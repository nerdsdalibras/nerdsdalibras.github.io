# Matriz de requisitos — situação real

Legenda das colunas:

- **Impl.** — implementado no código (servidor).
- **Testado** — coberto por teste automatizado (nome do teste) e/ou verificado manualmente no navegador (E2E).
- **Pend. integração** — depende de serviço externo/credencial ainda não configurado.
- **Pend. esclarecimento** — depende de definição da Prefeitura/edital; há comportamento provisório documentado em `02-pendencias-esclarecimento.md`.

> "Testado" significa que o teste automatizado passou no ambiente local com
> PostgreSQL 16 e dados fictícios. **Não** equivale a homologação pela
> Prefeitura nem a declaração de conformidade com o edital.

Arquivos de teste: `operacao/tests/` (A = `test_agendamentos`, I = `test_imutabilidade`,
M = `test_medicao`, N = `test_notificacoes`, Z = `test_indenizacao`,
R = `test_relatorio_chamados_isolamento`, V = `test_views`).

## 1. Agendamentos

| Requisito | Impl. | Testado (evidência) | Pend. integração | Pend. esclarecimento |
|---|---|---|---|---|
| Registro por Prefeitura e contratada | Sim | A `test_registra_campos_e_registro_original`, `test_contratada_tambem_registra`; V `test_criar_agendamento_pela_interface`; E2E | — | — |
| Data/horário, local, modalidade, duração, qtd. profissionais | Sim | A `test_registra_campos_e_registro_original` | — | — |
| Data/hora de criação (servidor, imutável) | Sim | I `test_campos_originais_imutaveis` | — | — |
| Confirmação de atendimento | Sim | A `test_confirmacao_exige_escala_completa_e_alerta`; E2E | — | — |
| Intérpretes escalados com nome, telefone e e-mail | Sim | V `test_contatos_de_interpretes_so_para_vinculados`; E2E | — | — |
| Alterações de horário com justificativa | Sim | A `test_alteracao_de_horario_registra_antes_e_depois_e_alerta` | — | — |
| Cancelamento com justificativa, sem apagar | Sim | A `test_cancelar_nao_apaga_e_exige_justificativa`; E2E | — | — |
| Eventos simultâneos em locais/plataformas diferentes | Sim | A `test_eventos_simultaneos_em_locais_diferentes` | — | — |
| Bloqueio de intérprete em eventos sobrepostos (decisão de implementação) | Sim | A `test_mesmo_interprete_nao_pode_estar_em_eventos_sobrepostos` | — | — |
| Identificador único, status, filtros (período, modalidade, profissional, situação) | Sim | Filtros verificados manualmente; sem teste automatizado dedicado | — | — |

## 2. Histórico auditável

| Requisito | Impl. | Testado (evidência) | Pend. integração | Pend. esclarecimento |
|---|---|---|---|---|
| Registro original preservado | Sim (evento `CRIACAO` com snapshot + campos originais imutáveis por trigger) | A `test_registra_campos_e_registro_original`; I `test_campos_originais_imutaveis` | — | — |
| Usuário, data/hora, justificativa, valores antes/depois | Sim | A `test_alteracao_de_horario_registra_antes_e_depois_e_alerta` | — | — |
| Cancelar não apaga | Sim | A `test_cancelar_nao_apaga_e_exige_justificativa`; I `test_delete_de_agendamento_bloqueado_no_banco_e_na_aplicacao` | — | — |
| Travas contra exclusão/adulteração de homologados | Sim (triggers PostgreSQL) | I `test_homologado_pelas_duas_partes_fica_travado`, `test_cancelado_e_imutavel` | — | — |
| Histórico protegido contra alteração | Sim (append-only + cadeia SHA-256) | I `test_auditoria_append_only`, `test_cadeia_de_hash_integra_e_detecta_adulteracao` | — | — |
| Separação de papéis no banco (app sem poder de desligar triggers) | Sim (`sql/`) | Verificado manualmente: `ALTER TABLE ... DISABLE TRIGGER`, `UPDATE` na auditoria e `DELETE` negados ao papel `sgi_app` | — | — |
| Exportação do histórico (CSV/PDF) | Sim | V `test_exportacoes_relatorio_e_historico`; verificado no navegador | — | — |
| Retenção durante vigência e arquivamento legal | Sim: nada é eliminado; política versionada aprovada pela Prefeitura | R `test_retencao_sem_prazo_inventado_e_aprovacao_da_prefeitura`; I `test_politica_retencao_decidida_imutavel` | — | **Sim** — prazo legal a ser informado pela Prefeitura |

## 3. Permissões e homologação

