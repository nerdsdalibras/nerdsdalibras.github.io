"""Plataforma multi-cidades: administrador da Nerds, cidades isoladas, liberação de acessos."""
import io
import os
from datetime import date, timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import CommandError, call_command
from django.test import Client, TestCase
from django.urls import reverse

from operacao.models import Agendamento, Contrato, EventoAuditoria, Feriado, ParametroMedicao, PedidoIndenizacao, Perfil, Vinculo
from operacao.servicos import agendamentos, indenizacao, plataforma
from operacao.servicos.base import Ator, ErroRegra

from .base import Cenario, sp

U = get_user_model()
SENHA = "senha-de-teste-123"


def cliente(usuario):
    c = Client()
    c.force_login(usuario)
    s = c.session
    s.set_expiry(10 * 365 * 24 * 3600)
    s.save()
    return c


def form_cidade(cidade, uf, prefixo, **kw):
    return {"cidade": cidade, "uf": uf, "orgao": f"Prefeitura de {cidade} — Educação", "referencia": "Pregão Fictício 1/2026",
            "prefixo": prefixo, "vigencia_inicio": "2026-01-01", "vigencia_fim": "", "preco_inicial": "", "meu_perfil": "OPERADOR", **kw}


class Plataforma(TestCase):
    def setUp(self):
        self.admin = U.objects.create_user(email="dono@exemplo.invalid", nome_completo="Dono Fictício", password=SENHA)
        self.admin.deve_trocar_senha = False
        self.admin.administrador_plataforma = True
        self.admin.save()
        self.c = cliente(self.admin)

    def criar(self, cidade, uf, prefixo):
        r = self.c.post(reverse("operacao:plataforma"), form_cidade(cidade, uf, prefixo))
        self.assertEqual(r.status_code, 302, r.content[:400])
        return Contrato.objects.get(prefixo_codigo=prefixo)

    def liberar(self, contrato, email, perfil):
        v = Vinculo.objects.get(usuario=self.admin, contrato=contrato)
        self.c.post(reverse("operacao:plataforma_entrar", args=[contrato.pk]))
        self.assertEqual(self.c.session["vinculo_id"], v.pk)
        r = self.c.post(reverse("operacao:usuarios"), {"nome_completo": f"Pessoa {email}", "email": email, "perfil": perfil})
        return r

    def test_admin_sem_cidade_vai_para_a_plataforma_e_cria_cidades_isoladas(self):
        r = self.c.get(reverse("operacao:painel"))
        self.assertRedirects(r, reverse("operacao:plataforma"))
        sbc = self.criar("São Bernardo do Campo", "SP", "SBC")
        fra = self.criar("Franca", "SP", "FRA")
        bh = self.criar("Belo Horizonte", "MG", "BHZ")
        for c in (sbc, fra, bh):
            self.assertEqual(ParametroMedicao.objects.get(contrato=c).situacao, "PROPOSTO")
            self.assertTrue(Vinculo.objects.filter(usuario=self.admin, contrato=c, perfil="OPERADOR").exists())
            self.assertTrue(EventoAuditoria.objects.filter(contrato=c, acao="CRIACAO_CIDADE").exists())
        self.assertTrue(Feriado.objects.filter(contrato=fra, data=date(2026, 7, 9)).exists())   # estadual SP
        self.assertFalse(Feriado.objects.filter(contrato=bh, data=date(2026, 7, 9)).exists())  # MG não tem 9/7
        self.assertTrue(Feriado.objects.filter(contrato=bh, data=date(2026, 11, 20)).exists())  # nacional
        r = self.c.post(reverse("operacao:plataforma"), form_cidade("Outra", "SP", "SBC"))
        self.assertEqual(Contrato.objects.filter(prefixo_codigo="SBC").count(), 1)  # prefixo único

    def test_prefixo_vazio_e_gerado_pelo_nome_da_cidade(self):
        for cidade, uf, esperado in [("São Bernardo do Campo", "SP", "SBC"), ("Franca", "SP", "FRA"),
                                     ("Franca", "SP", "FRAN"),  # já em uso: mais letras
                                     ("Santa Bárbara d'Oeste", "SP", "SBO")]:
            r = self.c.post(reverse("operacao:plataforma"), form_cidade(cidade, uf, ""))
            self.assertEqual(r.status_code, 302, r.content[:400])
            self.assertEqual(Contrato.objects.order_by("-id").first().prefixo_codigo, esperado)
        self.assertEqual(plataforma.sugerir_prefixo("Ribeirão Preto"), "RP")
        Contrato.objects.filter(prefixo_codigo="FRA").update(prefixo_codigo="FRANCA")
        for n in ("FRA", "FRANC"):
            Contrato.objects.create(codigo=f"x-{n}", orgao="O", contratada="C", referencia="R", prefixo_codigo=n)
        self.assertEqual(plataforma.sugerir_prefixo("Franca"), "FRAA")  # todas as variações em uso
        # Prefixo informado continua valendo e sendo validado
        self.criar("Belo Horizonte", "MG", "BHZ")
        self.c.post(reverse("operacao:plataforma"), form_cidade("Contagem", "MG", "C1"))
        self.assertFalse(Contrato.objects.filter(cidade="Contagem").exists())

    def test_prefeitura_ve_so_a_propria_cidade(self):
        sbc, fra = self.criar("São Bernardo do Campo", "SP", "SBC"), self.criar("Franca", "SP", "FRA")
        self.liberar(sbc, "fiscal.sbc@exemplo.invalid", "FISCAL")
        self.liberar(fra, "fiscal.fra@exemplo.invalid", "FISCAL")
        f_sbc = U.objects.get(email="fiscal.sbc@exemplo.invalid")
        f_sbc.deve_trocar_senha = False
        f_sbc.save()
        self.assertEqual(Vinculo.objects.filter(usuario=f_sbc).count(), 1)
        op_fra = Ator(self.admin, fra, Perfil.OPERADOR)
        with mock.patch("django.utils.timezone.now", return_value=sp(2026, 11, 2, 9)):
            ag_fra = agendamentos.criar(op_fra, titulo="Evento de Franca", unidade_solicitante="Escola F", modalidade="REMOTO",
                                        local="Plataforma", inicio_previsto=sp(2026, 11, 20, 9), duracao_prevista_min=60, qtd_profissionais=1)
            ag_sbc = agendamentos.criar(Ator(self.admin, sbc, Perfil.OPERADOR), titulo="Evento de SBC", unidade_solicitante="Escola S",
                                        modalidade="REMOTO", local="Plataforma", inicio_previsto=sp(2026, 11, 20, 9), duracao_prevista_min=60, qtd_profissionais=1)
        c = cliente(f_sbc)
        lista = c.get(reverse("operacao:agendamentos")).content.decode()
        self.assertIn(ag_sbc.codigo, lista)
        self.assertNotIn(ag_fra.codigo, lista)
        self.assertNotIn("Franca", c.get(reverse("operacao:painel")).content.decode())
        self.assertEqual(c.get(reverse("operacao:agendamento", args=[ag_fra.pk])).status_code, 404)
        self.assertEqual(c.post(reverse("operacao:agendamento_cancelar", args=[ag_fra.pk]), {"justificativa": "x"}).status_code, 404)
        self.assertEqual(c.get(reverse("operacao:plataforma")).status_code, 403)
        self.assertEqual(c.post(reverse("operacao:plataforma_entrar", args=[fra.pk])).status_code, 403)
        self.assertNotIn("Franca", c.get(reverse("operacao:auditoria") + "?formato=csv").content.decode())
        # a Prefeitura corrige e cancela o que é seu, com auditoria
        with mock.patch("django.utils.timezone.now", return_value=sp(2026, 11, 3, 9)):
            c.post(reverse("operacao:agendamento_cancelar", args=[ag_sbc.pk]), {"justificativa": "Evento adiado"})
        ag_sbc.refresh_from_db()
        self.assertEqual(ag_sbc.status, "CANCELADO")
        self.assertTrue(EventoAuditoria.objects.filter(contrato=sbc, entidade_id=str(ag_sbc.pk), usuario=f_sbc).exists())

    def test_admin_libera_solicitantes_e_so_o_primeiro_fiscal(self):
        sbc = self.criar("São Bernardo do Campo", "SP", "SBC")
        self.liberar(sbc, "fiscal1@exemplo.invalid", "FISCAL")
        self.assertTrue(Vinculo.objects.filter(contrato=sbc, perfil="FISCAL", usuario__email="fiscal1@exemplo.invalid").exists())
        self.liberar(sbc, "fiscal2@exemplo.invalid", "FISCAL")  # já há fiscal ativo
        self.assertFalse(U.objects.filter(email="fiscal2@exemplo.invalid").exists())
        self.liberar(sbc, "escola@exemplo.invalid", "SOLICITANTE")
        self.assertTrue(Vinculo.objects.filter(contrato=sbc, perfil="SOLICITANTE").exists())
        v_f = Vinculo.objects.get(contrato=sbc, perfil="FISCAL")
        self.c.post(reverse("operacao:vinculo_alterar", args=[v_f.pk]), {"perfil": "FISCAL", "justificativa": "desativar"})
        v_f.refresh_from_db()
        self.assertTrue(v_f.ativo)  # admin não desativa/troca fiscal existente
        # o fiscal da Prefeitura libera outro fiscal
        f1 = U.objects.get(email="fiscal1@exemplo.invalid")
        f1.deve_trocar_senha = False
        f1.save()
        cliente(f1).post(reverse("operacao:usuarios"), {"nome_completo": "Fiscal 2", "email": "fiscal2@exemplo.invalid", "perfil": "FISCAL"})
        self.assertTrue(Vinculo.objects.filter(contrato=sbc, perfil="FISCAL", usuario__email="fiscal2@exemplo.invalid").exists())

    def test_admin_da_plataforma_nao_aprova_pela_prefeitura(self):
        sbc = self.criar("São Bernardo do Campo", "SP", "SBC")
        p = ParametroMedicao.objects.get(contrato=sbc)
        self.c.post(reverse("operacao:plataforma_entrar", args=[sbc.pk]))
        r = self.c.post(reverse("operacao:parametro_decidir", args=[p.pk]), {"decisao": "aprovar", "parecer": "x"})
        self.assertEqual(r.status_code, 403)
        p.refresh_from_db()
        self.assertEqual(p.situacao, "PROPOSTO")

    def test_usuario_comum_nao_acessa_nem_cria_cidade(self):
        comum = U.objects.create_user(email="comum@exemplo.invalid", nome_completo="Comum", password=SENHA)
        comum.deve_trocar_senha = False
        comum.save()
        self.assertEqual(cliente(comum).get(reverse("operacao:plataforma")).status_code, 403)
        with self.assertRaises(PermissionDenied):
            plataforma.criar_cidade(comum, cidade="X", uf="SP", orgao="O", referencia="R", prefixo="XX")

    def test_entrar_em_cidade_existente_vincula_e_audita(self):
        outra = Contrato.objects.create(codigo="pre", cidade="Santos", uf="SP", orgao="O", contratada="C", referencia="R", prefixo_codigo="SAN")
        self.c.post(reverse("operacao:plataforma_entrar", args=[outra.pk]))
        self.assertTrue(Vinculo.objects.filter(usuario=self.admin, contrato=outra, perfil="OPERADOR").exists())
        self.assertTrue(EventoAuditoria.objects.filter(contrato=outra, acao="CRIACAO_VINCULO").exists())


