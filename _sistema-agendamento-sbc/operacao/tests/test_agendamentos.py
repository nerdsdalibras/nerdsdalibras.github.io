from datetime import timedelta

from django.core.exceptions import PermissionDenied

from operacao.models import (
    Agendamento, ClassificacaoCancelamento, EventoAuditoria, Feriado, Notificacao, StatusAgendamento, TipoNotificacao,
)
from operacao.servicos import agendamentos
from operacao.servicos.base import ErroRegra

from .base import Cenario, sp


class Criacao(Cenario):
    def test_registra_campos_e_registro_original(self):
        ag = self.novo_agendamento()
        self.assertTrue(ag.codigo.startswith("TST-"))
        self.assertEqual(ag.status, StatusAgendamento.SOLICITADO)
        ev = EventoAuditoria.objects.get(entidade="Agendamento", entidade_id=str(ag.pk), acao="CRIACAO")
        self.assertEqual(ev.dados_posteriores["duracao_prevista_min"], 120)
        self.assertEqual(ev.usuario, self.solicitante.usuario)

    def test_acima_de_uma_hora_exige_dois_interpretes(self):
        with self.assertRaises(ErroRegra):
            self.novo_agendamento(duracao=61, qtd=1)

    def test_contratada_tambem_registra(self):
        ag = self.novo_agendamento(ator=self.operador)
        self.assertEqual(ag.parte_criadora, "CONTRATADA")

    def test_admin_tecnico_nao_registra(self):
        with self.assertRaises(PermissionDenied):
            self.novo_agendamento(ator=self.admin)

    def test_eventos_simultaneos_em_locais_diferentes(self):
        a = self.novo_agendamento(local="Escola A")
        b = self.novo_agendamento(local="Plataforma B", modalidade="REMOTO", duracao=60, qtd=1)
        self.assertEqual(a.inicio_previsto, b.inicio_previsto)

    def test_mesmo_interprete_nao_pode_estar_em_eventos_sobrepostos(self):
        a = self.novo_agendamento(local="Escola A")
        b = self.novo_agendamento(local="Escola B")
        agendamentos.escalar(self.operador, a, self.interpretes[0])
        with self.assertRaises(ErroRegra):
            agendamentos.escalar(self.operador, b, self.interpretes[0])


class Antecedencia(Cenario):
    # 16/11/2026 é segunda; 20/11/2026 (sexta) é feriado nacional.
    def test_remoto_um_dia_util(self):
        ok = self.novo_agendamento(modalidade="REMOTO", duracao=60, qtd=1, quando=sp(2026, 11, 17, 9), criado=sp(2026, 11, 16, 18))
        self.assertEqual(ok.antecedencia_dias_uteis, 1)
        self.assertFalse(ok.fora_do_prazo)
        fora = self.novo_agendamento(modalidade="REMOTO", duracao=60, qtd=1, quando=sp(2026, 11, 17, 18), criado=sp(2026, 11, 17, 8))
        self.assertTrue(fora.fora_do_prazo)

    def test_presencial_tres_dias_uteis_com_feriado(self):
        # pedido quarta 18/11 → seg 23/11: (qui 19, sex 20=feriado, seg 23) = 2 dias úteis → fora
        ag = self.novo_agendamento(quando=sp(2026, 11, 23, 9), criado=sp(2026, 11, 18, 10))
        self.assertEqual(ag.antecedencia_dias_uteis, 2)
        self.assertTrue(ag.fora_do_prazo)
        # pedido sexta 13/11 → qua 18/11: (seg 16, ter 17, qua 18) = 3 → no prazo
        ok = self.novo_agendamento(quando=sp(2026, 11, 18, 9), criado=sp(2026, 11, 13, 17))
        self.assertFalse(ok.fora_do_prazo)

    def setUp(self):
        super().setUp()
        from datetime import date

        Feriado.objects.create(contrato=self.contrato, data=date(2026, 11, 20), descricao="Consciência Negra")

    def test_fora_do_prazo_preserva_registro(self):
        ag = self.novo_agendamento(quando=sp(2026, 11, 17, 9), criado=sp(2026, 11, 16, 9))
        self.assertTrue(Agendamento.objects.filter(pk=ag.pk, fora_do_prazo=True).exists())


