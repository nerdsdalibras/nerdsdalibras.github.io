"""Auditoria funcional (itens 1–20). Exercita o servidor por requisições HTTP
diretas sempre que possível, conferindo o estado do banco antes/depois."""
from datetime import date, datetime, timedelta
from datetime import timezone as dt_timezone
from decimal import Decimal
from unittest import mock

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.exceptions import PermissionDenied
from django.db import DatabaseError, connection, transaction
from django.test import Client, override_settings
from django.urls import reverse
from django.utils import timezone

from operacao.models import (
    Agendamento, AvisoInterno, Chamado, Contrato, Escala, EventoAuditoria, Feriado, Interprete, Medicao,
    Notificacao, ParametroMedicao, PedidoIndenizacao, Perfil, RelatorioMensal, StatusAgendamento,
    StatusNotificacao, Vinculo,
)
from operacao.servicos import (
    agendamentos, auditoria, cadastros, calendario, chamados, homologacao, indenizacao, medicao, notificacoes,
    parametros, relatorios,
)
from operacao.servicos.base import Ator, ErroRegra
from operacao.servicos.parametros import FAIXAS_EDITAL

from .base import Cenario, sp

LOCMEM = dict(EMAIL_ENVIO_HABILITADO=True, EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
DADOS_FORM = {
    "titulo": "Evento auditoria", "unidade_solicitante": "Unidade X", "modalidade": "PRESENCIAL",
    "local": "Sala 1", "inicio_previsto": "2026-11-16T09:00", "duracao_prevista_min": "120",
    "qtd_profissionais": "2", "observacoes": "",
}


class Base(Cenario):
    def cliente(self, perfil, csrf=False):
        c = Client(enforce_csrf_checks=csrf)
        c.force_login(self.atores[perfil].usuario)
        sessao = c.session
        sessao.set_expiry(10 * 365 * 24 * 3600)  # o relógio simulado não pode expirar a sessão
        sessao.save()
        return c

    def assertAutenticado(self, resposta):
        """Garante que a resposta não foi um redirecionamento para o login (falso positivo)."""
        self.assertNotIn("/contas/entrar/", resposta.get("Location", ""))
        return resposta

    def estado(self, ag):
        """Fotografia do registro + quantidade de eventos de auditoria."""
        return auditoria.serializar(Agendamento.objects.get(pk=ag.pk)), EventoAuditoria.objects.count()


# 1 ------------------------------------------------------------------------------------------
class A01CriacaoPorPerfil(Base):
    def test_prefeitura_e_contratada_criam_admin_e_anonimo_nao(self):
        for perfil, parte in ((Perfil.SOLICITANTE, "PREFEITURA"), (Perfil.FISCAL, "PREFEITURA"), (Perfil.OPERADOR, "CONTRATADA")):
            with self.subTest(perfil=perfil), self.agora(sp(2026, 11, 2, 9)):
                antes = set(Agendamento.objects.values_list("pk", flat=True))
                r = self.assertAutenticado(self.cliente(perfil).post(reverse("operacao:agendamento_novo"), DADOS_FORM))
                self.assertEqual(r.status_code, 302)
                novos = Agendamento.objects.exclude(pk__in=antes)
                self.assertEqual(novos.count(), 1)
                ag = novos.get()
                self.assertEqual(ag.parte_criadora, parte)
                self.assertEqual(ag.criado_por, self.atores[perfil].usuario)
                # 09:00 em São Paulo = 12:00 UTC
                self.assertEqual(ag.inicio_previsto, sp(2026, 11, 16, 9))
                self.assertEqual(ag.inicio_previsto.astimezone(dt_timezone.utc).hour, 12)
        total = Agendamento.objects.count()
        r = self.cliente(Perfil.ADMIN_TECNICO).post(reverse("operacao:agendamento_novo"), DADOS_FORM)
        self.assertEqual(r.status_code, 403)
        r = Client().post(reverse("operacao:agendamento_novo"), DADOS_FORM)
        self.assertEqual(r.status_code, 302)
        self.assertIn("/contas/entrar/", r["Location"])
        self.assertEqual(Agendamento.objects.count(), total)

    def test_solicitante_ve_apenas_os_proprios(self):
        do_operador = self.novo_agendamento(ator=self.operador)
        proprio = self.novo_agendamento()
        c = self.cliente(Perfil.SOLICITANTE)
        html = c.get(reverse("operacao:agendamentos")).content.decode()
        csv = c.get(reverse("operacao:agendamentos") + "?formato=csv").content.decode()
        self.assertIn(proprio.codigo, html)
        self.assertNotIn(do_operador.codigo, html)
        self.assertNotIn(do_operador.codigo, csv)


# 2 ------------------------------------------------------------------------------------------
@override_settings(**LOCMEM)
class A02Confirmacao(Base):
    def test_confirmacao_registra_profissionais_e_alerta_fiscais(self):
        ag = self.novo_agendamento()
        c = self.cliente(Perfil.OPERADOR)
        with self.captureOnCommitCallbacks(execute=True):
            c.post(reverse("operacao:agendamento_escalar", args=[ag.pk]), {"interprete": self.interpretes[0].pk})
            r = c.post(reverse("operacao:agendamento_confirmar", args=[ag.pk]))  # escala incompleta
        ag.refresh_from_db()
        self.assertEqual(ag.status, StatusAgendamento.SOLICITADO)
        self.assertFalse(Notificacao.objects.filter(tipo="CONFIRMACAO").exists())
        with self.captureOnCommitCallbacks(execute=True):
            c.post(reverse("operacao:agendamento_escalar", args=[ag.pk]), {"interprete": self.interpretes[1].pk})
            c.post(reverse("operacao:agendamento_confirmar", args=[ag.pk]))
        ag.refresh_from_db()
        self.assertEqual(ag.status, StatusAgendamento.CONFIRMADO)
        self.assertEqual(ag.confirmado_por, self.operador.usuario)
        self.assertIsNotNone(ag.confirmado_em)
        nomes = sorted(e.interprete.nome_completo for e in ag.escalas_ativas())
        self.assertEqual(nomes, ["Intérprete 1", "Intérprete 2"])
        n = Notificacao.objects.get(tipo="CONFIRMACAO", agendamento=ag)
        self.assertEqual(n.destinatarios, [self.fiscal.usuario.email])  # só fiscais/gestores
        self.assertIn("Intérprete 1", n.corpo)
        self.assertIn("Intérprete 2", n.corpo)
        self.assertEqual(n.status, StatusNotificacao.ENVIADA)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, [self.fiscal.usuario.email])
        self.assertTrue(AvisoInterno.objects.filter(notificacao=n, usuario=self.fiscal.usuario).exists())
        self.assertFalse(AvisoInterno.objects.filter(notificacao=n, usuario=self.solicitante.usuario).exists())
        # contatos dos intérpretes não trafegam por e-mail
        self.assertNotIn("@exemplo.invalid", mail.outbox[0].body.replace(self.fiscal.usuario.email, ""))


