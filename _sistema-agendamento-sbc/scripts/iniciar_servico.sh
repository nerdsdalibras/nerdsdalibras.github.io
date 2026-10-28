#!/usr/bin/env bash
# Inicialização do serviço na hospedagem: espera o banco ficar disponível, migrações (inclui triggers de imutabilidade),
# administrador inicial (se ainda não existir) e servidor web.
set -euo pipefail
export PYTHONUNBUFFERED=1  # mensagens aparecem na hora no log da hospedagem
python manage.py aguardar_banco --timeout "${SGI_ESPERA_BANCO_SEGUNDOS:-300}"
python manage.py migrate --noinput
python manage.py inicializar_plataforma
exec gunicorn config.wsgi -c gunicorn.conf.py
