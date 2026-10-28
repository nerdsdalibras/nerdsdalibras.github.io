# Auditoria funcional — 28/10/2026

Escopo: os 20 itens solicitados, verificados contra os requisitos do edital
(conforme recebidos). Ambiente: local, PostgreSQL 16, dados **fictícios**.
Nada aqui equivale à homologação pela Prefeitura nem a declaração de
conformidade com o edital.

## Tipos de evidência

| Sigla | Significado |
|---|---|
| **HTTP** | Teste automatizado que faz requisições HTTP reais ao servidor Django (permissões, CSRF, sessões), contra PostgreSQL real, e confere o banco antes/depois. Datas futuras/passadas usam **relógio simulado**. Arquivo `operacao/tests/test_auditoria_funcional.py` (classes `A01`…`A18`; itens 7–8 em `A07A08Parametros`, 9–12 em `A09A12Medicao`). |
| **SRV** | Teste automatizado chamando a camada de serviço (regras) contra PostgreSQL real. |
| **E2E** | Execução real: Gunicorn em modo produção (`DEBUG=false`), navegador Chromium (Playwright), PostgreSQL, servidor SMTP local e os scripts de backup/restauração. Sem relógio simulado. |
| **NÃO TESTADO** | Integração que depende de terceiro/credencial e não foi exercitada. |

Resultado da suíte automatizada após as correções: **97 testes executados, 0 falhas, 0 erros**
(69 anteriores + 28 da auditoria).

## Resultado por item

