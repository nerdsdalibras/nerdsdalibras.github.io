from django.db import migrations

SQL = """
CREATE OR REPLACE FUNCTION sgi_indenizacao_trava() RETURNS trigger AS $$
BEGIN
  IF OLD.situacao <> 'SOLICITADA' THEN
    RAISE EXCEPTION 'SGI: pedido de indenização decidido é imutável';
  END IF;
  IF (NEW.valor_referencia, NEW.horas_referencia, NEW.minutos_referencia, NEW.percentual, NEW.parametro_id,
      NEW.comprovacao, NEW.anexo, NEW.anexo_sha256, NEW.anexo_conteudo, NEW.anexo_nome_original, NEW.anexo_tipo,
      NEW.agendamento_id)
     IS DISTINCT FROM
     (OLD.valor_referencia, OLD.horas_referencia, OLD.minutos_referencia, OLD.percentual, OLD.parametro_id,
      OLD.comprovacao, OLD.anexo, OLD.anexo_sha256, OLD.anexo_conteudo, OLD.anexo_nome_original, OLD.anexo_tipo,
      OLD.agendamento_id) THEN
    RAISE EXCEPTION 'SGI: dados do pedido de indenização são imutáveis';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
"""


def preencher_cidades(apps, schema_editor):
    Contrato = apps.get_model("operacao", "Contrato")
    for c in Contrato.objects.filter(cidade=""):
        if c.prefixo_codigo == "SBC" or "São Bernardo" in c.orgao:
            c.cidade, c.uf = "São Bernardo do Campo", "SP"
            c.save(update_fields=["cidade", "uf"])


class Migration(migrations.Migration):
    dependencies = [("operacao", "0004_contrato_cidade_contrato_uf_and_more")]
    operations = [
        migrations.RunPython(preencher_cidades, migrations.RunPython.noop),
        migrations.RunSQL(SQL, reverse_sql=migrations.RunSQL.noop),
    ]
