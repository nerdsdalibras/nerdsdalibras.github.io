from datetime import timedelta
from unittest import mock

from django.core import mail
from django.test import override_settings
from django.utils import timezone

from operacao.models import AvisoInterno, Notificacao, StatusNotificacao, TentativaEnvio
from operacao.servicos import agendamentos, notificacoes

from .base import Cenario

LOCMEM = dict(EMAIL_ENVIO_HABILITADO=True, EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")


class Notificacoes(Cenario):
    def confirmar_novo(self):
        ag = self.novo_agendamento()
        for i in self.interpretes[:2]:
            agendamentos.escalar(self.operador, ag, i)
        with self.captureOnCommitCallbacks(execute=True):
            agendamentos.confirmar(self.operador, ag)
        return Notificacao.objects.get(agendamento=ag, tipo="CONFIRMACAO")

    @override_settings(EMAIL_ENVIO_HABILITADO=False)
    def test_sem_configuracao_fica_pendente_de_integracao_sem_simular_sucesso(self):
        n = self.confirmar_novo()
        n.refresh_from_db()
        self.assertEqual(n.status, StatusNotificacao.INTEGRACAO_PENDENTE)
        self.assertIsNone(n.enviada_em)
        self.assertEqual(len(mail.outbox), 0)
        self.assertTrue(AvisoInterno.objects.filter(notificacao=n, usuario=self.fiscal.usuario).exists())

    @override_settings(**LOCMEM)
    def test_envio_imediato_aos_fiscais_e_sem_duplicidade(self):
        n = self.confirmar_novo()
        n.refresh_from_db()
        self.assertEqual(n.status, StatusNotificacao.ENVIADA)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, [self.fiscal.usuario.email])
        self.assertNotIn("90000", mail.outbox[0].body)  # contatos de intérpretes não vão por e-mail
        notificacoes.enviar(n.pk)
        notificacoes.processar_pendentes()
        self.assertEqual(len(mail.outbox), 1)
        mesma = notificacoes.enfileirar(self.contrato, "CONFIRMACAO", n.chave_idempotencia, "x", "y")
        self.assertEqual(mesma.pk, n.pk)
        self.assertEqual(Notificacao.objects.filter(chave_idempotencia=n.chave_idempotencia).count(), 1)

    @override_settings(**LOCMEM, NOTIFICACAO_MAX_TENTATIVAS=2)
    def test_falha_registra_e_reenvia(self):
        with mock.patch("django.core.mail.EmailMessage.send", side_effect=OSError("SMTP fora do ar")):
            n = self.confirmar_novo()
        n.refresh_from_db()
        self.assertEqual(n.status, StatusNotificacao.FALHA)
        self.assertIn("SMTP fora do ar", n.ultimo_erro)
        Notificacao.objects.filter(pk=n.pk).update(proxima_tentativa_em=timezone.now() - timedelta(seconds=1))
        notificacoes.processar_pendentes()
        n.refresh_from_db()
        self.assertEqual(n.status, StatusNotificacao.ENVIADA)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(TentativaEnvio.objects.filter(notificacao=n).count(), 2)

    @override_settings(**LOCMEM, NOTIFICACAO_MAX_TENTATIVAS=1)
    def test_falha_definitiva(self):
        with mock.patch("django.core.mail.EmailMessage.send", side_effect=OSError("x")):
            n = self.confirmar_novo()
        n.refresh_from_db()
        self.assertEqual(n.status, StatusNotificacao.FALHA_DEFINITIVA)
