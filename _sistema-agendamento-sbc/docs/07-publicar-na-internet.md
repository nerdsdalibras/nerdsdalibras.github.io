# Publicar o SGI na internet (Render)

Resultado: um endereço como `https://sgi-nerdsdalibras.onrender.com` (depois,
opcionalmente, `https://sgi.nerdsdalibras.com`), com login e senha:

- **Você** (administrador da plataforma) entra, cria as cidades e libera os acessos.
- **Cada Prefeitura** entra com o próprio login e vê **somente a sua cidade**:
  agendamentos, correções, cancelamentos e histórico auditável.

A preparação foi testada localmente simulando a hospedagem (mesmo comando de
build, mesmo script de início, mesmas variáveis). A criação da conta e a
publicação em si precisam ser feitas por você, porque envolvem cadastro e cartão.

## Passo a passo (cerca de 15 minutos)

1. **Crie a conta** em https://render.com usando "Sign in with GitHub" com o
   GitHub que tem acesso ao repositório `nerdsdalibras/nerdsdalibras.github.io`.
   Cadastre um cartão (os planos usados são pagos; veja "Custos").
2. No painel do Render: **New → Blueprint**.
   - Repositório: `nerdsdalibras/nerdsdalibras.github.io`
   - Branch: `claude/hopeful-sagan-ucav78` (ou `main`, se as mudanças forem mescladas)
   - **Blueprint Path:** `_sistema-agendamento-sbc/render.yaml`
3. O Render vai pedir os valores marcados como secretos:
   | Variável | O que colocar |
   |---|---|
   | `SGI_ADMIN_EMAIL` | o e-mail que **você** usará para entrar (ex.: `nerdsdalibras@gmail.com`) |
   | `SGI_ADMIN_NOME` | seu nome |
   | `SGI_ADMIN_SENHA` | uma senha **temporária** com 12+ caracteres (será trocada no 1º acesso) |
   | `EMAIL_HOST_PASSWORD` | deixe vazio por enquanto (senha de app do Gmail, quando tiver) |
   | `SGI_DOMINIO` | deixe vazio por enquanto |
4. Clique em **Apply**. O Render cria o banco PostgreSQL e o serviço web, instala
   tudo e, ao iniciar, aplica as migrações (inclusive as travas de auditoria) e
   cria o seu usuário administrador. Leva alguns minutos.
5. Abra o endereço mostrado pelo Render (`https://….onrender.com`), entre com o
   e-mail e a senha temporária e **defina sua senha definitiva**.
6. Você cai na tela **Plataforma**. Em **Nova cidade**, cadastre a cidade (ex.:
   São Bernardo do Campo / SP / Pregão Eletrônico nº 246/2026 / prefixo `SBC`).
7. Você é levado à tela **Usuários** daquela cidade: crie o acesso do
   **Fiscal/Gestor da Prefeitura**. A senha temporária aparece **uma única vez**:
   envie login e senha por canais diferentes (ex.: e-mail com o login, telefone
   com a senha). No primeiro acesso a pessoa é obrigada a trocar a senha.
8. Repita para cada cidade (ex.: Franca). Use **Trocar cidade** / **Plataforma**
   no topo para alternar entre elas.

## O que cada um pode fazer

| Quem | Pode | Não pode |
|---|---|---|
| Você (administrador da plataforma) | Criar cidades; entrar em qualquer cidade como contratada; criar acessos da contratada, **solicitantes** e o **primeiro Fiscal/Gestor** de cada cidade | Aprovar parâmetros, medições, indenizações ou relatórios em nome da Prefeitura; trocar/desativar fiscais já existentes |
| Fiscal/Gestor da Prefeitura | Tudo da sua cidade: solicitar, corrigir horário, cancelar, homologar, aprovar parâmetros, atestar relatório, criar outros acessos da Prefeitura | Ver qualquer dado de outra cidade |
| Solicitante da Prefeitura | Criar e acompanhar os próprios pedidos, corrigir e cancelar | Ver pedidos de outros solicitantes ou de outra cidade |

Toda ação fica no **histórico auditável** (quem, quando, justificativa, valores
antes/depois), separado por cidade e protegido contra alteração.

## Domínio próprio (opcional): sgi.nerdsdalibras.com

1. No Render, no serviço `sgi-nerdsdalibras`: **Settings → Custom Domains → Add**
   `sgi.nerdsdalibras.com`.
2. No provedor de DNS de `nerdsdalibras.com`, crie o registro **CNAME** `sgi`
   apontando para o endereço `….onrender.com` indicado pelo Render.
3. No Render, em **Environment**, defina `SGI_DOMINIO=sgi.nerdsdalibras.com` e
   salve (o serviço reinicia). O certificado HTTPS é emitido pelo Render.

O site institucional `nerdsdalibras.com` não é alterado.

## Custos (conferir a tabela vigente no site do Render)

O `render.yaml` usa planos **pagos de entrada** — serviço web "Starter" e banco
"Basic 256 MB" —, da ordem de poucas dezenas de dólares por mês no total.
Planos gratuitos **não** são recomendados: o serviço gratuito "dorme" (atrasa
alertas) e o banco gratuito tem prazo de validade, com risco de perda de dados.

## Limites e cuidados

- **Servidores fora do Brasil:** o Render não tem região no Brasil (o arquivo
  usa `virginia`, EUA). Há transferência internacional de dados pessoais;
  informe a Prefeitura (pendência P19).
- **Banco gerenciado:** a aplicação conecta como dona das tabelas, então a
  separação de papéis descrita no manual (seção 5) não se aplica. As travas
  (triggers) e a cadeia de hash continuam ativas; quem tem acesso ao painel do
  Render pode, em tese, alterar o banco — proteja a conta do Render com
  verificação em duas etapas.
- **Backups:** o plano pago do banco tem backups do próprio Render. A cópia
  cifrada no Google Drive (`scripts/backup.sh` com `BACKUP_DRIVE=sim`) precisa
  rodar em algum agendador (ex.: um "Cron Job" do Render ou um computador da
  equipe com acesso ao banco).
- **E-mail:** os alertas ficam na caixa interna do sistema até você configurar
  a senha de app do Gmail e definir `EMAIL_ENVIO_HABILITADO=true`.
- **Repositório público:** o código está no repositório do site, que é público.
  Não há senhas no código, mas recomenda-se mover o sistema para um repositório
  privado antes de receber dados reais.
- **Dados reais:** só cadastre dados reais depois que a Prefeitura estiver de
  acordo com as pendências do documento 02.
