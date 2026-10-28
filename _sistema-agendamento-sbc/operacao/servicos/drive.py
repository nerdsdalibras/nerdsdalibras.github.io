"""Cópia externa dos backups no Google Drive da conta nerdsdalibras@gmail.com.

Somente biblioteca padrão (urllib). Regras de segurança:
- só envia arquivos CIFRADOS (.gpg) e o arquivo de somas (.sha256);
- confere que a conta autenticada é a esperada (GDRIVE_CONTA) antes de enviar;
- escopo OAuth mínimo `drive.file`: o sistema só enxerga arquivos que ele criou;
- após o envio compara o MD5 calculado pelo Google com o MD5 local;
- credenciais apenas em variáveis de ambiente (nunca em código ou no banco).
"""
import hashlib
import json
import os
import urllib.error
import urllib.parse
import urllib.request
import uuid

from django.conf import settings

ESCOPO = "https://www.googleapis.com/auth/drive.file"
PASTA_MIME = "application/vnd.google-apps.folder"
EXTENSOES_PERMITIDAS = (".gpg", ".sha256")
BLOCO = 8 * 1024 * 1024


class ErroDrive(Exception):
    pass


def diagnostico():
    falta = [n for n in ("GDRIVE_CLIENT_ID", "GDRIVE_CLIENT_SECRET", "GDRIVE_REFRESH_TOKEN") if not getattr(settings, n)]
    return [f"{n} não configurado." for n in falta]


def _req(metodo, url, dados=None, cabecalhos=None, token=None):
    req = urllib.request.Request(url, data=dados, method=metodo, headers=dict(cabecalhos or {}))
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        corpo = e.read()[:500].decode("utf-8", "replace")
        raise ErroDrive(f"HTTP {e.code} em {metodo} {url.split('?')[0]}: {corpo}") from None
    except urllib.error.URLError as e:
        raise ErroDrive(f"Falha de conexão com {url.split('?')[0]}: {e.reason}") from None


def obter_token():
    if diagnostico():
        raise ErroDrive("Integração com o Google Drive pendente: " + " ".join(diagnostico()))
    corpo = urllib.parse.urlencode({
        "client_id": settings.GDRIVE_CLIENT_ID, "client_secret": settings.GDRIVE_CLIENT_SECRET,
        "refresh_token": settings.GDRIVE_REFRESH_TOKEN, "grant_type": "refresh_token",
    }).encode()
    _, _, r = _req("POST", settings.GDRIVE_TOKEN_URL, corpo, {"Content-Type": "application/x-www-form-urlencoded"})
    token = json.loads(r).get("access_token")
    if not token:
        raise ErroDrive("Resposta de token sem access_token.")
    return token


def _api(caminho, **params):
    q = urllib.parse.urlencode(params)
    return f"{settings.GDRIVE_API_URL}{caminho}" + (f"?{q}" if q else "")


def conferir_conta(token):
    _, _, r = _req("GET", _api("/drive/v3/about", fields="user(emailAddress)"), token=token)
    email = json.loads(r).get("user", {}).get("emailAddress", "").lower()
    if email != settings.GDRIVE_CONTA.lower():
        raise ErroDrive(f"Conta autenticada ({email or 'desconhecida'}) diferente da esperada ({settings.GDRIVE_CONTA}). Nada foi enviado.")
    return email


def garantir_pasta(token, nome=None):
    nome = nome or settings.GDRIVE_PASTA
    nome_q = nome.replace("\\", "\\\\").replace("'", "\\'")
    q = f"name = '{nome_q}' and mimeType = '{PASTA_MIME}' and trashed = false"
    _, _, r = _req("GET", _api("/drive/v3/files", q=q, fields="files(id,name)", spaces="drive"), token=token)
    achadas = json.loads(r).get("files", [])
    if achadas:
        return achadas[0]["id"]
    _, _, r = _req("POST", _api("/drive/v3/files", fields="id"), json.dumps({"name": nome, "mimeType": PASTA_MIME}).encode(),
                   {"Content-Type": "application/json; charset=UTF-8"}, token)
    return json.loads(r)["id"]


