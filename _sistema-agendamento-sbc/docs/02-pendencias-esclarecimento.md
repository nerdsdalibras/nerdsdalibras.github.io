# Pendências de esclarecimento e decisões provisórias

O sistema **não resolve sozinho** ambiguidades do edital. Onde foi preciso
algum comportamento para funcionar, ele está descrito abaixo como **provisório**,
pode ser alterado e deve ser confirmado por escrito pela Prefeitura.

| # | Tema | O que o edital (conforme requisitos recebidos) diz | Comportamento atual do sistema | O que precisa ser definido |
|---|---|---|---|---|
| P1 | Cancelamento "24 horas ou um dia útil" | Diferencia cancelamento com antecedência superior/inferior a "24 horas ou um dia útil" | Calcula **os dois critérios**. Se ambos indicam superior → "antecedência superior"; se ambos inferior → "tardio"; se divergem **ou se a antecedência é exatamente 24 h** → "pendente de esclarecimento". Nenhuma classificação gera valor automaticamente | Qual critério prevalece; como tratar exatamente 24 h |
| P2 | Contagem de dias úteis | Remoto 1 dia útil; presencial 3 dias úteis | Conta os dias úteis no intervalo (data do pedido, data do evento] — exclui o dia do pedido, inclui o do evento; ignora a hora do pedido. Ex.: pedido na segunda para terça = 1 dia útil | Se o dia do evento conta; se pedidos após certo horário contam como do dia seguinte |
| P3 | Feriados municipais e pontos facultativos | Calendário configurável | Carregados só feriados nacionais e o estadual de SP (9/7) de 2026–2027. **Feriados municipais de São Bernardo do Campo, pontos facultativos e recessos escolares não foram carregados** | Fiscal deve cadastrar conforme decreto municipal |
| P4 | Excedente acima de 60 minutos | Tabela vai até 60 min | Pendência de regra; exige medição fundamentada aprovada | Regra para excedentes > 60 min |
| P5 | Atendimento mais curto que o agendado | Não definido | Pendência de regra | Se fatura o agendado, o realizado ou outra regra |
| P6 | Duração agendada fracionada (não múltipla de 60 min) | Não definido | Pendência de regra (ex.: 30, 90, 150 min) | Se fatura proporcionalmente ou arredonda |
| P7 | Arredondamento monetário | Usar decimais precisos | Total = preço (4 casas) × minutos / 60, gravado com 8 casas; valor final arredondado a centavos com ROUND_HALF_UP | Confirmar regra |
| P8 | Limite de 2 h na indenização | Requisito recebido: "Presencial: 100% do tempo estimado, limitado a duas horas" | Limite aplicado **apenas** ao presencial; remoto = 50% sem limite | Confirmar se o limite vale para remoto |
| P9 | Excedente medido sobre quê | "Excedentes ao tempo agendado" | Excedente = duração realizada − duração agendada, em minutos inteiros (segundos desprezados) | Se atraso de início causado pela unidade conta |
| P10 | Prazo de primeira resposta (30 min) | Prazo de resposta | Conta em minutos corridos desde a abertura | Se conta só dentro do expediente da Secretaria; horário do expediente |
| P11 | Prazo legal de retenção | Manter durante vigência e arquivamento legal | Nenhum prazo pré-definido; nenhuma eliminação automática; política versionada aprovada pela Prefeitura | Prazo e fundamento normativo |
| P12 | Preço unitário | R$ 156,60 é valor inicial da proposta | Parâmetro v1 criado como **PROPOSTO**; só vale após aprovação do Fiscal | Preço homologado na licitação e data de vigência |
| P13 | Mudanças de layout/código | Contratada não altera layout sujeito à autorização | Parâmetros e calendário dependem de aprovação no sistema; o **layout é código** e o relatório grava `layout_versao` | Processo formal: mudança de código só implantada após aceite da Prefeitura (ex.: ata/ordem de serviço) |
| P14 | Destinatários dos alertas | Fiscais e gestores da Prefeitura | Todos os usuários com perfil Fiscal/Gestor ativos no contrato | Lista nominal e e-mails institucionais |
| P15 | Quem pode homologar pela contratada | Homologação pelas duas partes | Perfil Operador da contratada | Se exige preposto específico |
| P17 | Uso de conta Google pessoal (gratuita) da contratada | — | E-mails saem de `nerdsdalibras@gmail.com`; backups vão **cifrados** ao Drive dessa conta (o Google não consegue lê-los). Os e-mails de alerta, porém, trafegam em claro pelo Gmail (sem contatos de intérpretes) | Prefeitura deve estar ciente/de acordo com o uso de Gmail/Drive pessoal no tratamento; recomendável migrar para Google Workspace (conta institucional com termo de tratamento de dados) ou e-mail transacional com contrato |
| P18 | Filtros antispam da Prefeitura | — | Mensagens de remetente `@gmail.com` a domínios públicos podem ir para spam | Pedir à TI da Prefeitura que libere o remetente, ou usar domínio próprio com SPF/DKIM |
| P19 | Hospedagem fora do Brasil | — | O guia de publicação usa o Render, que não tem região no Brasil (servidor nos EUA) | Informar a Prefeitura sobre a transferência internacional de dados (LGPD) ou escolher provedor com região no Brasil |
| P16 | Pedidos para eventos já iniciados/passados | Não tratado | Bloqueado: o início deve ser futuro | Se registros retroativos devem ser aceitos (ex.: urgências) |

Toda decisão futura sobre esses pontos deve ser registrada (ata, ofício ou
e-mail institucional) e refletida no sistema por nova versão de parâmetro ou
por mudança de código aprovada.
