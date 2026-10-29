# Verificação dos requisitos do edital — jornada completa (29/10/2026)

Verificação feita do jeito que o sistema é usado em produção, depois da
plataforma multi-cidades: o administrador da plataforma é criado pelas variáveis
de implantação, troca a senha no 1º acesso, cria a cidade na tela **Plataforma**
(como **Operador da contratada**), libera o **Fiscal/Gestor**, que libera o
**Solicitante**. Tudo pelas telas (requisições HTTP iguais às do navegador), com
dados fictícios e relógio simulado em America/Sao_Paulo.

**Evidências:**
- `operacao/tests/test_jornada_edital.py` — 10 testes, um por grupo do edital
  (`test_1_...` a `test_9_...` e `test_decisoes_...`);
- suíte completa: **139 testes passando** em PostgreSQL 16;
- navegador real (Chromium): 54 telas, 4 perfis, em celular (375 px) e
  computador (1280 px), sem rolagem lateral, todo campo com rótulo,
  identificadores únicos, idioma pt-BR.

"Testado" não equivale a homologação pela Prefeitura nem a declaração de
conformidade com o edital.

Legenda: **OK** = funciona e foi testado · **Parcial** = funciona, mas depende de
integração externa ou de algo fora do código · **Esclarecer** = funciona com regra
provisória; a definição é da Prefeitura (`02-pendencias-esclarecimento.md`).

## Defeitos encontrados nesta verificação (corrigidos)

| # | Defeito | Efeito para o usuário | Correção |
|---|---|---|---|
| V1 | O histórico gravava datas em fusos diferentes: o valor "antes" de uma alteração em UTC (`12:00+00:00`) e o "depois" em horário de Brasília (`13:00-03:00`) | Quem lesse o histórico entenderia que o evento passou de 12:00 para 13:00, quando passou de 09:00 para 13:00 | Datas sempre gravadas em horário de Brasília (`auditoria._valor_json`). Registros antigos não são alterados (são imutáveis); o instante continua correto neles |
| V2 | Tela de detalhe do agendamento: vários formulários com campos de mesmo identificador | O campo "justificativa" do cancelamento ficava sem rótulo para leitores de tela | Identificadores próprios por formulário e por escala (`views.detalhe_agendamento`) |

## 1. Agendamentos

| Requisito | Situação | Evidência |
|---|---|---|
| Prefeitura e contratada registram solicitações | OK | `test_1`: Solicitante e Operador criam pedidos; parte criadora registrada |
| Data e horário, local, modalidade, duração, quantidade de profissionais | OK | `test_1` |
| Data e hora da criação | OK | `test_1` (gravada pelo servidor); `test_2` (imutável no banco) |
| Confirmação de atendimento | OK | `test_1`: só com a escala completa; data e responsável gravados |
| Intérpretes com nome completo, telefone e e-mail | OK | `test_1` (visíveis a quem participa); `test_7` (não públicos) |
| Alterações de horário | OK | `test_1`, `test_2` |
| Cancelamentos com justificativa | OK | `test_1`: sem justificativa é recusado; registro preservado |
| Eventos simultâneos em locais/plataformas diferentes | OK | `test_1`: três eventos no mesmo horário; o mesmo intérprete não fica em dois ao mesmo tempo |

## 2. Histórico auditável

| Requisito | Situação | Evidência |
|---|---|---|
| Registro original preservado e histórico de todas as alterações | OK | `test_2` |
| Usuário, data, hora, justificativa, valores anteriores e posteriores | OK | `test_2` (defeito V1 corrigido); exportação CSV e PDF |
| Cancelar não apaga | OK | `test_2`: exclusão recusada na aplicação e no banco |
| Travas contra exclusão definitiva e adulteração de realizados/homologados | OK | `test_2`, `test_3`: triggers do banco recusam `UPDATE`/`DELETE`. Limite: quem administra a infraestrutura pode desligar triggers; a cadeia de hash denuncia (doc 03) |
| Retenção sem prazo inventado, configurável mediante autorização | OK / **Esclarecer** | `test_2`: nada é eliminado; política só vale com aprovação do Fiscal e não muda depois. O prazo legal deve ser informado pela Prefeitura |