class Implantacao(TestCase):
    def test_inicializar_plataforma_cria_admin_uma_vez(self):
        env = {"SGI_ADMIN_EMAIL": "Admin@Exemplo.invalid", "SGI_ADMIN_NOME": "Admin", "SGI_ADMIN_SENHA": "Senha-Inicial-Ficticia-2026"}
        with mock.patch.dict(os.environ, env):
            call_command("inicializar_plataforma", stdout=io.StringIO())
            u = U.objects.get(email="admin@exemplo.invalid")
            self.assertTrue(u.administrador_plataforma and u.deve_trocar_senha and u.check_password(env["SGI_ADMIN_SENHA"]))
            with mock.patch.dict(os.environ, {"SGI_ADMIN_SENHA": "Outra-Senha-Ficticia-2026"}):
                call_command("inicializar_plataforma", stdout=io.StringIO())
            u.refresh_from_db()
            self.assertTrue(u.check_password(env["SGI_ADMIN_SENHA"]))  # nunca redefine
        self.assertTrue(EventoAuditoria.objects.filter(acao="ADMIN_PLATAFORMA_CRIADO").exists())

    def test_senha_fraca_recusada(self):
        with mock.patch.dict(os.environ, {"SGI_ADMIN_EMAIL": "a@exemplo.invalid", "SGI_ADMIN_SENHA": "123"}):
            with self.assertRaises(CommandError):
                call_command("inicializar_plataforma", stdout=io.StringIO())
        self.assertFalse(U.objects.filter(administrador_plataforma=True).exists())

    def test_primeiro_acesso_exige_troca_de_senha(self):
        u = U.objects.create_user(email="novo@exemplo.invalid", nome_completo="Novo", password=SENHA)
        u.administrador_plataforma = True
        u.save()
        c = Client()
        c.force_login(u)
        r = c.get(reverse("operacao:painel"))
        self.assertEqual(r["Location"], reverse("contas:trocar_senha"))