# 3 ------------------------------------------------------------------------------------------
class A03AlteracaoHorario(Base):
    def test_exige_justificativa_preserva_anterior_registra_usuario_data_hora(self):
        quando = timezone.localtime().replace(second=0, microsecond=0) + timedelta(days=30)
        ag = agendamentos.criar(self.solicitante, titulo="T", unidade_solicitante="U", modalidade="REMOTO", local="P",
                                inicio_previsto=quando, duracao_prevista_min=60, qtd_profissionais=1)
        c = self.cliente(Perfil.SOLICITANTE)
        url = reverse("operacao:agendamento_alterar", args=[ag.pk])
        novo = (quando + timedelta(hours=3)).strftime("%Y-%m-%dT%H:%M")
        foto = self.estado(ag)
        c.post(url, {"inicio_previsto": novo, "duracao_prevista_min": 60, "qtd_profissionais": 1, "justificativa": "   "})
        self.assertEqual(self.estado(ag), foto)  # nada mudou sem justificativa
        antes_req = timezone.now()
        with self.captureOnCommitCallbacks(execute=True):
            c.post(url, {"inicio_previsto": novo, "duracao_prevista_min": 60, "qtd_profissionais": 1, "justificativa": "Troca de sala"})
        ag.refresh_from_db()
        self.assertEqual(ag.inicio_previsto, quando + timedelta(hours=3))
        ev = EventoAuditoria.objects.get(entidade_id=str(ag.pk), acao="ALTERACAO_HORARIO")
        self.assertEqual(ev.usuario, self.solicitante.usuario)
        self.assertEqual(ev.justificativa, "Troca de sala")
        self.assertEqual(datetime.fromisoformat(ev.dados_anteriores["inicio_previsto"]), quando)
        self.assertEqual(datetime.fromisoformat(ev.dados_posteriores["inicio_previsto"]), quando + timedelta(hours=3))
        self.assertLess(abs((ev.ocorrido_em - antes_req).total_seconds()), 60)  # data/hora do banco
        original = EventoAuditoria.objects.get(entidade_id=str(ag.pk), acao="CRIACAO")
        self.assertEqual(datetime.fromisoformat(original.dados_posteriores["inicio_previsto"]), quando)
        self.assertTrue(Notificacao.objects.filter(agendamento=ag, tipo="ALTERACAO_HORARIO").exists())


# 4 ------------------------------------------------------------------------------------------
class A04Cancelamento(Base):
    def test_cancelar_preserva_original_e_alerta(self):
        ag = self.confirmado()
        original = auditoria.serializar(ag, ["titulo", "local", "inicio_previsto", "duracao_prevista_min", "criado_em", "codigo"])
        c = self.cliente(Perfil.FISCAL)
        url = reverse("operacao:agendamento_cancelar", args=[ag.pk])
        with self.agora(ag.inicio_previsto - timedelta(days=5)):
            c.post(url, {"justificativa": ""})
            ag.refresh_from_db()
            self.assertEqual(ag.status, StatusAgendamento.CONFIRMADO)
            with self.captureOnCommitCallbacks(execute=True):
                c.post(url, {"justificativa": "Unidade fechada"})
        ag.refresh_from_db()
        self.assertEqual(ag.status, StatusAgendamento.CANCELADO)
        self.assertEqual(auditoria.serializar(ag, list(original)), original)
        self.assertEqual(ag.escalas.filter(ativa=False).count(), 2)
        n = Notificacao.objects.get(agendamento=ag, tipo="CANCELAMENTO_AGENDAMENTO")
        self.assertIn("Unidade fechada", n.corpo)
        self.assertIn("Escalas canceladas", n.corpo)
        self.assertTrue(EventoAuditoria.objects.filter(entidade_id=str(ag.pk), acao="CRIACAO").exists())

    def test_cancelamento_de_escala_alerta(self):
        ag = self.confirmado()
        e = ag.escalas.filter(ativa=True).first()
        self.cliente(Perfil.OPERADOR).post(reverse("operacao:escala_cancelar", args=[ag.pk, e.pk]), {"motivo": "Indisposição"})
        self.assertTrue(Notificacao.objects.filter(agendamento=ag, tipo="CANCELAMENTO_ESCALA").exists())
        self.assertTrue(Escala.objects.filter(pk=e.pk, ativa=False).exists())