| # | Requisito | Teste executado | Resultado | Evidência | Pendências |
|---|---|---|---|---|---|
| 1 | Prefeitura e contratada criam solicitações conforme permissões | HTTP `A01`: POST de criação por Solicitante, Fiscal, Operador, Administrador técnico e anônimo; listagem e CSV do solicitante | **Passou** (após correção de falso positivo no teste antigo) | Solicitante/Fiscal criam com parte PREFEITURA, Operador com CONTRATADA; admin → 403; anônimo → login; nenhum registro extra. 09:00 informado = 12:00 UTC gravado. Solicitante não vê pedido da contratada (tela e CSV). E2E: operador criou SBC-2026-000003/4 pelo navegador | — |
| 2 | Confirmação registra profissionais e dispara alerta correto | HTTP `A02`; E2E com SMTP local | **Passou** | Confirmação com escala incompleta é recusada e não gera alerta; após completar: `confirmado_por/em` gravados, 2 intérpretes ativos, notificação tipo CONFIRMACAO só para fiscal, com os nomes; 1 e-mail; aviso interno só para o fiscal. E2E: mensagem SMTP recebida pelo servidor local, destinatário `fiscal@…`, assunto `[SGI SBC-2026-000003] Atendimento confirmado` | Envio por provedor real NÃO TESTADO |
| 3 | Alterar horário exige justificativa, preserva anterior, registra usuário/data/hora | HTTP `A03` (sem relógio simulado); E2E | **Passou** | Justificativa em branco: registro e auditoria inalterados. Com justificativa: evento ALTERACAO_HORARIO com usuário, justificativa, valor anterior e posterior, data/hora do **banco** (diferença < 60 s do momento real); evento CRIACAO mantém o horário original; alerta gerado. E2E: e-mail de alteração recebido | — |
| 4 | Cancelar preserva original e alerta | HTTP `A04`; E2E | **Passou** | Sem justificativa: nada muda. Com justificativa: status CANCELADO; título, local, horário, código e `criado_em` idênticos; escalas inativadas com motivo; alerta CANCELAMENTO_AGENDAMENTO com escalas citadas; cancelamento de escala gera CANCELAMENTO_ESCALA. E2E: classificação "Tardio" exibida | — |
| 5 | Sem permissão não altera nem por interface nem por requisição direta | HTTP `A05` (16 requisições indevidas, GET em rota de alteração, POST sem CSRF, gestão de perfis); E2E `permissoes.js` | **Passou após correção do DEFEITO D1** | Todas as indevidas → 403/404; estado do agendamento, auditoria, parâmetros, feriados e usuários idênticos antes/depois; GET → 405; sem CSRF → 403. E2E: botões ausentes; POST forjado de aprovação → 403; sem CSRF → 403; admin tentando criar FISCAL → recusado, usuário não criado | Acesso de superusuário à infraestrutura não é bloqueado pela aplicação (ver manual, seção 5) |
| 6 | Realizados e homologados não podem ser apagados/adulterados por usuários da aplicação | HTTP `A06` (6 tentativas por rota) + SQL `DELETE/UPDATE` | **Passou** | Homologado: agendamento, medições e auditoria idênticos após todas as requisições; `delete()` e SQL bloqueados por trigger (agendamento, medição, homologação). Realizado não homologado: só muda por correção com justificativa, que gera **nova** versão de medição e preserva a anterior; DELETE bloqueado | — |
| 7 | Contratada não altera fórmulas/parâmetros sem aprovação | HTTP `A07A08Parametros`; E2E | **Passou após correção do DEFEITO D1** | Proposta da contratada fica PROPOSTO e não é usada (medição seguinte usa v1); aprovação pelo operador → 403 (HTTP) e PermissionDenied (serviço); edição da proposta via SQL → bloqueada. Antes da correção, o administrador técnico podia criar um "Fiscal" e aprovar sozinho | Mudanças de layout/código dependem de processo formal (doc 02, P13) |
| 8 | Cada alteração autorizada tem versão e não modifica medições anteriores | HTTP `A07A08Parametros` | **Passou** | v2 aprovada pelo fiscal (versão, situação e aprovador gravados, evento de auditoria); medição anterior e linha do parâmetro v1 idênticas byte a byte; novo atendimento usa v2 (R$ 200,1234 × 2 h = R$ 400,25) | — |
| 9 | 2 h com 2 intérpretes = 2 h faturáveis = R$ 313,20 | HTTP/SRV `A09A12Medicao.test_duas_horas_dois_interpretes` + testes anteriores | **Passou** | 120 min, 2,0000 h, R$ 313,20, com 2 escalas ativas | Preço homologado na licitação (P12) |
| 10 | > 1 h sinaliza ≥ 2 intérpretes, inclusive pela duração real | HTTP `A09A12Medicao.test_revezamento_sinalizado` | **Passou após correção do DEFEITO D2** | Criação 61 min/1 intérprete recusada; alteração para 90 min com 1 recusada; confirmação exige 2; real 75 min com 1 intérprete → `alerta_revezamento` na medição, na tela e **agora também no relatório mensal** (antes não constava) | — |
| 11 | 1h08→1h; 1h22→1h30; 1h35→1h30; 1h50→2h; limites 10/11/30/31/40/41/60 | HTTP `A09A12Medicao.test_casos_do_enunciado_e_limites_pelo_fluxo_completo` pelo fluxo completo (registro de realização → medição) + SRV unitário | **Passou** | 68→60, 82→90, 95→90, 110→120; excedentes 10→+0, 11→+30, 30→+30, 31→+30, 40→+30, 41→+60, 60→+60; valores = 156,60 × minutos/60 | — |
| 12 | Casos não definidos não recebem regra inventada | HTTP `A09A12Medicao.test_casos_nao_definidos_nao_recebem_regra` | **Passou** | Excedente 61 min, realizado menor que o agendado, duração 90 e 30 min → PENDENTE_REGRA, sem minutos/valor, sem medição vigente, homologação recusada, fora dos totais do relatório e listados como pendência | Regras a definir (P4–P6) |
| 13 | Cancelamento tardio sem indenização automática; exige confirmação, evidência e aprovação | HTTP `A13`; E2E com anexo PDF | **Passou** | Nada é criado ao cancelar; sem confirmação prévia → recusado; sem comprovação → recusado; operador não decide (403); fiscal sem marcar a comprovação → não aprova; aprovado entra separado (horas = 0, indenização = 313,20). E2E: pedido com anexo criado; anexo só baixa autenticado | Critério 24 h × dia útil (P1); limite de 2 h no remoto (P8) |
| 14 | Dias úteis consideram fins de semana e feriados configurados | HTTP/SRV `A14` + testes anteriores | **Passou** | sex→seg = 1; sex→dom = 0; feriado cadastrado pelo fiscal torna pedido fora do prazo (0 dia útil); desativar feriado não altera registro anterior | Feriados municipais de SBC não carregados (P3); método de contagem (P2) |
| 15 | Dados de um cliente inacessíveis a outro | HTTP `A15` com 4 perfis de outro contrato | **Passou** | 7 GETs e 6 POSTs a objetos do contrato A → 403/404 para todos os perfis; 10 listagens/exportações sem código, chamado, e-mail, nome de intérprete ou preço do contrato A; sessão adulterada apontando para vínculo alheio → 404 | — |
| 16 | Falhas de notificação visíveis, com reenvio e sem duplicidade | HTTP `A16`; **E2E com SMTP real local** | **Passou após correção do DEFEITO D3** | E2E: com SMTP desligado, 4 falhas reais `ConnectionRefusedError` registradas e exibidas; reenvio manual → ENVIADA; botão some; POST forjado de reenvio → bloqueado ("reenvio bloqueado para evitar duplicidade"); processador reenviou 3 vencidas e na 2ª execução 0; **cada mensagem chegou exatamente 1 vez**; histórico FALHA > ENVIADA; trigger impede voltar ENVIADA para PENDENTE | **Entrega por provedor real (credenciais SMTP, SPF/DKIM) NÃO TESTADA**; duplicidade em queda entre envio SMTP e gravação no banco é mitigada por Message-ID, não eliminada |
| 17 | Chamados registram 1ª resposta e acompanham 30 min | HTTP `A17` | **Passou após correção do DEFEITO D4** | Painel marca no prazo (10 min), atenção (21 min), excedido (31 min); atualização automática de 60 s; resposta de quem abriu não conta; resposta do operador aos 12 min grava 1ª resposta; 1ª resposta imutável (trigger). Antes, a conclusão por outra pessoa da Prefeitura contava indevidamente como 1ª resposta | Contagem só no expediente (P10) |
| 18 | Relatório rastreia cada valor até atendimento e regra | HTTP `A18` | **Passou após correção do DEFEITO D2** | Cada item traz código, versão e situação da medição, versão do parâmetro, preço unitário, previsto, realizado, excedente, acréscimo, valor bruto e regra aplicada; soma dos itens = total; CSV e PDF incluem "Memória de cálculo por atendimento"; conteúdo congelado com hash | — |
| 19 | Backup e restauração efetivamente testados | **E2E** (`backup.sh`, `restaurar.sh`, GPG) | **Passou após correção dos DEFEITOS D5 e D6** | Restauração em banco e pasta novos: 29 tabelas idênticas (linhas + MD5 do conteúdo), 57 triggers, cadeia de auditoria íntegra (mesmo último hash), anexo idêntico; aplicação subiu sobre o banco restaurado e o login gravou só nele (+1 × +0); recusa banco não vazio, pasta não vazia (antes de tocar no banco) e backup corrompido; backup cifrado: só `.gpg` no disco, somas OK, dump decifrado válido; chave inválida → erro, nada gravado | Cópia externa/imutável e rotina agendada dependem da infraestrutura (não implantada) |
| 20 | Dados permanecem após reiniciar | **E2E** | **Passou** | Gunicorn parado e **PostgreSQL reiniciado**: contagens, MD5 da tabela de agendamentos e último hash idênticos; tela exibe o mesmo registro (Cancelado, 7 eventos, pedido de indenização); anexo baixado idêntico (SHA-256) ao enviado | — |

