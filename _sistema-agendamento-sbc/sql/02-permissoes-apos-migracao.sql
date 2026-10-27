-- Executar como superusuário (ou sgi_dono) APÓS cada `manage.py migrate` feito com sgi_dono.
-- Uso: psql -v ON_ERROR_STOP=1 -d sgi -f sql/02-permissoes-apos-migracao.sql
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO sgi_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sgi_app;
-- Tabelas append-only: sem UPDATE nem DELETE para a aplicação (além dos triggers).
REVOKE UPDATE ON operacao_eventoauditoria, operacao_homologacao, operacao_tentativaenvio,
  operacao_interacaochamado, operacao_registronotafiscal FROM sgi_app;
-- DELETE somente onde o framework precisa (sessões e tentativas de login).
GRANT DELETE ON django_session, contas_tentativalogin TO sgi_app;
