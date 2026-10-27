"""Conferência e homologação pelas duas partes.

Cada homologação guarda o estado conferido e seu hash SHA-256. O agendamento só
fica HOMOLOGADO quando Prefeitura e contratada homologaram o MESMO estado. Se o
estado muda depois de uma homologação parcial (ex.: correção de horário), o
hash deixa de coincidir e a homologação anterior perde efeito (mas permanece
registrada como evidência). Após HOMOLOGADO, triggers do banco impedem alteração.
"""
import hashlib
import json

from django.db import transaction
from django.utils import timezone

from ..models import Agendamento, Homologacao, Parte, Perfil, StatusAgendamento
from . import auditoria
from .base import ErroRegra, exigir_mesmo_contrato, exigir_perfil
from .medicao import medicao_vigente


def estado(ag):
    m = medicao_vigente(ag)
    return {
        "agendamento": str(ag.pk),
        "codigo": ag.codigo,
        "versao_registro": ag.versao,
        "inicio_previsto": ag.inicio_previsto.isoformat(),
        "duracao_prevista_min": ag.duracao_prevista_min,
        "inicio_realizado": ag.inicio_realizado.isoformat() if ag.inicio_realizado else None,
        "fim_realizado": ag.fim_realizado.isoformat() if ag.fim_realizado else None,
        "interpretes": sorted(e.interprete.nome_completo for e in ag.escalas_ativas()),
        "medicao": None
        if m is None
        else {
            "versao": m.versao,
            "parametro_versao": m.parametro.versao,
            "minutos_faturaveis": m.minutos_faturaveis,
            "horas_faturaveis": str(m.horas_faturaveis),
            "valor_total": str(m.valor_total),
        },
    }


def hash_estado(dados):
    return hashlib.sha256(json.dumps(dados, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def homologacoes_validas(ag):
    h = hash_estado(estado(ag))
    return {x.parte: x for x in ag.homologacoes.filter(hash_estado=h).order_by("em")}


@transaction.atomic
def homologar(ator, ag, observacao=""):
    exigir_perfil(ator, Perfil.FISCAL, Perfil.OPERADOR)
    exigir_mesmo_contrato(ator, ag)
    ag = Agendamento.objects.select_for_update().get(pk=ag.pk)
    if ag.status != StatusAgendamento.REALIZADO:
        raise ErroRegra("Só atendimentos realizados podem ser homologados.")
    dados = estado(ag)
    if dados["medicao"] is None:
        raise ErroRegra("Não há medição válida (pendência de regra ou medição fundamentada não aprovada).")
    h = hash_estado(dados)
    if ag.homologacoes.filter(parte=ator.parte, hash_estado=h).exists():
        raise ErroRegra("Sua parte já homologou este estado do atendimento.")
    hom = Homologacao.objects.create(
        agendamento=ag, parte=ator.parte, usuario=ator.usuario, hash_estado=h, estado_conferido=dados, observacao=observacao or ""
    )
    auditoria.registrar(ator, "Homologacao", hom.pk, f"HOMOLOGACAO_{ator.parte}", observacao, depois={"hash_estado": h, **dados})
    validas = homologacoes_validas(ag)
    if Parte.PREFEITURA in validas and Parte.CONTRATADA in validas:
        antes = auditoria.serializar(ag)
        ag.status = StatusAgendamento.HOMOLOGADO
        ag.homologado_em = timezone.now()
        ag.save()
        auditoria.registrar(ator, "Agendamento", ag.pk, "STATUS_HOMOLOGADO", "Homologado pelas duas partes", antes, auditoria.serializar(ag))
    return hom
