#!/usr/bin/env bash
# Inicialização do serviço na hospedagem: migrações (inclui triggers de imutabilidade),
# administrador inicial (se ainda não existir) e servidor web.
set -euo pipefail
python manage.py migrate --noinput
python manage.py inicializar_plataforma
exec gunicorn config.wsgi -c gunicorn.conf.py