# 5 ------------------------------------------------------------------------------------------
class A05SemPermissao(Base):
    def test_requisicoes_diretas_sem_permissao_nao_alteram_nada(self):
        ag = self.confirmado()
        outro = self.novo_agendamento(ator=self.operador, quando=sp(2026, 11, 20, 9))
        p = parametros.propor_parametro(self.operador, "170", FAIXAS_EDITAL, date(2026, 1, 1), "proposta")
        u = lambda n, *a: reverse(f"operacao:{n}", args=a)  # noqa: E731
        casos = [
            (Perfil.SOLICITANTE, u("agendamento_confirmar", ag.pk), {}),
            (Perfil.SOLICITANTE, u("agendamento_escalar", ag.pk), {"interprete": self.interpretes[2].pk}),
            (Perfil.SOLICITANTE, u("agendamento_realizacao", ag.pk), {"inicio_realizado": "2026-11-16T09:00", "fim_realizado": "2026-11-16T11:00"}),
            (Perfil.SOLICITANTE, u("agendamento_cancelar", outro.pk), {"justificativa": "x"}),
            (Perfil.SOLICITANTE, u("agendamento_alterar", outro.pk), {"inicio_previsto": "2026-11-21T09:00", "duracao_prevista_min": 60, "qtd_profissionais": 1, "justificativa": "x"}),
            (Perfil.SOLICITANTE, u("parametro_decidir", p.pk), {"decisao": "aprovar", "parecer": "x"}),
            (Perfil.FISCAL, u("agendamento_confirmar", outro.pk), {}),
            (Perfil.FISCAL, u("agendamento_escalar", outro.pk), {"interprete": self.interpretes[2].pk}),
            (Perfil.FISCAL, u("agendamento_realizacao", ag.pk), {"inicio_realizado": "2026-11-16T09:00", "fim_realizado": "2026-11-16T11:00"}),
            (Perfil.OPERADOR, u("parametro_decidir", p.pk), {"decisao": "aprovar", "parecer": "x"}),
            (Perfil.OPERADOR, u("feriados"), {"data": "2026-12-24", "descricao": "x"}),
            (Perfil.OPERADOR, u("usuarios"), {"nome_completo": "X", "email": "x@exemplo.invalid", "perfil": "FISCAL"}),
            (Perfil.ADMIN_TECNICO, u("agendamento_cancelar", ag.pk), {"justificativa": "x"}),
            (Perfil.ADMIN_TECNICO, u("agendamento_alterar", ag.pk), {"inicio_previsto": "2026-11-21T09:00", "duracao_prevista_min": 120, "qtd_profissionais": 2, "justificativa": "x"}),
            (Perfil.ADMIN_TECNICO, u("parametros"), {"preco_unitario_hora": "1", "vigente_desde": "2026-01-01", "faixas": "1;10;0", "justificativa": "x"}),
            (Perfil.ADMIN_TECNICO, u("agendamento_homologar", ag.pk), {}),
        ]
        fotos = (self.estado(ag), self.estado(outro), ParametroMedicao.objects.get(pk=p.pk).situacao,
                 Feriado.objects.count(), get_user_model().objects.count(), ParametroMedicao.objects.count())
        for perfil, url, dados in casos:
            with self.subTest(perfil=perfil, url=url):
                r = self.cliente(perfil).post(url, dados)
                self.assertIn(r.status_code, (403, 404), r.status_code)
        self.assertEqual((self.estado(ag)[0], self.estado(outro)[0]), (fotos[0][0], fotos[1][0]))
        self.assertEqual(EventoAuditoria.objects.count(), fotos[0][1])
        self.assertEqual(ParametroMedicao.objects.get(pk=p.pk).situacao, "PROPOSTO")
        self.assertEqual(Feriado.objects.count(), fotos[3])
        self.assertEqual(get_user_model().objects.count(), fotos[4])
        self.assertEqual(ParametroMedicao.objects.count(), fotos[5])

    def test_get_em_endpoint_de_alteracao_e_post_sem_csrf_sao_rejeitados(self):
        ag = self.novo_agendamento()
        self.assertEqual(self.cliente(Perfil.OPERADOR).get(reverse("operacao:agendamento_confirmar", args=[ag.pk])).status_code, 405)
        r = self.cliente(Perfil.SOLICITANTE, csrf=True).post(reverse("operacao:agendamento_cancelar", args=[ag.pk]), {"justificativa": "x"})
        self.assertEqual(r.status_code, 403)
        ag.refresh_from_db()
        self.assertEqual(ag.status, StatusAgendamento.SOLICITADO)

    def test_admin_tecnico_nao_cria_nem_promove_perfil_da_prefeitura(self):
        """Sem esta trava, a contratada criaria um 'fiscal' e aprovaria os próprios parâmetros."""
        c = self.cliente(Perfil.ADMIN_TECNICO)
        c.post(reverse("operacao:usuarios"), {"nome_completo": "Falso Fiscal", "email": "falso@exemplo.invalid", "perfil": "FISCAL"})
        self.assertFalse(Vinculo.objects.filter(usuario__email="falso@exemplo.invalid", perfil="FISCAL", ativo=True).exists())
        v_op = Vinculo.objects.get(usuario=self.operador.usuario)
        c.post(reverse("operacao:vinculo_alterar", args=[v_op.pk]), {"perfil": "FISCAL", "ativo": "on", "justificativa": "x"})
        v_op.refresh_from_db()
        self.assertEqual(v_op.perfil, Perfil.OPERADOR)
        v_fiscal = Vinculo.objects.get(usuario=self.fiscal.usuario)
        c.post(reverse("operacao:vinculo_alterar", args=[v_fiscal.pk]), {"perfil": "FISCAL", "justificativa": "desativar"})
        v_fiscal.refresh_from_db()
        self.assertTrue(v_fiscal.ativo)
        # caminhos permitidos: cada parte gere os próprios perfis
        c.post(reverse("operacao:usuarios"), {"nome_completo": "Novo Operador", "email": "novo.op@exemplo.invalid", "perfil": "OPERADOR"})
        self.assertTrue(Vinculo.objects.filter(usuario__email="novo.op@exemplo.invalid", perfil="OPERADOR").exists())
        f = self.cliente(Perfil.FISCAL)
        f.post(reverse("operacao:usuarios"), {"nome_completo": "Nova Fiscal", "email": "nova.fiscal@exemplo.invalid", "perfil": "FISCAL"})
        self.assertTrue(Vinculo.objects.filter(usuario__email="nova.fiscal@exemplo.invalid", perfil="FISCAL").exists())
        self.assertTrue(Notificacao.objects.filter(tipo="ACESSO_PREFEITURA").exists())
        f.post(reverse("operacao:usuarios"), {"nome_completo": "Op Falso", "email": "op.falso@exemplo.invalid", "perfil": "OPERADOR"})
        self.assertFalse(Vinculo.objects.filter(usuario__email="op.falso@exemplo.invalid").exists())


