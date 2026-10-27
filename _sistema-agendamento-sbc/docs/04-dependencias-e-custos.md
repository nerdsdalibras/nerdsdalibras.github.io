# Dependências e custos recorrentes

## Dependências de software (todas livres, sem custo de licença)

| Componente | Versão | Licença | Uso |
|---|---|---|---|
| Python | 3.12+ (testado em 3.13) | PSF | Linguagem |
| Django | 5.2 LTS (5.2.18) | BSD | Framework web, autenticação, CSRF, sessões |
| psycopg | 3.2 | LGPL | Driver PostgreSQL |
| PostgreSQL | 16 | PostgreSQL License | Banco de dados, triggers, hash |
| ReportLab | 4.x | BSD | Geração de PDF |
| Gunicorn | 23 | MIT | Servidor de aplicação |
| WhiteNoise | 6 | MIT | Arquivos estáticos |
| Pillow (dependência do ReportLab) | — | MIT-CMU | Imagens em PDF |

Não há bibliotecas JavaScript, fontes, CDNs, analytics ou rastreadores de terceiros.

Atualizações de segurança: acompanhar avisos do Django (LTS com suporte até
abril de 2028, conforme calendário publicado pelo projeto) e do PostgreSQL 16.

## Serviços externos necessários (recorrentes)

Os valores abaixo são **estimativas de ordem de grandeza para orçamento, não
cotações**. Devem ser cotados com fornecedores antes da contratação.

| Item | Necessidade | Faixa estimada (a cotar) |
|---|---|---|
| Servidor/VM (2 vCPU, 4 GB RAM) em nuvem no Brasil | Obrigatório | ~R$ 100 a 400/mês |
| PostgreSQL gerenciado (opcional; alternativa: no próprio servidor) | Recomendado | ~R$ 150 a 600/mês |
| Armazenamento externo de backups (com bloqueio de exclusão) | Obrigatório | ~R$ 10 a 80/mês para o volume esperado |
| Envio de e-mail transacional (SMTP autenticado com SPF/DKIM/DMARC no domínio da contratada) | Obrigatório para alertas por e-mail | Gratuito a ~R$ 100/mês no volume esperado |
| Domínio e certificado TLS | Obrigatório | Domínio ~R$ 40/ano; certificado gratuito (ex.: Let's Encrypt) |
| Monitoramento de disponibilidade e alertas | Recomendado | Gratuito a ~R$ 100/mês |
| Horas técnicas: atualizações, backups testados, suporte | Obrigatório | Depende da equipe; estimar algumas horas/mês |

## Itens que dependem de terceiros/Prefeitura

- Credenciais SMTP e autorização para envio real (pendente de integração).
- Lista de fiscais/gestores e e-mails institucionais.
- Eventual integração com sistemas da Prefeitura (não solicitada; não implementada).
