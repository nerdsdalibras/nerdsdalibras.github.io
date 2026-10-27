from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied

from operacao.models import Chamado, Contrato, Perfil, StatusRelatorio, Vinculo
from operacao.servicos import agendamentos, chamados, homologacao, relatorios
from operacao.servicos.base import Ator, ErroRegra

from .base import Cenario, sp


class Relatorio(Cenario):
    def test_prazo_segundo_dia_util(self):
        # competência 11/2026 → dezembro: 1 (ter), 2 (qua) → prazo 02/12/2026
        self.assertEqual(relatorios.prazo_limite(self.contrato, date(2026, 11, 1)), date(2026, 12, 2))
        # competência 12/2026 → janeiro 2027: 1 é feriado se cadastrado
        from operacao.models import Feriado

        Feriado.objects.create(contrato=self.contrato, data=date(2027, 1, 1), descricao="Confraternização")
        self.assertEqual(relatorios.prazo_limite(self.contrato, date(2026, 12, 1)), date(2027, 1, 5))

    def test_fluxo_submissao_atesto_e_nf(self):
        ag, m = self.realizado(120)
        homologacao.homologar(self.operador, ag)
        homologacao.homologar(self.fiscal, ag)
        ag2, _ = self.realizado(130, quando=sp(2026, 11, 18, 9), duracao=60, qtd=1)  # pendência
        with self.agora(sp(2026, 12, 2, 10)):
            r = relatorios.submeter(self.operador, date(2026, 11, 1))
        self.assertTrue(r.submetido_no_prazo)
        self.assertEqual(r.conteudo["totais"]["horas_prestadas"], "2.0000")
        self.assertEqual(r.conteudo["totais"]["valor_horas_prestadas"], "313.20")
        self.assertEqual(len(r.conteudo["pendencias_medicao"]), 1)
        with self.assertRaises(ErroRegra):
            relatorios.registrar_nota_fiscal(self.operador, r, "123", date(2026, 12, 3), Decimal("313.20"))
        with self.assertRaises(PermissionDenied):
            relatorios.decidir(self.operador, r, True, "auto")
        relatorios.decidir(self.fiscal, r, True, "Conferido e atestado")
        nf = relatorios.registrar_nota_fiscal(self.operador, r, "123", date(2026, 12, 3), Decimal("313.20"))
        self.assertEqual(nf.valor, Decimal("313.20"))

    def test_submissao_apos_prazo_e_sinalizada(self):
        with self.agora(sp(2026, 12, 4, 10)):
            r = relatorios.submeter(self.operador, date(2026, 11, 1))
        self.assertFalse(r.submetido_no_prazo)

    def test_devolucao_gera_nova_versao_e_preserva_anterior(self):
        with self.agora(sp(2026, 12, 1, 10)):
            r1 = relatorios.submeter(self.operador, date(2026, 11, 1))
            with self.assertRaises(ErroRegra):
                relatorios.submeter(self.operador, date(2026, 11, 1))
        relatorios.decidir(self.fiscal, r1, False, "Ajustar ocorrências")
        with self.agora(sp(2026, 12, 2, 10)):
            r2 = relatorios.submeter(self.operador, date(2026, 11, 1))
        self.assertEqual(r2.versao, 2)
        r1.refresh_from_db()
        self.assertEqual(r1.status, StatusRelatorio.DEVOLVIDO)


class Chamados(Cenario):
    def test_sla_primeira_resposta(self):
        t0 = sp(2026, 11, 16, 9)
        with self.agora(t0):
            c = chamados.abrir(self.solicitante, "INTERCORRENCIA", "Intérprete não chegou", "Descrição fictícia")
        c.refresh_from_db()
        self.assertEqual(chamados.situacao_sla(c, t0 + timedelta(minutes=10))["nivel"], "NO_PRAZO")
        self.assertEqual(chamados.situacao_sla(c, t0 + timedelta(minutes=22))["nivel"], "ATENCAO")
        self.assertEqual(chamados.situacao_sla(c, t0 + timedelta(minutes=31))["nivel"], "VENCIDO")
        chamados.responder(self.solicitante, c, "complemento")  # quem abriu não conta como resposta
        c.refresh_from_db()
        self.assertIsNone(c.primeira_resposta_em)
        chamados.responder(self.operador, c, "Substituto a caminho")
        c.refresh_from_db()
        self.assertIsNotNone(c.primeira_resposta_em)
        self.assertEqual(c.responsavel, self.operador.usuario)
        chamados.concluir(self.operador, c, "Substituição realizada")
        c.refresh_from_db()
        self.assertIsNotNone(c.concluido_em)


class Isolamento(Cenario):
    def test_dados_de_outro_contrato_inacessiveis(self):
        outro = Contrato.objects.create(codigo="outro", orgao="Outro órgão fictício", contratada="X", referencia="Y", prefixo_codigo="OUT")
        u = get_user_model().objects.create_user(email="op2@exemplo.invalid", nome_completo="Op 2", password="senha-de-teste-123")
        Vinculo.objects.create(usuario=u, contrato=outro, perfil=Perfil.OPERADOR)
        ator_outro = Ator(u, outro, Perfil.OPERADOR)
        ag = self.novo_agendamento()
        with self.assertRaises(PermissionDenied):
            agendamentos.escalar(ator_outro, ag, self.interpretes[0])
        with self.assertRaises(PermissionDenied):
            agendamentos.confirmar(ator_outro, ag)
        self.assertFalse(agendamentos.pode_ver(ator_outro, ag))


class ConfiguracoesSujeitasAPrefeitura(Cenario):
    def test_calendario_so_pela_prefeitura(self):
        from operacao.servicos import cadastros

        with self.assertRaises(PermissionDenied):
            cadastros.adicionar_feriado(self.operador, date(2026, 8, 20), "Data fictícia")
        with self.assertRaises(PermissionDenied):
            cadastros.adicionar_feriado(self.admin, date(2026, 8, 20), "Data fictícia")
        f = cadastros.adicionar_feriado(self.fiscal, date(2026, 8, 20), "Data fictícia")
        self.assertTrue(f.ativo)

    def test_retencao_sem_prazo_inventado_e_aprovacao_da_prefeitura(self):
        from operacao.models import PoliticaRetencao
        from operacao.servicos import parametros

        self.assertFalse(PoliticaRetencao.objects.exists())  # nenhum prazo é pré-definido pelo sistema
        p = parametros.propor_retencao(self.operador, "Prazo informado pela Prefeitura (fictício)", "Norma fictícia")
        with self.assertRaises(PermissionDenied):
            parametros.decidir_retencao(self.operador, p, True, "auto")
        p = parametros.decidir_retencao(self.fiscal, p, True, "De acordo")
        self.assertEqual(p.situacao, "APROVADO")

    def test_admin_tecnico_nao_propoe_parametro(self):
        from operacao.servicos import parametros
        from operacao.servicos.parametros import FAIXAS_EDITAL

        with self.assertRaises(PermissionDenied):
            parametros.propor_parametro(self.admin, "1", FAIXAS_EDITAL, date(2026, 1, 1), "x")

    def test_criacao_de_perfil_da_prefeitura_gera_aviso(self):
        from operacao.models import Notificacao
        from operacao.servicos import cadastros

        v, senha = cadastros.criar_usuario_vinculo(self.admin, "novo.fiscal@exemplo.invalid", "Novo Fiscal Fictício", Perfil.FISCAL)
        self.assertTrue(senha)
        self.assertTrue(Notificacao.objects.filter(tipo="ACESSO_PREFEITURA").exists())
