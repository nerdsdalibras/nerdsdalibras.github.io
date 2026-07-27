#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Injeta automaticamente o Meta Pixel (ID 2091933185003703) no <head> de
# qualquer página .html do projeto que ainda não tenha o pixel.
#
# Rodado como hook PostToolUse (matcher Write|Edit): sempre que o Claude cria ou
# edita um arquivo, este script confere se é um .html completo sem o pixel e,
# se for, insere o snippet imediatamente antes de </head>.
#
# É idempotente: se o ID já estiver na página, não faz nada.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

PIXEL_ID="2091933185003703"
DIR="${CLAUDE_PROJECT_DIR:-.}"
SNIPPET_FILE="$DIR/.claude/hooks/meta-pixel.html"

# Lê o JSON do hook (stdin) e extrai o caminho do arquivo tocado.
input="$(cat)"
file="$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_response.filePath // empty' 2>/dev/null || true)"

# Guard-rails: precisa ser um .html existente, e o snippet precisa existir.
[ -n "$file" ] || exit 0
case "$file" in *.html) ;; *) exit 0 ;; esac
[ -f "$file" ] || exit 0
[ -f "$SNIPPET_FILE" ] || exit 0

# Já tem o pixel? Nada a fazer.
grep -q "$PIXEL_ID" "$file" && exit 0
# Só injeta em documentos HTML completos (com </head>).
grep -qi "</head>" "$file" || exit 0

snip="$(cat "$SNIPPET_FILE")"
awk -v snip="$snip" 'BEGIN{done=0}
  !done && tolower($0) ~ /<\/head>/ { print snip; done=1 }
  { print }
' "$file" > "$file.pixeltmp" && mv "$file.pixeltmp" "$file"

printf '{"systemMessage": "Meta Pixel (2091933185003703) adicionado automaticamente em %s"}\n' "$file"
