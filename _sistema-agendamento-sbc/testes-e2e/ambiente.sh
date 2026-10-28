# Ambiente dos roteiros E2E. Uso: . testes-e2e/ambiente.sh
# Requer: PostgreSQL local, .env.dev na raiz do sistema, Node + Playwright e um venv
# com aiosmtpd em $SMTP_VENV (python3 -m venv $SMTP_VENV && $SMTP_VENV/bin/pip install aiosmtpd).
APP="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
E="${E2E_DIR:-$HOME/sgi-e2e}"; mkdir -p "$E"
SMTP_VENV="${SMTP_VENV:-$E/smtpvenv}"
ROTEIROS="$APP/testes-e2e"
set -a
. $APP/.env.dev
DJANGO_DEBUG=false; HTTPS_ATIVO=false; DJANGO_ALLOWED_HOSTS=127.0.0.1
DB_NAME=sgi_auditoria; MEDIA_ROOT=$E/media
EMAIL_ENVIO_HABILITADO=true; EMAIL_HOST=127.0.0.1; EMAIL_PORT=2525; EMAIL_USE_TLS=false; EMAIL_HOST_USER=; EMAIL_HOST_PASSWORD=
EMAIL_REMETENTE=sgi@exemplo.invalid; EMAIL_TIMEOUT=5; URL_BASE=http://127.0.0.1:8770
SENHA_DEMONSTRACAO='Auditoria-Ficticia-2026!'; PERMITIR_DEMONSTRACAO=sim
set +a
PY=$APP/.venv/bin/python
sobe_app() { # $1 porta  $2 banco
  ( cd $APP && DB_NAME=${2:-$DB_NAME} nohup .venv/bin/gunicorn config.wsgi -b 127.0.0.1:$1 -w 2 >> $E/gunicorn-$1.log 2>&1 & echo $! > $E/gunicorn-$1.pid )
  for i in $(seq 30); do
    if curl -s -o /dev/null http://127.0.0.1:$1/contas/entrar/; then
      kill -0 $(cat $E/gunicorn-$1.pid) 2>/dev/null && { echo "app no ar (pid $(cat $E/gunicorn-$1.pid), porta $1, banco ${2:-$DB_NAME})"; return 0; }
      echo "ERRO: porta $1 respondida por outro processo"; return 1
    fi; sleep 0.5; done; echo "app não subiu"; return 1
}
derruba_app() { # encerra TODOS os gunicorn da porta e espera a porta liberar
  for pid in $(pgrep -f "gunicorn config.wsgi -b 127.0.0.1:$1"); do kill $pid 2>/dev/null; done
  for i in $(seq 40); do pgrep -f "gunicorn config.wsgi -b 127.0.0.1:$1" >/dev/null || return 0; sleep 0.5; done
  for pid in $(pgrep -f "gunicorn config.wsgi -b 127.0.0.1:$1"); do kill -9 $pid 2>/dev/null; done; sleep 1; }
sobe_smtp() { nohup $SMTP_VENV/bin/python $ROTEIROS/smtp_coletor.py $E/caixa 2525 > $E/smtp.log 2>&1 & echo $! > $E/smtp.pid; sleep 1.5; }
derruba_smtp() { kill $(cat $E/smtp.pid) 2>/dev/null; sleep 0.5; }
nav() { node $ROTEIROS/navegador.js "$1" "${2:-http://127.0.0.1:8770}" $E/estado.json; }
sql() { PGPASSWORD=$DB_PASSWORD psql -h localhost -U $DB_USER -d ${2:-$DB_NAME} -tAc "$1"; }