class AnexoNoBanco(Cenario):
    def cancelado_tarde(self):
        ag = self.confirmado()
        with self.agora(ag.inicio_previsto - timedelta(hours=2)):
            agendamentos.cancelar(self.solicitante, ag, "x")
        ag.refresh_from_db()
        return ag

    def test_anexo_guardado_no_banco_e_baixado_identico(self):
        ag = self.cancelado_tarde()
        conteudo = b"%PDF-1.4\n% documento ficticio\n" + os.urandom(2000)
        p = indenizacao.solicitar(self.operador, ag, "Reserva", SimpleUploadedFile("reserva.pdf", conteudo, "application/pdf"))
        p.refresh_from_db()
        self.assertEqual(bytes(p.anexo_conteudo), conteudo)
        self.assertFalse(p.anexo)  # nada em disco
        c = cliente(self.fiscal.usuario)
        r = c.get(reverse("operacao:indenizacao_anexo", args=[p.pk]))
        self.assertEqual(r.content, conteudo)
        self.assertEqual(r["Content-Type"], "application/pdf")
        from django.db import DatabaseError, connection, transaction

        with self.assertRaises(DatabaseError), transaction.atomic(), connection.cursor() as cur:
            cur.execute("UPDATE operacao_pedidoindenizacao SET anexo_conteudo = 'x' WHERE id = %s", [p.pk])

    def test_anexo_com_conteudo_falso_recusado(self):
        ag = self.cancelado_tarde()
        with self.assertRaisesRegex(ErroRegra, "não corresponde"):
            indenizacao.solicitar(self.operador, ag, "Reserva", SimpleUploadedFile("reserva.pdf", b"MZ\x90executavel", "application/pdf"))
        self.assertFalse(PedidoIndenizacao.objects.exists())


