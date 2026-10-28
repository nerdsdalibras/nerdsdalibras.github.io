# Roteiros E2E da auditoria funcional

Usados na auditoria de 28/10/2026 (`docs/06-auditoria-funcional.md`, itens 16, 19 e 20).
Usam **somente dados fictícios** e um banco próprio (`sgi_auditoria`), que é recriado.
O e-mail vai para um servidor SMTP **local** (`smtp_coletor.py`), que grava as mensagens
em arquivos — nenhuma mensagem sai da máquina.

```bash
. testes-e2e/ambiente.sh
bash testes-e2e/preparar.sh                 # banco, contrato, dados fictícios
sobe_app 8770                               # Gunicorn em modo produção
nav fluxo; nav ver-falha                    # confirmação com SMTP fora do ar → falha visível
sobe_smtp; nav reenviar                     # reenvio manual → enviado uma única vez
NOTIF_ID=<id> nav reenvio-forjado           # POST direto em notificação já enviada → bloqueado
nav alterar                                 # alteração de horário → e-mail imediato
ANEXO=$E/comprovacao.pdf nav cancelar-e-indenizar
nav conferir                                # estado exibido, histórico, anexo, integridade
node testes-e2e/permissoes.js http://127.0.0.1:8770 <id_parametro_proposto> <url_agendamento>
derruba_app 8770; derruba_smtp
```

Cópia no Google Drive (contra imitação LOCAL da API, sem contatar o Google):
```bash
python3 -I testes-e2e/google_falso.py 8790 nerdsdalibras@gmail.com /tmp/resumo-drive.json &
GDRIVE_CLIENT_ID=cid GDRIVE_CLIENT_SECRET=csec GDRIVE_REFRESH_TOKEN=refresh-valido \
GDRIVE_TOKEN_URL=http://127.0.0.1:8790/token GDRIVE_API_URL=http://127.0.0.1:8790 \
BACKUP_DRIVE=sim BACKUP_GPG_DESTINATARIO=backup@exemplo.invalid PYTHON=.venv/bin/python scripts/backup.sh /tmp/bk
```

Backup/restauração e reinício: ver os comandos descritos na tabela do relatório
(`scripts/backup.sh`, `scripts/restaurar.sh`, `pg_ctlcluster 16 main restart`).
Para o teste de GPG, use um `GNUPGHOME` com caminho curto (limite de socket do gpg-agent)
e `gpg --batch --pinentry-mode loopback --gen-key testes-e2e/chave-gpg-teste.txt`.
