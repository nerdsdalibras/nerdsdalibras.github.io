"""E-mail (Gmail nerdsdalibras@gmail.com) e cópia externa no Google Drive.

O Drive é testado contra um servidor HTTP LOCAL que imita a API do Google
(OAuth, about, files, envio retomável em blocos, download). Isso valida o código
HTTP, a conferência de conta e de integridade, mas NÃO substitui teste com o Google.
"""
import hashlib
import io
import json
import os
import tempfile
import threading
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest import mock

from django.core import mail
from django.core.management import CommandError, call_command
from django.test import SimpleTestCase, TestCase, override_settings

from operacao.models import EventoAuditoria, Notificacao, StatusNotificacao
from operacao.servicos import drive, notificacoes

GMAIL_OK = dict(EMAIL_ENVIO_HABILITADO=True, EMAIL_BACKEND="django.core.mail.backends.smtp.EmailBackend",
                EMAIL_HOST="smtp.gmail.com", EMAIL_HOST_USER="nerdsdalibras@gmail.com",
                EMAIL_HOST_PASSWORD="senha-de-app-ficticia", EMAIL_USE_TLS=True,
                DEFAULT_FROM_EMAIL="Nerds da Libras - SGI <nerdsdalibras@gmail.com>")


class DiagnosticoEmail(SimpleTestCase):
    def test_padrao_e_gmail_da_nerds_e_fica_pendente_sem_senha_e_sem_autorizacao(self):
        from django.conf import settings

        self.assertEqual(settings.EMAIL_HOST, "smtp.gmail.com")
        self.assertEqual(settings.EMAIL_HOST_USER, "nerdsdalibras@gmail.com")
        self.assertIn("nerdsdalibras@gmail.com", settings.DEFAULT_FROM_EMAIL)
        with override_settings(EMAIL_ENVIO_HABILITADO=False, EMAIL_HOST_PASSWORD="", EMAIL_BACKEND="django.core.mail.backends.smtp.EmailBackend", EMAIL_HOST="smtp.gmail.com",
                               EMAIL_HOST_USER="nerdsdalibras@gmail.com"):
            p = " ".join(notificacoes.diagnostico_email())
            self.assertIn("desabilitado", p)
            self.assertIn("senha de app", p)
            self.assertFalse(notificacoes.integracao_configurada())

    @override_settings(**GMAIL_OK)
    def test_configuracao_completa(self):
        self.assertEqual(notificacoes.diagnostico_email(), [])

    @override_settings(**{**GMAIL_OK, "DEFAULT_FROM_EMAIL": "outro@exemplo.invalid"})
    def test_gmail_exige_remetente_igual_a_conta(self):
        self.assertIn("deve ser a própria conta", " ".join(notificacoes.diagnostico_email()))

    @override_settings(**{**GMAIL_OK, "EMAIL_USE_TLS": False, "EMAIL_USE_SSL": False})
    def test_gmail_exige_conexao_cifrada(self):
        self.assertIn("cifrada", " ".join(notificacoes.diagnostico_email()))

    @override_settings(EMAIL_ENVIO_HABILITADO=True, EMAIL_BACKEND="django.core.mail.backends.smtp.EmailBackend", EMAIL_HOST="127.0.0.1", EMAIL_HOST_USER="", EMAIL_HOST_PASSWORD="")
    def test_smtp_local_sem_autenticacao_e_aceito(self):
        self.assertEqual(notificacoes.diagnostico_email(), [])


class EnvioEmail(TestCase):
    def test_pendencia_registrada_com_motivo(self):
        from operacao.models import Contrato

        c = Contrato.objects.create(codigo="x", orgao="O", contratada="C", referencia="R", prefixo_codigo="X")
        n = Notificacao.objects.create(contrato=c, tipo="CONFIRMACAO", chave_idempotencia="k1", assunto="a", corpo="b",
                                       destinatarios=["fiscal@exemplo.invalid"])
        with override_settings(EMAIL_ENVIO_HABILITADO=True, EMAIL_HOST_PASSWORD="", EMAIL_BACKEND="django.core.mail.backends.smtp.EmailBackend", EMAIL_HOST="smtp.gmail.com",
                               EMAIL_HOST_USER="nerdsdalibras@gmail.com"), \
                mock.patch("django.core.mail.EmailMessage.send") as envio:
            notificacoes.enviar(n.pk)
        envio.assert_not_called()  # nenhuma tentativa de conexão sem senha
        n.refresh_from_db()
        self.assertEqual(n.status, StatusNotificacao.INTEGRACAO_PENDENTE)
        self.assertIn("EMAIL_HOST_PASSWORD", n.ultimo_erro)

    @override_settings(**{**GMAIL_OK, "EMAIL_BACKEND": "django.core.mail.backends.locmem.EmailBackend"})
    def test_comando_de_teste_envia_uma_mensagem_do_gmail_da_nerds_e_audita(self):
        out = io.StringIO()
        call_command("testar_email", "--para", "teste@exemplo.invalid", "--executor", "Auditor", stdout=out)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["teste@exemplo.invalid"])
        self.assertIn("nerdsdalibras@gmail.com", mail.outbox[0].from_email)
        self.assertTrue(EventoAuditoria.objects.filter(entidade="Email", acao="TESTE_ENVIO").exists())
        self.assertNotIn("senha-de-app-ficticia", out.getvalue())

    @override_settings(EMAIL_ENVIO_HABILITADO=False)
    def test_comando_de_teste_recusa_sem_configuracao(self):
        with self.assertRaises(CommandError):
            call_command("testar_email", "--para", "teste@exemplo.invalid", stdout=io.StringIO())
        self.assertEqual(len(mail.outbox), 0)


