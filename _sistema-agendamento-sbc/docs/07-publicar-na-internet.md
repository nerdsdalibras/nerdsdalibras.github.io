# Publicar o SGI em https://sgi.nerdsdalibras.com (Netlify)

## Como fica

```
Usuário (Prefeitura / Nerds)
        │  https://sgi.nerdsdalibras.com   ← endereço que todos usam
        ▼
   Netlify (site "sgi", separado do site institucional)
        │  repassa cada acesso (proxy), sem mudar o endereço no navegador
        ▼
   Render: aplicação Python + banco PostgreSQL (o "motor" do sistema)
```

**Por que dois serviços:** a Netlify publica páginas e arquivos prontos, mas
**não executa Python nem mantém um banco de dados** — e o sistema (login,
agendamentos, histórico auditável) precisa das duas coisas funcionando 24 horas.
Por isso a Netlify fica na frente, no domínio da Nerds, e repassa tudo ao
servidor da aplicação no Render. Para o usuário, o endereço é sempre
`sgi.nerdsdalibras.com`.

**Por que subdomínio (`sgi.`) e não `nerdsdalibras.com/sistema`:** as páginas do
site institucional carregam scripts de terceiros (ex.: Meta Pixel). No mesmo
endereço, esses scripts poderiam ler dados das Prefeituras de quem estivesse
logado. O subdomínio isola completamente o sistema do site de marketing.
O site `nerdsdalibras.com` **não é alterado**.

O que foi testado localmente (simulação, dados fictícios): servidor em modo
produção atrás de um proxy que imita a Netlify, nos dois comportamentos possíveis
de cabeçalho `Host`; login, troca de cidade, filtros, cadastro, exportação e
saída funcionaram; cookies ficam presos ao domínio público, com `Secure` e
`HttpOnly`; nenhum redirecionamento expõe o endereço interno; sem `SGI_DOMINIO`
o login é bloqueado (CSRF). **A publicação real não foi testada** — exige suas
contas na Netlify e no Render.

## Parte 1 — Motor do sistema no Render (uma vez)

1. Crie a conta em https://render.com ("Sign in with GitHub") e cadastre um cartão.
2. **New → Blueprint** → repositório `nerdsdalibras/nerdsdalibras.github.io`,
   branch `claude/hopeful-sagan-ucav78` (ou `main`, após mesclar),
   **Blueprint Path:** `_sistema-agendamento-sbc/render.yaml`.
3. Preencha os valores pedidos:
   | Variável | Valor |
   |---|---|
   | `SGI_ADMIN_EMAIL` | o e-mail com que **você** vai entrar (ex.: `nerdsdalibras@gmail.com`) |
   | `SGI_ADMIN_NOME` | seu nome |
   | `SGI_ADMIN_SENHA` | senha **temporária**, 12+ caracteres (trocada no 1º acesso) |
   | `EMAIL_HOST_PASSWORD` | vazio por enquanto (senha de app do Gmail, depois) |
   (`SGI_DOMINIO` já vem como `sgi.nerdsdalibras.com`.)
4. **Apply** e aguarde. Anote o endereço do serviço, algo como
   `https://sgi-nerdsdalibras.onrender.com` — ele será usado na Netlify.

### Alternativa manual (se o campo "Blueprint Path" não aparecer)

1. **New → Postgres:** nome `sgi-banco`, Database `sgi`, User `sgi`, região
   **Virginia (US East)**, plano **Basic-256mb**. Depois de criado, copie a
   **Internal Database URL**.
2. **New → Web Service** → repositório `nerdsdalibras/nerdsdalibras.github.io`,
   branch `claude/hopeful-sagan-ucav78`, mesma região, plano **Starter**:
   - **Root Directory:** `_sistema-agendamento-sbc`
   - **Runtime/Language:** Python 3
   - **Build Command:** `pip install -r requirements.txt && python manage.py collectstatic --noinput`
   - **Start Command:** `bash scripts/iniciar_servico.sh`
3. Em **Environment**, crie as variáveis:
   | Variável | Valor |
   |---|---|
   | `DATABASE_URL` | a Internal Database URL copiada no passo 1 |
   | `DJANGO_SECRET_KEY` | use o botão **Generate** do Render |
   | `DJANGO_DEBUG` | `false` |
   | `HTTPS_ATIVO` | `true` |
   | `ATRAS_DE_PROXY` | `true` |
   | `SGI_DOMINIO` | `sgi.nerdsdalibras.com` |
   | `PYTHON_VERSION` | `3.12.8` |
   | `EMAIL_ENVIO_HABILITADO` | `false` |
   | `SGI_ADMIN_EMAIL`, `SGI_ADMIN_NOME`, `SGI_ADMIN_SENHA` | como na tabela acima |
4. **Create Web Service** e anote o endereço `https://….onrender.com`.

## Parte 2 — Site na Netlify com o domínio sgi.nerdsdalibras.com

1. Na Netlify (mesma conta do site institucional): **Add new site → Import an
   existing project → GitHub** → `nerdsdalibras/nerdsdalibras.github.io`.
