"""Espera o banco aceitar conexões antes de iniciar o serviço.

Na hospedagem, o banco recém-criado (ou reiniciado) pode levar alguns minutos
para aceitar conexões; sem esta espera, o serviço falha logo na inicialização.
"""
import time

from django.core.management.base import BaseCommand, CommandError
from django.db import OperationalError, connection


class Command(BaseCommand):
    help = "Aguarda o banco de dados ficar disponível (padrão: até 300 s)."

    def add_arguments(self, parser):
        parser.add_argument("--timeout", type=int, default=300)
        parser.add_argument("--intervalo", type=float, default=5)

    def handle(self, *args, **o):
        limite = time.monotonic() + o["timeout"]
        tentativa = 0
        while True:
            tentativa += 1
            try:
                connection.ensure_connection()
                self.stdout.write(self.style.SUCCESS(f"Banco disponível (tentativa {tentativa})."))
                return
            except OperationalError as e:
                connection.close()
                motivo = str(e).strip().splitlines()[0][:200]
                if time.monotonic() >= limite:
                    raise CommandError(f"Banco indisponível após {o['timeout']} s: {motivo}")
                self.stdout.write(f"Aguardando o banco (tentativa {tentativa}): {motivo}")
                time.sleep(o["intervalo"])
