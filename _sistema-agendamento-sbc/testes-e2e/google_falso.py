"""Servidor LOCAL que imita a API do Google (OAuth + Drive) para testes E2E do backup.
Uso: python google_falso.py <porta> <conta_autenticada> <arquivo_estado.json>
Não contata o Google. Arquivos recebidos ficam em memória e um resumo é gravado no estado."""
import hashlib
import json
import sys
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class FalsoGoogle(BaseHTTPRequestHandler):
    estado = None

    def log_message(self, *a):
        pass

    def _json(self, codigo, obj, cab=None):
        corpo = json.dumps(obj).encode()
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json")
        for k, v in (cab or {}).items():
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def _autorizado(self):
        if self.headers.get("Authorization") != "Bearer tok-valido":
            self._json(401, {"error": "invalid_token"})
            return False
        return True

    def _corpo(self):
        return self.rfile.read(int(self.headers.get("Content-Length") or 0))

    def do_POST(self):
        e, url = self.estado, urllib.parse.urlparse(self.path)
        corpo = self._corpo()
        if url.path == "/token":
            dados = urllib.parse.parse_qs(corpo.decode())
            if dados.get("refresh_token") != ["refresh-valido"]:
                return self._json(400, {"error": "invalid_grant"})
            return self._json(200, {"access_token": "tok-valido"})
        if not self._autorizado():
            return
        if url.path == "/drive/v3/files":
            meta = json.loads(corpo)
            fid = f"pasta{len(e['pastas']) + 1}"
            e["pastas"][fid] = meta["name"]
            return self._json(200, {"id": fid})
        if url.path == "/upload/drive/v3/files":
            meta = json.loads(corpo)
            sid = f"s{len(e['sessoes']) + 1}"
            e["sessoes"][sid] = {"meta": meta, "dados": b"", "total": int(self.headers["X-Upload-Content-Length"])}
            return self._json(200, {}, {"Location": f"http://127.0.0.1:{e['porta']}/sessao/{sid}"})
        self._json(404, {})

    def do_PUT(self):
        e = self.estado
        sid = self.path.rsplit("/", 1)[-1]
        s = e["sessoes"][sid]
        s["dados"] += self._corpo()
        e["puts"] += 1
        if len(s["dados"]) < s["total"]:
            return self._json(308, {}, {"Range": f"bytes=0-{len(s['dados']) - 1}"})
        fid = f"arq{len(e['arquivos']) + 1}"
        md5 = hashlib.md5(s["dados"]).hexdigest()
        if e.get("corromper"):
            md5 = "0" * 32
        e["arquivos"][fid] = {"name": s["meta"]["name"], "parents": s["meta"]["parents"], "dados": s["dados"]}
        self._json(200, {"id": fid, "name": s["meta"]["name"], "size": str(len(s["dados"])), "md5Checksum": md5})

    def do_GET(self):
        e, url = self.estado, urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(url.query)
        if not self._autorizado():
            return
        if url.path == "/drive/v3/about":
            return self._json(200, {"user": {"emailAddress": e["conta"]}})
        if url.path == "/drive/v3/files":
            consulta = q.get("q", [""])[0]
            if "mimeType" in consulta:
                nome = consulta.split("name = '")[1].split("'")[0]
                return self._json(200, {"files": [{"id": k, "name": v} for k, v in e["pastas"].items() if v == nome]})
            pai = consulta.split("'")[1]
            return self._json(200, {"files": [{"id": k, "name": v["name"], "size": str(len(v["dados"])),
                                               "md5Checksum": hashlib.md5(v["dados"]).hexdigest()}
                                              for k, v in e["arquivos"].items() if pai in v["parents"]]})
        if url.path.startswith("/drive/v3/files/") and q.get("alt") == ["media"]:
            dados = e["arquivos"][url.path.rsplit("/", 1)[-1]]["dados"]
            self.send_response(200)
            self.send_header("Content-Length", str(len(dados)))
            self.end_headers()
            self.wfile.write(dados)
            return
        self._json(404, {})


class ComResumo(FalsoGoogle):
    def do_PUT(self):
        super().do_PUT()
        json.dump({k: v for k, v in self.estado.items() if k in ("pastas", "puts")} |
                  {"arquivos": {k: {"name": v["name"], "md5": hashlib.md5(v["dados"]).hexdigest(), "bytes": len(v["dados"])}
                                for k, v in self.estado["arquivos"].items()}}, open(sys.argv[3], "w"), indent=1)


if __name__ == "__main__":
    porta = int(sys.argv[1])
    FalsoGoogle.estado = {"pastas": {}, "sessoes": {}, "arquivos": {}, "puts": 0, "conta": sys.argv[2], "porta": porta}
    print("Google falso ouvindo", porta, flush=True)
    ThreadingHTTPServer(("127.0.0.1", porta), ComResumo).serve_forever()
