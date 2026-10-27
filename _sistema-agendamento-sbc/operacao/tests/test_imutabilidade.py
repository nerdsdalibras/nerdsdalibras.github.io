from django.db import DatabaseError, connection, transaction

from operacao.models import Agendamento, EventoAuditoria, ExclusaoProibida, StatusAgendamento
from operacao.servicos import agendamentos, homologacao
from operacao.servicos.auditoria import verificar_cadeia

from .base import Cenario


class TravasBanco(Cenario):
    def sql_falha(self, sql, params=None):
        with self.assertRaises(DatabaseError):
            with transaction.atomic():
                with connection.cursor() as c:
                    c.execute(sql, params or [])

    def test_delete_de_agendamento_bloqueado_no_banco_e_na_aplicacao(self):
        ag = self.novo_agendamento()
        with self.assertRaises(ExclusaoProibida):
            ag.delete()
        self.sql_falha("DELETE FROM operacao_agendamento WHERE id = %s", [ag.pk])
        self.sql_falha("TRUNCATE operacao_agendamento CASCADE")

    def test_auditoria_append_only(self):
        self.novo_agendamento()
        ev = EventoAuditoria.objects.first()
        self.sql_falha("UPDATE operacao_eventoauditoria SET justificativa = 'adulterado' WHERE id = %s", [ev.pk])
        self.sql_falha("DELETE FROM operacao_eventoauditoria WHERE id = %s", [ev.pk])
        with self.assertRaises(ExclusaoProibida):
            ev.save()

    def test_cadeia_de_hash_integra_e_detecta_adulteracao(self):
        for _ in range(3):
            self.novo_agendamento()
        self.assertEqual(verificar_cadeia(), [])
        ev = EventoAuditoria.objects.order_by("id")[1]
        with connection.cursor() as c:  # simula adulteração por quem desliga triggers (superusuário)
            c.execute("SET CONSTRAINTS ALL IMMEDIATE")
            c.execute("ALTER TABLE operacao_eventoauditoria DISABLE TRIGGER USER")
            c.execute("UPDATE operacao_eventoauditoria SET justificativa = 'adulterado' WHERE id = %s", [ev.pk])
            c.execute("ALTER TABLE operacao_eventoauditoria ENABLE TRIGGER USER")
        self.assertIn(ev.pk, verificar_cadeia())

    def test_campos_originais_imutaveis(self):
        ag = self.novo_agendamento()
        self.sql_falha("UPDATE operacao_agendamento SET criado_em = now() WHERE id = %s", [ag.pk])
        self.sql_falha("UPDATE operacao_agendamento SET fora_do_prazo = NOT fora_do_prazo WHERE id = %s", [ag.pk])

    def test_cancelado_e_imutavel(self):
        ag = self.confirmado()
        with self.agora(ag.inicio_previsto - __import__("datetime").timedelta(days=5)):
            agendamentos.cancelar(self.solicitante, ag, "motivo")
        self.sql_falha("UPDATE operacao_agendamento SET status = 'CONFIRMADO' WHERE id = %s", [ag.pk])

    def test_homologado_pelas_duas_partes_fica_travado(self):
        ag, m = self.realizado(120)
        homologacao.homologar(self.operador, ag, "conferido")
        ag.refresh_from_db()
        self.assertEqual(ag.status, StatusAgendamento.REALIZADO)
        homologacao.homologar(self.fiscal, ag, "atestado")
        ag.refresh_from_db()
        self.assertEqual(ag.status, StatusAgendamento.HOMOLOGADO)
        self.sql_falha("UPDATE operacao_agendamento SET local = 'x' WHERE id = %s", [ag.pk])
        self.sql_falha("UPDATE operacao_escala SET ativa = false WHERE agendamento_id = %s", [ag.pk])
        self.sql_falha(
            "INSERT INTO operacao_medicao (agendamento_id, versao, parametro_id, minutos_previstos, minutos_realizados, excedente_min,"
            " preco_unitario, situacao, pendencias, regra_aplicada, alerta_revezamento, fundamentacao, criada_em, criada_por_id, parecer)"
            " VALUES (%s, 99, %s, 1, 1, 0, 1, 'AUTOMATICA', '[]', 'x', false, '', now(), %s, '')",
            [ag.pk, self.parametro.pk, self.operador.usuario.pk],
        )
        self.sql_falha("UPDATE operacao_medicao SET valor_total = 1 WHERE id = %s", [m.pk])
        with self.assertRaises(Exception):
            with transaction.atomic():
                agendamentos.registrar_realizacao(self.operador, ag, ag.inicio_realizado, ag.fim_realizado, "tentativa")

    def test_homologacao_parcial_perde_efeito_se_dados_mudam(self):
        from datetime import timedelta

        ag, _ = self.realizado(120)
        homologacao.homologar(self.operador, ag)
        with self.agora(ag.inicio_previsto + timedelta(hours=5)):
            agendamentos.registrar_realizacao(self.operador, ag, ag.inicio_previsto, ag.inicio_previsto + timedelta(minutes=125), "correção")
        ag.refresh_from_db()
        homologacao.homologar(self.fiscal, ag)
        ag.refresh_from_db()
        self.assertEqual(ag.status, StatusAgendamento.REALIZADO)  # contratada precisa homologar o novo estado
        self.assertEqual(ag.homologacoes.count(), 2)
        homologacao.homologar(self.operador, ag)
        ag.refresh_from_db()
        self.assertEqual(ag.status, StatusAgendamento.HOMOLOGADO)

    def test_parametro_aprovado_imutavel(self):
        self.sql_falha("UPDATE operacao_parametromedicao SET preco_unitario_hora = 1 WHERE id = %s", [self.parametro.pk])

    def test_politica_retencao_decidida_imutavel(self):
        from operacao.servicos import parametros

        p = parametros.propor_retencao(self.operador, "Prazo fictício", "Norma fictícia")
        self.sql_falha("UPDATE operacao_politicaretencao SET prazo_descricao = 'outro' WHERE id = %s", [p.pk])
        parametros.decidir_retencao(self.fiscal, p, True, "ok")
        self.sql_falha("UPDATE operacao_politicaretencao SET parecer = 'x' WHERE id = %s", [p.pk])
