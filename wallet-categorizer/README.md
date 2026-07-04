# Wallet Categorizer (protótipo)

App Android que lê as notificações da sua carteira digital e dos apps bancários,
envia o texto para a API da Anthropic (Claude) para extrair valor/estabelecimento
e categorizar automaticamente o gasto, e permite fazer perguntas em linguagem
natural sobre seus gastos.

Este é um protótipo funcional, não um app publicável. Sem polimento de produção,
sem testes automatizados, sem tratamento de todos os edge cases.

## Como rodar

1. Abra a pasta `wallet-categorizer/` no Android Studio (Iguana ou mais recente).
2. Deixe o Gradle sincronizar as dependências.
3. Conecte um celular Android (ou use um emulador) e rode o app (`Run ▶`).
4. No app, vá em **Ajustes**:
   - Toque em "Abrir ajustes de notificação" e conceda acesso a notificações ao
     Wallet Categorizer (Configurações do Android → Apps → Acesso especial →
     Acesso a notificações).
   - Cole sua chave de API da Anthropic (`sk-ant-...`), obtida em
     https://console.anthropic.com.
   - Ajuste a lista de apps monitorados se necessário (um nome de pacote por
     linha). Já vem pré-configurado com Google Wallet e os principais bancos/
     carteiras brasileiras (Nubank, Itaú, Bradesco, Banco do Brasil, Inter,
     PicPay, C6, Santander, PortoBank etc.) — ajuste os nomes de pacote conforme
     necessário, pois variam por versão do app.
5. Crie/edite suas categorias de gasto na aba **Categorias**.
6. Faça uma compra com a carteira digital — a notificação some do topo, mas o
   app captura o texto, chama a API e a transação aparece na aba **Gastos**
   já categorizada.
7. Use a aba **Assistente** para perguntar coisas como "quanto gastei em
   alimentação esse mês?".

## Como funciona

- `notification/WalletNotificationListener.kt`: um `NotificationListenerService`
  do Android, que recebe todas as notificações do sistema. Filtra apenas os
  pacotes na sua lista de apps monitorados e faz um filtro local rápido
  (presença de "R$") antes de gastar uma chamada de API.
- `ai/Categorizer.kt`: monta uma chamada à Anthropic Messages API
  (`POST /v1/messages`) com **saída estruturada** (`output_config.format` com
  um JSON Schema) pedindo para o modelo extrair valor, estabelecimento e
  escolher uma das suas categorias, em uma única chamada.
- `ai/ChatAssistant.kt`: monta um resumo compacto das transações categorizadas
  e envia junto com a pergunta do usuário como contexto (sem structured
  output — resposta em texto livre).
- `ai/ClaudeClient.kt`: cliente HTTP cru via OkHttp (sem SDK oficial, que não
  tem build para Android) — headers `x-api-key`, `anthropic-version`,
  `content-type: application/json`.
- Tudo fica salvo localmente em um banco Room (SQLite). A chave de API fica em
  `EncryptedSharedPreferences`.

## Privacidade

- O texto das notificações (que pode conter valor, nome do estabelecimento e
  parte do texto do banco) é enviado para a API da Anthropic para
  categorização. Nada é enviado para nenhum outro servidor além da Anthropic.
- Nenhuma credencial bancária é lida — apenas o texto visível da notificação.
- A chave de API fica armazenada localmente e criptografada no dispositivo.

## Limitações conhecidas

- Parsing de notificação depende do texto exato que cada banco manda — se um
  banco mudar o formato da notificação, a extração de valor/estabelecimento
  pode falhar (o texto bruto continua salvo mesmo assim).
- Só funciona no Android. No iOS não é possível ler notificações de outros
  apps — a alternativa lá seria integrar via Open Finance/Open Banking Brasil.
- Sem sincronização em nuvem — os dados ficam só no aparelho.
- O modelo padrão é `claude-opus-4-8`; para reduzir custo por transação, troque
  para `claude-haiku-4-5` na tela de Ajustes.