## Defeitos encontrados e corrigidos

| ID | Defeito | Impacto | Correção | Reteste |
|---|---|---|---|---|
| D1 | Administrador técnico (contratada) podia criar/promover/desativar perfis da Prefeitura | A contratada poderia criar um "Fiscal" e aprovar sozinha parâmetros, medições, homologações e relatórios (itens 5 e 7) | Cada parte gere só os próprios perfis: Fiscal/Gestor → Solicitante e Fiscal; Administrador técnico → Operador e Administrador técnico; regra no serviço; formulários filtrados | `A05` HTTP + E2E: recusado, nenhum usuário criado |
| D2 | Relatório sem memória de cálculo por item e sem sinalizar revezamento insuficiente | Valor não rastreável até a regra (item 18); alerta de revezamento perdido no relatório (item 10) | Itens com versão/situação da medição, parâmetro, preço, previsto/realizado, excedente, acréscimo, valor bruto, regra e alerta; seção "Memória de cálculo" em tela, CSV e PDF; `layout_versao` 1.1 | `A09A12Medicao.test_revezamento_sinalizado`, `A18` |
| D3 | Tela dizia "fiscais notificados" mesmo com o e-mail falhando | Informação enganosa ao operador | Mensagem mostra a situação real (Enviada / Falha + erro / Integração pendente); envio síncrono idempotente quando ainda pendente | `A16MensagemDeTela` + E2E (falha e envio reais) |
| D4 | Conclusão de chamado por outra pessoa da Prefeitura contava como 1ª resposta | Prazo de 30 min aparecia cumprido sem resposta da contratada | Mesma regra de 1ª resposta para responder e concluir | `A17` |
| D5 | `restaurar.sh` extraía anexos no diretório-pai de `MEDIA_ROOT` usando o nome gravado no backup | Restaurar para outro destino podia sobrescrever a pasta de anexos em uso | Backup guarda o conteúdo; restauração extrai dentro de `MEDIA_ROOT`, recusa pasta não vazia **antes** de tocar no banco | E2E: pasta original intacta; recusa sem criar tabelas |
| D6 | `backup.sh` continuava se a cifragem GPG falhasse | Backup em claro e arquivo de somas vazio, sem erro | Falha de cifragem interrompe com erro e remove o que estiver em claro; somas vazias = erro | E2E: chave inexistente → código 1, 0 arquivos; chave válida → só `.gpg` |
| T1 | Teste antigo `test_criar_agendamento_pela_interface` era **falso positivo** (passava sendo redirecionado ao login por causa do relógio simulado) | Cobertura inexistente apesar de "verde" | Sessão de teste com validade longa e asserção de que o registro foi criado e que não houve redirecionamento ao login | Demonstrado falhando sem a correção e passando com ela |