# 6 ------------------------------------------------------------------------------------------
class A06RealizadosHomologados(Base):
    def test_homologado_resiste_a_todas_as_requisicoes_e_sql_do_papel_da_aplicacao(self):
        ag, m = self.realizado(120)
        homologacao.homologar(self.operador, ag)
        homologacao.homologar(self.fiscal, ag)
        ag.refresh_from_db()
        self.assertEqual(ag.status, StatusAgendamento.HOMOLOGADO)
        foto = self.estado(ag)
        medicoes = list(Medicao.objects.filter(agendamento=ag).values())
        e = ag.escalas.filter(ativa=True).first()
        u = lambda n, *a: reverse(f"operacao:{n}", args=a)  # noqa: E731
        for perfil, url, dados in [
            (Perfil.OPERADOR, u("agendamento_realizacao", ag.pk), {"inicio_realizado": "2026-11-16T09:00", "fim_realizado": "2026-11-16T12:00", "justificativa": "x"}),
            (Perfil.OPERADOR, u("escala_cancelar", ag.pk, e.pk), {"motivo": "x"}),
            (Perfil.OPERADOR, u("medicao_propor", ag.pk), {"minutos_faturaveis": 300, "fundamentacao": "x"}),
            (Perfil.FISCAL, u("agendamento_cancelar", ag.pk), {"justificativa": "x"}),
            (Perfil.FISCAL, u("agendamento_alterar", ag.pk), {"inicio_previsto": "2026-12-01T09:00", "duracao_prevista_min": 120, "qtd_profissionais": 2, "justificativa": "x"}),
            (Perfil.FISCAL, u("agendamento_homologar", ag.pk), {}),
        ]:
            with self.subTest(url=url), self.agora(ag.inicio_previsto + timedelta(days=1)):
                r = self.assertAutenticado(self.cliente(perfil).post(url, dados))
                self.assertEqual(r.status_code, 302)  # processado e redirecionado ao detalhe (com erro de regra)
        self.assertEqual(self.estado(ag), foto)
        self.assertEqual(list(Medicao.objects.filter(agendamento=ag).values()), medicoes)
        with self.assertRaises(Exception):
            ag.delete()
        for sql in ("DELETE FROM operacao_agendamento WHERE id=%s", "UPDATE operacao_agendamento SET local='x' WHERE id=%s",
                    "UPDATE operacao_medicao SET valor_total=0 WHERE agendamento_id=%s", "DELETE FROM operacao_medicao WHERE agendamento_id=%s",
                    "UPDATE operacao_homologacao SET observacao='x' WHERE agendamento_id=%s"):
            with self.subTest(sql=sql), self.assertRaises(DatabaseError), transaction.atomic(), connection.cursor() as c:
                c.execute(sql, [ag.pk])

    def test_realizado_nao_homologado_so_muda_por_correcao_justificada_e_versionada(self):
        ag, m1 = self.realizado(120)
        c = self.cliente(Perfil.OPERADOR)
        url = reverse("operacao:agendamento_realizacao", args=[ag.pk])
        with self.agora(ag.inicio_previsto + timedelta(days=1)):
            c.post(url, {"inicio_realizado": "2026-11-16T09:00", "fim_realizado": "2026-11-16T11:15", "justificativa": ""})
            self.assertEqual(ag.medicoes.count(), 1)
            c.post(url, {"inicio_realizado": "2026-11-16T09:00", "fim_realizado": "2026-11-16T11:15", "justificativa": "Erro de digitação"})
        self.assertEqual(ag.medicoes.count(), 2)
        m1.refresh_from_db()
        self.assertEqual(m1.minutos_faturaveis, 120)  # versão anterior intacta
        self.assertTrue(EventoAuditoria.objects.filter(entidade_id=str(ag.pk), acao="REGISTRO_REALIZACAO", justificativa="Erro de digitação").exists())
        with self.assertRaises(DatabaseError), transaction.atomic(), connection.cursor() as cur:
            cur.execute("DELETE FROM operacao_agendamento WHERE id=%s", [ag.pk])


# 7 e 8 ---------------------------------------------------------------------------------------
class A07A08Parametros(Base):
    def test_contratada_propoe_mas_nao_vigora_sem_aprovacao(self):
        c = self.cliente(Perfil.OPERADOR)
        c.post(reverse("operacao:parametros"), {"preco_unitario_hora": "999.0000", "vigente_desde": "2026-01-01",
                                                "faixas": "1;10;60\n11;60;120", "justificativa": "tentativa"})
        p = ParametroMedicao.objects.get(versao=2)
        self.assertEqual(p.situacao, "PROPOSTO")
        ag, m = self.realizado(68, duracao=60, qtd=1)
        self.assertEqual(m.parametro_id, self.parametro.pk)  # v1 continua vigente
        self.assertEqual(m.minutos_faturaveis, 60)
        self.assertEqual(c.post(reverse("operacao:parametro_decidir", args=[p.pk]), {"decisao": "aprovar", "parecer": "x"}).status_code, 403)
        with self.assertRaises(PermissionDenied):
            parametros.decidir_parametro(self.operador, p, True, "x")
        with self.assertRaises(DatabaseError), transaction.atomic(), connection.cursor() as cur:  # editar proposta
            cur.execute("UPDATE operacao_parametromedicao SET preco_unitario_hora=1 WHERE id=%s", [p.pk])

    def test_aprovacao_gera_versao_e_nao_altera_medicoes_anteriores(self):
        ag1, m1 = self.realizado(120)
        foto_m1 = Medicao.objects.filter(pk=m1.pk).values().get()
        foto_v1 = ParametroMedicao.objects.filter(pk=self.parametro.pk).values().get()
        p2 = parametros.propor_parametro(self.operador, "200.1234", FAIXAS_EDITAL, date(2026, 11, 17), "Reajuste fictício")
        self.cliente(Perfil.FISCAL).post(reverse("operacao:parametro_decidir", args=[p2.pk]), {"decisao": "aprovar", "parecer": "ok"})
        p2.refresh_from_db()
        self.assertEqual((p2.versao, p2.situacao, p2.decidido_por), (2, "APROVADO", self.fiscal.usuario))
        self.assertEqual(Medicao.objects.filter(pk=m1.pk).values().get(), foto_m1)
        self.assertEqual(ParametroMedicao.objects.filter(pk=self.parametro.pk).values().get(), foto_v1)
        ag2, m2 = self.realizado(120, quando=sp(2026, 11, 18, 9))
        self.assertEqual(m2.parametro.versao, 2)
        self.assertEqual(m2.valor_total, Decimal("400.25"))  # 200,1234 × 2 = 400,2468 → 400,25
        self.assertTrue(EventoAuditoria.objects.filter(entidade="ParametroMedicao", entidade_id=str(p2.pk), acao="APROVACAO").exists())


