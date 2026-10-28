from django.core.management.base import BaseCommand, CommandError

from operacao.servicos import auditoria, drive
from operacao.servicos.auditoria import AtorSistema


class Command(BaseCommand):
    help = "Cópia externa de backups CIFRADOS no Google Drive: enviar | listar | baixar."

    def add_arguments(self, parser):
        sub = parser.add_subparsers(dest="acao", required=True)
        e = sub.add_parser("enviar")
        e.add_argument("arquivos", nargs="+")
        sub.add_parser("listar")
        b = sub.add_parser("baixar")
        b.add_argument("arquivo_id")
        b.add_argument("destino")
        sub.add_parser("diagnostico")

    def handle(self, *args, **o):
        try:
            if o["acao"] == "diagnostico":
                falta = drive.diagnostico()
                for f in falta:
                    self.stdout.write(self.style.WARNING(f"PENDENTE: {f}"))
                if not falta:
                    token = drive.obter_token()
                    self.stdout.write(self.style.SUCCESS(f"Conectado como {drive.conferir_conta(token)}."))
                return
            if o["acao"] == "enviar":
                conta, enviados = drive.enviar_backup(o["arquivos"])
                for i in enviados:
                    self.stdout.write(f"  enviado {i['name']} ({i.get('size')} bytes) id={i['id']} md5 confere={i['md5Checksum'] == i['md5_local']}")
                auditoria.registrar(AtorSistema(None, "Rotina de backup"), "Backup", enviados[0]["id"], "COPIA_EXTERNA_DRIVE",
                                    f"Conta {conta}", depois={"arquivos": [{k: i[k] for k in ("id", "name", "md5Checksum")} for i in enviados]})
                self.stdout.write(self.style.SUCCESS(f"{len(enviados)} arquivo(s) no Drive de {conta}, integridade conferida."))
                return
            token = drive.obter_token()
            drive.conferir_conta(token)
            pasta = drive.garantir_pasta(token)
            if o["acao"] == "listar":
                for f in drive.listar(token, pasta):
                    self.stdout.write(f"{f['id']}  {f['name']}  {f.get('size')} bytes  {f.get('createdTime')}  md5={f.get('md5Checksum')}")
            else:
                drive.baixar(token, o["arquivo_id"], o["destino"])
                self.stdout.write(self.style.SUCCESS(f"Baixado em {o['destino']}. Confira com sha256sum -c e decifre com gpg -d."))
        except drive.ErroDrive as e:
            raise CommandError(str(e))
