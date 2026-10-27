"""Medição de horas faturáveis.

Regras (edital):
- unidade faturável = hora de EVENTO; o número de intérpretes não altera as horas;
- excedente sobre o tempo agendado segue a tabela expressa (parametrizada e versionada);
- casos não definidos (excedente > 60 min, atendimento mais curto que o agendado,
  duração agendada fracionada/não múltipla de 60 min) NÃO são extrapolados:
  geram PENDENTE_REGRA e exigem medição fundamentada aprovada pela Prefeitura.

Arredondamento: valor bruto = preço unitário (4 casas) × minutos faturáveis / 60,
calculado em Decimal sem perda; o valor total é arredondado para 2 casas
(centavos) com ROUND_HALF_UP. Os dois valores ficam gravados.
"""
from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from ..models import Agendamento, Medicao, Perfil, SITUACOES_MEDICAO_VALIDAS, SituacaoMedicao, StatusAgendamento
from . import auditoria
from .base import ErroRegra, exigir_mesmo_contrato, exigir_perfil, exigir_texto
from .calendario import local
from .parametros import parametro_vigente

PENDENCIAS = {
    "DURACAO_FRACIONADA": "Duração agendada não é múltipla de 60 minutos (regra de duração fracionada não definida no edital).",
    "ATENDIMENTO_MAIS_CURTO": "Atendimento realizado em tempo inferior ao agendado (regra não definida no edital).",
    "EXCEDENTE_ACIMA_DA_TABELA": "Excedente superior ao limite da tabela (acima de 60 minutos não está definido no edital).",
    "EXCEDENTE_SEM_FAIXA": "Excedente não se enquadra em nenhuma faixa da tabela vigente.",
}


