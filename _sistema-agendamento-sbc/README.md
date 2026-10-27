# SGI-SBC — Sistema de Agendamento de Intérpretes de Libras

Aplicação web para a **Nerds da Libras** registrar, escalar, medir e prestar
contas dos serviços de tradução e interpretação de Libras à **Secretaria de
Educação de São Bernardo do Campo** (Pregão Eletrônico nº 246/2026).

> **Situação:** software funcional e testado em ambiente local com dados
> **fictícios**. Ainda **não** foi implantado em servidor, **não** enviou
> e-mails reais e **não** foi validado pela Prefeitura. Este repositório não
> declara conformidade com o edital: veja `docs/01-matriz-conformidade.md` para
> o que está implementado, testado e pendente.

## Documentação

| Documento | Conteúdo |
|---|---|
| `docs/00-plano-matriz-arquitetura.md` | Plano apresentado antes do desenvolvimento |
| `docs/01-matriz-conformidade.md` | Requisito a requisito: implementado / testado / pendente de integração / pendente de esclarecimento |
| `docs/02-pendencias-esclarecimento.md` | Ambiguidades do edital e decisões provisórias documentadas |
| `docs/03-manual-administracao.md` | Implantação, usuários, backup, restauração, limites do acesso à infraestrutura |
| `docs/04-dependencias-e-custos.md` | Dependências de software e custos recorrentes |
| `docs/05-protecao-de-dados.md` | Medidas de proteção de dados e seus limites |

## Stack

Python 3.12+ · Django 5.2 LTS · PostgreSQL 16 (obrigatório: as travas de
imutabilidade e a cadeia de hash da auditoria são triggers PostgreSQL) ·
ReportLab (PDF) · Gunicorn + WhiteNoise.

## Execução local (desenvolvimento)

```bash
cd _sistema-agendamento-sbc
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt

# Banco local (exemplo; use suas próprias credenciais)
sudo -u postgres psql -c "CREATE ROLE sgi_dev LOGIN PASSWORD 'troque-esta-senha' CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE sgi_dev OWNER sgi_dev;"

# Variáveis de ambiente (NUNCA versione o arquivo com valores reais)
cat > .env.dev <<'EOF'
DJANGO_SECRET_KEY=gere-uma-chave-aleatoria
DJANGO_DEBUG=true
HTTPS_ATIVO=false
DB_NAME=sgi_dev
DB_USER=sgi_dev
DB_PASSWORD=troque-esta-senha
DB_TEST_NAME=test_sgi_dev
EOF
set -a; . ./.env.dev; set +a

.venv/bin/python manage.py migrate
.venv/bin/python manage.py criar_contrato --vigencia-inicio 2026-10-01   # contrato, feriados base, parâmetro v1 PROPOSTO
SENHA_DEMONSTRACAO='uma-senha-longa-local' .venv/bin/python manage.py carregar_demonstracao  # opcional, dados fictícios
.venv/bin/python manage.py runserver
```

Acesse `http://localhost:8000`. Usuários de demonstração (fictícios):
`fiscal@`, `solicitante@`, `operador@`, `admin@exemplo.invalid`, todos com a
senha definida em `SENHA_DEMONSTRACAO`. A carga de demonstração **aprova o
parâmetro v1 em nome de uma fiscal fictícia** — isso fica registrado na
auditoria e não deve ser feito em produção.

## Testes

```bash
set -a; . ./.env.dev; set +a
.venv/bin/python manage.py test operacao
```

Os testes rodam em PostgreSQL real (o usuário do banco precisa de `CREATEDB`)
porque verificam os triggers. Resultado na última execução: **69 testes, todos
passando**.

## Comandos de gestão

| Comando | Uso |
|---|---|
| `criar_contrato` | Cria o contrato SBC, feriados nacionais/estadual 2026–2027 e o parâmetro v1 (R$ 156,6000) **em situação PROPOSTO** |
| `criar_usuario --contrato ... --email ... --nome ... --perfil ... --operador-infra "Nome"` | Primeiro acesso (ex.: administrador técnico e primeiro fiscal). Auditado. |
| `processar_notificacoes` | Envia pendentes e reenvia falhas — agendar a cada 1–5 min |
| `verificar_auditoria` | Recalcula a cadeia de hash da trilha de auditoria |
| `carregar_demonstracao` | Dados fictícios; recusado fora de `DEBUG` salvo `PERMITIR_DEMONSTRACAO=sim` |

## Estrutura

```
config/            configurações (somente variáveis de ambiente para segredos)
contas/            usuário individual (login por e-mail), bloqueio por tentativas
operacao/
  models.py        modelos (todos com contrato_id para isolamento)
  migrations/      estrutura + triggers de imutabilidade e auditoria (0002, 0003)
  servicos/        TODAS as regras de negócio e de permissão
  views.py         camada fina: valida entrada, chama serviços
  templates/       interface em pt-BR, sem JavaScript e sem recursos de terceiros
  tests/           testes das regras críticas
scripts/           backup.sh e restaurar.sh
sql/               separação de papéis no PostgreSQL
```

## Observação sobre este repositório

Este código está numa pasta iniciada por `_` dentro do repositório do site
institucional, para que o GitHub Pages (Jekyll) não a publique, e há regra em
`_redirects` para o Netlify não servi-la. **Recomenda-se mover o sistema para
um repositório privado próprio** antes da implantação.