# 9 a 12 --------------------------------------------------------------------------------------
class A09A12Medicao(Base):
    def test_duas_horas_dois_interpretes(self):
        ag, m = self.realizado(120, duracao=120, qtd=2)
        self.assertEqual(ag.escalas.filter(ativa=True).count(), 2)
        self.assertEqual((m.minutos_faturaveis, m.horas_faturaveis, m.valor_total), (120, Decimal("2.0000"), Decimal("313.20")))

    def test_revezamento_sinalizado(self):
        c = self.cliente(Perfil.SOLICITANTE)
        with self.agora(sp(2026, 11, 2, 9)):
            c.post(reverse("operacao:agendamento_novo"), {**DADOS_FORM, "duracao_prevista_min": "61", "qtd_profissionais": "1"})
        self.assertFalse(Agendamento.objects.filter(duracao_prevista_min=61).exists())
        ag = self.novo_agendamento(duracao=60, qtd=1)
        with self.agora(sp(2026, 11, 2, 9)), self.assertRaises(ErroRegra):
            agendamentos.alterar_horario(self.solicitante, ag, ag.inicio_previsto, 90, "x")
        ag2, m = self.realizado(75, duracao=60, qtd=1, quando=sp(2026, 11, 18, 9))
        self.assertTrue(m.alerta_revezamento)
        html = self.cliente(Perfil.FISCAL).get(reverse("operacao:agendamento", args=[ag2.pk])).content.decode()
        self.assertIn("menos de dois intérpretes", html)
        with self.agora(sp(2026, 12, 1, 9)):
            r = relatorios.submeter(self.operador, date(2026, 11, 1))
        item = next(i for i in r.conteudo["atendimentos"] if i["codigo"] == ag2.codigo)
        self.assertTrue(item.get("alerta_revezamento"))

    def test_casos_do_enunciado_e_limites_pelo_fluxo_completo(self):
        casos = [  # (minutos reais para evento de 60 min, faturáveis esperados)
            (68, 60), (82, 90), (95, 90), (110, 120),
            (70, 60), (71, 90), (90, 90), (91, 90), (100, 90), (101, 120), (120, 120),
        ]
        for i, (real, esperado) in enumerate(casos):
            with self.subTest(real=real):
                ag, m = self.realizado(real, duracao=60, qtd=1, quando=sp(2026, 11, 2, 9) + timedelta(days=i))
                self.assertEqual(m.situacao, "AUTOMATICA")
                self.assertEqual(m.minutos_faturaveis, esperado)
                self.assertEqual(m.valor_total, (Decimal("156.60") * esperado / 60).quantize(Decimal("0.01")))

    def test_casos_nao_definidos_nao_recebem_regra(self):
        for i, (dur, real, pend) in enumerate([(60, 121, "EXCEDENTE_ACIMA_DA_TABELA"), (120, 100, "ATENDIMENTO_MAIS_CURTO"),
                                               (90, 90, "DURACAO_FRACIONADA"), (30, 30, "DURACAO_FRACIONADA")]):
            with self.subTest(dur=dur, real=real):
                ag, m = self.realizado(real, duracao=dur, qtd=2 if dur > 60 else 1, quando=sp(2026, 11, 2, 9) + timedelta(days=i))
                self.assertEqual(m.situacao, "PENDENTE_REGRA")
                self.assertIn(pend, m.pendencias)
                self.assertIsNone(m.minutos_faturaveis)
                self.assertIsNone(m.valor_total)
                self.assertIsNone(medicao.medicao_vigente(ag))
                with self.assertRaises(ErroRegra):
                    homologacao.homologar(self.operador, ag)
        with self.agora(sp(2026, 12, 1, 9)):
            r = relatorios.submeter(self.operador, date(2026, 11, 1))
        self.assertEqual(r.conteudo["totais"]["valor_horas_prestadas"], "0")
        self.assertEqual(len(r.conteudo["pendencias_medicao"]), 4)


