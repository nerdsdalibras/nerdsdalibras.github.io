#!/usr/bin/env bash
# Cria o banco sgi_auditoria (APAGA o anterior de mesmo nome) com dados fictícios.
. "$(dirname "$0")/ambiente.sh"
rm -rf $E/caixa $E/media $E/estado.json $E/*.log $E/bk; mkdir -p $E/caixa
su postgres -c "psql -qc 'DROP DATABASE IF EXISTS sgi_auditoria;' -c 'DROP DATABASE IF EXISTS sgi_auditoria_restaurado;' -c 'CREATE DATABASE sgi_auditoria OWNER sgi_dev;'"
cd $APP && $PY manage.py migrate -v0 && $PY manage.py collectstatic --noinput -v0 \
 && $PY manage.py criar_contrato --vigencia-inicio 2026-10-01 && $PY manage.py carregar_demonstracao
$PY - "$E/comprovacao.pdf" <<'P'
import sys
from reportlab.pdfgen import canvas
c = canvas.Canvas(sys.argv[1])
c.drawString(72, 750, "Declaração FICTÍCIA de reserva de agenda — documento de teste"); c.save()
P
