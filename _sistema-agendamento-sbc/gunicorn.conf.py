"""Configuração do Gunicorn para a hospedagem.

Também mantém um laço de reenvio de notificações em cada processo (a cada 2 min),
para não depender de um agendador externo. É seguro rodar em vários processos:
o envio usa bloqueio de linha e nunca reenvia notificação já ENVIADA.
"""
import os
import threading
import time

bind = f"0.0.0.0:{os.environ.get('PORT', '8000')}"
workers = int(os.environ.get("WEB_CONCURRENCY", "2"))
timeout = 60
accesslog = "-"
forwarded_allow_ips = "*"  # a hospedagem termina o HTTPS no proxy


def post_worker_init(worker):
    if os.environ.get("SGI_PROCESSADOR_NOTIFICACOES", "sim") != "sim":
        return

    def laco():
        from django.db import close_old_connections

        intervalo = int(os.environ.get("SGI_INTERVALO_NOTIFICACOES", "120"))
        while True:
            time.sleep(intervalo)
            try:
                from operacao.servicos.notificacoes import processar_pendentes

                processar_pendentes()
            except Exception:  # noqa: BLE001 — registra e segue
                worker.log.exception("Falha ao processar notificações pendentes")
            finally:
                close_old_connections()

    threading.Thread(target=laco, name="sgi-notificacoes", daemon=True).start()
