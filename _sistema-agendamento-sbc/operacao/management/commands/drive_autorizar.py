"""Autoriza o SGI a gravar backups no Google Drive da conta nerdsdalibras@gmail.com.

Execute UMA vez, num computador com navegador (pode ser o seu, com GDRIVE_CLIENT_ID
e GDRIVE_CLIENT_SECRET definidos). Ao final, o refresh token é exibido para ser
guardado na variável GDRIVE_REFRESH_TOKEN do servidor (gerenciador de segredos).
"""
import http.server
import json
import secrets
import urllib.parse

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from operacao.servicos import drive


class Command(BaseCommand):
    help = "Obtém autorização OAuth (escopo drive.file) da conta do Google Drive usada para backups."

    def add_arguments(self, parser):
        parser.add_argument("--porta", type=int, default=8899)

    def handle(self, *args, **o):
        if not (settings.GDRIVE_CLIENT_ID and settings.GDRIVE_CLIENT_SECRET):
            raise CommandError("Defina GDRIVE_CLIENT_ID e GDRIVE_CLIENT_SECRET (cliente OAuth do tipo 'App para computador').")
        redirect = f"http://127.0.0.1:{o['porta']}/"
        estado = secrets.token_urlsafe(16)
        recebido = {}

        class Retorno(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
                recebido.update({k: v[0] for k, v in q.items()})
                self.send_response(200)
                self.send_header("Content-Type", "text/plain; charset=utf-8")
                self.end_headers()
                self.wfile.write("Autorização recebida. Pode fechar esta aba e voltar ao terminal.".encode())

            def log_message(self, *a):
                pass

        self.stdout.write(f"Abra no navegador, entre como {settings.GDRIVE_CONTA} e autorize:\n\n{drive.url_autorizacao(redirect, estado)}\n")
        with http.server.HTTPServer(("127.0.0.1", o["porta"]), Retorno) as srv:
            while "code" not in recebido and "error" not in recebido:
                srv.handle_request()
        if recebido.get("error"):
            raise CommandError(f"Autorização negada: {recebido['error']}")
        if recebido.get("state") != estado:
            raise CommandError("Parâmetro 'state' não confere; autorização descartada.")
        tokens = drive.trocar_codigo(recebido["code"], redirect)
        if "refresh_token" not in tokens:
            raise CommandError(f"Resposta sem refresh_token: {json.dumps({k: v for k, v in tokens.items() if 'token' not in k})}")
        conta = drive.conferir_conta(tokens["access_token"])
        self.stdout.write(self.style.SUCCESS(f"Conta autorizada: {conta}"))
        self.stdout.write("Guarde o valor abaixo em GDRIVE_REFRESH_TOKEN no servidor (é um SEGREDO; não versione, não envie por chat):")
        self.stdout.write(tokens["refresh_token"])