class Cancelamento(Cenario):
    def cancelar(self, ag, momento, ator=None):
        with self.agora(momento):
            agendamentos.cancelar(ator or self.solicitante, ag, "Justificativa fictícia")
        ag.refresh_from_db()
        return ag

    def test_cancelar_nao_apaga_e_exige_justificativa(self):
        ag = self.confirmado()
        with self.assertRaises(ErroRegra):
            with self.agora(ag.inicio_previsto - timedelta(days=5)):
                agendamentos.cancelar(self.solicitante, ag, "  ")
        ag = self.cancelar(ag, ag.inicio_previsto - timedelta(days=5))
        self.assertEqual(ag.status, StatusAgendamento.CANCELADO)
        self.assertTrue(Agendamento.objects.filter(pk=ag.pk).exists())
        self.assertFalse(ag.escalas.filter(ativa=True).exists())

    def test_superior_nos_dois_criterios(self):
        ag = self.cancelar(self.confirmado(), sp(2026, 11, 12, 9))  # 4 dias antes
        self.assertEqual(ag.cancelamento_classificacao, ClassificacaoCancelamento.ANTECEDENCIA_SUPERIOR)

    def test_tardio_nos_dois_criterios(self):
        ag = self.cancelar(self.confirmado(), sp(2026, 11, 16, 7))  # mesmo dia, 2 h antes
        self.assertEqual(ag.cancelamento_classificacao, ClassificacaoCancelamento.TARDIO)

    def test_exatamente_24h_e_ambiguo(self):
        ag = self.confirmado(quando=sp(2026, 11, 17, 9))
        ag = self.cancelar(ag, sp(2026, 11, 16, 9))
        self.assertEqual(ag.cancelamento_minutos_antecedencia, 1440)
        self.assertEqual(ag.cancelamento_classificacao, ClassificacaoCancelamento.AMBIGUO)

    def test_criterios_divergentes_sao_ambiguos(self):
        # sexta 18h → segunda 9h: 63 h (>24 h) e 1 dia útil → superior
        ag = self.cancelar(self.confirmado(), sp(2026, 11, 13, 18))
        self.assertEqual(ag.cancelamento_classificacao, ClassificacaoCancelamento.ANTECEDENCIA_SUPERIOR)
        # segunda 20h → terça 9h: 13 h (<24 h) mas 1 dia útil → critérios divergem
        ag2 = self.cancelar(self.confirmado(quando=sp(2026, 11, 17, 9)), sp(2026, 11, 16, 20))
        self.assertEqual(ag2.cancelamento_classificacao, ClassificacaoCancelamento.AMBIGUO)
        # sábado 8h → domingo 9h? usa evento domingo: 25 h, 0 dia útil → divergem
        ag3 = self.cancelar(self.confirmado(quando=sp(2026, 11, 22, 9)), sp(2026, 11, 21, 8))
        self.assertEqual(ag3.cancelamento_classificacao, ClassificacaoCancelamento.AMBIGUO)

    def test_solicitante_nao_cancela_pedido_de_outro(self):
        ag = self.novo_agendamento(ator=self.operador)
        with self.assertRaises(PermissionDenied):
            agendamentos.cancelar(self.solicitante, ag, "x")


class AlteracaoEAlertas(Cenario):
    def test_alteracao_de_horario_registra_antes_e_depois_e_alerta(self):
        ag = self.confirmado()
        novo = ag.inicio_previsto + timedelta(hours=2)
        with self.agora(ag.inicio_previsto - timedelta(days=5)):
            with self.captureOnCommitCallbacks(execute=True):
                agendamentos.alterar_horario(self.solicitante, ag, novo, 120, "Mudança de sala fictícia")
        ev = EventoAuditoria.objects.filter(entidade_id=str(ag.pk), acao="ALTERACAO_HORARIO").get()
        self.assertIn("inicio_previsto", ev.dados_anteriores)
        self.assertIn("inicio_previsto", ev.dados_posteriores)
        self.assertEqual(ev.justificativa, "Mudança de sala fictícia")
        self.assertTrue(Notificacao.objects.filter(agendamento=ag, tipo=TipoNotificacao.ALTERACAO_HORARIO).exists())

    def test_confirmacao_exige_escala_completa_e_alerta(self):
        ag = self.novo_agendamento()
        agendamentos.escalar(self.operador, ag, self.interpretes[0])
        with self.assertRaises(ErroRegra):
            agendamentos.confirmar(self.operador, ag)
        agendamentos.escalar(self.operador, ag, self.interpretes[1])
        agendamentos.confirmar(self.operador, ag)
        self.assertTrue(Notificacao.objects.filter(agendamento=ag, tipo=TipoNotificacao.CONFIRMACAO).exists())

    def test_prefeitura_nao_confirma(self):
        ag = self.novo_agendamento()
        with self.assertRaises(PermissionDenied):
            agendamentos.confirmar(self.fiscal, ag)

    def test_cancelamento_de_escala_alerta_e_reabre_confirmacao(self):
        ag = self.confirmado()
        e = ag.escalas.filter(ativa=True).first()
        agendamentos.cancelar_escala(self.operador, e, "Intérprete doente (fictício)")
        ag.refresh_from_db()
        self.assertEqual(ag.status, StatusAgendamento.SOLICITADO)
        self.assertTrue(Notificacao.objects.filter(agendamento=ag, tipo=TipoNotificacao.CANCELAMENTO_ESCALA).exists())

    def test_substituicao_mantem_confirmado(self):
        ag = self.confirmado()
        e = ag.escalas.filter(ativa=True).first()
        nova = agendamentos.cancelar_escala(self.operador, e, "Substituição", substituto=self.interpretes[2])
        ag.refresh_from_db()
        self.assertEqual(ag.status, StatusAgendamento.CONFIRMADO)
        self.assertEqual(nova.substitui_id, e.pk)
