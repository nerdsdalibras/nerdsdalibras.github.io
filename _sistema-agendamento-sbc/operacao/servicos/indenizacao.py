"""Indenização por cancelamento tardio.

Nunca é gerada automaticamente. Pré-condições verificadas no servidor:
- agendamento cancelado e classificado como TARDIO ou AMBIGUO (este último
  exige análise do critério pela Prefeitura);
- atendimento previamente CONFIRMADO antes do cancelamento;
- cancelamento não feito pela contratada (fato imputável à contratada);
- comprovação de reserva de agenda/mobilização descrita (e opcionalmente anexada);
- decisão expressa do Fiscal/Gestor da Prefeitura, que atesta a comprovação e
  a ausência de fato imputável à contratada.

Valor de referência (se aprovado):
- remoto: 50% do tempo estimado;
- presencial: 100% do tempo estimado, limitado a 2 horas.
Fica em registro próprio, separado das horas efetivamente prestadas.
"""
import hashlib
import os
from decimal import ROUND_HALF_UP, Decimal

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from ..models import (
    Agendamento,
    ClassificacaoCancelamento,
    Modalidade,
    Parte,
    PedidoIndenizacao,
    Perfil,
    SituacaoIndenizacao,
    StatusAgendamento,
)
from . import auditoria, calendario
from .base import ErroRegra, exigir_mesmo_contrato, exigir_perfil, exigir_texto
from .parametros import parametro_vigente

EXTENSOES_ANEXO = {".pdf", ".png", ".jpg", ".jpeg"}


def referencia(ag):
    """(percentual, minutos de referência, horas de referência) — sem arredondar."""
    if ag.modalidade == Modalidade.REMOTO:
        pct = Decimal("50.00")
        minutos = Decimal(ag.duracao_prevista_min) * pct / 100
    else:
        pct = Decimal("100.00")
        minutos = Decimal(min(ag.duracao_prevista_min, 120))
    return pct, minutos, minutos / Decimal(60)


def verificar_elegibilidade(ag):
    """Retorna lista de impedimentos (vazia = pode ser solicitada para análise)."""
    imp = []
    if ag.status != StatusAgendamento.CANCELADO:
        imp.append("O agendamento não está cancelado.")
        return imp
    if ag.cancelamento_classificacao == ClassificacaoCancelamento.ANTECEDENCIA_SUPERIOR:
        imp.append("Cancelamento com antecedência superior: não há indenização.")
    if not ag.confirmado_em or ag.confirmado_em >= ag.cancelado_em:
        imp.append("O atendimento não estava confirmado antes do cancelamento.")
    if ag.cancelamento_parte == Parte.CONTRATADA:
        imp.append("Cancelamento registrado pela contratada (fato imputável à contratada).")
    if ag.indenizacoes.filter(situacao__in=[SituacaoIndenizacao.SOLICITADA, SituacaoIndenizacao.APROVADA]).exists():
        imp.append("Já existe pedido em análise ou aprovado.")
    return imp


ASSINATURAS = {".pdf": (b"%PDF",), ".png": (b"\x89PNG\r\n\x1a\n",), ".jpg": (b"\xff\xd8\xff",), ".jpeg": (b"\xff\xd8\xff",)}
TIPOS = {".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg"}


def _ler_anexo(arquivo):
    """Valida extensão, tamanho e assinatura real do arquivo; devolve (nome, sha256, bytes, tipo)."""
    nome = os.path.basename(arquivo.name)
    ext = os.path.splitext(nome)[1].lower()
    if ext not in EXTENSOES_ANEXO:
        raise ErroRegra("Anexo deve ser PDF, PNG ou JPG.")
    if arquivo.size > settings.ANEXO_TAMANHO_MAXIMO_MB * 1024 * 1024:
        raise ErroRegra(f"Anexo excede {settings.ANEXO_TAMANHO_MAXIMO_MB} MB.")
    conteudo = b"".join(arquivo.chunks())
    if not conteudo.startswith(ASSINATURAS[ext]):
        raise ErroRegra("O conteúdo do anexo não corresponde à extensão informada.")
    return nome, hashlib.sha256(conteudo).hexdigest(), conteudo, TIPOS[ext]