def valores(preco, minutos, casas=2):
    horas = (Decimal(minutos) / Decimal(60)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
    bruto = (Decimal(preco) * Decimal(minutos) / Decimal(60)).quantize(Decimal("0.00000001"), rounding=ROUND_HALF_UP)
    total = bruto.quantize(Decimal(1).scaleb(-casas), rounding=ROUND_HALF_UP)
    return horas, bruto, total


def calcular(minutos_previstos, minutos_realizados, faixas, preco, casas=2):
    """Função pura de cálculo. Não depende de banco."""
    excedente = minutos_realizados - minutos_previstos
    pendencias = []
    if minutos_previstos % 60 != 0:
        pendencias.append("DURACAO_FRACIONADA")
    acrescimo = None
    if excedente < 0:
        pendencias.append("ATENDIMENTO_MAIS_CURTO")
    elif excedente == 0:
        acrescimo = 0
    else:
        limite = max(f["ate"] for f in faixas)
        if excedente > limite:
            pendencias.append("EXCEDENTE_ACIMA_DA_TABELA")
        else:
            faixa = next((f for f in faixas if f["de"] <= excedente <= f["ate"]), None)
            if faixa is None:
                pendencias.append("EXCEDENTE_SEM_FAIXA")
            else:
                acrescimo = faixa["acrescimo_min"]
    r = {
        "excedente_min": excedente,
        "acrescimo_min": None,
        "minutos_faturaveis": None,
        "horas_faturaveis": None,
        "valor_bruto": None,
        "valor_total": None,
        "pendencias": pendencias,
    }
    if pendencias:
        r["situacao"] = SituacaoMedicao.PENDENTE_REGRA
        r["regra_aplicada"] = "Pendência de regra: " + " ".join(PENDENCIAS[p] for p in pendencias)
        return r
    faturaveis = minutos_previstos + acrescimo
    horas, bruto, total = valores(preco, faturaveis, casas)
    r.update(
        situacao=SituacaoMedicao.AUTOMATICA,
        acrescimo_min=acrescimo,
        minutos_faturaveis=faturaveis,
        horas_faturaveis=horas,
        valor_bruto=bruto,
        valor_total=total,
        regra_aplicada=(
            f"Tempo agendado {minutos_previstos} min; realizado {minutos_realizados} min; "
            f"excedente {excedente} min → acréscimo {acrescimo} min (tabela do edital). "
            f"Faturável: {faturaveis} min = {horas} h × R$ {preco} = R$ {bruto} → arredondado R$ {total} "
            f"(ROUND_HALF_UP, {casas} casas). Hora de evento, independente do nº de intérpretes."
        ),
    )
    return r


def _proxima_versao(ag):
    return (ag.medicoes.aggregate(m=Max("versao"))["m"] or 0) + 1


def medicao_vigente(ag):
    """Última versão, se válida (automática ou fundamentada aprovada). Senão, None."""
    ultima = ag.medicoes.exclude(situacao=SituacaoMedicao.REJEITADA).order_by("-versao").first()
    if ultima and ultima.situacao in SITUACOES_MEDICAO_VALIDAS:
        return ultima
    return None


def _parametro(ag):
    p = parametro_vigente(ag.contrato, local(ag.inicio_previsto).date())
    if p is None:
        raise ErroRegra("Não há parâmetro de medição APROVADO pela Prefeitura vigente na data do evento.")
    return p


def precisa_revezamento(ag):
    real = ag.duracao_realizada_min or 0
    return ag.duracao_prevista_min > 60 or real > 60


def medir(ator, ag):
    """Gera nova versão de medição a partir dos horários previstos e realizados."""
    if ag.duracao_realizada_min is None:
        raise ErroRegra("Registre os horários realizados antes de medir.")
    p = _parametro(ag)
    r = calcular(ag.duracao_prevista_min, ag.duracao_realizada_min, p.faixas_excedente, p.preco_unitario_hora, p.casas_decimais_total)
    alerta = precisa_revezamento(ag) and ag.escalas.filter(ativa=True).count() < 2
    m = Medicao.objects.create(
        agendamento=ag,
        versao=_proxima_versao(ag),
        parametro=p,
        minutos_previstos=ag.duracao_prevista_min,
        minutos_realizados=ag.duracao_realizada_min,
        preco_unitario=p.preco_unitario_hora,
        alerta_revezamento=alerta,
        criada_por=ator.usuario,
        **{k: r[k] for k in ("excedente_min", "acrescimo_min", "minutos_faturaveis", "horas_faturaveis",
                             "valor_bruto", "valor_total", "situacao", "pendencias", "regra_aplicada")},
    )
    auditoria.registrar(ator, "Medicao", m.pk, "MEDICAO_CALCULADA", r["regra_aplicada"], depois=auditoria.serializar(m))
    return m


@transaction.atomic
def propor_fundamentada(ator, ag, minutos_faturaveis, fundamentacao):
    exigir_perfil(ator, Perfil.OPERADOR)
    exigir_mesmo_contrato(ator, ag)
    ag = Agendamento.objects.select_for_update().get(pk=ag.pk)
    fundamentacao = exigir_texto(fundamentacao, "Fundamentação")
    ultima = ag.medicoes.order_by("-versao").first()
    if ag.status != StatusAgendamento.REALIZADO or ultima is None:
        raise ErroRegra("Medição fundamentada só é possível para atendimento realizado e já medido.")
    if ultima.situacao not in (SituacaoMedicao.PENDENTE_REGRA, SituacaoMedicao.REJEITADA):
        raise ErroRegra("Só há medição fundamentada quando a última medição está pendente de regra ou foi rejeitada.")
    try:
        minutos = int(minutos_faturaveis)
    except (TypeError, ValueError):
        raise ErroRegra("Minutos faturáveis inválidos.")
    if minutos <= 0:
        raise ErroRegra("Minutos faturáveis devem ser positivos.")
    p = _parametro(ag)
    horas, bruto, total = valores(p.preco_unitario_hora, minutos, p.casas_decimais_total)
    m = Medicao.objects.create(
        agendamento=ag,
        versao=_proxima_versao(ag),
        parametro=p,
        minutos_previstos=ag.duracao_prevista_min,
        minutos_realizados=ag.duracao_realizada_min,
        excedente_min=ag.duracao_realizada_min - ag.duracao_prevista_min,
        minutos_faturaveis=minutos,
        horas_faturaveis=horas,
        preco_unitario=p.preco_unitario_hora,
        valor_bruto=bruto,
        valor_total=total,
        situacao=SituacaoMedicao.PROPOSTA,
        pendencias=ultima.pendencias,
        regra_aplicada=f"Medição fundamentada proposta: {minutos} min = {horas} h × R$ {p.preco_unitario_hora} = R$ {total}.",
        alerta_revezamento=ultima.alerta_revezamento,
        fundamentacao=fundamentacao,
        criada_por=ator.usuario,
    )
    auditoria.registrar(ator, "Medicao", m.pk, "MEDICAO_FUNDAMENTADA_PROPOSTA", fundamentacao, depois=auditoria.serializar(m))
    return m


@transaction.atomic
def decidir_fundamentada(ator, medicao, aprovar, parecer):
    exigir_perfil(ator, Perfil.FISCAL)
    exigir_mesmo_contrato(ator, medicao.agendamento)
    parecer = exigir_texto(parecer, "Parecer")
    m = Medicao.objects.select_for_update().get(pk=medicao.pk)
    if m.situacao != SituacaoMedicao.PROPOSTA:
        raise ErroRegra("Esta medição não está aguardando decisão.")
    if m.agendamento.medicoes.filter(versao__gt=m.versao).exists():
        raise ErroRegra("Existe versão mais recente desta medição.")
    antes = auditoria.serializar(m)
    m.situacao = SituacaoMedicao.APROVADA if aprovar else SituacaoMedicao.REJEITADA
    m.decidida_por, m.decidida_em, m.parecer = ator.usuario, timezone.now(), parecer
    m.save()
    auditoria.registrar(ator, "Medicao", m.pk, "MEDICAO_APROVADA" if aprovar else "MEDICAO_REJEITADA", parecer, antes, auditoria.serializar(m))
    return m
