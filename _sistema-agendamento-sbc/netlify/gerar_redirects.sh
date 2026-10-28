#!/bin/sh
# Gera o _redirects do site Netlify a partir de SGI_BACKEND_URL (definida no painel da Netlify).
set -eu
if [ -z "${SGI_BACKEND_URL:-}" ]; then
  echo "ERRO: defina SGI_BACKEND_URL nas variáveis do site (ex.: https://sgi-nerdsdalibras.onrender.com)." >&2
  exit 1
fi
case "$SGI_BACKEND_URL" in
  https://*) ;;
  *) echo "ERRO: SGI_BACKEND_URL deve começar com https://" >&2; exit 1 ;;
esac
URL="${SGI_BACKEND_URL%/}"
mkdir -p publico
# Tudo (páginas, formulários, arquivos estáticos, downloads) vai ao servidor da aplicação.
printf '/*    %s/:splat    200!\n' "$URL" > publico/_redirects
echo "Proxy configurado: https://<este site>/*  ->  $URL/*"
cat publico/_redirects
