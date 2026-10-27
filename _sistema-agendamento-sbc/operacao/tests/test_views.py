"""Testes de interface: autenticação, isolamento, permissões e ausência de rastreadores."""
from pathlib import Path

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.urls import reverse

from operacao.models import Contrato, Perfil, Vinculo

from .base import Cenario

SENHA = "senha-de-teste-123"


@override_settings(HTTPS_ATIVO=False, SECURE_SSL_REDIRECT=False)
class Views(Cenario):
    def entrar(self, perfil):
        self.client.force_login(self.atores[perfil].usuario)

    def test_exige_login(self):
        r = self.client.get(reverse("operacao:agendamentos"))
        self.assertEqual(r.status_code, 302)
        self.assertIn("/contas/entrar/", r["Location"])

    def test_login_bloqueia_apos_tentativas(self):
        url = reverse("contas:login")
        for _ in range(5):
            self.client.post(url, {"username": "fiscal@exemplo.invalid", "password": "errada"})
        r = self.client.post(url, {"username": "fiscal@exemplo.invalid", "password": SENHA})
        self.assertEqual(r.status_code, 200)
        self.assertNotIn("_auth_user_id", self.client.session)

    def test_contatos_de_interpretes_so_para_vinculados(self):
        ag = self.confirmado()
        self.entrar(Perfil.FISCAL)
        r = self.client.get(reverse("operacao:agendamento", args=[ag.pk]))
        self.assertContains(r, "i1@exemplo.invalid")
        outro = Contrato.objects.create(codigo="o", orgao="O", contratada="C", referencia="R", prefixo_codigo="O")
        u = get_user_model().objects.create_user(email="x@exemplo.invalid", nome_completo="X", password=SENHA)
        u.deve_trocar_senha = False
        u.save()
        Vinculo.objects.create(usuario=u, contrato=outro, perfil=Perfil.FISCAL)
        self.client.force_login(u)
        r = self.client.get(reverse("operacao:agendamento", args=[ag.pk]))
        self.assertEqual(r.status_code, 404)

    def test_solicitante_nao_ve_agendamento_de_outro(self):
        ag = self.novo_agendamento(ator=self.operador)
        self.entrar(Perfil.SOLICITANTE)
        self.assertEqual(self.client.get(reverse("operacao:agendamento", args=[ag.pk])).status_code, 404)

    def test_operador_nao_aprova_parametro_pela_interface(self):
        from datetime import date

        from operacao.servicos import parametros
        from operacao.servicos.parametros import FAIXAS_EDITAL

        p = parametros.propor_parametro(self.operador, "160", FAIXAS_EDITAL, date(2026, 1, 1), "Proposta")
        self.entrar(Perfil.OPERADOR)
        r = self.client.post(reverse("operacao:parametro_decidir", args=[p.pk]), {"decisao": "aprovar", "parecer": "x"})
        self.assertEqual(r.status_code, 403)
        p.refresh_from_db()
        self.assertEqual(p.situacao, "PROPOSTO")

    def test_paginas_principais_respondem(self):
        self.confirmado()
        for perfil in Perfil.values:
            self.entrar(perfil)
            for nome in ("painel", "agendamentos", "chamados", "avisos"):
                with self.subTest(perfil=perfil, pagina=nome):
                    r = self.client.get(reverse(f"operacao:{nome}"))
                    self.assertEqual(r.status_code, 200)
                    self.assertIn("Content-Security-Policy", r)

    def test_criar_agendamento_pela_interface(self):
        self.entrar(Perfil.SOLICITANTE)
        with self.agora(__import__("operacao.tests.base", fromlist=["sp"]).sp(2026, 11, 2, 9)):
            r = self.client.post(reverse("operacao:agendamento_novo"), {
                "titulo": "Evento fictício", "unidade_solicitante": "Unidade", "modalidade": "PRESENCIAL",
                "local": "Sala 1", "inicio_previsto": "2026-11-16T09:00", "duracao_prevista_min": "120",
                "qtd_profissionais": "2", "observacoes": "",
            })
        self.assertEqual(r.status_code, 302, getattr(r, "context", None) and r.context.get("form") and r.context["form"].errors)

    def test_templates_sem_rastreadores_de_terceiros(self):
        raiz = Path(__file__).resolve().parents[2]
        proibidos = ("fbq(", "facebook.net", "googletagmanager", "google-analytics", "gtag(", "hotjar", "clarity.ms")
        for arq in list(raiz.rglob("templates/**/*.html")) + list(raiz.rglob("static/**/*.js")):
            texto = arq.read_text(encoding="utf-8")
            for p in proibidos:
                self.assertNotIn(p, texto, f"Rastreador '{p}' encontrado em {arq}")

    def test_exportacoes_relatorio_e_historico(self):
        from datetime import date

        from operacao.servicos import relatorios

        from .base import sp

        ag, _ = self.realizado(120)
        with self.agora(sp(2026, 12, 1, 10)):
            r = relatorios.submeter(self.operador, date(2026, 11, 1))
        self.entrar(Perfil.FISCAL)
        url = reverse("operacao:relatorio", args=[r.pk])
        csv = self.client.get(url + "?formato=csv")
        self.assertEqual(csv["Content-Type"], "text/csv; charset=utf-8")
        self.assertIn(r.hash_conteudo, csv.content.decode("utf-8"))
        pdf = self.client.get(url + "?formato=pdf")
        self.assertTrue(pdf.content.startswith(b"%PDF"))
        for fmt in ("csv", "pdf"):
            h = self.client.get(reverse("operacao:agendamento_historico", args=[ag.pk, fmt]))
            self.assertEqual(h.status_code, 200)
