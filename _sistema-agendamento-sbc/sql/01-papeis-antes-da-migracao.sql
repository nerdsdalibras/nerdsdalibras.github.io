-- Executar como superusuário ANTES das migrações.
-- sgi_dono: proprietário das tabelas, usado SOMENTE para rodar migrações.
-- sgi_app : usado pela aplicação; como não é dono, NÃO pode desabilitar
--           triggers, alterar estrutura nem truncar tabelas.
-- Uso: psql -v ON_ERROR_STOP=1 -v senha_dono='...' -v senha_app='...' -f sql/01-papeis-antes-da-migracao.sql
-- (gere senhas fortes no momento; não as versione)
CREATE ROLE sgi_dono LOGIN PASSWORD :'senha_dono';
CREATE ROLE sgi_app  LOGIN PASSWORD :'senha_app';
CREATE DATABASE sgi OWNER sgi_dono;
\connect sgi
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO sgi_app;
