"""Jornada completa pelas telas, na ordem em que o sistema é usado de verdade.

Começa como na hospedagem: o administrador da plataforma é criado pelas
variáveis SGI_ADMIN_*, troca a senha no 1º acesso, cria a cidade pela tela
Plataforma (perfil Operador da contratada) e libera o Fiscal/Gestor, que libera
o Solicitante. Cada teste cobre um grupo de requisitos do edital (1 a 9 e as
decisões de implementação) usando apenas requisições HTTP às telas, como um
navegador faria. Dados exclusivamente fictícios; relógio simulado em
America/Sao_Paulo (novembro/dezembro de 2026).
"""
import io
import os
import re
from datetime import date, datetime, timezone as tz
from decimal import Decimal
from pathlib import Path
from smtplib import SMTPException
from unittest import mock

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.mail.backends.base import BaseEmailBackend
from django.core.management import call_command
from django.db import DatabaseError, connection, transaction
from django.test import Client, TestCase, override_settings
from django.urls import resolve, reverse

from operacao.models import (
    Agendamento, AvisoInterno, Chamado, Contrato, EventoAuditoria, Feriado, Homologacao, Interprete, Medicao,
    Notificacao, ParametroMedicao, PedidoIndenizacao, PoliticaRetencao, RelatorioMensal, TentativaEnvio, Vinculo,
)
from operacao.servicos import medicao

from .base import sp

U = get_user_model()
SENHA_INICIAL = "Temporaria-Ficticia-2026!"
DEZ_ANOS = 10 * 365 * 24 * 3600
FAIXAS_TEXTO = "1;10;0\n11;30;30\n31;40;30\n41;60;60"


class BackendFalho(BaseEmailBackend):
    """Servidor de e-mail indisponível (para testar falha e reenvio)."""

    def send_messages(self, mensagens):
        raise SMTPException("servidor SMTP fictício indisponível")


def mensagens(r):
    try:
        return " | ".join(str(m) for m in r.context["messages"])
    except (KeyError, TypeError):
        return ""


