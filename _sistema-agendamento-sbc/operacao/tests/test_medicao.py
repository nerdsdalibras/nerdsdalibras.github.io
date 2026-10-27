from decimal import Decimal

from django.test import SimpleTestCase

from operacao.models import SituacaoMedicao
from operacao.servicos.medicao import calcular
from operacao.servicos.parametros import FAIXAS_EDITAL

from .base import Cenario

P = Decimal("156.6000")


class TabelaExcedente(SimpleTestCase):
    def r(self, previsto, real):
        return calcular(previsto, real, FAIXAS_EDITAL, P)

    def test_sem_excedente(self):
        r = self.r(120, 120)
        self.assertEqual(r["minutos_faturaveis"], 120)
        self.assertEqual(r["valor_total"], Decimal("313.20"))

    def test_faixas_expressas_e_limites(self):
        casos = {1: 0, 10: 0, 11: 30, 30: 30, 31: 30, 40: 30, 41: 60, 60: 60}
        for exc, acr in casos.items():
            with self.subTest(excedente=exc):
                r = self.r(60, 60 + exc)
                self.assertEqual(r["situacao"], SituacaoMedicao.AUTOMATICA)
                self.assertEqual(r["acrescimo_min"], acr)
                self.assertEqual(r["minutos_faturaveis"], 60 + acr)

    def test_excedente_acima_de_60_e_pendencia(self):
        r = self.r(60, 121)
        self.assertEqual(r["situacao"], SituacaoMedicao.PENDENTE_REGRA)
        self.assertIn("EXCEDENTE_ACIMA_DA_TABELA", r["pendencias"])
        self.assertIsNone(r["valor_total"])

    def test_atendimento_mais_curto_e_pendencia(self):
        r = self.r(120, 90)
        self.assertEqual(r["situacao"], SituacaoMedicao.PENDENTE_REGRA)
        self.assertIn("ATENDIMENTO_MAIS_CURTO", r["pendencias"])

    def test_duracao_fracionada_e_pendencia(self):
        for previsto in (30, 90, 150):
            with self.subTest(previsto=previsto):
                r = self.r(previsto, previsto)
                self.assertEqual(r["situacao"], SituacaoMedicao.PENDENTE_REGRA)
                self.assertIn("DURACAO_FRACIONADA", r["pendencias"])

    def test_decimal_e_arredondamento(self):
        r = calcular(60, 71, FAIXAS_EDITAL, Decimal("156.6055"))  # 90 min
        self.assertEqual(r["horas_faturaveis"], Decimal("1.5000"))
        self.assertEqual(r["valor_bruto"], Decimal("234.90825000"))
        self.assertEqual(r["valor_total"], Decimal("234.91"))  # ROUND_HALF_UP
        self.assertIsInstance(r["valor_total"], Decimal)


class MedicaoIntegrada(Cenario):
    def test_dois_interpretes_nao_dobram_horas(self):
        ag, m = self.realizado(120, duracao=120, qtd=2)
        self.assertEqual(ag.escalas.filter(ativa=True).count(), 2)
        self.assertEqual(m.minutos_faturaveis, 120)
        self.assertEqual(m.horas_faturaveis, Decimal("2.0000"))
        self.assertEqual(m.valor_total, Decimal("313.20"))

    def test_medicao_guarda_versao_do_parametro_e_nao_muda_com_novo_preco(self):
        from datetime import date

        from operacao.servicos import parametros

        ag, m = self.realizado(60, duracao=60, qtd=1)
        novo = parametros.propor_parametro(self.operador, "200.0000", FAIXAS_EDITAL, date(2026, 1, 1), "Reajuste fictício")
        parametros.decidir_parametro(self.fiscal, novo, True, "ok")
        m.refresh_from_db()
        self.assertEqual(m.parametro_id, self.parametro.pk)
        self.assertEqual(m.valor_total, Decimal("156.60"))

    def test_pendencia_exige_fundamentada_aprovada_e_preserva_versoes(self):
        from operacao.servicos import medicao

        ag, m1 = self.realizado(130, duracao=60, qtd=1)  # excedente 70 min
        self.assertEqual(m1.situacao, SituacaoMedicao.PENDENTE_REGRA)
        self.assertIsNone(medicao.medicao_vigente(ag))
        prop = medicao.propor_fundamentada(self.operador, ag, 120, "Excedente justificado em ata fictícia")
        self.assertIsNone(medicao.medicao_vigente(ag))
        with self.assertRaises(Exception):
            medicao.decidir_fundamentada(self.operador, prop, True, "auto-aprovação")
        medicao.decidir_fundamentada(self.fiscal, prop, True, "Aprovado")
        vig = medicao.medicao_vigente(ag)
        self.assertEqual(vig.pk, prop.pk)
        self.assertEqual(vig.valor_total, Decimal("313.20"))
        m1.refresh_from_db()
        self.assertEqual(m1.situacao, SituacaoMedicao.PENDENTE_REGRA)  # original preservada
        self.assertEqual(ag.medicoes.count(), 2)

    def test_alerta_revezamento_quando_real_excede_uma_hora_com_um_interprete(self):
        ag, m = self.realizado(70, duracao=60, qtd=1)
        self.assertTrue(m.alerta_revezamento)