def md5_arquivo(caminho):
    h = hashlib.md5()  # noqa: S324 — usado só para comparar com o md5Checksum do Drive
    with open(caminho, "rb") as f:
        for parte in iter(lambda: f.read(BLOCO), b""):
            h.update(parte)
    return h.hexdigest()


def enviar_arquivo(token, caminho, pasta_id):
    nome = os.path.basename(caminho)
    if not nome.endswith(EXTENSOES_PERMITIDAS):
        raise ErroDrive(f"Recusado: {nome} não está cifrado (.gpg). Backups só vão ao Drive cifrados.")
    tamanho = os.path.getsize(caminho)
    _, cab, _ = _req(
        "POST", _api("/upload/drive/v3/files", uploadType="resumable", fields="id,name,size,md5Checksum"),
        json.dumps({"name": nome, "parents": [pasta_id]}).encode(),
        {"Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": "application/octet-stream",
         "X-Upload-Content-Length": str(tamanho)}, token,
    )
    sessao = cab.get("Location") or cab.get("location")
    if not sessao:
        raise ErroDrive("O Drive não retornou a sessão de envio.")
    resposta = b""
    with open(caminho, "rb") as f:
        inicio = 0
        while True:
            parte = f.read(BLOCO)
            fim = inicio + len(parte) - 1
            faixa = f"bytes {inicio}-{fim}/{tamanho}" if parte else f"bytes */{tamanho}"
            try:
                _, _, resposta = _req("PUT", sessao, parte, {"Content-Range": faixa, "Content-Length": str(len(parte))})
                break  # 200/201: concluído
            except ErroDrive as e:
                if "HTTP 308" not in str(e):  # 308 = continuar enviando
                    raise
            inicio = fim + 1
    info = json.loads(resposta)
    local = md5_arquivo(caminho)
    if info.get("md5Checksum") != local:
        raise ErroDrive(f"Integridade NÃO confere para {nome}: local {local}, Drive {info.get('md5Checksum')}.")
    return {**info, "md5_local": local}


def listar(token, pasta_id):
    q = f"'{pasta_id}' in parents and trashed = false"
    _, _, r = _req("GET", _api("/drive/v3/files", q=q, fields="files(id,name,size,md5Checksum,createdTime)",
                               orderBy="createdTime desc", pageSize="200"), token=token)
    return json.loads(r).get("files", [])


def baixar(token, arquivo_id, destino):
    _, _, r = _req("GET", _api(f"/drive/v3/files/{urllib.parse.quote(arquivo_id)}", alt="media"), token=token)
    with open(destino, "wb") as f:
        f.write(r)
    return destino


def enviar_backup(caminhos):
    """Fluxo completo: token → confere conta → pasta → envia e confere cada arquivo."""
    for c in caminhos:
        if not os.path.basename(c).endswith(EXTENSOES_PERMITIDAS):
            raise ErroDrive(f"Recusado: {os.path.basename(c)} não está cifrado (.gpg). Nada foi enviado.")
    token = obter_token()
    conta = conferir_conta(token)
    pasta = garantir_pasta(token)
    return conta, [enviar_arquivo(token, c, pasta) for c in caminhos]


def url_autorizacao(redirect_uri, estado=None):
    return "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode({
        "client_id": settings.GDRIVE_CLIENT_ID, "redirect_uri": redirect_uri, "response_type": "code",
        "scope": ESCOPO, "access_type": "offline", "prompt": "consent",
        "login_hint": settings.GDRIVE_CONTA, "state": estado or uuid.uuid4().hex,
    })


def trocar_codigo(codigo, redirect_uri):
    corpo = urllib.parse.urlencode({
        "code": codigo, "client_id": settings.GDRIVE_CLIENT_ID, "client_secret": settings.GDRIVE_CLIENT_SECRET,
        "redirect_uri": redirect_uri, "grant_type": "authorization_code",
    }).encode()
    _, _, r = _req("POST", settings.GDRIVE_TOKEN_URL, corpo, {"Content-Type": "application/x-www-form-urlencoded"})
    return json.loads(r)