# 13 ------------------------------------------------------------------------------------------
class A13Indenizacao(Base):
    def test_cancelamento_tardio_nao_gera_indenizacao_sem_confirmacao_evidencia_e_aprovacao(self):
        # sem confirmação
        ag0 = self.novo_agendamento(quando=sp(2026, 11, 17, 9))
        with self.agora(ag0.inicio_previsto - timedelta(hours=2)):
            agendamentos.cancelar(self.solicitante, ag0, "x")
        r = self.cliente(Perfil.OPERADOR).post(reverse("operacao:indenizacao_solicitar", args=[ag0.pk]), {"comprovacao": "Reserva"})
        self.assertFalse(PedidoIndenizacao.objects.exists())
        # confirmado e cancelado tarde
        ag = self.confirmado()
        with self.agora(ag.inicio_previsto - timedelta(hours=2)):
            agendamentos.cancelar(self.solicitante, ag, "x")
        self.assertFalse(PedidoIndenizacao.objects.exists())  # nada automático
        c = self.cliente(Perfil.OPERADOR)
        c.post(reverse("operacao:indenizacao_solicitar", args=[ag.pk]), {"comprovacao": ""})
        self.assertFalse(PedidoIndenizacao.objects.exists())  # sem evidência
        c.post(reverse("operacao:indenizacao_solicitar", args=[ag.pk]), {"comprovacao": "Declaração de reserva de agenda"})
        p = PedidoIndenizacao.objects.get()
        self.assertEqual(p.situacao, "SOLICITADA")
        url = reverse("operacao:indenizacao_decidir", args=[ag.pk, p.pk])
        self.assertEqual(c.post(url, {"decisao": "aprovar", "parecer": "x", "reserva_comprovada": "on"}).status_code, 403)
        self.cliente(Perfil.FISCAL).post(url, {"decisao": "aprovar", "parecer": "x"})  # sem atestar a comprovação
        p.refresh_from_db()
        self.assertEqual(p.situacao, "SOLICITADA")
        with self.agora(sp(2026, 12, 1, 9)):
            r = relatorios.consolidar(self.contrato, date(2026, 11, 1))
        self.assertEqual(r["totais"]["valor_indenizacoes"], "0")
        self.cliente(Perfil.FISCAL).post(url, {"decisao": "aprovar", "parecer": "Conferido", "reserva_comprovada": "on"})
        p.refresh_from_db()
        self.assertEqual(p.situacao, "APROVADA")
        r = relatorios.consolidar(self.contrato, date(2026, 11, 1))
        self.assertEqual(r["totais"]["valor_indenizacoes"], "313.20")
        self.assertEqual(r["totais"]["horas_prestadas"], "0")  # separada das horas prestadas


# 14 ------------------------------------------------------------------------------------------
class A14DiasUteis(Base):
    def test_fim_de_semana_feriado_configurado_e_desativacao(self):
        f = set()
        self.assertEqual(calendario.dias_uteis_entre(date(2026, 11, 13), date(2026, 11, 16), f), 1)  # sex→seg
        self.assertEqual(calendario.dias_uteis_entre(date(2026, 11, 13), date(2026, 11, 15), f), 0)  # sex→dom
        r1 = self.novo_agendamento(modalidade="REMOTO", duracao=60, qtd=1, quando=sp(2026, 11, 16, 9), criado=sp(2026, 11, 13, 17))
        self.assertFalse(r1.fora_do_prazo)
        feriado = cadastros.adicionar_feriado(self.fiscal, date(2026, 11, 16), "Feriado municipal fictício")
        r2 = self.novo_agendamento(modalidade="REMOTO", duracao=60, qtd=1, quando=sp(2026, 11, 16, 14), criado=sp(2026, 11, 13, 17))
        self.assertEqual(r2.antecedencia_dias_uteis, 0)
        self.assertTrue(r2.fora_do_prazo)
        p = self.novo_agendamento(quando=sp(2026, 11, 19, 9), criado=sp(2026, 11, 13, 17))  # ter, qua, qui = 3
        self.assertEqual(p.antecedencia_dias_uteis, 3)
        cadastros.desativar_feriado(self.fiscal, feriado, "Decreto revogado (fictício)")
        r2.refresh_from_db()
        self.assertTrue(r2.fora_do_prazo)  # registro anterior preservado


# 15 ------------------------------------------------------------------------------------------
class A15Isolamento(Base):
    def test_usuario_de_outro_contrato_nao_acessa_nada(self):
        ag, m = self.realizado(120)
        with self.agora(ag.inicio_previsto - timedelta(days=20)):
            ch = chamados.abrir(self.solicitante, "INTERCORRENCIA", "Chamado A", "desc", ag)
        with self.agora(sp(2026, 12, 1, 9)):
            rel = relatorios.submeter(self.operador, date(2026, 11, 1))
        p2 = parametros.propor_parametro(self.operador, "170", FAIXAS_EDITAL, date(2026, 1, 1), "x")
        fer = Feriado.objects.create(contrato=self.contrato, data=date(2026, 12, 24), descricao="x")
        notif = Notificacao.objects.filter(contrato=self.contrato).first()
        v_a = Vinculo.objects.get(usuario=self.operador.usuario)
        outro = Contrato.objects.create(codigo="b", orgao="Órgão B", contratada="C", referencia="R", prefixo_codigo="BBB")
        clientes = {}
        for perfil in Perfil.values:
            usr = get_user_model().objects.create_user(email=f"b-{perfil}@exemplo.invalid", nome_completo="B", password="senha-de-teste-123")
            usr.deve_trocar_senha = False
            usr.save()
            Vinculo.objects.create(usuario=usr, contrato=outro, perfil=perfil)
            clientes[perfil] = Client()
            clientes[perfil].force_login(usr)
        u = lambda n, *a: reverse(f"operacao:{n}", args=a)  # noqa: E731
        gets = [u("agendamento", ag.pk), u("agendamento_historico", ag.pk, "csv"), u("agendamento_historico", ag.pk, "pdf"),
                u("chamado", ch.pk), u("relatorio", rel.pk), u("relatorio", rel.pk) + "?formato=csv",
                u("interprete_editar", self.interpretes[0].pk)]
        posts = [u("parametro_decidir", p2.pk), u("feriado_desativar", fer.pk), u("notificacao_reenviar", notif.pk),
                 u("vinculo_alterar", v_a.pk), u("agendamento_cancelar", ag.pk), u("agendamento_escalar", ag.pk)]
        for perfil, c in clientes.items():
            for url in gets:
                with self.subTest(perfil=perfil, get=url):
                    self.assertIn(c.get(url).status_code, (403, 404))
            for url in posts:
                with self.subTest(perfil=perfil, post=url):
                    self.assertIn(c.post(url, {"decisao": "aprovar", "parecer": "x", "justificativa": "x", "perfil": "FISCAL"}).status_code, (403, 404))
            for url in (u("agendamentos"), u("agendamentos") + "?formato=csv", u("chamados"), u("avisos"), u("relatorios"),
                        u("parametros"), u("interpretes"), u("auditoria") + "?formato=csv", u("feriados"), u("painel")):
                r = c.get(url)
                if r.status_code == 200:
                    corpo = r.content.decode()
                    with self.subTest(perfil=perfil, lista=url):
                        for segredo in (ag.codigo, ch.codigo, self.interpretes[0].email, "Intérprete 1", "170,0000"):
                            self.assertNotIn(segredo, corpo)
        p2.refresh_from_db()
        self.assertEqual(p2.situacao, "PROPOSTO")
        ag.refresh_from_db()
        self.assertEqual(ag.status, StatusAgendamento.REALIZADO)

    def test_sessao_adulterada_nao_seleciona_vinculo_alheio(self):
        outro = Contrato.objects.create(codigo="b", orgao="B", contratada="C", referencia="R", prefixo_codigo="BBB")
        usr = get_user_model().objects.create_user(email="z@exemplo.invalid", nome_completo="Z", password="senha-de-teste-123")
        usr.deve_trocar_senha = False
        usr.save()
        Vinculo.objects.create(usuario=usr, contrato=outro, perfil=Perfil.FISCAL)
        c = Client()
        c.force_login(usr)
        s = c.session
        s["vinculo_id"] = Vinculo.objects.get(usuario=self.fiscal.usuario).pk
        s.save()
        ag = self.novo_agendamento()
        self.assertEqual(c.get(reverse("operacao:agendamento", args=[ag.pk])).status_code, 404)


