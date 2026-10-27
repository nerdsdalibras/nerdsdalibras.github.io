# Plano — Sistema de Agendamento de Intérpretes de Libras (SGI-SBC)

Contratante: Secretaria de Educação de São Bernardo do Campo (PMSBC)
Contratada: Nerds da Libras
Referência: Pregão Eletrônico nº 246/2026

> Este documento foi escrito **antes** da implementação, como plano. O estado
> final de cada item (implementado / testado / pendente) está em
> `docs/01-matriz-conformidade.md`, que é a fonte atualizada. Nenhum item
> aqui deve ser lido como declaração de conformidade com o edital.

## 1. Matriz preliminar de requisitos → solução proposta

| # | Requisito (resumo) | Solução proposta | Onde a regra é aplicada |
|---|---|---|---|
| 1.1 | Registrar solicitações (Prefeitura e contratada) | Formulário de solicitação para perfis Solicitante, Fiscal e Operador | Serviço `criar_agendamento` (servidor) |
| 1.2 | Data/hora, local, modalidade, duração, qtd. profissionais | Campos obrigatórios no modelo `Agendamento` | Validação no serviço + constraints no banco |
| 1.3 | Data/hora de criação | `criado_em` definido pelo servidor, imutável | Default do banco/servidor |
| 1.4 | Confirmação de atendimento | Ação "Confirmar" (Operador) exige escala completa | Serviço `confirmar_agendamento` |
| 1.5 | Intérpretes escalados com nome, telefone e e-mail | Cadastro `Interprete` por contrato + `Escala` | Contatos só para usuários vinculados ao contrato |
| 1.6 | Alterações de horário | Ação com justificativa obrigatória; valores antes/depois | Serviço + auditoria |
| 1.7 | Cancelamento com justificativa | Status `CANCELADO`, sem exclusão | Serviço + trigger que bloqueia DELETE |
| 1.8 | Eventos simultâneos | Sem restrição por horário; bloqueio apenas de intérprete em dois eventos sobrepostos | Serviço `escalar_interprete` |
| 2.1 | Registro original + histórico | Tabela `EventoAuditoria` append-only com snapshot original e antes/depois | Triggers PostgreSQL (UPDATE/DELETE/TRUNCATE bloqueados) |
| 2.2 | Usuário, data, hora, justificativa | Campos obrigatórios no evento | Serviço de auditoria |
| 2.3 | Travas contra exclusão/adulteração de homologados | Triggers bloqueiam DELETE sempre e UPDATE após homologação | Banco de dados |
| 2.4 | Retenção | Sem rotina de eliminação; política versionada e aprovada pela Prefeitura; prazo **não definido** pelo sistema | Modelo `PoliticaRetencao` |
| 2.5 | Evidência de adulteração | Cadeia de hash SHA-256 nos eventos + comando de verificação | Trigger + comando `verificar_auditoria` |
| 3.1 | Permissões e identificação individual | Usuário individual, perfis por vínculo com contrato | Decorators + filtros por contrato em todas as consultas |
| 3.2 | Conferência e homologação pelas duas partes | Homologação por parte, com hash do estado conferido | Serviço `homologar` |
| 3.3 | Contratada não altera configurações unilateralmente | Parâmetros, calendário e retenção só entram em vigor com aprovação de Fiscal PMSBC | Serviços + checagem de perfil |
| 3.4 | Parâmetros de medição versionados | `ParametroMedicao` com versão; medição guarda a versão usada | Triggers impedem alterar versão aprovada |
| 4.1 | Alertas imediatos (confirmação, alteração de horário, cancelamento de escala) | Outbox `Notificacao` + envio após commit + caixa de notificações interna | Serviço de notificações |
| 4.2 | Envio real, credenciais seguras | SMTP configurado por variáveis de ambiente; sem configuração → "integração pendente" | Backend de envio |
| 4.3 | Envio, falha, reenvio, sem duplicidade | Chave de idempotência única, `TentativaEnvio`, bloqueio de linha | Banco + comando `processar_notificacoes` |
| 5.1 | Hora de evento, independente de nº de intérpretes | Cálculo usa só duração; testes cobrem 2 intérpretes | Serviço `calcular_medicao` |
| 5.2 | > 1 h exige ≥ 2 intérpretes | Validação na criação, na confirmação e sinalização na medição | Serviços |
| 5.3 | Previsto x realizado | Campos de início/fim realizados | Modelo |
| 5.4 | Tabela de excedentes (1–10, 11–30, 31–40, 41–60) | Faixas parametrizadas; padrão = tabela do edital | Serviço de medição |
| 5.5 | Casos não definidos → pendência | Situação `PENDENTE_REGRA`; medição fundamentada exige aprovação | Serviço + nova versão (sem sobrescrever) |
| 5.6 | Dinheiro em decimal; 4 casas no unitário | `Decimal`/`NUMERIC(14,4)`; total arredondado a 2 casas (ROUND_HALF_UP), documentado | Serviço + banco |
| 5.7 | Preço configurável (R$ 156,60 inicial) | Parâmetro versionado proposto como v1, sujeito a aprovação | Seed + fluxo de aprovação |
| 6.1 | Antecedência (remoto 1 dia útil, presencial 3) | Cálculo com calendário configurável e fuso America/Sao_Paulo | Serviço `calendario` |
| 6.2 | Sinalizar fora do prazo | Flag preservada no registro; não impede o pedido | Serviço |
| 6.3 | Cancelamento > / < "24 h ou 1 dia útil" | Calcula os dois critérios; divergência ou exatamente 24 h = `AMBIGUO` (pendência) | Serviço |
| 6.4 | Indenização só com análise/comprovação/aprovação | `PedidoIndenizacao` separado da medição; pré-condições verificadas | Serviço + aprovação do Fiscal |
| 6.5 | Remoto 50%; presencial 100% limitado a 2 h | Cálculo de referência exibido ao Fiscal | Serviço |
| 7.x | Proteção de dados | Mínimo de dados, contatos só autenticados, isolamento por contrato, sem rastreadores de terceiros | Middleware + filtros + testes |
| 8.x | Fila de chamados com 1ª resposta e SLA de 30 min | `Chamado` com abertura, responsável, 1ª resposta, conclusão; destaque ≥ 20 min | Serviço + painel com atualização automática |
| 9.x | Relatório mensal, prazo 2º dia útil, atesto antes da NF | `RelatorioMensal` com snapshot congelado + hash; NF só após atesto | Serviço + trigger |