## 3. Permissões e homologação

| Requisito | Situação | Evidência |
|---|---|---|
| Controle de permissões e identificação individual | OK | Preparação (login, troca obrigatória de senha) e `test_3` (cada ação grava o usuário) |
| Conferência e homologação pelas duas partes, com evidências | OK | `test_3`: contratada + Prefeitura homologam o mesmo estado (hash guardado); depois disso, travado |
| Contratada não altera sozinha configurações e fórmulas | OK | `test_3`: não aprova parâmetro, não cadastra feriado, não cria nem desativa Fiscal |
| Layout sujeito à autorização da Prefeitura | Parcial / **Esclarecer** | O layout é código; o relatório grava a versão do layout (1.1). Falta acordar o processo de aprovação de mudanças |
| Parâmetros de medição com aprovação, histórico e versão, sem mudar medições anteriores | OK | `test_3`: proposta não vale até aprovação; medição antiga mantém a versão 1 |

## 4. Alertas automáticos

| Requisito | Situação | Evidência |
|---|---|---|
| Aviso imediato aos fiscais/gestores: confirmação, alteração de horário, cancelamento de escala | OK | `test_4`: aviso na caixa interna do sistema na mesma operação |
| Envio real por e-mail | **Parcial (integração pendente)** | Conta definida (`nerdsdalibras@gmail.com`). Faltam a senha de app do Gmail e a autorização de envio real. Testado com servidor de teste; **nenhum e-mail real enviado** |
| Sem credencial, marcar como pendente sem simular sucesso | OK | `test_4`: situação "Integração pendente" |
| Registro de envio, falha e reenvio, sem duplicidade | OK | `test_4`: falha registrada, nova tentativa envia uma única vez; reenvio de mensagem já enviada é bloqueado |

## 5. Medição das horas

| Requisito | Situação | Evidência |
|---|---|---|
| Hora de evento, independente do número de intérpretes | OK | `test_5`: 2 intérpretes, 2,5 h faturadas (não 5 h) |
| Acima de 1 hora exige dois intérpretes | OK | `test_1` (pedido recusado); `test_5` (alerta quando o realizado passa de 1 h com um intérprete) |
| Horários previstos e realizados | OK | `test_5` |
| Tabela 1–10 / 11–30 / 31–40 / 41–60 min | OK | `test_5`: todos os limites (0, 1, 10, 11, 30, 31, 40, 41, 60) |
| Casos não definidos viram pendência; medição fundamentada aprovada, sem alterar o histórico | OK / **Esclarecer** | `test_5`: acima de 60 min, mais curto e duração fracionada; versões preservadas. Regras desses casos: Prefeitura |
| Decimal, 4 casas no preço, arredondamento documentado | OK / **Esclarecer** | `test_5`: R$ 156,6049 × 2,5 h = 391,51225 → 391,51; metade para cima. Confirmar a regra com a Prefeitura |
| Preço configurável; R$ 156,60 só como valor inicial | OK / **Esclarecer** | `test_5`: cidade nova nasce com R$ 156,60 "proposto" e nada é medido antes da aprovação. Preço final: resultado da licitação |

## 6. Antecedência e cancelamentos

| Requisito | Situação | Evidência |
|---|---|---|
| Remoto: 1 dia útil; presencial: 3 dias úteis | OK / **Esclarecer** | `test_6` (método de contagem documentado no doc 02) |
| Calendário de dias úteis e feriados configurável; fuso America/Sao_Paulo | OK / **Esclarecer** | `test_6`: feriado municipal cadastrado pelo Fiscal entra na contagem. Os feriados municipais de cada cidade precisam ser cadastrados pelo Fiscal |
| Sinalizar pedidos fora do prazo, preservando o registro | OK | `test_6`: marcado na tela e no filtro "pendência/fora do prazo" |
| "24 horas ou um dia útil" sem resolver sozinho | OK / **Esclarecer** | `test_6`: exatamente 24 h e critérios divergentes ficam "Ambíguo" para a Prefeitura decidir |
| Indenização: só com confirmação prévia, comprovação e aprovação; nunca automática; não cabe por fato da contratada | OK | `test_6` |
| Remoto 50%; presencial 100% limitado a 2 h | OK / **Esclarecer** | `test_6`: presencial 180 min → 2 h = R$ 313,20; remoto 120 min → 1 h = R$ 156,60. Confirmar se o limite de 2 h vale também para remoto |
| Indenização separada das horas prestadas | OK | `test_9`: totais separados no relatório |

