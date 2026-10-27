from datetime import date, datetime, timedelta
from unittest import mock
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.test import TestCase

from operacao.models import Contrato, Interprete, ParametroMedicao, Perfil, Vinculo
from operacao.servicos.base import Ator
from operacao.servicos.parametros import FAIXAS_EDITAL

SP = ZoneInfo("America/Sao_Paulo")


def sp(*args):
    return datetime(*args, tzinfo=SP)


class Cenario(TestCase):
    """Contrato fictício com um usuário por perfil e parâmetro aprovado."""

    def setUp(self):
        self.contrato = Contrato.objects.create(
            codigo="teste", orgao="Órgão Fictício", contratada="Contratada Fictícia",
            referencia="Pregão Fictício", prefixo_codigo="TST",
        )
        self.atores = {}
        U = get_user_model()
        for perfil in Perfil.values:
            u = U.objects.create_user(email=f"{perfil.lower()}@exemplo.invalid", nome_completo=f"Usuário {perfil}", password="senha-de-teste-123")
            u.deve_trocar_senha = False
            u.save()
            Vinculo.objects.create(usuario=u, contrato=self.contrato, perfil=perfil)
            self.atores[perfil] = Ator(u, self.contrato, perfil)
        self.solicitante = self.atores[Perfil.SOLICITANTE]
        self.fiscal = self.atores[Perfil.FISCAL]
        self.operador = self.atores[Perfil.OPERADOR]
        self.admin = self.atores[Perfil.ADMIN_TECNICO]
        self.parametro = ParametroMedicao.objects.create(
            contrato=self.contrato, versao=1, preco_unitario_hora="156.6000", faixas_excedente=FAIXAS_EDITAL,
            vigente_desde=date(2026, 1, 1), situacao="APROVADO", justificativa="teste",
        )
        self.interpretes = [
            Interprete.objects.create(contrato=self.contrato, nome_completo=f"Intérprete {n}", telefone="(11) 90000-000" + str(n), email=f"i{n}@exemplo.invalid")
            for n in range(1, 4)
        ]

    def agora(self, dt):
        return mock.patch("django.utils.timezone.now", return_value=dt)

    def novo_agendamento(self, ator=None, quando=None, criado=None, modalidade="PRESENCIAL", duracao=120, qtd=2, **kw):
        from operacao.servicos import agendamentos

        quando = quando or sp(2026, 11, 16, 9, 0)  # segunda-feira
        criado = criado or quando - timedelta(days=10)
        with self.agora(criado):
            return agendamentos.criar(
                ator or self.solicitante, titulo="Evento fictício", unidade_solicitante="Unidade Fictícia",
                modalidade=modalidade, local=kw.get("local", "Local Fictício"), inicio_previsto=quando,
                duracao_prevista_min=duracao, qtd_profissionais=qtd,
            )

    def confirmado(self, **kw):
        from operacao.servicos import agendamentos

        ag = self.novo_agendamento(**kw)
        criado = kw.get("criado") or (ag.inicio_previsto - timedelta(days=10))
        with self.agora(criado + timedelta(hours=1)):
            for i in self.interpretes[: ag.qtd_profissionais]:
                agendamentos.escalar(self.operador, ag, i)
            agendamentos.confirmar(self.operador, ag)
        ag.refresh_from_db()
        return ag

    def realizado(self, minutos_reais, **kw):
        from operacao.servicos import agendamentos

        ag = self.confirmado(**kw)
        inicio = ag.inicio_previsto
        with self.agora(inicio + timedelta(minutes=minutos_reais + 5)):
            m = agendamentos.registrar_realizacao(self.operador, ag, inicio, inicio + timedelta(minutes=minutos_reais))
        ag.refresh_from_db()
        return ag, m
