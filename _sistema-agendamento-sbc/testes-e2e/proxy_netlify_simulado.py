"""Imita o proxy (rewrite 200) da Netlify para testes locais.

Uso: python proxy_netlify_simulado.py <porta> <backend_host:porta> <modo_host> [host_destino]
  modo_host = preservar  → repassa o Host do navegador (ex.: sgi.localhost)
  modo_host = destino    → troca o Host pelo do servidor (ex.: sgi-nerdsdalibras.onrender.com)
Repassa método, caminho, query string, corpo e todos os cabeçalhos (inclusive vários
Set-Cookie); acrescenta X-Forwarded-Proto: https e X-Forwarded-For. Não segue redirecionamentos.
"""
import http.client
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORTA, BACKEND, MODO = int(sys.argv[1]), sys.argv[2], sys.argv[3]
HOST_DESTINO = sys.argv[4] if len(sys.argv) > 4 else BACKEND
SALTO = {"connection", "keep-alive", "transfer-encoding", "te", "trailer", "upgrade", "proxy-authorization", "proxy-authenticate"}


class Proxy(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass

    def _repassar(self):
        corpo = self.rfile.read(int(self.headers.get("Content-Length") or 0)) or None
        cab = {k: v for k, v in self.headers.items() if k.lower() not in SALTO | {"host", "content-length"}}
        cab["Host"] = self.headers["Host"] if MODO == "preservar" else HOST_DESTINO
        cab["X-Forwarded-Proto"] = "https"
        cab["X-Forwarded-For"] = self.client_address[0]
        if corpo:
            cab["Content-Length"] = str(len(corpo))
        con = http.client.HTTPConnection(BACKEND, timeout=30)
        con.request(self.command, self.path, body=corpo, headers=cab)
        r = con.getresponse()
        dados = r.read()
        self.send_response(r.status, r.reason)
        for k, v in r.getheaders():
            if k.lower() not in SALTO | {"content-length"}:
                self.send_header(k, v)
        self.send_header("Content-Length", str(len(dados)))
        self.end_headers()
        self.wfile.write(dados)

    do_GET = do_POST = do_HEAD = do_PUT = do_DELETE = _repassar


ThreadingHTTPServer(("127.0.0.1", PORTA), Proxy).serve_forever()