## 7. Proteção de dados

| Requisito | Situação | Evidência |
|---|---|---|
| Dados restritos ao necessário | Parcial | Revisão do modelo de dados (doc 05). Validação pelo encarregado de dados das partes |
| Proteção contra acesso não autorizado e vazamentos | OK | `test_7`: login obrigatório, cabeçalhos de segurança, sessão protegida. Produção: HTTPS com certificado válido e HSTS (verificado em 29/10/2026) |
| Contatos dos intérpretes não públicos | OK | `test_7`; `test_4` (não vão no e-mail) |
| Isolamento entre clientes e contratos; nada da CMAA | OK | `test_7`: Franca não vê São Bernardo; um solicitante não vê o de outro; nenhum dado ou código da CMAA |
| Não afirmar conformidade plena com a LGPD | OK | Nenhum documento afirma (doc 05) |

## 8. Operação e suporte

| Requisito | Situação | Evidência |
|---|---|---|
| Fila de intercorrências, substituições e validações: abertura, responsável, primeira resposta, conclusão | OK | `test_8` |
| Monitoramento e destaque de chamados sem resposta perto de 30 min | OK / **Esclarecer** | `test_8`: destaque a partir de 20 min e "excedido" aos 30; a tela se atualiza a cada 60 s. Contagem em minutos corridos ou só no expediente: Prefeitura |
| 30 min é prazo de resposta, não de resolução | OK | `test_8`: respondido em 15 min fica "no prazo" mesmo sem conclusão; resposta da própria Prefeitura não conta |
| O sistema não substitui a equipe | OK | Documentado |

## 9. Relatório mensal

| Requisito | Situação | Evidência |
|---|---|---|
| Consolidar serviços, horários, profissionais, ocorrências e horas | OK | `test_9`: conteúdo congelado com hash; exportação CSV e PDF |
| Entrega até o 2º dia útil do mês seguinte | OK | `test_9`: só após o fim do mês; prazo 02/12/2026 calculado; atraso é sinalizado |
| Conferência e atesto antes de liberar o registro da nota fiscal | OK | `test_9`: nota recusada antes do atesto e aceita depois |

## Decisões de implementação

| Item | Situação | Evidência |
|---|---|---|
| Perfis: solicitante, fiscal/gestor, operador, administrador técnico | OK | Todos os testes |
| Identificador único, status claros, filtros por período, modalidade, profissional e situação | OK | `test_decisoes` |
| Exportação PDF/CSV de relatórios e histórico | OK | `test_2`, `test_9`, `test_decisoes` |
| Backups e restauração | Parcial | Scripts testados localmente (27 e 28/10/2026). Na hospedagem atual valem os backups automáticos do banco pago do Render; a cópia cifrada no Google Drive depende da autorização OAuth da conta; restauração no Render ainda não testada |
| Histórico protegido contra os usuários; limites do acesso à infraestrutura explicados | OK | `test_2`; doc 03, seção 5 |
| Interface em português, responsiva e acessível | OK | `test_decisoes` e navegador (54 telas em 375 px e 1280 px; defeito V2 corrigido). Não substitui uma auditoria completa de acessibilidade (WCAG) |
| Somente dados fictícios | OK | Todos os testes e a carga de demonstração |

## O que ainda não foi testado

- E-mail real (falta a senha de app do Gmail e a sua autorização).
- Cópia de backup no Google Drive (falta a autorização OAuth da conta).
- Envio de anexo de alguns MB pelo endereço público (passa pelo proxy da Netlify).
- Restauração de backup na hospedagem (Render).
- Uso real pela Prefeitura (homologação do sistema pelas partes).