# 16 ------------------------------------------------------------------------------------------
@override_settings(**LOCMEM, NOTIFICACAO_MAX_TENTATIVAS=3)
class A16Notificacoes(Base):
    def test_falha_visivel_reenvio_sem_duplicidade(self):
        ag = self.novo_agendamento()
        for i in self.interpretes[:2]:
            agendamentos.escalar(self.operador, ag, i)
        with mock.patch("django.core.mail.EmailMessage.send", side_effect=OSError("SMTP recusou")):
            with self.captureOnCommitCallbacks(execute=True):
                agendamentos.confirmar(self.operador, ag)
        n = Notificacao.objects.get(tipo="CONFIRMACAO")
        self.assertEqual(n.status, StatusNotificacao.FALHA)
        html = self.cliente(Perfil.FISCAL).get(reverse("operacao:avisos")).content.decode()
        self.assertIn("Falha (nova tentativa agendada)", html)  # falha visível para a Prefeitura
        self.assertNotIn("SMTP recusou", html)  # detalhe técnico só para a contratada
        self.assertIn("Atendimento confirmado", html)  # aviso interno disponível mesmo com falha no e-mail
        html_op = self.cliente(Perfil.OPERADOR).get(reverse("operacao:avisos")).content.decode()
        self.assertIn("SMTP recusou", html_op)
        notificacoes.processar_pendentes()  # ainda não venceu o intervalo
        self.assertEqual(len(mail.outbox), 0)
        self.cliente(Perfil.FISCAL).post(reverse("operacao:notificacao_reenviar", args=[n.pk]))
        n.refresh_from_db()
        self.assertEqual(n.status, StatusNotificacao.ENVIADA)
        self.assertEqual(len(mail.outbox), 1)
        self.cliente(Perfil.FISCAL).post(reverse("operacao:notificacao_reenviar", args=[n.pk]))
        Notificacao.objects.filter(pk=n.pk).update(proxima_tentativa_em=timezone.now() - timedelta(hours=1))
        notificacoes.processar_pendentes()
        notificacoes.enviar(n.pk, forcar=True)
        self.assertEqual(len(mail.outbox), 1)  # nenhuma duplicidade
        self.assertEqual(list(n.tentativas_envio.values_list("resultado", flat=True).order_by("pk")), ["FALHA", "ENVIADA"])
        self.assertTrue(EventoAuditoria.objects.filter(entidade="Notificacao", acao="REENVIO_MANUAL").exists())
        with self.assertRaises(DatabaseError), transaction.atomic(), connection.cursor() as cur:
            cur.execute("UPDATE operacao_notificacao SET status='PENDENTE' WHERE id=%s", [n.pk])

    @override_settings(EMAIL_ENVIO_HABILITADO=False)
    def test_integracao_pendente_visivel_e_nao_simula_sucesso(self):
        ag = self.confirmado()
        n = Notificacao.objects.get(agendamento=ag, tipo="CONFIRMACAO")
        notificacoes.enviar(n.pk)
        n.refresh_from_db()
        self.assertEqual(n.status, StatusNotificacao.INTEGRACAO_PENDENTE)
        self.assertIsNone(n.enviada_em)
        self.assertIn("Integração de e-mail pendente", self.cliente(Perfil.FISCAL).get(reverse("operacao:painel")).content.decode())


