from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from operacao.servicos.notificacoes import diagnostico_email, enviar_teste


class Command(BaseCommand):
    help = "Mostra o diagnóstico do e-mail e, com --para, envia UMA mensagem de teste (auditada)."

    def add_arguments(self, parser):
        parser.add_argument("--para", help="Destinatário do teste (informe explicitamente)")
        parser.add_argument("--executor", default="não informado", help="Nome de quem executa (vai para a auditoria)")

    def handle(self, *args, **o):
        self.stdout.write(f"Servidor: {settings.EMAIL_HOST}:{settings.EMAIL_PORT} | conta: {settings.EMAIL_HOST_USER or '-'} "
                          f"| remetente: {settings.DEFAULT_FROM_EMAIL} | senha configurada: {'sim' if settings.EMAIL_HOST_PASSWORD else 'não'}")
        problemas = diagnostico_email()
        for p in problemas:
            self.stdout.write(self.style.WARNING(f"PENDENTE: {p}"))
        if not problemas:
            self.stdout.write(self.style.SUCCESS("Configuração completa."))
        if o["para"]:
            ok, detalhe = enviar_teste(o["para"], o["executor"])
            if not ok:
                raise CommandError(f"Teste NÃO enviado: {detalhe}")
            self.stdout.write(self.style.SUCCESS(detalhe))
