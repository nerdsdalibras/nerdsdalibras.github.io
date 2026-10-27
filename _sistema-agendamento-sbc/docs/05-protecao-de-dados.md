# Proteção de dados — medidas implementadas e limites

Este documento **não** afirma que a aplicação, por si só, torna o tratamento
conforme à LGPD. Conformidade depende também de base legal, contrato/termos
entre as partes, governança, treinamento, gestão de incidentes, atendimento a
titulares e da infraestrutura em que o sistema for implantado.

## Dados tratados (minimização)

| Titular | Dados | Finalidade |
|---|---|---|
| Usuários (servidores da Prefeitura e equipe da contratada) | Nome completo, e-mail, perfil, registros de acesso e de operações (IP) | Identificação individual e auditoria exigidas no contrato |
| Intérpretes | Nome completo, telefone corporativo/celular, e-mail | Exigidos para escala e contato operacional |
| Eventos | Unidade, local/plataforma, horários, observações | Execução e medição do serviço |

Não são coletados CPF, endereço residencial, dados de alunos ou pessoas surdas
atendidas. O campo de observações orienta a não incluir dados pessoais
desnecessários. Links de reunião remota devem ser informados com cautela.

## Medidas técnicas

- Autenticação individual; senhas com hash (PBKDF2 do Django), mínimo de 12
  caracteres; bloqueio temporário após 5 tentativas; troca obrigatória da senha inicial.
- Perfis com permissões verificadas no servidor; solicitante só vê os próprios pedidos.
- Isolamento por contrato em todas as consultas (outro contrato → "não encontrado").
  Nenhum dado de outros clientes (por exemplo, CMAA) foi carregado ou reutilizado.
- Contatos de intérpretes visíveis apenas a usuários autenticados e vinculados
  ao contrato; não vão nos e-mails de alerta nem nas exportações de agendamentos.
- Cabeçalhos de segurança: CSP restritiva, `X-Frame-Options: DENY`,
  `nosniff`, `Referrer-Policy`, `Cache-Control: no-store` para páginas autenticadas,
  cookies `Secure`/`HttpOnly`/`SameSite` com HTTPS, HSTS.
- Proteção CSRF; CSV com neutralização de fórmulas; anexos com tipo/tamanho
  limitados, nome aleatório e download apenas autenticado.
- Sem rastreadores, analytics, fontes ou scripts de terceiros (há teste automatizado).
  O hook do repositório do site que injeta Meta Pixel foi configurado para
  ignorar esta pasta.
- `noindex` em todas as páginas.

## Pendências organizacionais (fora do código)

- Definir papéis (controlador/operador) e encarregados no contrato.
- Política de retenção aprovada (doc 02, P11).
- Plano de resposta a incidentes e comunicação à Prefeitura.
- Hospedagem em provedor com contrato de tratamento de dados; preferencialmente no Brasil.
- Revisão periódica de acessos (desativar vínculos de quem saiu).
- MFA para usuários: **não implementado** nesta versão (recomendado como próxima etapa).
