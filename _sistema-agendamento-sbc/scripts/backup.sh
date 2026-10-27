#!/usr/bin/env bash
# Backup do SGI: banco (pg_dump formato custom) + anexos, com soma SHA-256.
# Uso: scripts/backup.sh [diretorio_destino]    (variáveis DB_* do ambiente)
# Opcional: BACKUP_GPG_DESTINATARIO=chave → cifra os arquivos com GnuPG.
set -euo pipefail
DESTINO="${1:-./backups}"
CARIMBO="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$DESTINO"
umask 077
export PGPASSWORD="${DB_PASSWORD:-}"
DUMP="$DESTINO/sgi-$CARIMBO.dump"
pg_dump -h "${DB_HOST:-localhost}" -p "${DB_PORT:-5432}" -U "${DB_USER:-sgi}" -d "${DB_NAME:-sgi}" \
  --format=custom --no-owner --file "$DUMP"
ARQS=("$DUMP")
if [ -d "${MEDIA_ROOT:-./media}" ]; then
  tar -C "$(dirname "${MEDIA_ROOT:-./media}")" -czf "$DESTINO/sgi-anexos-$CARIMBO.tar.gz" "$(basename "${MEDIA_ROOT:-./media}")"
  ARQS+=("$DESTINO/sgi-anexos-$CARIMBO.tar.gz")
fi
if [ -n "${BACKUP_GPG_DESTINATARIO:-}" ]; then
  for a in "${ARQS[@]}"; do gpg --batch --yes -r "$BACKUP_GPG_DESTINATARIO" -o "$a.gpg" -e "$a" && shred -u "$a"; done
  ARQS=("${ARQS[@]/%/.gpg}")
fi
( cd "$DESTINO" && sha256sum "${ARQS[@]##*/}" > "sgi-$CARIMBO.sha256" )
echo "Backup concluído: ${ARQS[*]}"
echo "Copie para armazenamento EXTERNO ao servidor (outra conta/região) e registre o último hash da auditoria:"
echo "  python manage.py verificar_auditoria"
