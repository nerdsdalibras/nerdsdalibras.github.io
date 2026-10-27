"""Travas no PostgreSQL. Valem para QUALQUER cliente do banco (não só a aplicação).

- Exclusão (DELETE/TRUNCATE) proibida em todas as tabelas de negócio.
- Auditoria: append-only; data/hora e cadeia de hash SHA-256 calculadas pelo banco.
- Agendamento: campos do registro original imutáveis; cancelado e homologado não mudam.
- Escala/medição/homologação de agendamento homologado: imutáveis.
- Versões decididas (parâmetros, retenção, medição fundamentada, indenização,
  relatório atestado) não mudam.
- Nota fiscal só pode ser registrada para relatório ATESTADO.

Limite: o proprietário das tabelas/superusuário do PostgreSQL pode desabilitar
triggers. Ver docs/03-manual-administracao.md (papéis separados, cadeia de hash
e backups externos para detecção).
"""
from django.db import migrations

TABELAS_SEM_EXCLUSAO = [
    "operacao_contrato", "operacao_vinculo", "operacao_interprete", "operacao_feriado",
    "operacao_parametromedicao", "operacao_politicaretencao", "operacao_agendamento", "operacao_escala",
    "operacao_medicao", "operacao_pedidoindenizacao", "operacao_homologacao", "operacao_eventoauditoria",
    "operacao_notificacao", "operacao_tentativaenvio", "operacao_avisointerno", "operacao_chamado",
    "operacao_interacaochamado", "operacao_relatoriomensal", "operacao_registronotafiscal",
]
TABELAS_SEM_UPDATE = [
    "operacao_eventoauditoria", "operacao_homologacao", "operacao_tentativaenvio",
    "operacao_interacaochamado", "operacao_registronotafiscal",
]

