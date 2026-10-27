from datetime import date

from django.core.management.base import BaseCommand
from django.db import transaction

from operacao.models import Contrato, Feriado, ParametroMedicao
from operacao.servicos import auditoria
from operacao.servicos.auditoria import AtorSistema
from operacao.servicos.parametros import FAIXAS_EDITAL, PRECO_INICIAL_PROPOSTA

# Feriados nacionais e estadual (SP) de 2026–2027. Municipais de São Bernardo do
# Campo e pontos facultativos NÃO são carregados: devem ser cadastrados pelo
# Fiscal conforme decreto municipal (pendência documentada).
FERIADOS = [
    ("2026-01-01", "Confraternização Universal"), ("2026-04-03", "Paixão de Cristo"),
    ("2026-04-21", "Tiradentes"), ("2026-05-01", "Dia do Trabalho"),
    ("2026-07-09", "Revolução Constitucionalista (feriado estadual SP)"), ("2026-09-07", "Independência do Brasil"),
    ("2026-10-12", "Nossa Senhora Aparecida"), ("2026-11-02", "Finados"),
    ("2026-11-15", "Proclamação da República"), ("2026-11-20", "Dia Nacional de Zumbi e da Consciência Negra"),
    ("2026-12-25", "Natal"),
    ("2027-01-01", "Confraternização Universal"), ("2027-03-26", "Paixão de Cristo"),
    ("2027-04-21", "Tiradentes"), ("2027-05-01", "Dia do Trabalho"),
    ("2027-07-09", "Revolução Constitucionalista (feriado estadual SP)"), ("2027-09-07", "Independência do Brasil"),
    ("2027-10-12", "Nossa Senhora Aparecida"), ("2027-11-02", "Finados"),
    ("2027-11-15", "Proclamação da República"), ("2027-11-20", "Dia Nacional de Zumbi e da Consciência Negra"),
    ("2027-12-25", "Natal"),
]


class Command(BaseCommand):
    help = "Cria o contrato SBC (Pregão 246/2026), feriados base e o parâmetro v1 PROPOSTO (R$ 156,6000)."

    def add_arguments(self, parser):
        parser.add_argument("--codigo", default="pmsbc-se-pe-246-2026")
        parser.add_argument("--vigencia-inicio", type=date.fromisoformat)
        parser.add_argument("--vigencia-fim", type=date.fromisoformat)

    @transaction.atomic
    def handle(self, *args, **o):
        contrato, criado = Contrato.objects.get_or_create(
            codigo=o["codigo"],
            defaults=dict(
                orgao="Prefeitura de São Bernardo do Campo — Secretaria de Educação",
                contratada="Nerds da Libras",
                referencia="Pregão Eletrônico nº 246/2026",
                objeto="Serviços de tradução e interpretação de Libras.",
                prefixo_codigo="SBC",
                vigencia_inicio=o["vigencia_inicio"],
                vigencia_fim=o["vigencia_fim"],
            ),
        )
        if not criado:
            self.stdout.write("Contrato já existe; nada a fazer.")
            return
        ator = AtorSistema(contrato, "Sistema (carga inicial)")
        auditoria.registrar(ator, "Contrato", contrato.pk, "CRIACAO", "Carga inicial", depois=auditoria.serializar(contrato))
        for d, desc in FERIADOS:
            f = Feriado.objects.create(contrato=contrato, data=date.fromisoformat(d), descricao=desc)
            auditoria.registrar(ator, "Feriado", f.pk, "INCLUSAO", "Carga inicial (feriado nacional/estadual)", depois=auditoria.serializar(f))
        p = ParametroMedicao.objects.create(
            contrato=contrato, versao=1, preco_unitario_hora=PRECO_INICIAL_PROPOSTA, faixas_excedente=FAIXAS_EDITAL,
            vigente_desde=o["vigencia_inicio"] or date(2026, 1, 1),
            justificativa="Valor inicial da proposta, sujeito ao resultado da licitação. Tabela de excedentes do edital.",
        )
        auditoria.registrar(ator, "ParametroMedicao", p.pk, "PROPOSTA", p.justificativa, depois=auditoria.serializar(p))
        self.stdout.write(self.style.SUCCESS(f"Contrato {contrato.codigo} criado. Parâmetro v1 aguarda aprovação do Fiscal."))