## 2. Arquitetura proposta

- **Aplicação web server-side** em Python 3.12+/Django 5.2 LTS, templates
  renderizados no servidor (funciona sem JavaScript; acessível).
- **Banco**: PostgreSQL 16 (constraints, `NUMERIC`, triggers de imutabilidade,
  `sha256()` nativo para cadeia de hash).
- **Camadas**:
  - `contas`: usuário individual (login por e-mail), bloqueio por tentativas.
  - `operacao`: contratos, vínculos/perfis, agendamentos, escalas, medição,
    cancelamento/indenização, homologação, auditoria, notificações, chamados,
    relatórios, calendário, parâmetros.
  - `operacao/servicos/`: **todas** as regras de negócio. Views apenas chamam
    serviços; nenhuma regra fica só na interface.
- **Isolamento**: todo registro tem `contrato_id`; o contrato ativo vem do
  vínculo do usuário (sessão) e é aplicado em todas as consultas.
- **Notificações**: padrão *outbox* — a notificação é gravada na mesma
  transação da operação e enviada após o commit; um comando agendado faz
  reenvios com backoff.
- **Exportações**: CSV (módulo padrão) e PDF (ReportLab).
- **Implantação**: Gunicorn + WhiteNoise atrás de proxy HTTPS; `docker-compose`
  de referência; backups com `pg_dump`.

## 3. Etapas de construção

1. Estrutura do projeto, configuração por variáveis de ambiente, banco.
2. Modelos, migrações e triggers de imutabilidade/auditoria.
3. Serviços de regra: calendário/antecedência, agendamento, escala,
   cancelamento, medição, indenização, homologação, parâmetros.
4. Notificações (outbox, SMTP, reenvio, idempotência).
5. Chamados e painel de SLA.
6. Relatório mensal, atesto e registro de NF; exportações CSV/PDF.
7. Interface (templates acessíveis e responsivos) e permissões.
8. Testes automatizados das regras críticas (com PostgreSQL real).
9. Documentação: execução, administração, backup/restauração, dependências e
   custos, matriz de conformidade, pendências de esclarecimento.

## 4. Informações que não impedem o desenvolvimento, mas precisam de definição

Registradas em `docs/02-pendencias-esclarecimento.md` (ex.: critério de
cancelamento "24 h ou 1 dia útil", método de contagem de dias úteis, feriados
municipais, regra para excedentes > 60 min, prazo legal de retenção, preço
homologado na licitação, hospedagem e provedor de e-mail).
