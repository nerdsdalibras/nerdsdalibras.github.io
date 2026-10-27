import getpass

from django.core.management.base import BaseCommand, CommandError

from operacao.models import Contrato, Perfil
from operacao.servicos.auditoria import AtorSistema
from operacao.servicos.base import ErroRegra
from operacao.servicos.cadastros import criar_usuario_vinculo


class Command(BaseCommand):
    help = "Cria usuário e vínculo (uso na implantação, com acesso à infraestrutura). Ação auditada."

    def add_arguments(self, parser):
        parser.add_argument("--contrato", required=True)
        parser.add_argument("--email", required=True)
        parser.add_argument("--nome", required=True)
        parser.add_argument("--perfil", required=True, choices=Perfil.values)
        parser.add_argument("--operador-infra", required=True, help="Nome de quem executa o comando (vai para a auditoria)")

    def handle(self, *args, **o):
        try:
            contrato = Contrato.objects.get(codigo=o["contrato"])
        except Contrato.DoesNotExist:
            raise CommandError("Contrato não encontrado.")
        senha = getpass.getpass("Senha inicial (mín. 12 caracteres; será exigida troca no 1º acesso): ")
        ator = AtorSistema(contrato, f"Linha de comando — {o['operador_infra']}")
        try:
            v, _ = criar_usuario_vinculo(ator, o["email"], o["nome"], o["perfil"], senha=senha)
        except (ErroRegra, Exception) as e:  # noqa: BLE001
            raise CommandError(str(e))
        self.stdout.write(self.style.SUCCESS(f"Vínculo criado: {v}"))