| Requisito | Impl. | Testado (evidência) | Pend. integração | Pend. esclarecimento |
|---|---|---|---|---|
| Perfis e identificação individual | Sim (4 perfis por vínculo; login por e-mail; senha ≥ 12; bloqueio após 5 falhas) | V `test_exige_login`, `test_login_bloqueia_apos_tentativas`; A `test_admin_tecnico_nao_registra`, `test_prefeitura_nao_confirma` | — | — |
| Homologação pelas duas partes com evidência | Sim (hash do estado conferido) | I `test_homologado_pelas_duas_partes_fica_travado`, `test_homologacao_parcial_perde_efeito_se_dados_mudam` | — | — |
| Contratada não altera configurações/fórmulas unilateralmente | Sim (parâmetros, calendário, retenção só vigoram com aprovação do Fiscal) | V `test_operador_nao_aprova_parametro_pela_interface`; R `test_calendario_so_pela_prefeitura`, `test_admin_tecnico_nao_propoe_parametro` | — | — |
| Layout sujeito à autorização da Prefeitura | Parcial: o layout é código; o relatório grava `layout_versao` | Não testado | — | **Sim** — processo de aprovação de mudanças de código/layout (ver doc 02) |
| Parâmetros versionados sem alterar medições anteriores | Sim | M `test_medicao_guarda_versao_do_parametro_e_nao_muda_com_novo_preco`; I `test_parametro_aprovado_imutavel` | — | — |

## 4. Alertas automáticos

| Requisito | Impl. | Testado (evidência) | Pend. integração | Pend. esclarecimento |
|---|---|---|---|---|
| Alerta imediato: confirmação, alteração de horário, cancelamento de escala (e de agendamento) | Sim (envio após commit + caixa interna) | A `test_confirmacao_exige_escala_completa_e_alerta`, `test_alteracao_de_horario_registra_antes_e_depois_e_alerta`, `test_cancelamento_de_escala_alerta_e_reabre_confirmacao`; N `test_envio_imediato_aos_fiscais_e_sem_duplicidade` (backend de teste em memória) | **Sim — SMTP real não configurado; nenhum e-mail real foi enviado** | Lista oficial de fiscais/gestores destinatários |
| Sem credencial → "integração pendente", sem simular sucesso | Sim | N `test_sem_configuracao_fica_pendente_de_integracao_sem_simular_sucesso` | — | — |
| Registro de envio, falha, reenvio; sem duplicidade | Sim | N `test_falha_registra_e_reenvia`, `test_falha_definitiva`, `test_envio_imediato_aos_fiscais_e_sem_duplicidade` | Agendador (cron/systemd) do comando `processar_notificacoes` no servidor | — |

## 5. Medição das horas

| Requisito | Impl. | Testado (evidência) | Pend. integração | Pend. esclarecimento |
|---|---|---|---|---|
| Hora de evento, independente do nº de intérpretes | Sim | M `test_dois_interpretes_nao_dobram_horas` | — | — |
| > 1 h exige ≥ 2 intérpretes | Sim (criação, confirmação, constraint no banco, alerta na medição) | A `test_acima_de_uma_hora_exige_dois_interpretes`; M `test_alerta_revezamento_quando_real_excede_uma_hora_com_um_interprete`; E2E | — | — |
| Previsto x realizado | Sim | M (testes integrados) | — | — |
| Tabela 1–10/11–30/31–40/41–60 | Sim | M `test_faixas_expressas_e_limites` (inclui limites de cada faixa) | — | — |
| Casos não definidos → pendência, sem extrapolar | Sim | M `test_excedente_acima_de_60_e_pendencia`, `test_atendimento_mais_curto_e_pendencia`, `test_duracao_fracionada_e_pendencia` | — | **Sim** — regras desses casos |
| Medição fundamentada aprovada, sem alterar histórico | Sim | M `test_pendencia_exige_fundamentada_aprovada_e_preserva_versoes` | — | — |
| Decimal; 4 casas no unitário; arredondamento documentado | Sim (ROUND_HALF_UP no total, 2 casas; bruto com 8 casas gravado) | M `test_decimal_e_arredondamento` | — | Confirmar regra de arredondamento aceita pela Prefeitura |
| Preço configurável; R$ 156,60 só como valor inicial | Sim (v1 criada como PROPOSTO) | M `test_medicao_guarda_versao...` | — | **Sim** — preço resultante da licitação |

## 6. Antecedência e cancelamentos

