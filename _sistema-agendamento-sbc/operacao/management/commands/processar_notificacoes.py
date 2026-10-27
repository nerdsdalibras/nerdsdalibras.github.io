from django.core.management.base import BaseCommand

from operacao.servicos.notificacoes import integracao_configurada, processar_pendentes


class Command(BaseCommand):
    help = "Envia notificações pendentes e reenvia falhas (agendar a cada 1–5 min)."

    def handle(self, *args, **o):
        resultado = processar_pendentes()
        self.stdout.write(f"Integração configurada: {integracao_configurada()}. Processadas: {len(resultado)}")
        for n in resultado:
            if n is not None:
                self.stdout.write(f"  {n.pk} {n.tipo} → {n.status}")