# ---------------------------------------------------------------- Google Drive (servidor falso local)
class FalsoGoogle(BaseHTTPRequestHandler):
    estado = None

    def log_message(self, *a):
        pass

    def _json(self, codigo, obj, cab=None):
        corpo = json.dumps(obj).encode()
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json")
        for k, v in (cab or {}).items():
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def _autorizado(self):
        if self.headers.get("Authorization") != "Bearer tok-valido":
            self._json(401, {"error": "invalid_token"})
            return False
        return True

    def _corpo(self):
        return self.rfile.read(int(self.headers.get("Content-Length") or 0))

    def do_POST(self):
        e, url = self.estado, urllib.parse.urlparse(self.path)
        corpo = self._corpo()
        if url.path == "/token":
            dados = urllib.parse.parse_qs(corpo.decode())
            if dados.get("refresh_token") != ["refresh-valido"]:
                return self._json(400, {"error": "invalid_grant"})
            return self._json(200, {"access_token": "tok-valido"})
        if not self._autorizado():
            return
        if url.path == "/drive/v3/files":
            meta = json.loads(corpo)
            fid = f"pasta{len(e['pastas']) + 1}"
            e["pastas"][fid] = meta["name"]
            return self._json(200, {"id": fid})
        if url.path == "/upload/drive/v3/files":
            meta = json.loads(corpo)
            sid = f"s{len(e['sessoes']) + 1}"
            e["sessoes"][sid] = {"meta": meta, "dados": b"", "total": int(self.headers["X-Upload-Content-Length"])}
            return self._json(200, {}, {"Location": f"http://127.0.0.1:{e['porta']}/sessao/{sid}"})
        self._json(404, {})

    def do_PUT(self):
        e = self.estado
        sid = self.path.rsplit("/", 1)[-1]
        s = e["sessoes"][sid]
        s["dados"] += self._corpo()
        e["puts"] += 1
        if len(s["dados"]) < s["total"]:
            return self._json(308, {}, {"Range": f"bytes=0-{len(s['dados']) - 1}"})
        fid = f"arq{len(e['arquivos']) + 1}"
        md5 = hashlib.md5(s["dados"]).hexdigest()
        if e.get("corromper"):
            md5 = "0" * 32
        e["arquivos"][fid] = {"name": s["meta"]["name"], "parents": s["meta"]["parents"], "dados": s["dados"]}
        self._json(200, {"id": fid, "name": s["meta"]["name"], "size": str(len(s["dados"])), "md5Checksum": md5})

    def do_GET(self):
        e, url = self.estado, urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(url.query)
        if not self._autorizado():
            return
        if url.path == "/drive/v3/about":
            return self._json(200, {"user": {"emailAddress": e["conta"]}})
        if url.path == "/drive/v3/files":
            consulta = q.get("q", [""])[0]
            if "mimeType" in consulta:
                nome = consulta.split("name = '")[1].split("'")[0]
                return self._json(200, {"files": [{"id": k, "name": v} for k, v in e["pastas"].items() if v == nome]})
            pai = consulta.split("'")[1]
            return self._json(200, {"files": [{"id": k, "name": v["name"], "size": str(len(v["dados"])),
                                               "md5Checksum": hashlib.md5(v["dados"]).hexdigest()}
                                              for k, v in e["arquivos"].items() if pai in v["parents"]]})
        if url.path.startswith("/drive/v3/files/") and q.get("alt") == ["media"]:
            dados = e["arquivos"][url.path.rsplit("/", 1)[-1]]["dados"]
            self.send_response(200)
            self.send_header("Content-Length", str(len(dados)))
            self.end_headers()
            self.wfile.write(dados)
            return
        self._json(404, {})


