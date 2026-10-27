"""Dados EXCLUSIVAMENTE fictícios para demonstração/homologação local."""
import os
from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from operacao.models import Contrato, ParametroMedicao, Perfil, Vinculo
from operacao.servicos import agendamentos, cadastros, parametros
from operacao.servicos.auditoria import AtorSistema
from operacao.servicos.base import Ator

USUARIOS = [
    ("fiscal@exemplo.invalid", "Fiscal Fictícia da Silva", Perfil.FISCAL),
    ("solicitante@exemplo.invalid", "Solicitante Fictício Souza", Perfil.SOLICITANTE),
    ("operador@exemplo.invalid", "Operadora Fictícia Lima", Perfil.OPERADOR),
    ("admin@exemplo.invalid", "Administrador Técnico Fictício", Perfil.ADMIN_TECNICO),
]
INTERPRETES = [
    ("Intérprete Fictícia Ana", "(11) 90000-0001", "ana@exemplo.invalid"),
    ("Intérprete Fictício Bruno", "(11) 90000-0002", "bruno@exemplo.invalid"),
    ("Intérprete Fictícia Carla", "(11) 90000-0003", "carla@exemplo.invalid"),
]


class Command(BaseCommand):
    help = "Carrega usuários/intérpretes/agendamentos fictícios (domínio exemplo.invalid). Não use em produção."

    def add_arguments(self, parser):
        parser.add_argument("--contrato", default="pmsbc-se-pe-246-2026")

    @transaction.atomic
    def handle(self, *args, **o):
        if not settings.DEBUG and os.environ.get("PERMITIR_DEMONSTRACAO") != "sim":
            raise CommandError("Recusado fora de DEBUG. Defina PERMITIR_DEMONSTRACAO=sim apenas em homologação.")
        senha = os.environ.get("SENHA_DEMONSTRACAO")
        if not senha or len(senha) < 12:
            raise CommandError("Defina SENHA_DEMONSTRACAO (mín. 12 caracteres) para os usuários fictícios.")
        contrato = Contrato.objects.get(codigo=o["contrato"])
        sistema = AtorSistema(contrato, "Sistema (carga de demonstração fictícia)")
        vs = {}
        for email, nome, perfil in USUARIOS:
            v = Vinculo.objects.filter(contrato=contrato, usuario__email=email).first()
            if v is None:
                v, _ = cadastros.criar_usuario_vinculo(sistema, email, nome, perfil, senha=senha)
                v.usuario.deve_trocar_senha = False
                v.usuario.save(update_fields=["deve_trocar_senha"])
            vs[perfil] = v
        a = {p: Ator(v.usuario, contrato, p) for p, v in vs.items()}
        p1 = ParametroMedicao.objects.get(contrato=contrato, versao=1)
        if p1.situacao == "PROPOSTO":
            parametros.decidir_parametro(a[Perfil.FISCAL], p1, True, "Aprovação FICTÍCIA para demonstração local.")
        ints = []
        for nome, tel, email in INTERPRETES:
            i = contrato.interpretes.filter(email=email).first() or cadastros.salvar_interprete(
                a[Perfil.OPERADOR], {"nome_completo": nome, "telefone": tel, "email": email}
            )
            ints.append(i)
        base = timezone.localtime().replace(hour=9, minute=0, second=0, microsecond=0) + timedelta(days=7)
        ag1 = agendamentos.criar(
            a[Perfil.SOLICITANTE], titulo="Reunião de pais (fictícia)", unidade_solicitante="EMEB Exemplo A",
            modalidade="PRESENCIAL", local="EMEB Exemplo A — auditório", inicio_previsto=base,
            duracao_prevista_min=120, qtd_profissionais=2,
        )
        agendamentos.criar(
            a[Perfil.SOLICITANTE], titulo="Formação remota (fictícia)", unidade_solicitante="Secretaria — Exemplo",
            modalidade="REMOTO", local="Plataforma de videoconferência (link enviado no dia)", inicio_previsto=base,
            duracao_prevista_min=60, qtd_profissionais=1,
        )
        agendamentos.escalar(a[Perfil.OPERADOR], ag1, ints[0])
        agendamentos.escalar(a[Perfil.OPERADOR], ag1, ints[1])
        agendamentos.confirmar(a[Perfil.OPERADOR], ag1)
        self.stdout.write(self.style.SUCCESS("Dados fictícios carregados. Usuários: " + ", ".join(u[0] for u in USUARIOS)))
