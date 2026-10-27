#!/usr/bin/env bash
# Restaura um backup em um banco VAZIO (nunca sobre o banco em produção sem decisão formal).
# Uso: scripts/restaurar.sh arquivo.dump [anexos.tar.gz]
set -euo pipefail
DUMP="$1"; ANEXOS="${2:-}"
SOMA="$(dirname "$DUMP")/$(basename "$DUMP" .dump | sed 's/^sgi-//; s/^/sgi-/').sha256"
[ -f "$SOMA" ] && ( cd "$(dirname "$DUMP")" && sha256sum -c --ignore-missing "$(basename "$SOMA")" )
export PGPASSWORD="${DB_PASSWORD:-}"
TABELAS=$(psql -h "${DB_HOST:-localhost}" -U "${DB_USER:-sgi}" -d "${DB_NAME:-sgi}" -tAc \
  "select count(*) from information_schema.tables where table_schema='public'")
if [ "$TABELAS" != "0" ]; then
  echo "Banco de destino ${DB_NAME:-sgi} não está vazio. Crie um banco novo para restaurar." >&2; exit 1
fi
pg_restore -h "${DB_HOST:-localhost}" -p "${DB_PORT:-5432}" -U "${DB_USER:-sgi}" -d "${DB_NAME:-sgi}" --no-owner --exit-on-error "$DUMP"
if [ -n "$ANEXOS" ]; then mkdir -p "$(dirname "${MEDIA_ROOT:-./media}")"; tar -C "$(dirname "${MEDIA_ROOT:-./media}")" -xzf "$ANEXOS"; fi
PY="${PYTHON:-python}"
"$PY" manage.py migrate --check
"$PY" manage.py verificar_auditoria
echo "Restauração concluída e cadeia de auditoria verificada. Compare o último hash com o registrado externamente."