@transaction.atomic
def solicitar(ator, ag, comprovacao, anexo=None):
    exigir_perfil(ator, Perfil.OPERADOR)
    exigir_mesmo_contrato(ator, ag)
    ag = Agendamento.objects.select_for_update().get(pk=ag.pk)
    comprovacao = exigir_texto(comprovacao, "Comprovação da reserva de agenda/mobilização")
    impedimentos = verificar_elegibilidade(ag)
    if impedimentos:
        raise ErroRegra(" ".join(impedimentos))
    p = parametro_vigente(ag.contrato, calendario.local(ag.inicio_previsto).date())
    if p is None:
        raise ErroRegra("Não há parâmetro de preço aprovado vigente na data do evento.")
    pct, minutos, horas = referencia(ag)
    bruto = Decimal(p.preco_unitario_hora) * horas
    total = bruto.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    nome_original, sha, conteudo, tipo = "", "", None, ""
    if anexo:
        nome_original, sha, conteudo, tipo = _ler_anexo(anexo)
    memoria = (
        f"{ag.get_modalidade_display()}: {pct}% do tempo estimado ({ag.duracao_prevista_min} min)"
        + (", limitado a 120 min" if ag.modalidade == Modalidade.PRESENCIAL else "")
        + f" = {minutos} min = {horas.quantize(Decimal('0.0001'))} h × R$ {p.preco_unitario_hora} = R$ {bruto.quantize(Decimal('0.00000001'))}"
        f" → R$ {total} (ROUND_HALF_UP). Classificação do cancelamento: {ClassificacaoCancelamento(ag.cancelamento_classificacao).label}."
    )
    pedido = PedidoIndenizacao.objects.create(
        agendamento=ag,
        solicitado_por=ator.usuario,
        comprovacao=comprovacao,
        anexo_nome_original=nome_original,
        anexo_sha256=sha,
        anexo_conteudo=conteudo,
        anexo_tipo=tipo,
        parametro=p,
        percentual=pct,
        minutos_referencia=minutos.quantize(Decimal("0.01")),
        horas_referencia=horas.quantize(Decimal("0.0001")),
        valor_referencia=total,
        memoria_calculo=memoria,
    )
    auditoria.registrar(ator, "PedidoIndenizacao", pedido.pk, "SOLICITACAO", comprovacao, depois=auditoria.serializar(pedido))
    return pedido


@transaction.atomic
def decidir(ator, pedido, aprovar, reserva_comprovada, imputavel_contratada, parecer):
    exigir_perfil(ator, Perfil.FISCAL)
    exigir_mesmo_contrato(ator, pedido.agendamento)
    parecer = exigir_texto(parecer, "Parecer")
    p = PedidoIndenizacao.objects.select_for_update().get(pk=pedido.pk)
    if p.situacao != SituacaoIndenizacao.SOLICITADA:
        raise ErroRegra("Pedido já decidido.")
    if aprovar and (not reserva_comprovada or imputavel_contratada):
        raise ErroRegra("Aprovação exige comprovação de reserva/mobilização e ausência de fato imputável à contratada.")
    antes = auditoria.serializar(p)
    p.situacao = SituacaoIndenizacao.APROVADA if aprovar else SituacaoIndenizacao.INDEFERIDA
    p.reserva_comprovada, p.imputavel_contratada = bool(reserva_comprovada), bool(imputavel_contratada)
    p.decidido_por, p.decidido_em, p.parecer = ator.usuario, timezone.now(), parecer
    p.save()
    auditoria.registrar(ator, "PedidoIndenizacao", p.pk, "APROVACAO" if aprovar else "INDEFERIMENTO", parecer, antes, auditoria.serializar(p))
    return p
