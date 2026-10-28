"""Relatório mensal: consolidação, submissão, conferência/atesto e registro de NF.

O conteúdo submetido é CONGELADO (JSON + hash SHA-256). Correções geram nova
versão após devolução; versões anteriores permanecem. O registro da nota fiscal
só é liberado após o atesto da Prefeitura.
"""
import hashlib
import json
from datetime import date
from decimal import Decimal

from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from ..models import (
    Agendamento,
    Chamado,
    Perfil,
    RegistroNotaFiscal,
    RelatorioMensal,
    SituacaoIndenizacao,
    StatusAgendamento,
    StatusRelatorio,
)
from . import auditoria, calendario
from .base import ErroRegra, exigir_mesmo_contrato, exigir_perfil, exigir_texto
from .medicao import PENDENCIAS, medicao_vigente

LAYOUT_VERSAO = "1.1"  # 1.1: memória de cálculo por atendimento e alerta de revezamento


def limites_mes(competencia):
    inicio = date(competencia.year, competencia.month, 1)
    proximo = date(inicio.year + (inicio.month // 12), inicio.month % 12 + 1, 1)
    return inicio, proximo


def prazo_limite(contrato, competencia):
    _, proximo = limites_mes(competencia)
    return calendario.n_esimo_dia_util(proximo.year, proximo.month, 2, calendario.feriados_do_contrato(contrato))


def _fmt(dt):
    return calendario.local(dt).strftime("%d/%m/%Y %H:%M") if dt else ""


def consolidar(contrato, competencia):
    inicio, proximo = limites_mes(competencia)
    ags = (
        Agendamento.objects.filter(
            contrato=contrato,
            inicio_previsto__date__gte=inicio,
            inicio_previsto__date__lt=proximo,
        )
        .prefetch_related("escalas__interprete", "medicoes", "indenizacoes")
        .order_by("inicio_previsto")
    )
    itens, indenizacoes, pendencias = [], [], []
    total_horas, total_valor, total_indenizacao = Decimal("0"), Decimal("0"), Decimal("0")
    for ag in ags:
        m = medicao_vigente(ag) if ag.status in (StatusAgendamento.REALIZADO, StatusAgendamento.HOMOLOGADO) else None
        ultima = max(ag.medicoes.all(), key=lambda x: x.versao, default=None)
        item = {
            "codigo": ag.codigo,
            "evento": ag.titulo,
            "unidade": ag.unidade_solicitante,
            "modalidade": ag.get_modalidade_display(),
            "local": ag.local,
            "status": ag.get_status_display(),
            "inicio_previsto": _fmt(ag.inicio_previsto),
            "duracao_prevista_min": ag.duracao_prevista_min,
            "inicio_realizado": _fmt(ag.inicio_realizado),
            "fim_realizado": _fmt(ag.fim_realizado),
            "interpretes": sorted({e.interprete.nome_completo for e in ag.escalas.all() if e.ativa}),
            "fora_do_prazo_antecedencia": ag.fora_do_prazo,
            "minutos_faturaveis": m.minutos_faturaveis if m else None,
            "horas_faturaveis": str(m.horas_faturaveis) if m else None,
            "valor": str(m.valor_total) if m else None,
            "medicao_versao": m.versao if m else None,
            "medicao_situacao": m.get_situacao_display() if m else None,
            "parametro_versao": m.parametro.versao if m else None,
            "preco_unitario": str(m.preco_unitario) if m else None,
            "minutos_previstos": m.minutos_previstos if m else None,
            "minutos_realizados": m.minutos_realizados if m else ag.duracao_realizada_min,
            "excedente_min": m.excedente_min if m else None,
            "acrescimo_min": m.acrescimo_min if m else None,
            "valor_bruto": str(m.valor_bruto) if m else None,
            "regra_aplicada": m.regra_aplicada if m else None,
            "fundamentacao": m.fundamentacao if m else "",
            "alerta_revezamento": bool(ultima and ultima.alerta_revezamento),
            "homologado": ag.status == StatusAgendamento.HOMOLOGADO,
        }
        if ag.status == StatusAgendamento.CANCELADO:
            item["cancelamento"] = {
                "em": _fmt(ag.cancelado_em),
                "parte": ag.cancelamento_parte,
                "justificativa": ag.cancelamento_justificativa,
                "classificacao": ag.get_cancelamento_classificacao_display(),
            }
        if ag.status == StatusAgendamento.REALIZADO and m is None:
            motivos = [PENDENCIAS.get(p, p) for p in (ultima.pendencias if ultima else [])] or ["Medição não aprovada."]
            pendencias.append({"codigo": ag.codigo, "motivos": motivos})
        if m:
            total_horas += m.horas_faturaveis
            total_valor += m.valor_total
        for ind in ag.indenizacoes.all():
            if ind.situacao == SituacaoIndenizacao.APROVADA:
                indenizacoes.append(
                    {"codigo": ag.codigo, "horas_referencia": str(ind.horas_referencia), "valor": str(ind.valor_referencia), "memoria": ind.memoria_calculo}
                )
                total_indenizacao += ind.valor_referencia
        itens.append(item)
    chamados = [
        {
            "codigo": c.codigo,
            "tipo": c.get_tipo_display(),
            "titulo": c.titulo,
            "aberto_em": _fmt(c.aberto_em),
            "primeira_resposta_em": _fmt(c.primeira_resposta_em),
            "concluido_em": _fmt(c.concluido_em),
            "status": c.get_status_display(),
        }
        for c in Chamado.objects.filter(contrato=contrato, aberto_em__date__gte=inicio, aberto_em__date__lt=proximo).order_by("aberto_em")
    ]
    return {
        "contrato": str(contrato),
        "competencia": inicio.strftime("%m/%Y"),
        "layout_versao": LAYOUT_VERSAO,
        "gerado_em": _fmt(timezone.now()),
        "atendimentos": itens,
        "indenizacoes_aprovadas": indenizacoes,
        "pendencias_medicao": pendencias,
        "ocorrencias": chamados,
        "totais": {
            "horas_prestadas": str(total_horas),
            "valor_horas_prestadas": str(total_valor),
            "valor_indenizacoes": str(total_indenizacao),
            "valor_geral": str(total_valor + total_indenizacao),
            "qtd_atendimentos": len(itens),
            "qtd_pendencias": len(pendencias),
        },
        "observacao": "Horas prestadas e indenizações são apresentadas separadamente. "
        "Itens com pendência de regra não entram nos totais.",
    }


def hash_conteudo(conteudo):
    return hashlib.sha256(json.dumps(conteudo, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


@transaction.atomic
def submeter(ator, competencia):
    exigir_perfil(ator, Perfil.OPERADOR)
    inicio, proximo = limites_mes(competencia)
    hoje = calendario.local(timezone.now()).date()
    if hoje < proximo:
        raise ErroRegra("O relatório só pode ser submetido após o término do mês de referência.")
    atual = RelatorioMensal.objects.select_for_update().filter(contrato=ator.contrato, competencia=inicio).order_by("-versao").first()
    if atual and atual.status != StatusRelatorio.DEVOLVIDO:
        raise ErroRegra("Já existe relatório submetido ou atestado para esta competência.")
    conteudo = consolidar(ator.contrato, inicio)
    prazo = prazo_limite(ator.contrato, inicio)
    versao = (RelatorioMensal.objects.filter(contrato=ator.contrato, competencia=inicio).aggregate(m=Max("versao"))["m"] or 0) + 1
    r = RelatorioMensal.objects.create(
        contrato=ator.contrato,
        competencia=inicio,
        versao=versao,
        conteudo=conteudo,
        hash_conteudo=hash_conteudo(conteudo),
        layout_versao=LAYOUT_VERSAO,
        prazo_limite=prazo,
        submetido_no_prazo=hoje <= prazo,
        submetido_por=ator.usuario,
    )
    auditoria.registrar(ator, "RelatorioMensal", r.pk, "SUBMISSAO", f"Competência {conteudo['competencia']} v{versao}",
                        depois={"hash_conteudo": r.hash_conteudo, "prazo_limite": str(prazo), "no_prazo": r.submetido_no_prazo})
    return r


@transaction.atomic
def decidir(ator, relatorio, atestar, parecer):
    exigir_perfil(ator, Perfil.FISCAL)
    exigir_mesmo_contrato(ator, relatorio)
    parecer = exigir_texto(parecer, "Parecer")
    r = RelatorioMensal.objects.select_for_update().get(pk=relatorio.pk)
    if r.status != StatusRelatorio.SUBMETIDO:
        raise ErroRegra("Relatório não está aguardando conferência.")
    antes = {"status": r.status}
    r.status = StatusRelatorio.ATESTADO if atestar else StatusRelatorio.DEVOLVIDO
    r.decidido_por, r.decidido_em, r.parecer = ator.usuario, timezone.now(), parecer
    r.save()
    auditoria.registrar(ator, "RelatorioMensal", r.pk, "ATESTO" if atestar else "DEVOLUCAO", parecer, antes, {"status": r.status, "hash_conteudo": r.hash_conteudo})
    return r


@transaction.atomic
def registrar_nota_fiscal(ator, relatorio, numero, data_emissao, valor, observacao=""):
    exigir_perfil(ator, Perfil.OPERADOR)
    exigir_mesmo_contrato(ator, relatorio)
    r = RelatorioMensal.objects.select_for_update().get(pk=relatorio.pk)
    if r.status != StatusRelatorio.ATESTADO:
        raise ErroRegra("O registro da nota fiscal só é liberado após o atesto do relatório pela Prefeitura.")
    if r.notas_fiscais.exists():
        raise ErroRegra("Nota fiscal já registrada para este relatório.")
    valor = Decimal(str(valor))
    esperado = Decimal(r.conteudo["totais"]["valor_geral"])
    if valor != esperado and not (observacao or "").strip():
        raise ErroRegra(f"Valor difere do total atestado (R$ {esperado}). Justifique na observação.")
    nf = RegistroNotaFiscal.objects.create(
        relatorio=r, numero=exigir_texto(numero, "Número"), data_emissao=data_emissao, valor=valor,
        registrado_por=ator.usuario, observacao=observacao or "",
    )
    auditoria.registrar(ator, "RegistroNotaFiscal", nf.pk, "REGISTRO_NF", observacao, depois=auditoria.serializar(nf))
    return nf