| Requisito | Impl. | Testado (evidência) | Pend. integração | Pend. esclarecimento |
|---|---|---|---|---|
| Remoto 1 dia útil; presencial 3 dias úteis | Sim | A `test_remoto_um_dia_util`, `test_presencial_tres_dias_uteis_com_feriado` | — | **Sim** — método de contagem (doc 02) |
| Calendário configurável; fuso America/Sao_Paulo | Sim | A (feriado no meio do prazo); R `test_prazo_segundo_dia_util`, `test_calendario_so_pela_prefeitura` | — | **Sim** — feriados municipais/pontos facultativos de SBC não carregados |
| Sinalizar fora do prazo preservando registro | Sim | A `test_fora_do_prazo_preserva_registro`; E2E | — | — |
| Cancelamento: critérios 24 h e 1 dia útil sem escolher entre eles | Sim (divergência ou exatamente 24 h = AMBÍGUO) | A `test_superior_nos_dois_criterios`, `test_tardio_nos_dois_criterios`, `test_exatamente_24h_e_ambiguo`, `test_criterios_divergentes_sao_ambiguos` | — | **Sim** |
| Indenização só com confirmação prévia, comprovação e aprovação; não imputável à contratada | Sim | Z (todos os 7 testes) | — | — |
| Remoto 50%; presencial 100% limitado a 2 h | Sim | Z `test_remoto_50`, `test_presencial_100_limitado_a_2h` | — | Confirmar se o limite de 2 h vale também para remoto |
| Indenização separada das horas prestadas | Sim | Z `test_aprovacao_exige_comprovacao_e_nao_imputavel`; R relatório separa totais | — | — |

## 7. Proteção de dados

| Requisito | Impl. | Testado (evidência) | Pend. integração | Pend. esclarecimento |
|---|---|---|---|---|
| Minimização (só dados contratuais) | Sim (ver doc 05) | Revisão do modelo de dados | — | Validação pelo encarregado (DPO) das partes |
| Proteção contra acesso não autorizado | Sim (autenticação, perfis, CSRF, CSP, cookies seguros em HTTPS, bloqueio de tentativas) | V `test_exige_login`, `test_login_bloqueia_apos_tentativas`, `test_solicitante_nao_ve_agendamento_de_outro`, `test_paginas_principais_respondem` (CSP) | HTTPS/hospedagem | — |
| Contatos de intérpretes não públicos | Sim | V `test_contatos_de_interpretes_so_para_vinculados`; N verifica que o e-mail de alerta não contém telefone | — | — |
| Isolamento entre clientes/contratos; sem dados da CMAA | Sim (contrato_id em tudo; nenhuma carga de outro contrato) | R `test_dados_de_outro_contrato_inacessiveis`; V (404 para outro contrato) | — | — |
| Sem rastreadores de terceiros | Sim | V `test_templates_sem_rastreadores_de_terceiros` | — | — |
| Conformidade plena com a LGPD | **Não declarada** — depende de medidas organizacionais (ver doc 05) | — | — | — |

## 8. Operação e suporte

| Requisito | Impl. | Testado (evidência) | Pend. integração | Pend. esclarecimento |
|---|---|---|---|---|
| Fila com abertura, responsável, 1ª resposta, conclusão | Sim | R `test_sla_primeira_resposta`; E2E | — | — |
| Destaque de chamados sem resposta próximos de 30 min | Sim (≥ 20 min "atenção", ≥ 30 "excedido"; atualização a cada 60 s) | R `test_sla_primeira_resposta` | — | Contagem em minutos corridos x apenas no expediente |
| Monitoramento durante o expediente | Sim (painel web) | E2E | — | Horário de expediente da Secretaria |
| Sistema não substitui pessoal | Documentado | — | — | — |

## 9. Relatório mensal

| Requisito | Impl. | Testado (evidência) | Pend. integração | Pend. esclarecimento |
|---|---|---|---|---|
| Consolidação de serviços, horários, profissionais, ocorrências, horas | Sim (snapshot congelado + hash) | R `test_fluxo_submissao_atesto_e_nf` | — | — |
| Prazo: 2º dia útil do mês seguinte | Sim (calculado e sinalizado) | R `test_prazo_segundo_dia_util`, `test_submissao_apos_prazo_e_sinalizada` | — | — |
| Conferência e atesto antes do registro da NF | Sim (serviço + trigger) | R `test_fluxo_submissao_atesto_e_nf`, `test_devolucao_gera_nova_versao_e_preserva_anterior` | — | — |
| Exportação CSV/PDF | Sim | V `test_exportacoes_relatorio_e_historico` | — | — |

## Entregáveis

| Entregável | Situação |
|---|---|
| Código completo e organizado | Entregue nesta pasta |
| Migrações e estrutura do banco | `operacao/migrations/0001–0003`, `contas/migrations/0001` |
| Aplicação funcional com instruções | `README.md`; executada localmente com Gunicorn e verificada no navegador |
| Configuração segura por variáveis de ambiente | `config/settings.py`, `.env.example` (sem segredos) |
| Testes das regras críticas | 69 testes passando |
| Manual de administração, backup e recuperação | `docs/03-manual-administracao.md`; backup e restauração executados com sucesso em ambiente local |
| Matriz | Este documento |
| Dependências e custos | `docs/04-dependencias-e-custos.md` |
| Docker | `Dockerfile` e `docker-compose.yml` fornecidos, **não testados** neste ambiente |
