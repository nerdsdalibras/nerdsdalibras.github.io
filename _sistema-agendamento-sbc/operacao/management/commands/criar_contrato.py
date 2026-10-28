from datetime import date

from django.core.management.base import BaseCommand
from django.db import transaction

from operacao.models import Contrato, Feriado, ParametroMedicao
from operacao.servicos import auditoria
from operacao.servicos.auditoria import AtorSistema
from operacao.servicos.parametros import FAIXAS_EDITAL, PRECO_INICIAL_PROPOSTA
from operacao.servicos.plataforma import FERIADOS_ESTADUAIS, FERIADOS_NACIONAIS

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
                cidade="São Bernardo do Campo",
                uf="SP",
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
        for d, desc in FERIADOS_NACIONAIS + FERIADOS_ESTADUAIS["SP"]:
            f = Feriado.objects.create(contrato=contrato, data=date.fromisoformat(d), descricao=desc)
            auditoria.registrar(ator, "Feriado", f.pk, "INCLUSAO", "Carga inicial (feriado nacional/estadual)", depois=auditoria.serializar(f))
        p = ParametroMedicao.objects.create(
            contrato=contrato, versao=1, preco_unitario_hora=PRECO_INICIAL_PROPOSTA, faixas_excedente=FAIXAS_EDITAL,
            vigente_desde=o["vigencia_inicio"] or date(2026, 1, 1),
            justificativa="Valor inicial da proposta, sujeito ao resultado da licitação. Tabela de excedentes do edital.",
        )
        auditoria.registrar(ator, "ParametroMedicao", p.pk, "PROPOSTA", p.justificativa, depois=auditoria.serializar(p))
        self.stdout.write(self.style.SUCCESS(f"Contrato {contrato.codigo} criado. Parâmetro v1 aguarda aprovação do Fiscal."))