2. Configuração do site:
   - **Branch to deploy:** `claude/hopeful-sagan-ucav78` (ou `main`, após mesclar)
   - **Base directory:** `_sistema-agendamento-sbc/netlify`
   - Build command e publish directory vêm do `netlify.toml` (deixe como sugerido).
3. **Environment variables** do site: `SGI_BACKEND_URL` = o endereço anotado na
   Parte 1 (ex.: `https://sgi-nerdsdalibras.onrender.com`). Faça o deploy.
   O build falha de propósito se essa variável faltar ou não for `https://`.
4. **Domain management → Add a domain →** `sgi.nerdsdalibras.com`.
   - Se o DNS de `nerdsdalibras.com` já está na Netlify, ela cria o registro sozinha.
   - Se o DNS está em outro provedor (ex.: Registro.br), crie lá um **CNAME**
     `sgi` → `<nome-do-site>.netlify.app`.
   - A Netlify emite o certificado HTTPS automaticamente (pode levar alguns minutos).
5. Acesse **https://sgi.nerdsdalibras.com**, entre com o e-mail e a senha temporária
   e defina a sua senha definitiva.

## Parte 3 — Liberar as cidades

1. Na tela **Plataforma**, em **Nova cidade**, cadastre a cidade (ex.: São
   Bernardo do Campo / SP / Pregão Eletrônico nº 246/2026 / prefixo `SBC`).
2. Você vai direto para **Usuários** dessa cidade: crie o acesso do
   **Fiscal/Gestor da Prefeitura**. A senha temporária aparece **uma única vez**;
   envie login e senha por canais diferentes. No 1º acesso a pessoa troca a senha.
3. Repita para cada cidade (ex.: Franca). Use **Trocar cidade** e **Plataforma**
   no topo para alternar.

## O que cada um pode fazer

| Quem | Pode | Não pode |
|---|---|---|
| Você (administrador da plataforma) | Criar cidades; entrar em qualquer cidade como contratada; criar acessos da contratada, **solicitantes** e o **primeiro Fiscal/Gestor** de cada cidade | Aprovar parâmetros, medições, indenizações ou relatórios em nome da Prefeitura; trocar/desativar fiscais já existentes |
| Fiscal/Gestor da Prefeitura | Tudo da sua cidade: solicitar, corrigir horário, cancelar, homologar, aprovar parâmetros, atestar relatório, liberar outros acessos da Prefeitura | Ver qualquer dado de outra cidade |
| Solicitante da Prefeitura | Criar e acompanhar os próprios pedidos, corrigir e cancelar | Ver pedidos de outros solicitantes ou de outra cidade |

Toda ação fica no **histórico auditável** (quem, quando, justificativa, valores
antes/depois), separado por cidade e protegido contra alteração.

## Custos (conferir as tabelas vigentes)

- **Netlify:** o site `sgi` só repassa acessos; tende a caber no plano que você
  já usa, mas o tráfego conta para os limites da conta.
- **Render:** planos pagos de entrada (serviço web "Starter" + banco
  "Basic 256 MB"), da ordem de poucas dezenas de dólares por mês. Planos
  gratuitos não são recomendados: o serviço "dorme" (o primeiro acesso demora e
  pode estourar o tempo do proxy da Netlify) e o banco gratuito expira.

## Limites e cuidados

- **Limites do proxy da Netlify:** requisições repassadas têm tempo máximo e
  tamanho de envio limitados pela Netlify. As telas do sistema são rápidas, mas
  **teste, após publicar, o envio de um anexo de alguns MB** na indenização; se
  falhar, reduza `ANEXO_TAMANHO_MAXIMO_MB` no Render.
- **IP nos registros:** atrás de dois proxies, o IP gravado na auditoria é o do
  proxy, não o do usuário. Usuário, data/hora e ação continuam corretos.
- **Servidor nos EUA:** o Render não tem região no Brasil (o arquivo usa
  `virginia`). Há transferência internacional de dados pessoais; informe a
  Prefeitura (pendência P19).
- **Banco gerenciado:** a aplicação conecta como dona das tabelas; as travas e a
  cadeia de hash continuam ativas, mas quem acessa o painel do Render pode, em
  tese, alterar o banco. Ative verificação em duas etapas no Render, na Netlify
  e no GitHub.
- **Backups:** o banco pago do Render tem backups próprios. A cópia cifrada no
  Google Drive (`scripts/backup.sh` com `BACKUP_DRIVE=sim`) precisa de um
  agendador (ex.: "Cron Job" do Render).
- **E-mail:** alertas ficam na caixa interna até configurar a senha de app do
  Gmail e `EMAIL_ENVIO_HABILITADO=true` no Render.
- **Repositório público:** não há senhas no código, mas recomenda-se mover o
  sistema para um repositório privado antes de receber dados reais.
- **Dados reais:** só depois que a Prefeitura estiver de acordo com as
  pendências do documento 02.
