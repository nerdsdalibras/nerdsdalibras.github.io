from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from operacao.servicos import auditoria
from operacao.servicos.auditoria import AtorSistema


class Command(BaseCommand):
    help = "Concede (ou retira com --retirar) o papel de administrador da plataforma. Auditado."

    def add_arguments(self, parser):
        parser.add_argument("--email", required=True)
        parser.add_argument("--retirar", action="store_true")
        parser.add_argument("--operador-infra", required=True)

    def handle(self, *args, **o):
        u = get_user_model().objects.filter(email=o["email"].lower()).first()
        if u is None:
            raise CommandError("Usuário não encontrado.")
        antes = auditoria.serializar(u, ["administrador_plataforma"])
        u.administrador_plataforma = not o["retirar"]
        u.save(update_fields=["administrador_plataforma"])
        auditoria.registrar(AtorSistema(None, f"Linha de comando — {o['operador_infra']}"), "Usuario", u.pk,
                            "ADMIN_PLATAFORMA_RETIRADO" if o["retirar"] else "ADMIN_PLATAFORMA_CONCEDIDO",
                            antes=antes, depois=auditoria.serializar(u, ["administrador_plataforma"]))
        self.stdout.write(self.style.SUCCESS(f"{u.email}: administrador_plataforma={u.administrador_plataforma}"))
