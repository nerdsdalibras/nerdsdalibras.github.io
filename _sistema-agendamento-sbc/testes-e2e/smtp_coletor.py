"""Servidor SMTP local que grava cada mensagem recebida (um arquivo por mensagem)."""
import sys, time, pathlib
from aiosmtpd.controller import Controller

destino = pathlib.Path(sys.argv[1]); destino.mkdir(parents=True, exist_ok=True)

class Coletor:
    async def handle_DATA(self, server, session, envelope):
        n = len(list(destino.glob("*.eml"))) + 1
        (destino / f"{n:03d}.eml").write_bytes(b"X-Envelope-To: " + ",".join(envelope.rcpt_tos).encode() + b"\r\n" + envelope.content)
        return "250 OK"

c = Controller(Coletor(), hostname="127.0.0.1", port=int(sys.argv[2]))
c.start()
print("SMTP local ouvindo", flush=True)
while True:
    time.sleep(3600)