Melhoria adicional: e-mails de alerta identificam o autor apenas pelo nome
(antes incluíam o e-mail do operador), reforçando a minimização.

## O que não foi testado (e por quê)

| Item | Situação |
|---|---|
| Entrega de e-mail por provedor real | NÃO TESTADO — sem credenciais e sem autorização de envio real. O protocolo SMTP foi exercitado contra servidor local controlado. |
| Fluxo completo realização → homologação → relatório **no navegador em tempo real** | Não exercitado em E2E porque exige eventos já ocorridos (o sistema não aceita pedidos para o passado). Coberto por testes HTTP com relógio simulado (`A06`, `A09–A12`, `A18`). |
| Implantação em servidor, HTTPS, Docker | Não executado neste ambiente. |
| Concorrência real (dois usuários simultâneos) | Não testada sob carga; há bloqueio de linha (`SELECT … FOR UPDATE`) no código. |
| Acessibilidade com leitor de tela | Não auditada com tecnologia assistiva; apenas estrutura semântica revisada. |

## Como reproduzir

```bash
set -a; . ./.env.dev; set +a
.venv/bin/python manage.py test operacao.tests.test_auditoria_funcional -v 2   # itens 1–18
.venv/bin/python manage.py test operacao                                      # suíte completa (97)
```
Os itens 16 (SMTP real), 19 e 20 foram executados manualmente com Gunicorn,
Playwright, um servidor SMTP local (`aiosmtpd`) e os scripts de `scripts/`,
conforme descrito na tabela. Os roteiros estão em `testes-e2e/` (ver `testes-e2e/LEIAME.md`).

## Adendo — 28/10/2026: integrações com a conta nerdsdalibras@gmail.com

Decisão da contratada: e-mails saem de `nerdsdalibras@gmail.com` e o Google Drive
dessa conta é a cópia externa dos backups.

| Item | Teste executado | Resultado | Evidência | Pendência |
|---|---|---|---|---|
| E-mail via Gmail da Nerds | `test_integracoes` (8 testes de diagnóstico/envio) + `testar_email` executado | **Configuração implementada; envio real NÃO TESTADO** | Padrão `smtp.gmail.com:587`, STARTTLS, remetente `Nerds da Libras - SGI <nerdsdalibras@gmail.com>`; sem senha → "integração pendente" com motivo e **nenhuma** tentativa de conexão; remetente diferente da conta → recusado; mensagem de teste aceita por servidor SMTP local com o remetente correto e registrada na auditoria | Senha de app (verificação em 2 etapas) e autorização de envio real. Este ambiente não alcança `smtp.gmail.com` |
| Backup no Google Drive | `DriveContraServidorFalso` (6 testes) + `backup.sh` executado com `BACKUP_DRIVE=sim` contra servidor local que imita a API do Google | **Implementado; NÃO TESTADO contra o Google** | Sem GPG → recusado (código 1); cifrado → 3 arquivos enviados, MD5 local = recebido, nenhum arquivo em claro; download idêntico e dump decifrado válido (29 tabelas, 57 triggers); conta autenticada diferente → nada enviado, backup local mantido (código 2); Drive fora do ar → erro claro, backup local mantido; cópia registrada na auditoria | Criar cliente OAuth, rodar `drive_autorizar` com a conta e guardar o refresh token como segredo; anuência da Prefeitura (P17) |

Observação: a instalação do `rclone` foi bloqueada pela política do ambiente; por
isso a integração foi feita na própria aplicação, sem dependências novas.
Suíte após o adendo: **111 testes, 0 falhas**.