class AuditoriaDoAnexo(AnexoNoBanco):
    def test_historico_registra_hash_e_tamanho_nao_o_conteudo(self):
        ag = self.cancelado_tarde()
        conteudo = b"%PDF-1.4\n" + b"A" * 500
        p = indenizacao.solicitar(self.operador, ag, "Reserva", SimpleUploadedFile("r.pdf", conteudo, "application/pdf"))
        ev = EventoAuditoria.objects.get(entidade="PedidoIndenizacao", entidade_id=str(p.pk), acao="SOLICITACAO")
        import hashlib

        self.assertEqual(ev.dados_posteriores["anexo_conteudo"], {"bytes": len(conteudo), "sha256": hashlib.sha256(conteudo).hexdigest()})


class AguardarBanco(TestCase):
    def test_espera_ate_o_banco_responder(self):
        from django.db import OperationalError, connection

        real = connection.ensure_connection
        falhas = iter([OperationalError("connection refused"), OperationalError("connection refused")])

        def instavel():
            erro = next(falhas, None)
            if erro:
                raise erro
            return real()

        out = io.StringIO()
        with mock.patch.object(connection, "ensure_connection", side_effect=instavel), mock.patch.object(connection, "close"):
            call_command("aguardar_banco", "--intervalo", "0", stdout=out)
        self.assertIn("Aguardando o banco (tentativa 1)", out.getvalue())
        self.assertIn("Banco disponível (tentativa 3)", out.getvalue())

    def test_desiste_apos_o_tempo_limite_com_mensagem_clara(self):
        from django.db import OperationalError, connection

        with mock.patch.object(connection, "ensure_connection", side_effect=OperationalError("connection refused")), \
                mock.patch.object(connection, "close"), self.assertRaisesRegex(CommandError, "indisponível após 0 s"):
            call_command("aguardar_banco", "--timeout", "0", "--intervalo", "0", stdout=io.StringIO())