# 17 ------------------------------------------------------------------------------------------
class A17Chamados(Base):
    def test_primeira_resposta_e_prazo_de_30_minutos(self):
        t0 = sp(2026, 11, 16, 9)
        with self.agora(t0):
            self.cliente(Perfil.SOLICITANTE).post(reverse("operacao:chamado_novo"), {"tipo": "SUBSTITUICAO", "titulo": "Falta", "descricao": "d", "agendamento": ""})
        ch = Chamado.objects.get()
        self.assertEqual(ch.aberto_em, t0)
        for minutos, marca in ((10, "sla-no_prazo"), (21, "sla-atencao"), (31, "sla-vencido")):
            with self.subTest(minutos=minutos), self.agora(t0 + timedelta(minutes=minutos)):
                html = self.cliente(Perfil.OPERADOR).get(reverse("operacao:chamados")).content.decode()
                self.assertIn(marca, html)
        self.assertIn('http-equiv="refresh"', html)
        with self.agora(t0 + timedelta(minutes=12)):
            self.cliente(Perfil.SOLICITANTE).post(reverse("operacao:chamado", args=[ch.pk]), {"acao": "responder", "texto": "complemento"})
            ch.refresh_from_db()
            self.assertIsNone(ch.primeira_resposta_em)
            self.cliente(Perfil.OPERADOR).post(reverse("operacao:chamado", args=[ch.pk]), {"acao": "responder", "texto": "A caminho"})
        ch.refresh_from_db()
        self.assertEqual(ch.primeira_resposta_em, t0 + timedelta(minutes=12))
        self.assertEqual(ch.primeira_resposta_por, self.operador.usuario)
        self.assertEqual(chamados.situacao_sla(ch)["minutos"], 12)
        with self.assertRaises(DatabaseError), transaction.atomic(), connection.cursor() as cur:
            cur.execute("UPDATE operacao_chamado SET primeira_resposta_em = now() WHERE id=%s", [ch.pk])

    def test_conclusao_pela_propria_prefeitura_nao_conta_como_primeira_resposta_da_contratada(self):
        with self.agora(sp(2026, 11, 16, 9)):
            ch = chamados.abrir(self.solicitante, "VALIDACAO", "t", "d")
        with self.agora(sp(2026, 11, 16, 10)):
            chamados.concluir(self.fiscal, ch, "Resolvido internamente")
        ch.refresh_from_db()
        self.assertIsNone(ch.primeira_resposta_em)


# 18 ------------------------------------------------------------------------------------------
class A18Rastreabilidade(Base):
    def test_cada_valor_do_relatorio_rastreia_ate_atendimento_e_regra(self):
        ag1, m1 = self.realizado(82, duracao=60, qtd=1)
        ag2, m2 = self.realizado(120, quando=sp(2026, 11, 18, 9))
        with self.agora(sp(2026, 12, 1, 9)):
            r = relatorios.submeter(self.operador, date(2026, 11, 1))
        total = Decimal("0")
        for ag, m in ((ag1, m1), (ag2, m2)):
            item = next(i for i in r.conteudo["atendimentos"] if i["codigo"] == ag.codigo)
            self.assertEqual(item["medicao_versao"], m.versao)
            self.assertEqual(item["parametro_versao"], m.parametro.versao)
            self.assertEqual(Decimal(item["valor"]), m.valor_total)
            self.assertEqual(item.get("regra_aplicada"), m.regra_aplicada)
            self.assertEqual(Decimal(item.get("preco_unitario")), m.preco_unitario)
            self.assertEqual(item.get("minutos_realizados"), m.minutos_realizados)
            total += Decimal(item["valor"])
        self.assertEqual(Decimal(r.conteudo["totais"]["valor_horas_prestadas"]), total)
        csv = self.cliente(Perfil.FISCAL).get(reverse("operacao:relatorio", args=[r.pk]) + "?formato=csv").content.decode("utf-8")
        self.assertIn("Regra aplicada", csv)
        self.assertIn(m1.regra_aplicada.split(";")[0], csv)


class A16MensagemDeTela(Base):
    @override_settings(**LOCMEM)
    def test_tela_informa_falha_real_do_email_e_nao_diz_notificado(self):
        ag = self.novo_agendamento()
        for i in self.interpretes[:2]:
            agendamentos.escalar(self.operador, ag, i)
        with mock.patch("django.core.mail.EmailMessage.send", side_effect=OSError("SMTP fora")):
            r = self.cliente(Perfil.OPERADOR).post(reverse("operacao:agendamento_confirmar", args=[ag.pk]), follow=True)
        html = r.content.decode()
        self.assertIn("E-mail: Falha (nova tentativa agendada)", html)
        self.assertNotIn("fiscais notificados", html)
        n = Notificacao.objects.get(agendamento=ag, tipo="CONFIRMACAO")
        self.assertEqual(n.tentativas, 1)  # a tela não gera tentativa extra

    @override_settings(EMAIL_ENVIO_HABILITADO=False)
    def test_tela_informa_integracao_pendente(self):
        ag = self.novo_agendamento()
        for i in self.interpretes[:2]:
            agendamentos.escalar(self.operador, ag, i)
        r = self.cliente(Perfil.OPERADOR).post(reverse("operacao:agendamento_confirmar", args=[ag.pk]), follow=True)
        self.assertIn("Integração de e-mail pendente (não enviada)", r.content.decode())


class A16DetalheTecnicoSoParaContratada(Base):
    @override_settings(EMAIL_ENVIO_HABILITADO=False, EMAIL_BACKEND="django.core.mail.backends.smtp.EmailBackend",
                       EMAIL_HOST="smtp.gmail.com", EMAIL_HOST_USER="nerdsdalibras@gmail.com", EMAIL_HOST_PASSWORD="")
    def test_prefeitura_nao_ve_configuracao_tecnica(self):
        ag = self.novo_agendamento()
        for i in self.interpretes[:2]:
            agendamentos.escalar(self.operador, ag, i)
        agendamentos.confirmar(self.operador, ag)
        fiscal = self.cliente(Perfil.FISCAL)
        for url in (reverse("operacao:painel"), reverse("operacao:avisos")):
            html = fiscal.get(url).content.decode()
            for termo in ("EMAIL_HOST_PASSWORD", "EMAIL_ENVIO_HABILITADO", "senha de app"):
                self.assertNotIn(termo, html)
        r = fiscal.post(reverse("operacao:agendamento_alterar", args=[ag.pk]), {
            "inicio_previsto": "2026-11-16T10:00", "duracao_prevista_min": 120, "qtd_profissionais": 2, "justificativa": "x"}, follow=True)
        self.assertNotIn("EMAIL_HOST_PASSWORD", r.content.decode())
        self.assertIn("Integração de e-mail pendente", r.content.decode())
        self.assertIn("EMAIL_HOST_PASSWORD", self.cliente(Perfil.OPERADOR).get(reverse("operacao:painel")).content.decode())