class Jornada(TestCase):
    # ------------------------------------------------------------ preparação (como na implantação real)
    def setUp(self):
        self.em(2026, 11, 3, 8, 0)  # terça-feira
        relogio = mock.patch("django.utils.timezone.now", side_effect=lambda: self.relogio)
        relogio.start()
        self.addCleanup(relogio.stop)

        variaveis = {"SGI_ADMIN_EMAIL": "admin.nerds@exemplo.invalid", "SGI_ADMIN_NOME": "Administração Nerds (fictícia)",
                     "SGI_ADMIN_SENHA": SENHA_INICIAL}
        with mock.patch.dict(os.environ, variaveis):
            call_command("inicializar_plataforma", stdout=io.StringIO())
        self.admin = U.objects.get(email="admin.nerds@exemplo.invalid")
        self.op = self.primeiro_acesso("admin.nerds@exemplo.invalid", SENHA_INICIAL, "Operador-Ficticio-Senha-1")

        # Tela Plataforma → Nova cidade, prefixo em branco, perfil Operador da contratada
        r = self.op.post(reverse("operacao:plataforma"), {
            "cidade": "São Bernardo do Campo", "uf": "SP", "orgao": "Prefeitura Fictícia — Secretaria de Educação",
            "referencia": "Pregão Eletrônico nº 246/2026", "prefixo": "", "vigencia_inicio": "2026-10-01",
            "vigencia_fim": "", "preco_inicial": "", "meu_perfil": "OPERADOR",
        })
        self.assertRedirects(r, reverse("operacao:usuarios"))
        self.sbc = Contrato.objects.get(cidade="São Bernardo do Campo")
        self.assertEqual(self.sbc.prefixo_codigo, "SBC")

        # Administrador libera o 1º Fiscal/Gestor; Fiscal troca a senha temporária e aprova o preço inicial
        self.fiscal = self.liberar(self.op, "Fiscal Fictícia SBC", "fiscal@exemplo.invalid", "FISCAL", "Fiscal-Ficticia-Senha-2")
        self.u_fiscal = U.objects.get(email="fiscal@exemplo.invalid")
        p1 = ParametroMedicao.objects.get(contrato=self.sbc, versao=1)
        self.assertEqual((p1.situacao, p1.preco_unitario_hora), ("PROPOSTO", Decimal("156.6000")))
        self.enviar(self.fiscal, "parametro_decidir", p1.pk, dados={"decisao": "aprovar", "parecer": "Preço da licitação (fictício)"})
        p1.refresh_from_db()
        self.assertEqual(p1.situacao, "APROVADO")

        # Fiscal libera um Solicitante da Prefeitura
        self.sol = self.liberar(self.fiscal, "Solicitante Fictícia A", "solicitante.a@exemplo.invalid", "SOLICITANTE", "Solicitante-Ficticia-Senha-3")

        # Operador cadastra os intérpretes (dados fictícios)
        for n in (1, 2, 3):
            r = self.op.post(reverse("operacao:interprete_novo"), {
                "nome_completo": f"Intérprete Fictício {n}", "telefone": f"(11) 90000-000{n}",
                "email": f"interprete{n}@exemplo.invalid", "ativo": "on", "justificativa": "",
            })
            self.assertRedirects(r, reverse("operacao:interpretes"))
        self.i1, self.i2, self.i3 = Interprete.objects.filter(contrato=self.sbc).order_by("pk")

    # ------------------------------------------------------------ utilitários
    def em(self, *args):
        self.relogio = sp(*args)

    def entrar(self, email, senha):
        c = Client()
        r = c.post(reverse("contas:login"), {"username": email, "password": senha})
        self.assertEqual(r.status_code, 302, f"login falhou para {email}")
        s = c.session
        s.set_expiry(DEZ_ANOS)  # o relógio simulado avança semanas
        s.save()
        return c

    def primeiro_acesso(self, email, temporaria, nova):
        c = self.entrar(email, temporaria)
        self.assertRedirects(c.get(reverse("operacao:painel")), reverse("contas:trocar_senha"), fetch_redirect_response=False)
        r = c.post(reverse("contas:trocar_senha"), {"old_password": temporaria, "new_password1": nova, "new_password2": nova})
        self.assertEqual(r.status_code, 302, "troca de senha recusada")
        s = c.session
        s.set_expiry(DEZ_ANOS)
        s.save()
        return c

    def liberar(self, quem, nome, email, perfil, nova_senha):
        r = quem.post(reverse("operacao:usuarios"), {"nome_completo": nome, "email": email, "perfil": perfil})
        temporaria = r.context["senha_temporaria"]
        self.assertTrue(temporaria, mensagens(r))
        return self.primeiro_acesso(email, temporaria, nova_senha)

    def enviar(self, c, nome, *args, dados=None):
        return c.post(reverse(f"operacao:{nome}", args=args), dados or {}, follow=True)

    def dados_ag(self, inicio="2026-11-16T09:00", modalidade="PRESENCIAL", duracao=120, qtd=2,
                 local="Endereço Fictício, 100", titulo="Evento fictício", unidade="EMEB Fictícia Alfa"):
        return {"titulo": titulo, "unidade_solicitante": unidade, "modalidade": modalidade, "local": local,
                "inicio_previsto": inicio, "duracao_prevista_min": duracao, "qtd_profissionais": qtd, "observacoes": ""}

    def criar_ag(self, c, **kw):
        r = c.post(reverse("operacao:agendamento_novo"), self.dados_ag(**kw))
        self.assertEqual(r.status_code, 302, mensagens(r))
        return Agendamento.objects.get(pk=resolve(r["Location"]).kwargs["pk"])

    def escalar(self, ag, interprete):
        return self.enviar(self.op, "agendamento_escalar", ag.pk, dados={"interprete": interprete.pk})

    def confirmado(self, interpretes, criador=None, **kw):
        ag = self.criar_ag(criador or self.sol, **kw)
        for i in interpretes:
            self.escalar(ag, i)
        self.enviar(self.op, "agendamento_confirmar", ag.pk)
        ag.refresh_from_db()
        self.assertEqual(ag.status, "CONFIRMADO")
        return ag

    def realizar(self, ag, inicio, fim, justificativa=""):
        self.enviar(self.op, "agendamento_realizacao", ag.pk,
                    dados={"inicio_realizado": inicio, "fim_realizado": fim, "justificativa": justificativa})
        return ag.medicoes.order_by("-versao").first()

    def homologar(self, c, ag):
        return self.enviar(c, "agendamento_homologar", ag.pk, dados={"observacao": "Conferido (fictício)"})

    def sql_bloqueado(self, sql, params):
        with self.assertRaises(DatabaseError) as erro:
            with transaction.atomic(), connection.cursor() as cur:
                cur.execute(sql, params)
        self.assertIn("SGI:", str(erro.exception))

    # ------------------------------------------------------------ 1. Agendamentos
    def test_1_agendamentos(self):
        self.em(2026, 11, 3, 9, 0)
        ag1 = self.criar_ag(self.sol, titulo="Reunião de pais (fictícia)", local="Rua Fictícia, 100 — sala 2")
        self.assertEqual(ag1.codigo, "SBC-2026-000001")
        self.assertEqual((ag1.local, ag1.modalidade, ag1.duracao_prevista_min, ag1.qtd_profissionais),
                         ("Rua Fictícia, 100 — sala 2", "PRESENCIAL", 120, 2))
        self.assertEqual(ag1.inicio_previsto, sp(2026, 11, 16, 9, 0))
        self.assertEqual(ag1.criado_em, sp(2026, 11, 3, 9, 0))  # data/hora da criação, pelo servidor
        self.assertEqual((ag1.parte_criadora, ag1.status), ("PREFEITURA", "SOLICITADO"))

        # A contratada também registra; eventos simultâneos em locais/plataformas diferentes
        ag2 = self.criar_ag(self.op, modalidade="REMOTO", local="Plataforma de vídeo (link fictício)", duracao=60, qtd=1)
        ag3 = self.criar_ag(self.op, local="Outro endereço fictício, 200")
        self.assertEqual(ag2.parte_criadora, "CONTRATADA")
        self.assertEqual({a.inicio_previsto for a in (ag1, ag2, ag3)}, {sp(2026, 11, 16, 9, 0)})

        # Mais de 1 hora com um único profissional é recusado
        antes = Agendamento.objects.count()
        r = self.op.post(reverse("operacao:agendamento_novo"), self.dados_ag(duracao=90, qtd=1))
        self.assertEqual(Agendamento.objects.count(), antes)
        self.assertIn("ao menos dois intérpretes", mensagens(r))

        # Escala, conflito de horário do mesmo intérprete, confirmação
        self.escalar(ag1, self.i1)
        self.escalar(ag1, self.i2)
        self.escalar(ag2, self.i3)
        r = self.escalar(ag3, self.i1)
        self.assertIn("horário sobreposto", mensagens(r))
        r = self.enviar(self.op, "agendamento_confirmar", ag3.pk)
        self.assertIn("antes de confirmar", mensagens(r))
        self.enviar(self.op, "agendamento_confirmar", ag1.pk)
        ag1.refresh_from_db()
        self.assertEqual((ag1.status, ag1.confirmado_em, ag1.confirmado_por), ("CONFIRMADO", sp(2026, 11, 3, 9, 0), self.admin))

        # Intérpretes com nome completo, telefone e e-mail (para quem participa do atendimento)
        pagina = self.sol.get(reverse("operacao:agendamento", args=[ag1.pk])).content.decode()
        for texto in ("Intérprete Fictício 1", "(11) 90000-0001", "interprete1@exemplo.invalid", "Intérprete Fictício 2"):
            self.assertIn(texto, pagina)

        # Alteração de horário (pela Prefeitura) com justificativa
        self.em(2026, 11, 4, 10, 0)
        self.enviar(self.sol, "agendamento_alterar", ag1.pk, dados={
            "inicio_previsto": "2026-11-16T10:00", "duracao_prevista_min": 120, "qtd_profissionais": 2,
            "justificativa": "Reunião adiada em uma hora"})
        ag1.refresh_from_db()
        self.assertEqual((ag1.inicio_previsto, ag1.status), (sp(2026, 11, 16, 10, 0), "CONFIRMADO"))

        # Cancelamento: justificativa obrigatória e registro preservado
        r = self.enviar(self.fiscal, "agendamento_cancelar", ag3.pk, dados={"justificativa": ""})
        self.assertIn("Justificativa obrigatória", mensagens(r))
        self.enviar(self.fiscal, "agendamento_cancelar", ag3.pk, dados={"justificativa": "Evento suspenso pela escola (fictício)"})
        ag3.refresh_from_db()
        self.assertEqual((ag3.status, ag3.cancelamento_justificativa), ("CANCELADO", "Evento suspenso pela escola (fictício)"))
        self.assertIn(ag3.codigo, self.fiscal.get(reverse("operacao:agendamentos")).content.decode())

    # ------------------------------------------------------------ 2. Histórico auditável
    def test_2_historico_auditavel(self):
        ag = self.confirmado([self.i1, self.i2])
        self.em(2026, 11, 5, 14, 0)
        self.enviar(self.sol, "agendamento_alterar", ag.pk, dados={
            "inicio_previsto": "2026-11-16T13:00", "duracao_prevista_min": 120, "qtd_profissionais": 2,
            "justificativa": "Troca de turno da escola"})
        eventos = EventoAuditoria.objects.filter(entidade="Agendamento", entidade_id=str(ag.pk))
        criacao, alteracao = eventos.get(acao="CRIACAO"), eventos.get(acao="ALTERACAO_HORARIO")
        # Registro original preservado
        self.assertEqual(criacao.dados_posteriores["local"], "Endereço Fictício, 100")
        self.assertEqual(criacao.dados_posteriores["duracao_prevista_min"], 120)
        # O mesmo horário aparece igual no registro original e no "antes" da alteração, em horário de Brasília
        self.assertEqual(criacao.dados_posteriores["inicio_previsto"], "2026-11-16T09:00:00-03:00")
        self.assertEqual(alteracao.dados_anteriores["inicio_previsto"], "2026-11-16T09:00:00-03:00")
        self.assertEqual(alteracao.dados_posteriores["inicio_previsto"], "2026-11-16T13:00:00-03:00")
        # Usuário, data/hora, justificativa, valores anteriores e posteriores
        self.assertIn("Solicitante Fictícia A", alteracao.usuario_descricao)
        self.assertEqual((alteracao.usuario, alteracao.perfil), (U.objects.get(email="solicitante.a@exemplo.invalid"), "SOLICITANTE"))
        self.assertIsNotNone(alteracao.ocorrido_em)
        self.assertEqual(alteracao.justificativa, "Troca de turno da escola")
        self.assertNotEqual(alteracao.dados_anteriores["inicio_previsto"], alteracao.dados_posteriores["inicio_previsto"])
        pagina = self.op.get(reverse("operacao:agendamento", args=[ag.pk])).content.decode()
        self.assertIn("Histórico auditável", pagina)
        self.assertIn("Troca de turno da escola", pagina)
        csv = self.op.get(reverse("operacao:agendamento_historico", args=[ag.pk, "csv"]))
        self.assertEqual(csv.status_code, 200)
        self.assertIn("ALTERACAO_HORARIO", csv.content.decode("utf-8-sig"))
        pdf = self.op.get(reverse("operacao:agendamento_historico", args=[ag.pk, "pdf"]))
        self.assertTrue(pdf.content.startswith(b"%PDF"))

        # Campos do registro original não podem ser alterados nem no banco
        tabela = Agendamento._meta.db_table
        self.sql_bloqueado(f"UPDATE {tabela} SET criado_em = criado_em - interval '1 day' WHERE id = %s", [ag.pk])

        # Cancelar não apaga; exclusão definitiva bloqueada na aplicação e no banco
        self.enviar(self.sol, "agendamento_cancelar", ag.pk, dados={"justificativa": "Evento cancelado (fictício)"})
        ag.refresh_from_db()
        self.assertEqual(ag.status, "CANCELADO")
        with self.assertRaises(Exception):
            ag.delete()
        self.sql_bloqueado(f"DELETE FROM {tabela} WHERE id = %s", [ag.pk])
        self.sql_bloqueado(f"UPDATE {tabela} SET local = 'adulterado' WHERE id = %s", [ag.pk])
        self.assertTrue(Agendamento.objects.filter(pk=ag.pk).exists())

        # Trilha de auditoria: só inclusão (sem alterar/apagar) e cadeia de hash íntegra
        tabela_aud = EventoAuditoria._meta.db_table
        self.sql_bloqueado(f"UPDATE {tabela_aud} SET justificativa = 'adulterada' WHERE id = %s", [alteracao.pk])
        self.sql_bloqueado(f"DELETE FROM {tabela_aud} WHERE id = %s", [alteracao.pk])
        r = self.fiscal.get(reverse("operacao:auditoria") + "?verificar=1")
        self.assertTrue(r.context["integridade"]["ok"], r.context["integridade"])

        # Retenção: nenhum prazo inventado; política só vale com aprovação da Prefeitura e não muda depois
        self.assertFalse(PoliticaRetencao.objects.filter(contrato=self.sbc).exists())
        self.op.post(reverse("operacao:retencao"), {"prazo_descricao": "A definir pela Prefeitura (fictício)",
                                                    "fundamento": "Aguardando indicação do fundamento legal"})
        pol = PoliticaRetencao.objects.get(contrato=self.sbc)
        self.assertEqual(pol.situacao, "PROPOSTO")
        self.assertEqual(self.op.post(reverse("operacao:retencao_decidir", args=[pol.pk]), {"decisao": "aprovar", "parecer": "x"}).status_code, 403)
        self.enviar(self.fiscal, "retencao_decidir", pol.pk, dados={"decisao": "aprovar", "parecer": "De acordo (fictício)"})
        pol.refresh_from_db()
        self.assertEqual(pol.situacao, "APROVADO")
        self.sql_bloqueado(f"UPDATE {PoliticaRetencao._meta.db_table} SET prazo_descricao = 'x' WHERE id = %s", [pol.pk])

    # ------------------------------------------------------------ 3. Permissões e homologação
    def test_3_permissoes_e_homologacao(self):
        self.assertRedirects(Client().get(reverse("operacao:agendamentos")),
                             reverse("contas:login") + "?next=" + reverse("operacao:agendamentos"), fetch_redirect_response=False)
        a = self.confirmado([self.i1, self.i2])
        b = self.confirmado([self.i1, self.i2], inicio="2026-11-17T09:00")
        # Solicitante não confirma; contratada não aprova parâmetro, não cadastra feriado
        self.assertEqual(self.sol.post(reverse("operacao:agendamento_confirmar", args=[a.pk])).status_code, 403)
        self.op.post(reverse("operacao:parametros"), {"preco_unitario_hora": "160.1234", "vigente_desde": "2026-11-01",
                                                      "faixas": FAIXAS_TEXTO, "justificativa": "Reajuste proposto (fictício)"})
        p2 = ParametroMedicao.objects.get(contrato=self.sbc, versao=2)
        self.assertEqual(p2.situacao, "PROPOSTO")
        self.assertEqual(self.op.post(reverse("operacao:parametro_decidir", args=[p2.pk]), {"decisao": "aprovar", "parecer": "x"}).status_code, 403)
        self.assertEqual(self.op.post(reverse("operacao:feriados"), {"data": "2026-11-25", "descricao": "x"}).status_code, 403)

        # Proposta não aprovada não vale: medição usa a versão 1 aprovada
        self.em(2026, 11, 16, 12, 0)
        ma = self.realizar(a, "2026-11-16T09:00", "2026-11-16T11:00")
        self.assertEqual((ma.parametro.versao, ma.preco_unitario, ma.valor_total), (1, Decimal("156.6000"), Decimal("313.20")))
        # Aprovação da nova versão não altera medições anteriores
        self.enviar(self.fiscal, "parametro_decidir", p2.pk, dados={"decisao": "aprovar", "parecer": "Reajuste aprovado (fictício)"})
        ma.refresh_from_db()
        self.assertEqual((ma.parametro.versao, ma.valor_total), (1, Decimal("313.20")))
        self.em(2026, 11, 17, 12, 0)
        mb = self.realizar(b, "2026-11-17T09:00", "2026-11-17T11:00")
        self.assertEqual((mb.parametro.versao, mb.valor_total), (2, Decimal("320.25")))  # 2 h × 160,1234 = 320,2468

        # Homologação pelas duas partes, com evidência do estado conferido
        self.homologar(self.op, a)
        a.refresh_from_db()
        self.assertEqual(a.status, "REALIZADO")
        self.homologar(self.fiscal, a)
        a.refresh_from_db()
        self.assertEqual(a.status, "HOMOLOGADO")
        evid = Homologacao.objects.filter(agendamento=a)
        self.assertEqual({h.parte for h in evid}, {"CONTRATADA", "PREFEITURA"})
        self.assertEqual(len({h.hash_estado for h in evid}), 1)
        self.assertEqual(evid.first().estado_conferido["medicao"]["valor_total"], "313.20")
        # Homologado: travado na tela e no banco
        r = self.realizar(a, "2026-11-16T09:00", "2026-11-16T11:30", justificativa="tentativa de correção")
        a.refresh_from_db()
        self.assertEqual((a.status, a.medicoes.count()), ("HOMOLOGADO", 1))
        self.sql_bloqueado(f"UPDATE {Agendamento._meta.db_table} SET local = 'adulterado' WHERE id = %s", [a.pk])

        # A contratada não cria um 2º Fiscal nem desativa o Fiscal existente
        self.op.post(reverse("operacao:usuarios"), {"nome_completo": "Fiscal Indevido", "email": "indevido@exemplo.invalid", "perfil": "FISCAL"})
        self.assertFalse(U.objects.filter(email="indevido@exemplo.invalid").exists())
        v_fiscal = Vinculo.objects.get(contrato=self.sbc, usuario=self.u_fiscal)
        self.enviar(self.op, "vinculo_alterar", v_fiscal.pk, dados={"perfil": "FISCAL", "justificativa": "tentativa indevida"})
        v_fiscal.refresh_from_db()
        self.assertTrue(v_fiscal.ativo)

        # Identificação individual: cada ação registra o usuário que a fez
        autores = set(EventoAuditoria.objects.filter(contrato=self.sbc).exclude(usuario=None).values_list("usuario__email", flat=True))
        self.assertTrue({"admin.nerds@exemplo.invalid", "fiscal@exemplo.invalid", "solicitante.a@exemplo.invalid"} <= autores)

    # ------------------------------------------------------------ 4. Alertas automáticos
    def test_4_alertas(self):
        ag = self.confirmado([self.i1, self.i2])
        n = Notificacao.objects.get(agendamento=ag, tipo="CONFIRMACAO")
        # Sem autorização/credencial: integração pendente, sem simular sucesso; aviso interno ao Fiscal
        self.assertEqual(n.destinatarios, ["fiscal@exemplo.invalid"])
        self.assertEqual(n.status, "INTEGRACAO_PENDENTE")
        self.assertIn("EMAIL_ENVIO_HABILITADO", n.ultimo_erro)
        self.assertEqual(len(mail.outbox), 0)
        self.assertTrue(AvisoInterno.objects.filter(notificacao=n, usuario=self.u_fiscal).exists())
        self.assertIn(n.assunto, self.fiscal.get(reverse("operacao:avisos")).content.decode())
        self.assertNotIn("(11) 90000", n.corpo)  # contatos dos intérpretes não vão no e-mail

        self.em(2026, 11, 4, 9, 0)
        self.enviar(self.op, "agendamento_alterar", ag.pk, dados={"inicio_previsto": "2026-11-16T14:00", "duracao_prevista_min": 120,
                                                                  "qtd_profissionais": 2, "justificativa": "Mudança de sala"})
        escala = ag.escalas.get(interprete=self.i2, ativa=True)
        self.enviar(self.op, "escala_cancelar", ag.pk, escala.pk, dados={"motivo": "Intérprete com atestado (fictício)", "substituto": self.i3.pk})
        tipos = set(Notificacao.objects.filter(agendamento=ag, publico="PREFEITURA").values_list("tipo", flat=True))
        self.assertEqual(tipos, {"CONFIRMACAO", "ALTERACAO_HORARIO", "CANCELAMENTO_ESCALA"})

        # Com envio autorizado: sai na hora, e o reprocessamento não duplica
        with override_settings(EMAIL_ENVIO_HABILITADO=True, EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend"):
            ag2 = self.confirmado([self.i1, self.i2], inicio="2026-11-18T09:00")
            n2 = Notificacao.objects.get(agendamento=ag2, tipo="CONFIRMACAO")
            self.assertEqual(n2.status, "ENVIADA")
            # 1º: aviso de pedido novo à Nerds; 2º: confirmação ao Fiscal
            self.assertEqual([m.to for m in mail.outbox], [["admin.nerds@exemplo.invalid"], ["fiscal@exemplo.invalid"]])
            # Envia o que ficou pendente (inclui os avisos de novo acesso da Prefeitura) e roda de novo
            call_command("processar_notificacoes", stdout=io.StringIO())
            enviados = len(mail.outbox)
            self.assertEqual(enviados, Notificacao.objects.filter(status="ENVIADA").count())
            self.assertFalse(Notificacao.objects.exclude(status="ENVIADA").exists())
            call_command("processar_notificacoes", stdout=io.StringIO())
            chaves = [m.extra_headers["X-SGI-Chave"] for m in mail.outbox]
            self.assertEqual(len(chaves), enviados)
            self.assertEqual(len(set(chaves)), enviados)  # nenhuma mensagem repetida
            r = self.enviar(self.op, "notificacao_reenviar", n2.pk)
            self.assertIn("reenvio bloqueado", mensagens(r))
            self.assertEqual(len(mail.outbox), enviados)

        # Falha do servidor de e-mail: registrada, com nova tentativa que envia uma única vez
        mail.outbox.clear()
        with override_settings(EMAIL_ENVIO_HABILITADO=True, EMAIL_BACKEND="operacao.tests.test_jornada_edital.BackendFalho"):
            ag3 = self.confirmado([self.i1, self.i2], inicio="2026-11-19T09:00")
            n3 = Notificacao.objects.get(agendamento=ag3, tipo="CONFIRMACAO")
            self.assertEqual((n3.status, n3.tentativas), ("FALHA", 1))
            self.assertIn("indisponível", n3.ultimo_erro)
        self.em(2026, 11, 4, 9, 5)
        with override_settings(EMAIL_ENVIO_HABILITADO=True, EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend"):
            call_command("processar_notificacoes", stdout=io.StringIO())
            call_command("processar_notificacoes", stdout=io.StringIO())
        n3.refresh_from_db()
        self.assertEqual(n3.status, "ENVIADA")
        self.assertEqual(list(TentativaEnvio.objects.filter(notificacao=n3).order_by("pk").values_list("resultado", flat=True)), ["FALHA", "ENVIADA"])
        self.assertEqual([m.extra_headers["X-SGI-Chave"] for m in mail.outbox].count(n3.chave_idempotencia), 1)
        # o aviso de pedido novo à Nerds, que também falhou, foi reenviado uma única vez
        aviso = Notificacao.objects.get(agendamento=ag3, tipo="NOVA_SOLICITACAO")
        self.assertEqual(aviso.status, "ENVIADA")
        self.assertEqual(len(mail.outbox), 2)

    def test_4b_avisos_para_a_contratada(self):
        """Pedido, alteração e cancelamento feitos pela Prefeitura chegam à Nerds (caixa de avisos e e-mail)."""
        u_sol = U.objects.get(email="solicitante.a@exemplo.invalid")
        with override_settings(EMAIL_ENVIO_HABILITADO=True, EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend"):
            # Pedido da Prefeitura: a Nerds recebe na hora; a Prefeitura vê que a contratada foi avisada
            r = self.sol.post(reverse("operacao:agendamento_novo"), self.dados_ag(titulo="Palestra (fictícia)"), follow=True)
            self.assertIn("A contratada (Nerds da Libras) foi avisada na caixa de avisos do sistema e por e-mail", mensagens(r))
            ag = Agendamento.objects.get(titulo="Palestra (fictícia)")
            nova = Notificacao.objects.get(agendamento=ag, tipo="NOVA_SOLICITACAO")
            self.assertEqual((nova.publico, nova.destinatarios, nova.status), ("CONTRATADA", ["admin.nerds@exemplo.invalid"], "ENVIADA"))
            self.assertEqual([m.to for m in mail.outbox], [["admin.nerds@exemplo.invalid"]])
            self.assertIn("Solicitante Fictícia A", mail.outbox[0].body)
            self.assertIn(ag.codigo, mail.outbox[0].subject)
            self.assertTrue(AvisoInterno.objects.filter(notificacao=nova, usuario=self.admin).exists())
            self.assertFalse(AvisoInterno.objects.filter(notificacao=nova, usuario=self.u_fiscal).exists())
            # Aparece no painel da Nerds como pedido aguardando confirmação e na caixa de avisos
            painel = self.op.get(reverse("operacao:painel"))
            self.assertEqual([a.codigo for a in painel.context["pedidos_pendentes"]], [ag.codigo])
            self.assertIn("Nova solicitação de intérprete", self.op.get(reverse("operacao:avisos")).content.decode())
            self.assertIsNone(self.sol.get(reverse("operacao:painel")).context["pedidos_pendentes"])
            # A Nerds "aceita": escala e confirma; o Fiscal da Prefeitura é avisado da confirmação
            self.escalar(ag, self.i1)
            self.escalar(ag, self.i2)
            self.enviar(self.op, "agendamento_confirmar", ag.pk)
            self.assertEqual(mail.outbox[-1].to, ["fiscal@exemplo.invalid"])
            self.assertEqual(self.op.get(reverse("operacao:painel")).context["pedidos_pendentes"].count(), 0)
            # Alteração de horário e cancelamento pela Prefeitura: a Nerds e o Fiscal são avisados
            self.em(2026, 11, 5, 10, 0)
            self.enviar(self.sol, "agendamento_alterar", ag.pk, dados={"inicio_previsto": "2026-11-16T14:00", "duracao_prevista_min": 120,
                                                                       "qtd_profissionais": 2, "justificativa": "Mudança de turno"})
            self.em(2026, 11, 10, 10, 0)
            r = self.enviar(self.sol, "agendamento_cancelar", ag.pk, dados={"justificativa": "Palestra adiada (fictício)"})
            self.assertIn("A contratada (Nerds da Libras) foi avisada", mensagens(r))
            para_nerds = Notificacao.objects.filter(agendamento=ag, publico="CONTRATADA").order_by("pk")
            self.assertEqual(list(para_nerds.values_list("tipo", flat=True)), ["NOVA_SOLICITACAO", "ALTERACAO_HORARIO", "CANCELAMENTO_AGENDAMENTO"])
            self.assertTrue(all(n.status == "ENVIADA" for n in para_nerds))
            self.assertEqual(Notificacao.objects.filter(agendamento=ag, publico="PREFEITURA").count(), 3)  # confirmação, alteração, cancelamento
            cancelados = self.op.get(reverse("operacao:painel")).context["cancelados_prefeitura"]
            self.assertEqual([a.codigo for a in cancelados], [ag.codigo])
            # Quando a própria Nerds cria ou cancela, não avisa a si mesma
            antes = Notificacao.objects.filter(publico="CONTRATADA").count()
            proprio = self.criar_ag(self.op, inicio="2026-11-20T09:00", titulo="Pedido registrado pela Nerds")
            self.enviar(self.op, "agendamento_cancelar", proprio.pk, dados={"justificativa": "Registrado por engano"})
            self.assertEqual(Notificacao.objects.filter(publico="CONTRATADA").count(), antes)
        # O operador da Nerds vê o histórico geral da cidade (somente leitura) e os pedidos de quem os fez
        r = self.op.get(reverse("operacao:auditoria"))
        self.assertEqual(r.status_code, 200)
        self.assertTrue(any(e.usuario_id == u_sol.pk and e.acao == "CRIACAO" for e in r.context["eventos"]))

    # ------------------------------------------------------------ 5. Medição das horas
    def test_5_medicao(self):
        a = self.confirmado([self.i1, self.i2])
        b = self.confirmado([self.i1], inicio="2026-11-17T09:00", duracao=60, qtd=1)
        c = self.confirmado([self.i1, self.i2], inicio="2026-11-18T09:00")
        self.em(2026, 11, 18, 13, 0)
        # Excedente de 25 min → +30 min; hora de evento, dois intérpretes não dobram
        ma = self.realizar(a, "2026-11-16T09:00", "2026-11-16T11:25")
        self.assertEqual(a.escalas.filter(ativa=True).count(), 2)
        self.assertEqual((ma.situacao, ma.minutos_previstos, ma.minutos_realizados, ma.acrescimo_min, ma.minutos_faturaveis),
                         ("AUTOMATICA", 120, 145, 30, 150))
        self.assertEqual((ma.horas_faturaveis, ma.valor_bruto, ma.valor_total), (Decimal("2.5000"), Decimal("391.50000000"), Decimal("391.50")))
        self.assertIn("ROUND_HALF_UP", ma.regra_aplicada)
        a.refresh_from_db()
        self.assertEqual((a.inicio_realizado, a.fim_realizado), (sp(2026, 11, 16, 9, 0), sp(2026, 11, 16, 11, 25)))
        # Realizado acima de 1 h com um intérprete: alerta de revezamento
        mb = self.realizar(b, "2026-11-17T09:00", "2026-11-17T10:15")
        self.assertTrue(mb.alerta_revezamento)
        self.assertIn("revezamento exigido", self.op.get(reverse("operacao:agendamento", args=[b.pk])).content.decode())
        # Excedente acima de 60 min: pendência de regra, sem extrapolar; homologação bloqueada
        mc = self.realizar(c, "2026-11-18T09:00", "2026-11-18T12:30")
        self.assertEqual((mc.situacao, mc.pendencias, mc.valor_total), ("PENDENTE_REGRA", ["EXCEDENTE_ACIMA_DA_TABELA"], None))
        self.assertIn("Sem medição válida", self.fiscal.get(reverse("operacao:agendamento", args=[c.pk])).content.decode())
        self.assertIn("Não há medição válida", mensagens(self.homologar(self.op, c)))
        # Medição fundamentada pela contratada e aprovada pela Prefeitura; versões preservadas
        self.enviar(self.op, "medicao_propor", c.pk, dados={"minutos_faturaveis": 210, "fundamentacao": "Evento estendido a pedido da escola (fictício)"})
        proposta = c.medicoes.get(versao=2)
        self.assertEqual(proposta.situacao, "PROPOSTA")
        self.enviar(self.fiscal, "medicao_decidir", c.pk, proposta.pk, dados={"decisao": "aprovar", "parecer": "De acordo (fictício)"})
        self.assertEqual(list(c.medicoes.order_by("versao").values_list("versao", "situacao")), [(1, "PENDENTE_REGRA"), (2, "APROVADA")])
        self.assertEqual(medicao.medicao_vigente(c).valor_total, Decimal("548.10"))

        # Tabela do edital em cada limite, e casos não definidos viram pendência
        faixas = ParametroMedicao.objects.get(contrato=self.sbc, versao=1).faixas_excedente
        preco = Decimal("156.6000")
        for excedente, acrescimo in [(0, 0), (1, 0), (10, 0), (11, 30), (30, 30), (31, 30), (40, 30), (41, 60), (60, 60)]:
            self.assertEqual(medicao.calcular(120, 120 + excedente, faixas, preco)["acrescimo_min"], acrescimo, excedente)
        self.assertEqual(medicao.calcular(120, 181, faixas, preco)["pendencias"], ["EXCEDENTE_ACIMA_DA_TABELA"])
        self.assertEqual(medicao.calcular(120, 100, faixas, preco)["pendencias"], ["ATENDIMENTO_MAIS_CURTO"])
        self.assertEqual(medicao.calcular(90, 90, faixas, preco)["pendencias"], ["DURACAO_FRACIONADA"])
        # Decimal com 4 casas no preço; total arredondado em centavos, metade para cima
        self.assertEqual(medicao.valores(Decimal("156.6049"), 150), (Decimal("2.5000"), Decimal("391.51225000"), Decimal("391.51")))
        self.assertEqual(medicao.valores(Decimal("100.0050"), 60)[2], Decimal("100.01"))

        # R$ 156,60 é só a proposta inicial: numa cidade nova, nada é medido antes da aprovação da Prefeitura
        p1 = ParametroMedicao.objects.get(contrato=self.sbc, versao=1)
        self.assertIn("sujeito ao resultado da licitação", p1.justificativa)
        acoes = list(EventoAuditoria.objects.filter(entidade="ParametroMedicao", entidade_id=str(p1.pk)).order_by("id").values_list("acao", flat=True))
        self.assertEqual(acoes, ["PROPOSTA", "APROVACAO"])
        self.op.post(reverse("operacao:plataforma"), {"cidade": "Franca", "uf": "SP", "orgao": "Prefeitura Fictícia de Franca",
                                                      "referencia": "Pregão Fictício 1/2026", "prefixo": "", "vigencia_inicio": "2026-10-01",
                                                      "vigencia_fim": "", "preco_inicial": "", "meu_perfil": "OPERADOR"})
        self.op.post(reverse("operacao:interprete_novo"), {"nome_completo": "Intérprete Fictício Franca", "telefone": "(16) 90000-0000",
                                                           "email": "interprete.fra@exemplo.invalid", "ativo": "on", "justificativa": ""})
        f = self.confirmado([Interprete.objects.get(email="interprete.fra@exemplo.invalid")], criador=self.op,
                            modalidade="REMOTO", local="Plataforma fictícia", inicio="2026-11-23T09:00", duracao=60, qtd=1)
        self.em(2026, 11, 23, 11, 0)
        r = self.enviar(self.op, "agendamento_realizacao", f.pk, dados={"inicio_realizado": "2026-11-23T09:00", "fim_realizado": "2026-11-23T10:00"})
        self.assertIn("Não há parâmetro de medição APROVADO", mensagens(r))
        self.assertFalse(Medicao.objects.filter(agendamento=f).exists())

    # ------------------------------------------------------------ 6. Antecedência e cancelamentos
    def test_6_antecedencia_e_cancelamentos(self):
        cancelar = {}
        cancelar["superior"] = self.confirmado([self.i1], inicio="2026-11-30T09:00", duracao=60, qtd=1)
        cancelar["24h"] = self.confirmado([self.i1], inicio="2026-12-01T09:00", duracao=60, qtd=1)
        cancelar["divergente"] = self.confirmado([self.i1], inicio="2026-12-02T09:00", duracao=60, qtd=1)
        cancelar["tardio"] = self.confirmado([self.i1, self.i2], inicio="2026-12-03T09:00", duracao=180)
        cancelar["remoto"] = self.confirmado([self.i1, self.i2], modalidade="REMOTO", local="Plataforma fictícia", inicio="2026-12-04T09:00")
        cancelar["sem_confirmacao"] = self.criar_ag(self.sol, inicio="2026-12-07T09:00", duracao=60, qtd=1)
        cancelar["pela_contratada"] = self.confirmado([self.i3], inicio="2026-12-08T09:00", duracao=60, qtd=1)

        # Calendário configurável pela Prefeitura (feriado municipal fictício)
        self.em(2026, 11, 16, 9, 0)
        self.enviar(self.fiscal, "feriados", dados={"data": "2026-11-25", "descricao": "Feriado municipal fictício"})
        self.assertTrue(Feriado.objects.filter(contrato=self.sbc, data=date(2026, 11, 25)).exists())

        # Remoto: 1 dia útil
        self.em(2026, 11, 16, 18, 0)
        ok = self.criar_ag(self.sol, modalidade="REMOTO", local="Plataforma fictícia", inicio="2026-11-17T09:00", duracao=60, qtd=1)
        self.assertEqual((ok.antecedencia_dias_uteis, ok.fora_do_prazo), (1, False))
        self.assertEqual(ok.inicio_previsto, datetime(2026, 11, 17, 12, 0, tzinfo=tz.utc))  # 09:00 em Brasília
        self.em(2026, 11, 17, 8, 0)
        fora = self.criar_ag(self.sol, modalidade="REMOTO", local="Plataforma fictícia", inicio="2026-11-17T18:00", duracao=60, qtd=1)
        self.assertEqual((fora.antecedencia_dias_uteis, fora.fora_do_prazo), (0, True))
        self.assertIn("fora do prazo", self.sol.get(reverse("operacao:agendamento", args=[fora.pk])).content.decode())
        lista = self.sol.get(reverse("operacao:agendamentos") + "?pendencias=on").content.decode()
        self.assertIn(fora.codigo, lista)
        self.assertNotIn(ok.codigo, lista)
        # Presencial: 3 dias úteis, contando o feriado
        self.em(2026, 11, 23, 10, 0)
        p_ok = self.criar_ag(self.sol, inicio="2026-11-27T09:00")
        self.assertEqual((p_ok.antecedencia_dias_uteis, p_ok.fora_do_prazo), (3, False))
        self.em(2026, 11, 24, 10, 0)
        p_fora = self.criar_ag(self.sol, inicio="2026-11-27T14:00", local="Outro endereço fictício")
        self.assertEqual((p_fora.antecedencia_dias_uteis, p_fora.fora_do_prazo), (2, True))

        # Cancelamentos: os dois critérios do edital, sem escolher entre eles
        def cancela(chave, *momento, quem=None):
            self.em(*momento)
            self.enviar(quem or self.sol, "agendamento_cancelar", cancelar[chave].pk, dados={"justificativa": f"Cancelamento {chave} (fictício)"})
            cancelar[chave].refresh_from_db()
            return cancelar[chave].cancelamento_classificacao

        self.assertEqual(cancela("superior", 2026, 11, 27, 9, 0), "ANTECEDENCIA_SUPERIOR")  # 72 h e 1 dia útil
        self.assertEqual(cancela("24h", 2026, 11, 30, 9, 0), "AMBIGUO")  # exatamente 24 h
        self.assertEqual(cancela("divergente", 2026, 12, 1, 10, 0), "AMBIGUO")  # 23 h, mas 1 dia útil
        self.assertEqual(cancela("tardio", 2026, 12, 3, 7, 0), "TARDIO")
        self.assertEqual(cancela("remoto", 2026, 12, 4, 8, 0), "TARDIO")
        self.assertEqual(cancela("sem_confirmacao", 2026, 12, 7, 8, 0), "TARDIO")
        self.assertEqual(cancela("pela_contratada", 2026, 12, 8, 8, 0, quem=self.op), "TARDIO")

        # Indenização nunca é automática
        self.assertFalse(PedidoIndenizacao.objects.exists())

        def pedir(chave, anexo=None):
            dados = {"comprovacao": "Intérpretes deslocados e agenda reservada (fictício)"}
            if anexo:
                dados["anexo"] = anexo
            r = self.op.post(reverse("operacao:indenizacao_solicitar", args=[cancelar[chave].pk]), dados, follow=True)
            return cancelar[chave].indenizacoes.first(), mensagens(r)

        # Presencial tardio: 100% do tempo estimado (180 min), limitado a 2 h
        pdf = SimpleUploadedFile("comprovante.pdf", b"%PDF-1.4 comprovante ficticio", content_type="application/pdf")
        pedido, _ = pedir("tardio", pdf)
        self.assertEqual((pedido.situacao, pedido.percentual, pedido.minutos_referencia, pedido.valor_referencia),
                         ("SOLICITADA", Decimal("100.00"), Decimal("120.00"), Decimal("313.20")))
        self.assertEqual(len(pedido.anexo_sha256), 64)
        # Aprovação exige comprovação conferida pela Prefeitura
        self.enviar(self.fiscal, "indenizacao_decidir", cancelar["tardio"].pk, pedido.pk, dados={"decisao": "aprovar", "parecer": "Sem comprovação"})
        pedido.refresh_from_db()
        self.assertEqual(pedido.situacao, "SOLICITADA")
        self.enviar(self.fiscal, "indenizacao_decidir", cancelar["tardio"].pk, pedido.pk,
                    dados={"decisao": "aprovar", "parecer": "Comprovação conferida (fictício)", "reserva_comprovada": "on"})
        pedido.refresh_from_db()
        self.assertEqual(pedido.situacao, "APROVADA")
        # Remoto tardio: 50% do tempo estimado (120 min → 60 min)
        remoto, _ = pedir("remoto")
        self.assertEqual((remoto.percentual, remoto.minutos_referencia, remoto.valor_referencia), (Decimal("50.00"), Decimal("60.00"), Decimal("156.60")))
        # Sem confirmação prévia, por fato da contratada ou com antecedência superior: não cabe
        for chave, motivo in [("sem_confirmacao", "não estava confirmado"), ("pela_contratada", "imputável à contratada"),
                              ("superior", "antecedência superior")]:
            pedido_x, msg = pedir(chave)
            self.assertIsNone(pedido_x, chave)
            self.assertIn(motivo, msg)

    # ------------------------------------------------------------ 7. Proteção de dados
    def test_7_protecao_de_dados(self):
        ag = self.confirmado([self.i1, self.i2])
        # Outro solicitante da mesma cidade não vê o pedido
        sol_b = self.liberar(self.fiscal, "Solicitante Fictício B", "solicitante.b@exemplo.invalid", "SOLICITANTE", "Solicitante-Ficticia-Senha-4")
        self.assertEqual(sol_b.get(reverse("operacao:agendamento", args=[ag.pk])).status_code, 404)
        self.assertNotIn(ag.codigo, sol_b.get(reverse("operacao:agendamentos")).content.decode())
        # Contatos dos intérpretes não são públicos
        self.assertEqual(Client().get(reverse("operacao:interpretes")).status_code, 302)
        self.assertEqual(self.sol.get(reverse("operacao:interpretes")).status_code, 403)
        self.assertNotIn("(11) 90000-0001", sol_b.get(reverse("operacao:painel")).content.decode())

        # Outra cidade: nada de São Bernardo aparece para a Prefeitura de Franca
        self.op.post(reverse("operacao:plataforma"), {"cidade": "Franca", "uf": "SP", "orgao": "Prefeitura Fictícia de Franca",
                                                      "referencia": "Pregão Fictício 1/2026", "prefixo": "", "vigencia_inicio": "2026-10-01",
                                                      "vigencia_fim": "", "preco_inicial": "", "meu_perfil": "OPERADOR"})
        fra = Contrato.objects.get(cidade="Franca")
        fiscal_fra = self.liberar(self.op, "Fiscal Fictício Franca", "fiscal.fra@exemplo.invalid", "FISCAL", "Fiscal-Franca-Senha-5")
        self.assertEqual(fiscal_fra.get(reverse("operacao:agendamento", args=[ag.pk])).status_code, 404)
        self.assertNotIn(ag.codigo, fiscal_fra.get(reverse("operacao:agendamentos") + "?formato=csv").content.decode("utf-8-sig"))
        self.assertNotIn("Intérprete Fictício 1", fiscal_fra.get(reverse("operacao:interpretes")).content.decode())
        historico = fiscal_fra.get(reverse("operacao:auditoria")).context["eventos"]
        self.assertTrue(historico and all(e.contrato_id == fra.pk for e in historico))
        # O administrador só vê São Bernardo depois de trocar de cidade
        self.assertEqual(self.op.get(reverse("operacao:agendamento", args=[ag.pk])).status_code, 404)
        self.op.post(reverse("operacao:plataforma_entrar", args=[self.sbc.pk]))
        self.assertEqual(self.op.get(reverse("operacao:agendamento", args=[ag.pk])).status_code, 200)

        # Cabeçalhos de segurança, sessão protegida, sem dados de outro contrato (CMAA)
        r = self.sol.get(reverse("operacao:painel"))
        self.assertIn("default-src 'self'", r["Content-Security-Policy"])
        self.assertEqual((r["X-Frame-Options"], r["Cache-Control"]), ("DENY", "no-store"))
        self.assertTrue(self.sol.cookies[settings.SESSION_COOKIE_NAME]["httponly"])
        self.assertFalse(Contrato.objects.filter(referencia__icontains="CMAA").exists())
        raiz = Path(settings.BASE_DIR)
        for arquivo in [*raiz.glob("operacao/**/*.py"), *raiz.glob("operacao/**/*.html"), *raiz.glob("sql/*.sql")]:
            if arquivo.name != Path(__file__).name:
                self.assertNotIn("CMAA", arquivo.read_text(encoding="utf-8"), arquivo)

    # ------------------------------------------------------------ 8. Operação e suporte
    def test_8_chamados(self):
        self.em(2026, 11, 10, 10, 0)
        r = self.sol.post(reverse("operacao:chamado_novo"), {"tipo": "INTERCORRENCIA", "titulo": "Intérprete não chegou (fictício)",
                                                             "descricao": "Aguardando no local", "agendamento": ""})
        c1 = Chamado.objects.get(pk=resolve(r["Location"]).kwargs["pk"])
        self.assertEqual((c1.codigo, c1.aberto_em, c1.status), ("SBC-CH-2026-00001", sp(2026, 11, 10, 10, 0), "ABERTO"))
        # A resposta da própria Prefeitura não conta como primeira resposta
        self.enviar(self.sol, "chamado", c1.pk, dados={"acao": "responder", "texto": "Continuamos aguardando"})
        c1.refresh_from_db()
        self.assertIsNone(c1.primeira_resposta_em)
        # Destaque perto de 30 min e depois de vencido; a tela se atualiza sozinha
        self.em(2026, 11, 10, 10, 25)
        fila = self.op.get(reverse("operacao:chamados")).content.decode()
        self.assertIn("próximo de 30 min", fila)
        self.assertIn('http-equiv="refresh"', fila)
        self.em(2026, 11, 10, 10, 31)
        self.assertIn("PRAZO DE RESPOSTA EXCEDIDO", self.op.get(reverse("operacao:chamados")).content.decode())
        # Responsável e primeira resposta
        self.enviar(self.op, "chamado", c1.pk, dados={"acao": "atribuir", "responsavel": self.admin.pk})
        self.enviar(self.op, "chamado", c1.pk, dados={"acao": "responder", "texto": "Substituta a caminho"})
        c1.refresh_from_db()
        self.assertEqual((c1.responsavel, c1.primeira_resposta_em, c1.status), (self.admin, sp(2026, 11, 10, 10, 31), "EM_ATENDIMENTO"))
        # Prazo de 30 min é de resposta, não de resolução
        self.em(2026, 11, 10, 11, 0)
        r = self.fiscal.post(reverse("operacao:chamado_novo"), {"tipo": "SUBSTITUICAO", "titulo": "Trocar intérprete (fictício)",
                                                                "descricao": "Pedido de substituição", "agendamento": ""})
        c2 = Chamado.objects.get(pk=resolve(r["Location"]).kwargs["pk"])
        self.em(2026, 11, 10, 11, 15)
        self.enviar(self.op, "chamado", c2.pk, dados={"acao": "responder", "texto": "Analisando a substituição"})
        self.em(2026, 11, 10, 13, 0)
        c2.refresh_from_db()
        from operacao.servicos.chamados import situacao_sla
        self.assertEqual(situacao_sla(c2)["nivel"], "RESPONDIDO")
        self.assertTrue(situacao_sla(c2)["no_prazo"])
        self.assertFalse(situacao_sla(c1)["no_prazo"])
        self.assertEqual(c2.status, "EM_ATENDIMENTO")
        self.enviar(self.op, "chamado", c2.pk, dados={"acao": "concluir", "texto": "Substituição feita (fictício)"})
        c2.refresh_from_db()
        self.assertEqual((c2.status, c2.concluido_em), ("CONCLUIDO", sp(2026, 11, 10, 13, 0)))

    # ------------------------------------------------------------ 9. Relatório mensal
    def test_9_relatorio_mensal(self):
        a = self.confirmado([self.i1, self.i2])
        t = self.confirmado([self.i1, self.i2], inicio="2026-11-26T09:00", duracao=180)
        self.em(2026, 11, 10, 10, 0)
        self.sol.post(reverse("operacao:chamado_novo"), {"tipo": "VALIDACAO", "titulo": "Validar atendimento (fictício)",
                                                         "descricao": "Conferência", "agendamento": a.codigo})
        self.em(2026, 11, 16, 12, 0)
        self.realizar(a, "2026-11-16T09:00", "2026-11-16T11:00")
        self.homologar(self.op, a)
        self.homologar(self.fiscal, a)
        self.em(2026, 11, 26, 8, 0)
        self.enviar(self.sol, "agendamento_cancelar", t.pk, dados={"justificativa": "Escola fechada (fictício)"})
        self.enviar(self.op, "indenizacao_solicitar", t.pk, dados={"comprovacao": "Agenda reservada (fictício)"})
        pedido = t.indenizacoes.get()
        self.enviar(self.fiscal, "indenizacao_decidir", t.pk, pedido.pk,
                    dados={"decisao": "aprovar", "parecer": "Conferido (fictício)", "reserva_comprovada": "on"})

        # Só depois de terminar o mês
        self.em(2026, 11, 30, 17, 0)
        self.enviar(self.op, "relatorio_submeter", dados={"competencia": "2026-11"})
        self.assertFalse(RelatorioMensal.objects.exists())
        # Prévia e submissão até o 2º dia útil (02/12/2026)
        self.em(2026, 12, 1, 10, 0)
        previa = self.op.get(reverse("operacao:relatorios") + "?competencia=2026-11").context["previa"]
        self.assertEqual(previa["prazo"], date(2026, 12, 2))
        self.assertEqual(previa["totais"]["horas_prestadas"], "2.0000")
        self.assertEqual((previa["totais"]["valor_horas_prestadas"], previa["totais"]["valor_indenizacoes"], previa["totais"]["valor_geral"]),
                         ("313.20", "313.20", "626.40"))
        self.assertEqual(self.fiscal.post(reverse("operacao:relatorio_submeter"), {"competencia": "2026-11"}).status_code, 403)
        self.enviar(self.op, "relatorio_submeter", dados={"competencia": "2026-11"})
        r = RelatorioMensal.objects.get(contrato=self.sbc)
        self.assertEqual((r.status, r.prazo_limite, r.submetido_no_prazo, len(r.hash_conteudo)), ("SUBMETIDO", date(2026, 12, 2), True, 64))
        item = next(i for i in r.conteudo["atendimentos"] if i["codigo"] == a.codigo)
        self.assertEqual((item["inicio_realizado"], item["fim_realizado"], item["interpretes"]),
                         ("16/11/2026 09:00", "16/11/2026 11:00", ["Intérprete Fictício 1", "Intérprete Fictício 2"]))
        self.assertEqual([o["tipo"] for o in r.conteudo["ocorrencias"]], ["Validação de chamado/atendimento"])
        self.assertEqual(len(r.conteudo["indenizacoes_aprovadas"]), 1)
        # Nota fiscal só depois do atesto da Prefeitura
        nf = {"acao": "nf", "numero": "NF-FICT-0001", "data_emissao": "2026-12-03", "valor": "626.40", "observacao": ""}
        self.enviar(self.op, "relatorio", r.pk, dados=nf)
        self.assertFalse(r.notas_fiscais.exists())
        self.enviar(self.fiscal, "relatorio", r.pk, dados={"acao": "decidir", "decisao": "aprovar", "parecer": "Atestado (fictício)"})
        r.refresh_from_db()
        self.assertEqual(r.status, "ATESTADO")
        self.em(2026, 12, 3, 9, 0)
        self.enviar(self.op, "relatorio", r.pk, dados=nf)
        self.assertEqual(r.notas_fiscais.get().valor, Decimal("626.40"))
        self.sql_bloqueado(f"UPDATE {RelatorioMensal._meta.db_table} SET conteudo = '{{}}' WHERE id = %s", [r.pk])
        csv = self.op.get(reverse("operacao:relatorio", args=[r.pk]) + "?formato=csv").content.decode("utf-8-sig")
        self.assertIn("INDENIZAÇÕES APROVADAS (separadas)", csv)
        self.assertTrue(self.op.get(reverse("operacao:relatorio", args=[r.pk]) + "?formato=pdf").content.startswith(b"%PDF"))

    # ------------------------------------------------------------ Decisões de implementação
    def test_decisoes_filtros_exportacao_interface(self):
        presencial = self.confirmado([self.i1, self.i2])
        remoto = self.confirmado([self.i3], modalidade="REMOTO", local="Plataforma fictícia", inicio="2026-11-17T09:00", duracao=60, qtd=1)
        cancelado = self.criar_ag(self.sol, inicio="2026-11-18T09:00")
        self.enviar(self.sol, "agendamento_cancelar", cancelado.pk, dados={"justificativa": "Não haverá aula (fictício)"})
        self.assertEqual([presencial.codigo, remoto.codigo, cancelado.codigo], ["SBC-2026-000001", "SBC-2026-000002", "SBC-2026-000003"])

        def lista(**filtro):
            r = self.fiscal.get(reverse("operacao:agendamentos"), filtro)
            return {a.codigo for a in r.context["agendamentos"]}

        self.assertEqual(lista(de="2026-11-17", ate="2026-11-17"), {remoto.codigo})
        self.assertEqual(lista(modalidade="REMOTO"), {remoto.codigo})
        self.assertEqual(lista(interprete=self.i3.pk), {remoto.codigo})
        self.assertEqual(lista(status="CANCELADO"), {cancelado.codigo})
        csv = self.fiscal.get(reverse("operacao:agendamentos"), {"formato": "csv"}).content.decode("utf-8-sig")
        self.assertTrue(csv.startswith("Código"))
        self.assertEqual(sum(cod in csv for cod in (presencial.codigo, remoto.codigo, cancelado.codigo)), 3)

        # Interface em português, preparada para celular, cada campo com rótulo
        html = self.sol.get(reverse("operacao:agendamento_novo")).content.decode()
        self.assertIn('<html lang="pt-BR">', html)
        self.assertIn('name="viewport" content="width=device-width, initial-scale=1"', html)
        campos = re.findall(r'<(?:input|select|textarea)[^>]*\bid="([^"]+)"', html)
        self.assertGreaterEqual(len(campos), 8)
        for id_campo in campos:
            self.assertIn(f'for="{id_campo}"', html, id_campo)
        # Tela de detalhe tem vários formulários na mesma página: identificadores únicos e cada campo com rótulo
        for quem in (self.op, self.fiscal):
            html = quem.get(reverse("operacao:agendamento", args=[presencial.pk])).content.decode()
            ids = re.findall(r'\sid="([^"]+)"', html)
            self.assertEqual(len(ids), len(set(ids)), sorted(i for i in ids if ids.count(i) > 1))
            for id_campo in re.findall(r'<(?:input|select|textarea)(?![^>]*type="hidden")[^>]*\bid="([^"]+)"', html):
                self.assertIn(f'for="{id_campo}"', html, id_campo)
