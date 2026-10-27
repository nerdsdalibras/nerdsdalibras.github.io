"""Parâmetros de medição versionados. Só entram em vigor com aprovação da Prefeitura."""
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from ..models import ParametroMedicao, Perfil, PoliticaRetencao, SituacaoAprovacao
from . import auditoria
from .base import ErroRegra, exigir_mesmo_contrato, exigir_perfil, exigir_texto

# Tabela expressa do edital (excedente sobre o tempo agendado, em minutos).
FAIXAS_EDITAL = [
    {"de": 1, "ate": 10, "acrescimo_min": 0},
    {"de": 11, "ate": 30, "acrescimo_min": 30},
    {"de": 31, "ate": 40, "acrescimo_min": 30},
    {"de": 41, "ate": 60, "acrescimo_min": 60},
]
PRECO_INICIAL_PROPOSTA = Decimal("156.6000")


def validar_faixas(faixas):
    if not isinstance(faixas, list) or not faixas:
        raise ErroRegra("Informe ao menos uma faixa de excedente.")
    anterior = 0
    for f in faixas:
        try:
            de, ate, ac = int(f["de"]), int(f["ate"]), int(f["acrescimo_min"])
        except (KeyError, TypeError, ValueError):
            raise ErroRegra("Faixa inválida: use 'de', 'ate' e 'acrescimo_min' inteiros.")
        if de < 1 or ate < de or ac < 0 or de <= anterior:
            raise ErroRegra(f"Faixa inválida ou sobreposta: {f}.")
        anterior = ate
    return [{"de": int(f["de"]), "ate": int(f["ate"]), "acrescimo_min": int(f["acrescimo_min"])} for f in faixas]


def validar_preco(valor):
    try:
        preco = Decimal(str(valor).replace(",", "."))
    except InvalidOperation:
        raise ErroRegra("Preço unitário inválido.")
    if preco <= 0 or preco != preco.quantize(Decimal("0.0001")):
        raise ErroRegra("Preço unitário deve ser positivo, com até 4 casas decimais.")
    return preco.quantize(Decimal("0.0001"))


@transaction.atomic
def propor_parametro(ator, preco, faixas, vigente_desde, justificativa):
    exigir_perfil(ator, Perfil.OPERADOR, Perfil.FISCAL)
    justificativa = exigir_texto(justificativa, "Justificativa")
    versao = (ParametroMedicao.objects.filter(contrato=ator.contrato).aggregate(m=Max("versao"))["m"] or 0) + 1
    p = ParametroMedicao.objects.create(
        contrato=ator.contrato,
        versao=versao,
        preco_unitario_hora=validar_preco(preco),
        faixas_excedente=validar_faixas(faixas),
        vigente_desde=vigente_desde,
        justificativa=justificativa,
        proposto_por=ator.usuario,
    )
    auditoria.registrar(ator, "ParametroMedicao", p.pk, "PROPOSTA", justificativa, depois=auditoria.serializar(p))
    return p


@transaction.atomic
def decidir_parametro(ator, parametro, aprovar, parecer):
    exigir_perfil(ator, Perfil.FISCAL)
    exigir_mesmo_contrato(ator, parametro)
    parecer = exigir_texto(parecer, "Parecer")
    p = ParametroMedicao.objects.select_for_update().get(pk=parametro.pk)
    if p.situacao != SituacaoAprovacao.PROPOSTO:
        raise ErroRegra("Esta versão já foi decidida e não pode mudar.")
    antes = auditoria.serializar(p)
    p.situacao = SituacaoAprovacao.APROVADO if aprovar else SituacaoAprovacao.REJEITADO
    p.decidido_por = ator.usuario
    p.decidido_em = timezone.now()
    p.parecer = parecer
    p.save()
    auditoria.registrar(ator, "ParametroMedicao", p.pk, "APROVACAO" if aprovar else "REJEICAO", parecer, antes, auditoria.serializar(p))
    return p


def parametro_vigente(contrato, data):
    return (
        ParametroMedicao.objects.filter(contrato=contrato, situacao=SituacaoAprovacao.APROVADO, vigente_desde__lte=data)
        .order_by("-vigente_desde", "-versao")
        .first()
    )


@transaction.atomic
def propor_retencao(ator, prazo_descricao, fundamento):
    exigir_perfil(ator, Perfil.OPERADOR, Perfil.FISCAL, Perfil.ADMIN_TECNICO)
    versao = (PoliticaRetencao.objects.filter(contrato=ator.contrato).aggregate(m=Max("versao"))["m"] or 0) + 1
    p = PoliticaRetencao.objects.create(
        contrato=ator.contrato,
        versao=versao,
        prazo_descricao=exigir_texto(prazo_descricao, "Prazo"),
        fundamento=exigir_texto(fundamento, "Fundamento"),
        proposto_por=ator.usuario,
    )
    auditoria.registrar(ator, "PoliticaRetencao", p.pk, "PROPOSTA", fundamento, depois=auditoria.serializar(p))
    return p


@transaction.atomic
def decidir_retencao(ator, politica, aprovar, parecer):
    exigir_perfil(ator, Perfil.FISCAL)
    exigir_mesmo_contrato(ator, politica)
    parecer = exigir_texto(parecer, "Parecer")
    p = PoliticaRetencao.objects.select_for_update().get(pk=politica.pk)
    if p.situacao != SituacaoAprovacao.PROPOSTO:
        raise ErroRegra("Esta versão já foi decidida.")
    antes = auditoria.serializar(p)
    p.situacao = SituacaoAprovacao.APROVADO if aprovar else SituacaoAprovacao.REJEITADO
    p.decidido_por, p.decidido_em, p.parecer = ator.usuario, timezone.now(), parecer
    p.save()
    auditoria.registrar(ator, "PoliticaRetencao", p.pk, "APROVACAO" if aprovar else "REJEICAO", parecer, antes, auditoria.serializar(p))
    return p
