"""Corrige a trava da política de retenção: função própria, sem referenciar
campos que só existem em ParametroMedicao (PL/pgSQL não garante curto-circuito)."""
from django.db import migrations

SQL = """
CREATE OR REPLACE FUNCTION sgi_parametro_trava() RETURNS trigger AS $$
BEGIN
  IF OLD.situacao <> 'PROPOSTO' THEN
    RAISE EXCEPTION 'SGI: versão % já decidida é imutável', OLD.versao;
  END IF;
  IF (NEW.preco_unitario_hora, NEW.faixas_excedente, NEW.vigente_desde, NEW.versao, NEW.casas_decimais_total,
      NEW.modo_arredondamento, NEW.contrato_id, NEW.justificativa)
     IS DISTINCT FROM
     (OLD.preco_unitario_hora, OLD.faixas_excedente, OLD.vigente_desde, OLD.versao, OLD.casas_decimais_total,
      OLD.modo_arredondamento, OLD.contrato_id, OLD.justificativa) THEN
    RAISE EXCEPTION 'SGI: conteúdo de versão proposta não pode ser editado; proponha nova versão';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sgi_retencao_trava() RETURNS trigger AS $$
BEGIN
  IF OLD.situacao <> 'PROPOSTO' THEN
    RAISE EXCEPTION 'SGI: versão % já decidida é imutável', OLD.versao;
  END IF;
  IF (NEW.prazo_descricao, NEW.fundamento, NEW.versao, NEW.contrato_id, NEW.proposto_por_id, NEW.proposto_em)
     IS DISTINCT FROM
     (OLD.prazo_descricao, OLD.fundamento, OLD.versao, OLD.contrato_id, OLD.proposto_por_id, OLD.proposto_em) THEN
    RAISE EXCEPTION 'SGI: conteúdo de versão proposta não pode ser editado; proponha nova versão';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER sgi_retencao_trava ON operacao_politicaretencao;
CREATE TRIGGER sgi_retencao_trava BEFORE UPDATE ON operacao_politicaretencao
  FOR EACH ROW EXECUTE FUNCTION sgi_retencao_trava();
"""


class Migration(migrations.Migration):
    dependencies = [("operacao", "0002_triggers_imutabilidade")]
    operations = [migrations.RunSQL(SQL, reverse_sql=migrations.RunSQL.noop)]
