"""Fila de intercorrências, substituições e validações.

Prazo de 30 minutos refere-se à PRIMEIRA RESPOSTA, não à resolução.
Primeira resposta = primeira interação de usuário diferente de quem abriu,
sendo da contratada quando o chamado foi aberto pela Prefeitura.
"""
import os

from django.db import transaction
from django.utils import timezone

from ..models import Chamado, Contrato, InteracaoChamado, Parte, Perfil, PARTE_DO_PERFIL, StatusChamado, TipoChamado, Vinculo
from . import auditoria
from .base import ErroRegra, exigir_mesmo_contrato, exigir_perfil, exigir_texto

PRAZO_RESPOSTA_MIN = 30
ALERTA_MIN = int(os.environ.get("SLA_ALERTA_MINUTOS", "20"))


def situacao_sla(chamado, agora=None):
    agora = agora or timezone.now()
    if chamado.primeira_resposta_em:
        minutos = int((chamado.primeira_resposta_em - chamado.aberto_em).total_seconds() // 60)
        return {"nivel": "RESPONDIDO", "minutos": minutos, "no_prazo": minutos <= PRAZO_RESPOSTA_MIN}
    minutos = int((agora - chamado.aberto_em).total_seconds() // 60)
    if minutos >= PRAZO_RESPOSTA_MIN:
        nivel = "VENCIDO"
    elif minutos >= ALERTA_MIN:
        nivel = "ATENCAO"
    else:
        nivel = "NO_PRAZO"
    return {"nivel": nivel, "minutos": minutos, "no_prazo": minutos < PRAZO_RESPOSTA_MIN}


@transaction.atomic
def abrir(ator, tipo, titulo, descricao, agendamento=None):
    exigir_perfil(ator, Perfil.SOLICITANTE, Perfil.FISCAL, Perfil.OPERADOR)
    if tipo not in TipoChamado.values:
        raise ErroRegra("Tipo inválido.")
    if agendamento is not None:
        exigir_mesmo_contrato(ator, agendamento)
    contrato = Contrato.objects.select_for_update().get(pk=ator.contrato.pk)
    n = contrato.proximo_numero_chamado
    contrato.proximo_numero_chamado += 1
    contrato.save(update_fields=["proximo_numero_chamado"])
    c = Chamado.objects.create(
        contrato=contrato,
        codigo=f"{contrato.prefixo_codigo}-CH-{timezone.localtime().year}-{n:05d}",
        tipo=tipo,
        agendamento=agendamento,
        titulo=exigir_texto(titulo, "Título"),
        descricao=exigir_texto(descricao, "Descrição"),
        aberto_por=ator.usuario,
        aberto_em=timezone.now(),
    )
    auditoria.registrar(ator, "Chamado", c.pk, "ABERTURA", descricao, depois=auditoria.serializar(c))
    return c


def _parte_do_usuario(contrato, usuario):
    v = Vinculo.objects.filter(contrato=contrato, usuario=usuario).first()
    return PARTE_DO_PERFIL.get(v.perfil) if v else None


@transaction.atomic
def responder(ator, chamado, texto):
    exigir_mesmo_contrato(ator, chamado)
    c = Chamado.objects.select_for_update().get(pk=chamado.pk)
    if c.status == StatusChamado.CONCLUIDO:
        raise ErroRegra("Chamado concluído.")
    if ator.perfil == Perfil.SOLICITANTE and c.aberto_por_id != ator.usuario.pk:
        raise ErroRegra("Sem acesso a este chamado.")
    texto = exigir_texto(texto, "Texto")
    i = InteracaoChamado.objects.create(chamado=c, autor=ator.usuario, texto=texto, em=timezone.now())
    antes = auditoria.serializar(c)
    conta_como_resposta = ator.usuario.pk != c.aberto_por_id and (
        _parte_do_usuario(c.contrato, c.aberto_por) == Parte.CONTRATADA or ator.parte == Parte.CONTRATADA
    )
    if c.primeira_resposta_em is None and conta_como_resposta:
        c.primeira_resposta_em, c.primeira_resposta_por = i.em, ator.usuario
        c.status = StatusChamado.EM_ATENDIMENTO
        if c.responsavel_id is None and ator.parte == Parte.CONTRATADA:
            c.responsavel = ator.usuario
        c.save()
    auditoria.registrar(ator, "Chamado", c.pk, "INTERACAO", texto, antes, auditoria.serializar(c))
    return i


@transaction.atomic
def atribuir(ator, chamado, responsavel):
    exigir_perfil(ator, Perfil.OPERADOR)
    exigir_mesmo_contrato(ator, chamado)
    if not Vinculo.objects.filter(contrato=ator.contrato, usuario=responsavel, ativo=True, perfil=Perfil.OPERADOR).exists():
        raise ErroRegra("Responsável deve ser operador ativo deste contrato.")
    c = Chamado.objects.select_for_update().get(pk=chamado.pk)
    if c.status == StatusChamado.CONCLUIDO:
        raise ErroRegra("Chamado concluído.")
    antes = auditoria.serializar(c)
    c.responsavel = responsavel
    c.save()
    auditoria.registrar(ator, "Chamado", c.pk, "ATRIBUICAO", f"Responsável: {responsavel.nome_completo}", antes, auditoria.serializar(c))
    return c


@transaction.atomic
def concluir(ator, chamado, solucao):
    exigir_perfil(ator, Perfil.OPERADOR, Perfil.FISCAL)
    exigir_mesmo_contrato(ator, chamado)
    solucao = exigir_texto(solucao, "Descrição da conclusão")
    c = Chamado.objects.select_for_update().get(pk=chamado.pk)
    if c.status == StatusChamado.CONCLUIDO:
        raise ErroRegra("Chamado já concluído.")
    InteracaoChamado.objects.create(chamado=c, autor=ator.usuario, texto=f"[Conclusão] {solucao}", em=timezone.now())
    antes = auditoria.serializar(c)
    agora = timezone.now()
    if c.primeira_resposta_em is None and ator.usuario.pk != c.aberto_por_id:
        c.primeira_resposta_em, c.primeira_resposta_por = agora, ator.usuario
    c.status, c.concluido_em, c.concluido_por = StatusChamado.CONCLUIDO, agora, ator.usuario
    c.save()
    auditoria.registrar(ator, "Chamado", c.pk, "CONCLUSAO", solucao, antes, auditoria.serializar(c))
    return c