SQL = """
CREATE OR REPLACE FUNCTION sgi_bloquear_exclusao() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'SGI: exclusão proibida em % (registros são preservados)', TG_TABLE_NAME;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sgi_bloquear_alteracao() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'SGI: alteração proibida em % (registro imutável)', TG_TABLE_NAME;
END $$ LANGUAGE plpgsql;

-- Auditoria: id, data/hora e hash definidos pelo banco, sob bloqueio, em ordem.
CREATE OR REPLACE FUNCTION sgi_auditoria_encadear() RETURNS trigger AS $$
DECLARE ultimo text;
BEGIN
  PERFORM pg_advisory_xact_lock(7240246);
  NEW.id := nextval(pg_get_serial_sequence('operacao_eventoauditoria', 'id'));
  NEW.ocorrido_em := clock_timestamp();
  SELECT hash INTO ultimo FROM operacao_eventoauditoria ORDER BY id DESC LIMIT 1;
  NEW.hash_anterior := coalesce(ultimo, '');
  NEW.hash := encode(sha256(convert_to(concat_ws('|',
      NEW.hash_anterior, NEW.id::text, coalesce(NEW.contrato_id::text, ''), NEW.entidade, NEW.entidade_id, NEW.acao,
      coalesce(NEW.usuario_id::text, ''), NEW.usuario_descricao, NEW.perfil,
      to_char(NEW.ocorrido_em AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
      NEW.justificativa, coalesce(NEW.dados_anteriores::text, ''), coalesce(NEW.dados_posteriores::text, ''),
      coalesce(host(NEW.ip), '')), 'UTF8')), 'hex');
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER sgi_auditoria_encadear BEFORE INSERT ON operacao_eventoauditoria
  FOR EACH ROW EXECUTE FUNCTION sgi_auditoria_encadear();

-- Agendamento
CREATE OR REPLACE FUNCTION sgi_agendamento_trava() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'HOMOLOGADO' THEN
    RAISE EXCEPTION 'SGI: agendamento % homologado pelas partes não pode ser alterado', OLD.codigo;
  END IF;
  IF OLD.status = 'CANCELADO' THEN
    RAISE EXCEPTION 'SGI: agendamento % cancelado não pode ser alterado', OLD.codigo;
  END IF;
  IF NEW.codigo IS DISTINCT FROM OLD.codigo OR NEW.contrato_id IS DISTINCT FROM OLD.contrato_id
     OR NEW.criado_em IS DISTINCT FROM OLD.criado_em OR NEW.criado_por_id IS DISTINCT FROM OLD.criado_por_id
     OR NEW.parte_criadora IS DISTINCT FROM OLD.parte_criadora
     OR NEW.antecedencia_dias_uteis IS DISTINCT FROM OLD.antecedencia_dias_uteis
     OR NEW.antecedencia_minima_dias_uteis IS DISTINCT FROM OLD.antecedencia_minima_dias_uteis
     OR NEW.fora_do_prazo IS DISTINCT FROM OLD.fora_do_prazo
     OR NEW.modalidade IS DISTINCT FROM OLD.modalidade THEN
    RAISE EXCEPTION 'SGI: campos do registro original do agendamento são imutáveis';
  END IF;
  IF OLD.confirmado_em IS NOT NULL AND NEW.confirmado_em IS DISTINCT FROM OLD.confirmado_em THEN
    RAISE EXCEPTION 'SGI: data de confirmação já registrada é imutável';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER sgi_agendamento_trava BEFORE UPDATE ON operacao_agendamento
  FOR EACH ROW EXECUTE FUNCTION sgi_agendamento_trava();

-- Registros filhos de agendamento homologado/cancelado
CREATE OR REPLACE FUNCTION sgi_filho_agendamento_trava() RETURNS trigger AS $$
DECLARE st text;
BEGIN
  SELECT status INTO st FROM operacao_agendamento WHERE id = NEW.agendamento_id;
  IF st = 'HOMOLOGADO' THEN
    RAISE EXCEPTION 'SGI: agendamento homologado — % não pode ser incluído/alterado', TG_TABLE_NAME;
  END IF;
  IF TG_TABLE_NAME = 'operacao_escala' AND TG_OP = 'INSERT' AND st = 'CANCELADO' THEN
    RAISE EXCEPTION 'SGI: agendamento cancelado não aceita escala';
  END IF;
  IF TG_TABLE_NAME = 'operacao_escala' AND TG_OP = 'UPDATE' THEN
    IF OLD.ativa = false THEN RAISE EXCEPTION 'SGI: escala cancelada é imutável'; END IF;
    IF NEW.interprete_id <> OLD.interprete_id OR NEW.agendamento_id <> OLD.agendamento_id
       OR NEW.escalado_em <> OLD.escalado_em OR NEW.escalado_por_id <> OLD.escalado_por_id THEN
      RAISE EXCEPTION 'SGI: dados da escala são imutáveis';
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER sgi_escala_trava BEFORE INSERT OR UPDATE ON operacao_escala
  FOR EACH ROW EXECUTE FUNCTION sgi_filho_agendamento_trava();
CREATE TRIGGER sgi_medicao_insercao_trava BEFORE INSERT ON operacao_medicao
  FOR EACH ROW EXECUTE FUNCTION sgi_filho_agendamento_trava();
CREATE TRIGGER sgi_homologacao_insercao_trava BEFORE INSERT ON operacao_homologacao
  FOR EACH ROW EXECUTE FUNCTION sgi_filho_agendamento_trava();

-- Medição: só a decisão de uma medição PROPOSTA pode ser gravada; valores nunca mudam.
CREATE OR REPLACE FUNCTION sgi_medicao_trava() RETURNS trigger AS $$
BEGIN
  IF OLD.situacao <> 'PROPOSTA' OR NEW.situacao NOT IN ('APROVADA', 'REJEITADA') THEN
    RAISE EXCEPTION 'SGI: medição % só pode receber decisão quando proposta', OLD.versao;
  END IF;
  IF (NEW.agendamento_id, NEW.versao, NEW.parametro_id, NEW.minutos_previstos, NEW.minutos_realizados,
      NEW.minutos_faturaveis, NEW.horas_faturaveis, NEW.preco_unitario, NEW.valor_bruto, NEW.valor_total,
      NEW.fundamentacao, NEW.criada_em, NEW.criada_por_id)
     IS DISTINCT FROM
     (OLD.agendamento_id, OLD.versao, OLD.parametro_id, OLD.minutos_previstos, OLD.minutos_realizados,
      OLD.minutos_faturaveis, OLD.horas_faturaveis, OLD.preco_unitario, OLD.valor_bruto, OLD.valor_total,
      OLD.fundamentacao, OLD.criada_em, OLD.criada_por_id) THEN
    RAISE EXCEPTION 'SGI: valores de medição são imutáveis';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER sgi_medicao_trava BEFORE UPDATE ON operacao_medicao
  FOR EACH ROW EXECUTE FUNCTION sgi_medicao_trava();

-- Parâmetros e política de retenção: só a decisão de versão PROPOSTA.
CREATE OR REPLACE FUNCTION sgi_parametro_trava() RETURNS trigger AS $$
BEGIN
  IF OLD.situacao <> 'PROPOSTO' THEN
    RAISE EXCEPTION 'SGI: versão % já decidida é imutável', OLD.versao;
  END IF;
  IF TG_TABLE_NAME = 'operacao_parametromedicao' AND
     (NEW.preco_unitario_hora, NEW.faixas_excedente, NEW.vigente_desde, NEW.versao, NEW.casas_decimais_total,
      NEW.modo_arredondamento, NEW.contrato_id, NEW.justificativa)
     IS DISTINCT FROM
     (OLD.preco_unitario_hora, OLD.faixas_excedente, OLD.vigente_desde, OLD.versao, OLD.casas_decimais_total,
      OLD.modo_arredondamento, OLD.contrato_id, OLD.justificativa) THEN
    RAISE EXCEPTION 'SGI: conteúdo de versão proposta não pode ser editado; proponha nova versão';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER sgi_parametro_trava BEFORE UPDATE ON operacao_parametromedicao
  FOR EACH ROW EXECUTE FUNCTION sgi_parametro_trava();
CREATE TRIGGER sgi_retencao_trava BEFORE UPDATE ON operacao_politicaretencao
  FOR EACH ROW EXECUTE FUNCTION sgi_parametro_trava();

-- Indenização: valores imutáveis; só decisão de pedido SOLICITADO.
CREATE OR REPLACE FUNCTION sgi_indenizacao_trava() RETURNS trigger AS $$
BEGIN
  IF OLD.situacao <> 'SOLICITADA' THEN
    RAISE EXCEPTION 'SGI: pedido de indenização decidido é imutável';
  END IF;
  IF (NEW.valor_referencia, NEW.horas_referencia, NEW.minutos_referencia, NEW.percentual, NEW.parametro_id,
      NEW.comprovacao, NEW.anexo, NEW.anexo_sha256, NEW.agendamento_id)
     IS DISTINCT FROM
     (OLD.valor_referencia, OLD.horas_referencia, OLD.minutos_referencia, OLD.percentual, OLD.parametro_id,
      OLD.comprovacao, OLD.anexo, OLD.anexo_sha256, OLD.agendamento_id) THEN
    RAISE EXCEPTION 'SGI: dados do pedido de indenização são imutáveis';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER sgi_indenizacao_trava BEFORE UPDATE ON operacao_pedidoindenizacao
  FOR EACH ROW EXECUTE FUNCTION sgi_indenizacao_trava();

-- Relatório: conteúdo congelado; só decisão de relatório SUBMETIDO.
CREATE OR REPLACE FUNCTION sgi_relatorio_trava() RETURNS trigger AS $$
BEGIN
  IF OLD.status <> 'SUBMETIDO' THEN
    RAISE EXCEPTION 'SGI: relatório % já decidido é imutável', OLD.versao;
  END IF;
  IF NEW.conteudo IS DISTINCT FROM OLD.conteudo OR NEW.hash_conteudo IS DISTINCT FROM OLD.hash_conteudo
     OR NEW.competencia IS DISTINCT FROM OLD.competencia OR NEW.submetido_em IS DISTINCT FROM OLD.submetido_em
     OR NEW.prazo_limite IS DISTINCT FROM OLD.prazo_limite OR NEW.submetido_no_prazo IS DISTINCT FROM OLD.submetido_no_prazo THEN
    RAISE EXCEPTION 'SGI: conteúdo submetido do relatório é imutável';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER sgi_relatorio_trava BEFORE UPDATE ON operacao_relatoriomensal
  FOR EACH ROW EXECUTE FUNCTION sgi_relatorio_trava();

CREATE OR REPLACE FUNCTION sgi_nf_trava() RETURNS trigger AS $$
BEGIN
  IF (SELECT status FROM operacao_relatoriomensal WHERE id = NEW.relatorio_id) <> 'ATESTADO' THEN
    RAISE EXCEPTION 'SGI: nota fiscal só pode ser registrada após atesto do relatório';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER sgi_nf_trava BEFORE INSERT ON operacao_registronotafiscal
  FOR EACH ROW EXECUTE FUNCTION sgi_nf_trava();

-- Notificação: conteúdo e destinatários imutáveis (só status de envio muda).
CREATE OR REPLACE FUNCTION sgi_notificacao_trava() RETURNS trigger AS $$
BEGIN
  IF (NEW.chave_idempotencia, NEW.assunto, NEW.corpo, NEW.destinatarios, NEW.tipo, NEW.criada_em, NEW.contrato_id)
     IS DISTINCT FROM
     (OLD.chave_idempotencia, OLD.assunto, OLD.corpo, OLD.destinatarios, OLD.tipo, OLD.criada_em, OLD.contrato_id) THEN
    RAISE EXCEPTION 'SGI: conteúdo da notificação é imutável';
  END IF;
  IF OLD.status = 'ENVIADA' AND NEW.status <> 'ENVIADA' THEN
    RAISE EXCEPTION 'SGI: notificação enviada não pode voltar a pendente (evita duplicidade)';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER sgi_notificacao_trava BEFORE UPDATE ON operacao_notificacao
  FOR EACH ROW EXECUTE FUNCTION sgi_notificacao_trava();

-- Chamado: abertura e primeira resposta imutáveis; concluído não muda.
CREATE OR REPLACE FUNCTION sgi_chamado_trava() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'CONCLUIDO' THEN RAISE EXCEPTION 'SGI: chamado concluído é imutável'; END IF;
  IF NEW.aberto_em IS DISTINCT FROM OLD.aberto_em OR NEW.aberto_por_id IS DISTINCT FROM OLD.aberto_por_id
     OR NEW.codigo IS DISTINCT FROM OLD.codigo OR NEW.descricao IS DISTINCT FROM OLD.descricao
     OR (OLD.primeira_resposta_em IS NOT NULL AND NEW.primeira_resposta_em IS DISTINCT FROM OLD.primeira_resposta_em) THEN
    RAISE EXCEPTION 'SGI: abertura e primeira resposta do chamado são imutáveis';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER sgi_chamado_trava BEFORE UPDATE ON operacao_chamado
  FOR EACH ROW EXECUTE FUNCTION sgi_chamado_trava();

-- Feriado: a data não muda (desativa-se e cadastra-se outra).
CREATE OR REPLACE FUNCTION sgi_feriado_trava() RETURNS trigger AS $$
BEGIN
  IF NEW.data IS DISTINCT FROM OLD.data OR NEW.contrato_id IS DISTINCT FROM OLD.contrato_id THEN
    RAISE EXCEPTION 'SGI: data do feriado é imutável';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER sgi_feriado_trava BEFORE UPDATE ON operacao_feriado
  FOR EACH ROW EXECUTE FUNCTION sgi_feriado_trava();
"""


def _sql_genericos():
    partes = []
    for t in TABELAS_SEM_EXCLUSAO:
        partes.append(
            f"CREATE TRIGGER sgi_sem_exclusao BEFORE DELETE ON {t} FOR EACH ROW EXECUTE FUNCTION sgi_bloquear_exclusao();"
            f"CREATE TRIGGER sgi_sem_truncate BEFORE TRUNCATE ON {t} FOR EACH STATEMENT EXECUTE FUNCTION sgi_bloquear_exclusao();"
        )
    for t in TABELAS_SEM_UPDATE:
        partes.append(f"CREATE TRIGGER sgi_sem_update BEFORE UPDATE ON {t} FOR EACH ROW EXECUTE FUNCTION sgi_bloquear_alteracao();")
    return "\n".join(partes)


class Migration(migrations.Migration):
    dependencies = [("operacao", "0001_initial")]

    operations = [migrations.RunSQL(SQL + _sql_genericos(), reverse_sql=migrations.RunSQL.noop)]
