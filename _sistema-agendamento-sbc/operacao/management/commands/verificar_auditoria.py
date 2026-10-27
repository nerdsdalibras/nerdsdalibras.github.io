from django.core.management.base import BaseCommand, CommandError

from operacao.models import EventoAuditoria
from operacao.servicos.auditoria import verificar_cadeia


class Command(BaseCommand):
    help = "Recalcula a cadeia de hash da trilha de auditoria e aponta divergências."

    def handle(self, *args, **o):
        problemas = verificar_cadeia()
        total = EventoAuditoria.objects.count()
        ultimo = EventoAuditoria.objects.order_by("-id").values_list("id", "hash").first()
        if problemas:
            raise CommandError(f"Cadeia de auditoria INVÁLIDA nos eventos: {problemas[:50]}")
        self.stdout.write(self.style.SUCCESS(f"Cadeia íntegra: {total} eventos. Último: {ultimo}"))
        self.stdout.write("Guarde o último hash fora do servidor (ex.: ata/e-mail ao Fiscal) para detectar reescrita total.")