class DriveContraServidorFalso(TestCase):
    def setUp(self):
        self.estado = {"pastas": {}, "sessoes": {}, "arquivos": {}, "puts": 0, "conta": "nerdsdalibras@gmail.com"}
        FalsoGoogle.estado = self.estado
        self.srv = ThreadingHTTPServer(("127.0.0.1", 0), FalsoGoogle)
        self.estado["porta"] = self.srv.server_address[1]
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        base = f"http://127.0.0.1:{self.estado['porta']}"
        self.cfg = override_settings(GDRIVE_CLIENT_ID="cid", GDRIVE_CLIENT_SECRET="csec", GDRIVE_REFRESH_TOKEN="refresh-valido",
                                     GDRIVE_TOKEN_URL=f"{base}/token", GDRIVE_API_URL=base, GDRIVE_CONTA="nerdsdalibras@gmail.com",
                                     GDRIVE_PASTA="SGI-SBC-backups")
        self.cfg.enable()
        self.dir = tempfile.mkdtemp()
        self.gpg = os.path.join(self.dir, "sgi-20261028T120000Z.dump.gpg")
        with open(self.gpg, "wb") as f:
            f.write(os.urandom(700_000))  # conteúdo cifrado simulado
        self.soma = os.path.join(self.dir, "sgi-20261028T120000Z.sha256")
        with open(self.soma, "w") as f:
            f.write("abc  sgi-20261028T120000Z.dump.gpg\n")

    def tearDown(self):
        self.cfg.disable()
        self.srv.shutdown()

    def test_envia_em_blocos_confere_md5_e_baixa_identico(self):
        with mock.patch.object(drive, "BLOCO", 256 * 1024):  # força envio retomável em vários blocos
            conta, enviados = drive.enviar_backup([self.gpg, self.soma])
        self.assertEqual(conta, "nerdsdalibras@gmail.com")
        self.assertEqual(len(enviados), 2)
        self.assertGreaterEqual(self.estado["puts"], 4)  # 3 blocos + 1 do arquivo de somas
        self.assertTrue(all(i["md5Checksum"] == i["md5_local"] for i in enviados))
        self.assertEqual(list(self.estado["pastas"].values()), ["SGI-SBC-backups"])
        drive.enviar_backup([self.soma])  # 2º envio reutiliza a pasta
        self.assertEqual(len(self.estado["pastas"]), 1)
        destino = os.path.join(self.dir, "baixado.gpg")
        drive.baixar(drive.obter_token(), enviados[0]["id"], destino)
        with open(self.gpg, "rb") as a, open(destino, "rb") as b:
            self.assertEqual(a.read(), b.read())

    def test_recusa_arquivo_nao_cifrado_sem_contatar_o_drive(self):
        claro = os.path.join(self.dir, "sgi-20261028T120000Z.dump")
        open(claro, "wb").write(b"PGDMP")
        with self.assertRaisesRegex(drive.ErroDrive, "não está cifrado"):
            drive.enviar_backup([self.gpg, claro])
        self.assertEqual(self.estado["sessoes"], {})

    def test_recusa_conta_diferente(self):
        self.estado["conta"] = "outra.conta@gmail.com"
        with self.assertRaisesRegex(drive.ErroDrive, "diferente da esperada"):
            drive.enviar_backup([self.gpg])
        self.assertEqual(self.estado["arquivos"], {})

    def test_detecta_integridade_divergente(self):
        self.estado["corromper"] = True
        with self.assertRaisesRegex(drive.ErroDrive, "Integridade NÃO confere"):
            drive.enviar_backup([self.gpg])

    def test_token_invalido_e_credencial_ausente(self):
        with override_settings(GDRIVE_REFRESH_TOKEN="revogado"), self.assertRaisesRegex(drive.ErroDrive, "invalid_grant"):
            drive.obter_token()
        with override_settings(GDRIVE_REFRESH_TOKEN=""), self.assertRaisesRegex(drive.ErroDrive, "pendente"):
            drive.obter_token()

    def test_comando_enviar_registra_auditoria_e_listar(self):
        out = io.StringIO()
        call_command("drive_backup", "enviar", self.gpg, self.soma, stdout=out)
        self.assertIn("integridade conferida", out.getvalue())
        ev = EventoAuditoria.objects.get(acao="COPIA_EXTERNA_DRIVE")
        self.assertIn("nerdsdalibras@gmail.com", ev.justificativa)
        out = io.StringIO()
        call_command("drive_backup", "listar", stdout=out)
        self.assertIn("sgi-20261028T120000Z.dump.gpg", out.getvalue())
        self.assertNotIn("refresh-valido", out.getvalue())
