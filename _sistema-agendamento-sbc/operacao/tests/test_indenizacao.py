from datetime import timedelta
from decimal import Decimal

from operacao.models import PedidoIndenizacao, SituacaoIndenizacao
from operacao.servicos import agendamentos, indenizacao
from operacao.servicos.base import ErroRegra

from .base import Cenario, sp


class Indenizacao(Cenario):
    def cancelado_tarde(self, ator=None, **kw):
        ag = self.confirmado(**kw)
        with self.agora(ag.inicio_previsto - timedelta(hours=2)):
            agendamentos.cancelar(ator or self.solicitante, ag, "Cancelamento fictício")
        ag.refresh_from_db()
        return ag

    def test_cancelamento_nao_gera_indenizacao_automatica(self):
        self.cancelado_tarde()
        self.assertEqual(PedidoIndenizacao.objects.count(), 0)

    def test_presencial_100_limitado_a_2h(self):
        ag = self.cancelado_tarde(duracao=240, qtd=2)
        p = indenizacao.solicitar(self.operador, ag, "Reserva de agenda comprovada (fictício)")
        self.assertEqual(p.horas_referencia, Decimal("2.0000"))
        self.assertEqual(p.valor_referencia, Decimal("313.20"))
        self.assertEqual(p.situacao, SituacaoIndenizacao.SOLICITADA)

    def test_remoto_50(self):
        ag = self.cancelado_tarde(modalidade="REMOTO", duracao=180, qtd=2)
        p = indenizacao.solicitar(self.operador, ag, "Comprovação fictícia")
        self.assertEqual(p.horas_referencia, Decimal("1.5000"))
        self.assertEqual(p.valor_referencia, Decimal("234.90"))

    def test_sem_confirmacao_previa_nao_cabe(self):
        ag = self.novo_agendamento()
        with self.agora(ag.inicio_previsto - timedelta(hours=2)):
            agendamentos.cancelar(self.solicitante, ag, "x")
        ag.refresh_from_db()
        with self.assertRaises(ErroRegra):
            indenizacao.solicitar(self.operador, ag, "x")

    def test_cancelamento_pela_contratada_nao_cabe(self):
        ag = self.cancelado_tarde(ator=self.operador)
        with self.assertRaises(ErroRegra):
            indenizacao.solicitar(self.operador, ag, "x")

    def test_antecedencia_superior_nao_cabe(self):
        ag = self.confirmado()
        with self.agora(ag.inicio_previsto - timedelta(days=5)):
            agendamentos.cancelar(self.solicitante, ag, "x")
        ag.refresh_from_db()
        with self.assertRaises(ErroRegra):
            indenizacao.solicitar(self.operador, ag, "x")

    def test_aprovacao_exige_comprovacao_e_nao_imputavel(self):
        ag = self.cancelado_tarde()
        p = indenizacao.solicitar(self.operador, ag, "Comprovação fictícia")
        with self.assertRaises(ErroRegra):
            indenizacao.decidir(self.fiscal, p, True, reserva_comprovada=False, imputavel_contratada=False, parecer="x")
        with self.assertRaises(Exception):
            indenizacao.decidir(self.operador, p, True, True, False, "auto")
        p = indenizacao.decidir(self.fiscal, p, True, True, False, "Comprovação conferida")
        self.assertEqual(p.situacao, SituacaoIndenizacao.APROVADA)
        # não entra nas horas prestadas
        self.assertFalse(ag.medicoes.exists())
