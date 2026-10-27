# Manual básico de administração, backup e recuperação

## 1. Implantação (produção)

Pré-requisitos: servidor Linux com Python 3.12+, PostgreSQL 16, proxy reverso
com HTTPS (ex.: Nginx/Caddy com certificado válido), relógio sincronizado (NTP).

1. **Banco com papéis separados** (superusuário do PostgreSQL):
   ```bash
   psql -v ON_ERROR_STOP=1 -v senha_dono='<gerar>' -v senha_app='<gerar>' -f sql/01-papeis-antes-da-migracao.sql
   ```
2. **Código e dependências**: `python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`
3. **Variáveis de ambiente**: copie `.env.example` para um arquivo fora do
   repositório (permissão 600) ou use o gerenciador de segredos do provedor.
   Gere `DJANGO_SECRET_KEY` aleatória. Mantenha `EMAIL_ENVIO_HABILITADO=false`
   até haver autorização para envio real.
4. **Migrações com o papel dono** e permissões para o papel da aplicação:
   ```bash
   DB_USER=sgi_dono DB_PASSWORD=... python manage.py migrate
   psql -v ON_ERROR_STOP=1 -d sgi -f sql/02-permissoes-apos-migracao.sql
   ```
   Repita os dois passos a cada atualização que traga migrações.
5. **Aplicação** com o papel `sgi_app`: `python manage.py collectstatic --noinput`
   e `gunicorn config.wsgi -b 127.0.0.1:8000 -w 3` (serviço systemd), atrás do
   proxy HTTPS com `ATRAS_DE_PROXY=true`.
6. **Contrato e primeiros acessos**:
   ```bash
   python manage.py criar_contrato --vigencia-inicio AAAA-MM-DD --vigencia-fim AAAA-MM-DD
   python manage.py criar_usuario --contrato pmsbc-se-pe-246-2026 --perfil ADMIN_TECNICO \
       --email ... --nome "..." --operador-infra "Seu nome"
   python manage.py criar_usuario --contrato pmsbc-se-pe-246-2026 --perfil FISCAL \
       --email ... --nome "..." --operador-infra "Seu nome"
   ```
   O Fiscal deve, no primeiro acesso: trocar a senha, revisar e **aprovar ou
   rejeitar o parâmetro v1**, cadastrar feriados municipais e indicar a
   política de retenção.
7. **Agendar** (cron/systemd timer):
   - a cada 2 min: `python manage.py processar_notificacoes`
   - diário: `scripts/backup.sh /caminho/backups` + cópia externa
   - diário: `python manage.py verificar_auditoria` (alertar se falhar)
   - diário: `python manage.py clearsessions`

**Não execute** `carregar_demonstracao` em produção.

## 2. Gestão de usuários

- Pelo menu **Usuários** (perfil Administrador técnico): criar acesso gera
  senha temporária exibida uma única vez; o usuário é obrigado a trocá-la.
- Desligamentos: desative o vínculo (não há exclusão; o histórico permanece).
- Criar ou promover alguém a perfil da Prefeitura gera aviso automático a
  todos os fiscais/gestores, para que acessos indevidos sejam percebidos.
- O administrador técnico **não** cria agendamentos, não aprova parâmetros, não
  homologa e não altera o calendário.

## 3. Backup

`scripts/backup.sh <destino>` gera:
- `sgi-<data>.dump` (pg_dump formato custom: estrutura, dados e triggers);
- `sgi-anexos-<data>.tar.gz` (comprovações de indenização, se houver);
- `sgi-<data>.sha256` (somas de verificação).

Com `BACKUP_GPG_DESTINATARIO=<chave>` os arquivos são cifrados com GnuPG.

Política recomendada (a ser acordada com a Prefeitura): diário com retenção de
30 dias + mensal com retenção durante a vigência; cópia em armazenamento
**externo ao servidor**, em outra conta/credencial, preferencialmente com
bloqueio de exclusão (object lock/WORM). Registre fora do servidor o último
hash exibido por `verificar_auditoria` a cada backup.

## 4. Restauração

1. Crie um banco **vazio** (o script recusa banco com tabelas).
2. `PYTHON=.venv/bin/python DB_NAME=<novo> scripts/restaurar.sh sgi-<data>.dump [sgi-anexos-<data>.tar.gz]`
3. O script confere as somas SHA-256, restaura, verifica migrações e recalcula a
   cadeia de auditoria. Compare o último hash com o registrado externamente.
4. Aplique `sql/02-permissoes-apos-migracao.sql` no banco restaurado e aponte a
   aplicação para ele.

Procedimento testado em ambiente local em 27/10/2026: restauração em banco
novo, 57 triggers recriados, cadeia de auditoria íntegra após a restauração.
**Teste a restauração periodicamente** (sugestão: trimestral) e registre o resultado.

## 5. Limites e controles do acesso administrativo à infraestrutura

O histórico é protegido contra **usuários da aplicação** por:
- triggers que impedem `UPDATE`/`DELETE`/`TRUNCATE` nas tabelas protegidas;
- o papel `sgi_app` não ser dono das tabelas (não consegue desligar triggers);
- cadeia de hash SHA-256 calculada pelo próprio banco.

**Limites honestos:** quem tem acesso de superusuário ao PostgreSQL ou ao
servidor (inclusive a equipe técnica da contratada e o provedor de nuvem) pode
desabilitar triggers e alterar dados. Isso **não é impedido** tecnicamente pela
aplicação. Controles compensatórios:

- cadeia de hash: qualquer alteração em evento já gravado é detectada por
  `verificar_auditoria` (testado em `test_cadeia_de_hash_integra_e_detecta_adulteracao`);
- registro externo periódico do último hash (ex.: e-mail mensal ao Fiscal ou
  anexado ao relatório atestado): permite detectar até a reescrita completa da cadeia;
- backups em local externo, imutáveis, com acesso também pela Prefeitura se acordado;
- acesso à infraestrutura nominal, com MFA, registro de acesso (logs do provedor)
  e mínimo de pessoas;
- relatórios mensais atestados guardam hash do conteúdo; divergência posterior é detectável.

## 6. Atualizações

1. Faça backup. 2. Atualize o código. 3. `pip install -r requirements.txt`.
4. Migrações com `sgi_dono` + `sql/02-...`. 5. `collectstatic`. 6. Reinicie o serviço.
7. Rode `verificar_auditoria`. Mudanças de regra/layout só após aceite da Prefeitura (doc 02, P13).

## 7. Diagnóstico rápido

| Sintoma | Verificar |
|---|---|
| Alertas não chegam por e-mail | Menu Avisos → "Registro de envios": status `INTEGRACAO_PENDENTE` = envio não habilitado/configurado; `FALHA` = ver último erro |
| "Bloqueado: ..." ao salvar | Trava do banco funcionando (registro homologado/cancelado/decidido) |
| Medição "pendente de regra" | Caso não previsto no edital: propor medição fundamentada e aguardar aprovação |
| `verificar_auditoria` falha | Tratar como incidente de segurança: preservar evidências, comparar com backups |
