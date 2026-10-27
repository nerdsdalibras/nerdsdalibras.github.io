"""Views: apenas validam entrada, chamam serviços e exibem resultado.

Toda regra de negócio e de permissão está em `operacao/servicos/` (servidor).
Toda consulta é filtrada pelo contrato do vínculo ativo.
"""
import json
from datetime import timedelta
from functools import wraps

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.core.exceptions import PermissionDenied
from django.db import DatabaseError
from django.db.models import Q
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.views.decorators.http import require_POST

from . import exportacoes, forms
from .middleware import CHAVE_SESSAO
from .models import (
    Agendamento, AvisoInterno, Chamado, Escala, EventoAuditoria, Feriado, Interprete, Medicao, Notificacao,
    ParametroMedicao, PedidoIndenizacao, Perfil, PoliticaRetencao, RelatorioMensal, SituacaoIndenizacao,
    SituacaoMedicao, StatusAgendamento, StatusChamado, StatusNotificacao, Vinculo,
)
from .servicos import (
    agendamentos, auditoria, cadastros, calendario, chamados, homologacao, indenizacao, medicao, notificacoes,
    parametros, relatorios,
)
from .servicos.base import Ator, ErroRegra

PREF = (Perfil.SOLICITANTE, Perfil.FISCAL)
GESTAO = (Perfil.FISCAL, Perfil.OPERADOR, Perfil.ADMIN_TECNICO)


def perfis(*permitidos):
    def deco(view):
        @login_required
        @wraps(view)
        def inner(request, *a, **kw):
            if request.vinculo is None or (permitidos and request.vinculo.perfil not in permitidos):
                raise PermissionDenied("Seu perfil não permite esta operação.")
            return view(request, *a, **kw)

        return inner

    return deco


def executar(request, func, *args, sucesso="Operação registrada.", **kwargs):
    """Executa serviço e converte erros de regra/banco em mensagens."""
    try:
        resultado = func(*args, **kwargs)
    except ErroRegra as e:
        messages.error(request, str(e))
        return None
    except DatabaseError as e:
        msg = str(e).split("\n")[0]
        messages.error(request, msg.replace("SGI: ", "Bloqueado: ") if "SGI:" in msg else "Erro ao gravar; operação não realizada.")
        return None
    except Exception as e:  # validações de senha etc.
        if e.__class__.__name__ == "ValidationError":
            messages.error(request, "; ".join(getattr(e, "messages", [str(e)])))
            return None
        raise
    messages.success(request, sucesso)
    return resultado if resultado is not None else True


def ator(request):
    return Ator.do_request(request)


def _agendamento(request, pk):
    ag = get_object_or_404(Agendamento.objects.select_related("contrato"), pk=pk, contrato=request.contrato)
    if not agendamentos.pode_ver(ator(request), ag):
        raise Http404
    return ag


# ------------------------------------------------------------ básicos
@login_required
def sem_vinculo(request):
    return render(request, "operacao/sem_vinculo.html")


@login_required
def selecionar_contrato(request):
    vinculos = Vinculo.objects.filter(usuario=request.user, ativo=True).select_related("contrato")
    if request.method == "POST":
        v = get_object_or_404(vinculos, pk=request.POST.get("vinculo"))
        request.session[CHAVE_SESSAO] = v.pk
        return redirect("operacao:painel")
    return render(request, "operacao/selecionar_contrato.html", {"vinculos": vinculos})


@perfis()
def painel(request):
    a = ator(request)
    qs = Agendamento.objects.filter(contrato=request.contrato)
    if a.perfil == Perfil.SOLICITANTE:
        qs = qs.filter(criado_por=request.user)
    agora = timezone.now()
    ctx = {
        "proximos": qs.filter(status__in=[StatusAgendamento.SOLICITADO, StatusAgendamento.CONFIRMADO], inicio_previsto__gte=agora)
        .order_by("inicio_previsto")[:10],
        "aguardando_confirmacao": qs.filter(status=StatusAgendamento.SOLICITADO).count(),
        "aguardando_homologacao": qs.filter(status=StatusAgendamento.REALIZADO).count(),
        "pendencias_medicao": Medicao.objects.filter(agendamento__in=qs, situacao__in=[SituacaoMedicao.PENDENTE_REGRA, SituacaoMedicao.PROPOSTA]).values("agendamento").distinct().count(),
        "chamados_abertos": _chamados_visiveis(request).exclude(status=StatusChamado.CONCLUIDO).count(),
        "parametros_pendentes": ParametroMedicao.objects.filter(contrato=request.contrato, situacao="PROPOSTO").count(),
        "indenizacoes_pendentes": PedidoIndenizacao.objects.filter(agendamento__contrato=request.contrato, situacao=SituacaoIndenizacao.SOLICITADA).count(),
        "relatorios_pendentes": RelatorioMensal.objects.filter(contrato=request.contrato, status="SUBMETIDO").count(),
        "notificacoes_problema": Notificacao.objects.filter(contrato=request.contrato).exclude(status=StatusNotificacao.ENVIADA).count(),
        "integracao_email": notificacoes.integracao_configurada(),
    }
    return render(request, "operacao/painel.html", ctx)


# ------------------------------------------------------------ agendamentos
def _filtrar(request, qs):
    a = ator(request)
    f = forms.FiltroAgendamentosForm(request.GET or None, contrato=request.contrato, mostrar_interprete=a.perfil != Perfil.SOLICITANTE)
    if f.is_valid():
        d = f.cleaned_data
        if d.get("de"):
            qs = qs.filter(inicio_previsto__date__gte=d["de"])
        if d.get("ate"):
            qs = qs.filter(inicio_previsto__date__lte=d["ate"])
        if d.get("modalidade"):
            qs = qs.filter(modalidade=d["modalidade"])
        if d.get("status"):
            qs = qs.filter(status=d["status"])
        if d.get("interprete"):
            qs = qs.filter(escalas__interprete=d["interprete"], escalas__ativa=True)
        if d.get("pendencias"):
            qs = qs.filter(Q(fora_do_prazo=True) | Q(medicoes__situacao__in=[SituacaoMedicao.PENDENTE_REGRA, SituacaoMedicao.PROPOSTA]))
    return f, qs.distinct()


@perfis()
def lista_agendamentos(request):
    qs = Agendamento.objects.filter(contrato=request.contrato).prefetch_related("escalas__interprete")
    if request.vinculo.perfil == Perfil.SOLICITANTE:
        qs = qs.filter(criado_por=request.user)
    filtro, qs = _filtrar(request, qs)
    qs = qs.order_by("-inicio_previsto")
    if request.GET.get("formato") == "csv":
        linhas = []
        for ag in qs:
            m = medicao.medicao_vigente(ag)
            linhas.append([
                ag.codigo, ag.titulo, ag.unidade_solicitante, ag.get_modalidade_display(), ag.local,
                _f(ag.inicio_previsto), ag.duracao_prevista_min, ag.qtd_profissionais, ag.get_status_display(),
                _f(ag.criado_em), "sim" if ag.fora_do_prazo else "não", _f(ag.confirmado_em),
                _f(ag.inicio_realizado), _f(ag.fim_realizado),
                ", ".join(e.interprete.nome_completo for e in ag.escalas.all() if e.ativa),
                m.horas_faturaveis if m else "", m.valor_total if m else "",
                ag.get_cancelamento_classificacao_display() if ag.cancelado_em else "",
            ])
        return exportacoes.csv_resposta("agendamentos", [
            "Código", "Evento", "Unidade", "Modalidade", "Local/plataforma", "Início previsto", "Duração (min)",
            "Profissionais", "Situação", "Criado em", "Fora do prazo", "Confirmado em", "Início realizado",
            "Fim realizado", "Intérpretes", "Horas faturáveis", "Valor (R$)", "Cancelamento",
        ], linhas)
    return render(request, "operacao/agendamentos.html", {"filtro": filtro, "agendamentos": qs[:500]})


def _f(dt):
    return calendario.local(dt).strftime("%d/%m/%Y %H:%M") if dt else ""


@perfis(Perfil.SOLICITANTE, Perfil.FISCAL, Perfil.OPERADOR)
def novo_agendamento(request):
    form = forms.AgendamentoForm(request.POST or None)
    if request.method == "POST" and form.is_valid():
        ag = executar(request, agendamentos.criar, ator(request), **form.cleaned_data, sucesso="Solicitação registrada.")
        if ag:
            if ag.fora_do_prazo:
                messages.warning(request, f"Pedido FORA do prazo de antecedência ({ag.antecedencia_dias_uteis} de {ag.antecedencia_minima_dias_uteis} dia(s) útil(eis)). Registro preservado e sinalizado.")
            return redirect("operacao:agendamento", ag.pk)
    return render(request, "operacao/agendamento_form.html", {"form": form})


@perfis()
def detalhe_agendamento(request, pk):
    ag = _agendamento(request, pk)
    a = ator(request)
    ultima = ag.medicoes.order_by("-versao").first()
    ctx = {
        "ag": ag,
        "escalas": ag.escalas.select_related("interprete", "escalado_por", "cancelada_por").order_by("escalado_em"),
        "medicoes": ag.medicoes.select_related("parametro", "criada_por", "decidida_por"),
        "medicao_vigente": medicao.medicao_vigente(ag),
        "ultima_medicao": ultima,
        "pendencias_texto": [medicao.PENDENCIAS.get(p, p) for p in (ultima.pendencias if ultima else [])],
        "indenizacoes": ag.indenizacoes.all(),
        "elegibilidade_indenizacao": indenizacao.verificar_elegibilidade(ag) if ag.status == StatusAgendamento.CANCELADO else None,
        "homologacoes": ag.homologacoes.select_related("usuario"),
        "homologacoes_validas": homologacao.homologacoes_validas(ag) if ag.status in (StatusAgendamento.REALIZADO, StatusAgendamento.HOMOLOGADO) else {},
        "historico": EventoAuditoria.objects.filter(contrato=request.contrato).filter(_filtro_historico(ag)).order_by("id"),
        "chamados": ag.chamados.all(),
        "f_escalar": forms.EscalarForm(contrato=request.contrato),
        "f_cancelar_escala": forms.CancelarEscalaForm(contrato=request.contrato),
        "f_alterar": forms.AlterarHorarioForm(initial={
            "inicio_previsto": calendario.local(ag.inicio_previsto).strftime("%Y-%m-%dT%H:%M"),
            "duracao_prevista_min": ag.duracao_prevista_min, "qtd_profissionais": ag.qtd_profissionais,
        }),
        "f_realizacao": forms.RealizacaoForm(initial={
            "inicio_realizado": calendario.local(ag.inicio_realizado or ag.inicio_previsto).strftime("%Y-%m-%dT%H:%M"),
            "fim_realizado": calendario.local(ag.fim_realizado or ag.fim_previsto).strftime("%Y-%m-%dT%H:%M"),
        }),
        "f_justificativa": forms.JustificativaForm(),
        "f_fundamentada": forms.MedicaoFundamentadaForm(),
        "f_decisao": forms.DecisaoForm(),
        "f_indenizacao": forms.IndenizacaoForm(),
        "f_decisao_indenizacao": forms.DecisaoIndenizacaoForm(),
        "pode_contatos": a.perfil in (Perfil.FISCAL, Perfil.OPERADOR, Perfil.SOLICITANTE),
        "ativos": ag.status in (StatusAgendamento.SOLICITADO, StatusAgendamento.CONFIRMADO),
    }
    return render(request, "operacao/agendamento_detalhe.html", ctx)


def _filtro_historico(ag):
    q = Q(entidade="Agendamento", entidade_id=str(ag.pk))
    for nome, ids in (
        ("Escala", ag.escalas.values_list("pk", flat=True)),
        ("Medicao", ag.medicoes.values_list("pk", flat=True)),
        ("Homologacao", ag.homologacoes.values_list("pk", flat=True)),
        ("PedidoIndenizacao", ag.indenizacoes.values_list("pk", flat=True)),
    ):
        q |= Q(entidade=nome, entidade_id__in=[str(i) for i in ids])
    return q


@perfis()
def historico_agendamento(request, pk, formato):
    if formato not in ("csv", "pdf"):
        raise Http404
    ag = _agendamento(request, pk)
    evs = EventoAuditoria.objects.filter(contrato=request.contrato).filter(_filtro_historico(ag)).order_by("id")
    cab = ["Nº", "Data/hora", "Usuário", "Perfil", "Entidade", "Ação", "Justificativa", "Antes", "Depois", "Hash"]
    linhas = [[
        e.id, _f(e.ocorrido_em), e.usuario_descricao, e.perfil, e.entidade, e.acao, e.justificativa,
        json.dumps(e.dados_anteriores, ensure_ascii=False) if e.dados_anteriores else "",
        json.dumps(e.dados_posteriores, ensure_ascii=False) if e.dados_posteriores else "", e.hash,
    ] for e in evs]
    nome = f"historico-{ag.codigo}"
    if formato == "csv":
        return exportacoes.csv_resposta(nome, cab, linhas)
    return exportacoes.pdf_resposta(nome, f"Histórico auditável — {ag.codigo}", [
        ("p", f"{ag.titulo} — {ag.contrato}"), ("tabela", cab[:7] + ["Alterações"], [l[:7] + [f"Antes: {l[7]}<br/>Depois: {l[8]}"[:1500]] for l in linhas]),
    ], rodape=f"Gerado em {_f(timezone.now())} por {request.user.nome_completo}. Hashes completos na exportação CSV.")


def _post_ag(request, pk):
    if request.method != "POST":
        raise Http404
    return _agendamento(request, pk)


@require_POST
@perfis(Perfil.OPERADOR)
def escalar(request, pk):
    ag = _post_ag(request, pk)
    f = forms.EscalarForm(request.POST, contrato=request.contrato)
    if f.is_valid():
        executar(request, agendamentos.escalar, ator(request), ag, f.cleaned_data["interprete"], sucesso="Intérprete escalado.")
    else:
        messages.error(request, "Selecione um intérprete.")
    return redirect("operacao:agendamento", ag.pk)


@require_POST
@perfis(Perfil.OPERADOR)
def cancelar_escala(request, pk, escala_id):
    ag = _post_ag(request, pk)
    escala = get_object_or_404(Escala, pk=escala_id, agendamento=ag)
    f = forms.CancelarEscalaForm(request.POST, contrato=request.contrato)
    if f.is_valid():
        executar(request, agendamentos.cancelar_escala, ator(request), escala, f.cleaned_data["motivo"], f.cleaned_data["substituto"],
                 sucesso="Escala cancelada; fiscais notificados.")
    else:
        messages.error(request, "Informe o motivo.")
    return redirect("operacao:agendamento", ag.pk)


@require_POST
@perfis(Perfil.OPERADOR)
def confirmar(request, pk):
    ag = _post_ag(request, pk)
    executar(request, agendamentos.confirmar, ator(request), ag, sucesso="Atendimento confirmado; fiscais notificados.")
    return redirect("operacao:agendamento", ag.pk)


@require_POST
@perfis(Perfil.SOLICITANTE, Perfil.FISCAL, Perfil.OPERADOR)
def alterar_horario(request, pk):
    ag = _post_ag(request, pk)
    f = forms.AlterarHorarioForm(request.POST)
    if f.is_valid():
        d = f.cleaned_data
        executar(request, agendamentos.alterar_horario, ator(request), ag, d["inicio_previsto"], d["duracao_prevista_min"],
                 d["justificativa"], d["qtd_profissionais"], sucesso="Horário alterado; fiscais notificados.")
    else:
        messages.error(request, "Dados inválidos: " + "; ".join(f"{k}: {' '.join(v)}" for k, v in f.errors.items()))
    return redirect("operacao:agendamento", ag.pk)


@require_POST
@perfis(Perfil.SOLICITANTE, Perfil.FISCAL, Perfil.OPERADOR)
def cancelar(request, pk):
    ag = _post_ag(request, pk)
    f = forms.JustificativaForm(request.POST)
    if f.is_valid():
        executar(request, agendamentos.cancelar, ator(request), ag, f.cleaned_data["justificativa"], sucesso="Agendamento cancelado (registro preservado).")
    else:
        messages.error(request, "Justificativa obrigatória.")
    return redirect("operacao:agendamento", ag.pk)


@require_POST
@perfis(Perfil.OPERADOR)
def registrar_realizacao(request, pk):
    ag = _post_ag(request, pk)
    f = forms.RealizacaoForm(request.POST)
    if f.is_valid():
        d = f.cleaned_data
        m = executar(request, agendamentos.registrar_realizacao, ator(request), ag, d["inicio_realizado"], d["fim_realizado"], d["justificativa"],
                     sucesso="Horários realizados registrados e medição calculada.")
        if m and m is not True and m.situacao == SituacaoMedicao.PENDENTE_REGRA:
            messages.warning(request, "Medição com PENDÊNCIA DE REGRA: requer medição fundamentada e aprovação da Prefeitura.")
    else:
        messages.error(request, "Horários inválidos.")
    return redirect("operacao:agendamento", ag.pk)


@require_POST
@perfis(Perfil.OPERADOR)
def propor_medicao(request, pk):
    ag = _post_ag(request, pk)
    f = forms.MedicaoFundamentadaForm(request.POST)
    if f.is_valid():
        executar(request, medicao.propor_fundamentada, ator(request), ag, f.cleaned_data["minutos_faturaveis"], f.cleaned_data["fundamentacao"],
                 sucesso="Medição fundamentada enviada para aprovação da Prefeitura.")
    else:
        messages.error(request, "Dados inválidos.")
    return redirect("operacao:agendamento", ag.pk)


@require_POST
@perfis(Perfil.FISCAL)
def decidir_medicao(request, pk, medicao_id):
    ag = _post_ag(request, pk)
    m = get_object_or_404(Medicao, pk=medicao_id, agendamento=ag)
    f = forms.DecisaoForm(request.POST)
    if f.is_valid():
        executar(request, medicao.decidir_fundamentada, ator(request), m, f.cleaned_data["decisao"] == "aprovar", f.cleaned_data["parecer"])
    else:
        messages.error(request, "Parecer obrigatório.")
    return redirect("operacao:agendamento", ag.pk)


@require_POST
@perfis(Perfil.FISCAL, Perfil.OPERADOR)
def homologar(request, pk):
    ag = _post_ag(request, pk)
    executar(request, homologacao.homologar, ator(request), ag, request.POST.get("observacao", ""), sucesso="Conferência/homologação registrada.")
    return redirect("operacao:agendamento", ag.pk)


@require_POST
@perfis(Perfil.OPERADOR)
def solicitar_indenizacao(request, pk):
    ag = _post_ag(request, pk)
    f = forms.IndenizacaoForm(request.POST, request.FILES)
    if f.is_valid():
        executar(request, indenizacao.solicitar, ator(request), ag, f.cleaned_data["comprovacao"], f.cleaned_data.get("anexo"),
                 sucesso="Pedido de indenização enviado para análise da Prefeitura.")
    else:
        messages.error(request, "Descreva a comprovação.")
    return redirect("operacao:agendamento", ag.pk)


@require_POST
@perfis(Perfil.FISCAL)
def decidir_indenizacao(request, pk, pedido_id):
    ag = _post_ag(request, pk)
    p = get_object_or_404(PedidoIndenizacao, pk=pedido_id, agendamento=ag)
    f = forms.DecisaoIndenizacaoForm(request.POST)
    if f.is_valid():
        d = f.cleaned_data
        executar(request, indenizacao.decidir, ator(request), p, d["decisao"] == "aprovar", d["reserva_comprovada"], d["imputavel_contratada"], d["parecer"])
    else:
        messages.error(request, "Parecer obrigatório.")
    return redirect("operacao:agendamento", ag.pk)


@perfis(Perfil.FISCAL, Perfil.OPERADOR)
def anexo_indenizacao(request, pedido_id):
    p = get_object_or_404(PedidoIndenizacao, pk=pedido_id, agendamento__contrato=request.contrato)
    if not p.anexo:
        raise Http404
    return FileResponse(p.anexo.open("rb"), as_attachment=True, filename=p.anexo_nome_original or "anexo")


# ------------------------------------------------------------ cadastros
@perfis(Perfil.FISCAL, Perfil.OPERADOR)
def interpretes(request):
    return render(request, "operacao/interpretes.html", {"interpretes": Interprete.objects.filter(contrato=request.contrato)})


@perfis(Perfil.OPERADOR)
def interprete_form(request, pk=None):
    obj = get_object_or_404(Interprete, pk=pk, contrato=request.contrato) if pk else None
    inicial = {"nome_completo": obj.nome_completo, "telefone": obj.telefone, "email": obj.email, "ativo": obj.ativo} if obj else None
    form = forms.InterpreteForm(request.POST or None, initial=inicial)
    if request.method == "POST" and form.is_valid():
        if obj and not form.cleaned_data["justificativa"].strip():
            messages.error(request, "Informe a justificativa da alteração.")
        elif executar(request, cadastros.salvar_interprete, ator(request), form.cleaned_data, obj, form.cleaned_data["justificativa"]):
            return redirect("operacao:interpretes")
    return render(request, "operacao/form_simples.html", {"form": form, "titulo": "Intérprete", "voltar": "operacao:interpretes"})


@perfis(Perfil.FISCAL, Perfil.OPERADOR, Perfil.ADMIN_TECNICO)
def parametros_view(request):
    form = forms.ParametroForm(request.POST or None)
    if request.method == "POST":
        if request.vinculo.perfil not in (Perfil.FISCAL, Perfil.OPERADOR):
            raise PermissionDenied
        if form.is_valid():
            d = form.cleaned_data
            if executar(request, parametros.propor_parametro, ator(request), d["preco_unitario_hora"], d["faixas"], d["vigente_desde"], d["justificativa"],
                        sucesso="Nova versão proposta; só vale após aprovação da Prefeitura."):
                return redirect("operacao:parametros")
    return render(request, "operacao/parametros.html", {
        "form": form, "f_decisao": forms.DecisaoForm(),
        "parametros": ParametroMedicao.objects.filter(contrato=request.contrato).select_related("proposto_por", "decidido_por"),
    })


@require_POST
@perfis(Perfil.FISCAL)
def parametro_decidir(request, pk):
    p = get_object_or_404(ParametroMedicao, pk=pk, contrato=request.contrato)
    f = forms.DecisaoForm(request.POST)
    if f.is_valid():
        executar(request, parametros.decidir_parametro, ator(request), p, f.cleaned_data["decisao"] == "aprovar", f.cleaned_data["parecer"])
    return redirect("operacao:parametros")


@perfis(*GESTAO)
def retencao(request):
    form = forms.RetencaoForm(request.POST or None)
    if request.method == "POST" and form.is_valid():
        if executar(request, parametros.propor_retencao, ator(request), form.cleaned_data["prazo_descricao"], form.cleaned_data["fundamento"]):
            return redirect("operacao:retencao")
    return render(request, "operacao/retencao.html", {
        "form": form, "f_decisao": forms.DecisaoForm(),
        "politicas": PoliticaRetencao.objects.filter(contrato=request.contrato),
    })


@require_POST
@perfis(Perfil.FISCAL)
def retencao_decidir(request, pk):
    p = get_object_or_404(PoliticaRetencao, pk=pk, contrato=request.contrato)
    f = forms.DecisaoForm(request.POST)
    if f.is_valid():
        executar(request, parametros.decidir_retencao, ator(request), p, f.cleaned_data["decisao"] == "aprovar", f.cleaned_data["parecer"])
    return redirect("operacao:retencao")


@perfis()
def feriados(request):
    form = forms.FeriadoForm(request.POST or None)
    if request.method == "POST":
        if request.vinculo.perfil != Perfil.FISCAL:
            raise PermissionDenied
        if form.is_valid() and executar(request, cadastros.adicionar_feriado, ator(request), form.cleaned_data["data"], form.cleaned_data["descricao"]):
            return redirect("operacao:feriados")
    return render(request, "operacao/feriados.html", {"form": form, "feriados": Feriado.objects.filter(contrato=request.contrato)})


@require_POST
@perfis(Perfil.FISCAL)
def feriado_desativar(request, pk):
    f = get_object_or_404(Feriado, pk=pk, contrato=request.contrato)
    executar(request, cadastros.desativar_feriado, ator(request), f, request.POST.get("justificativa", ""))
    return redirect("operacao:feriados")


# ------------------------------------------------------------ chamados
def _chamados_visiveis(request):
    qs = Chamado.objects.filter(contrato=request.contrato)
    if request.vinculo.perfil == Perfil.SOLICITANTE:
        qs = qs.filter(aberto_por=request.user)
    return qs


@perfis()
def lista_chamados(request):
    agora = timezone.now()
    abertos = list(_chamados_visiveis(request).exclude(status=StatusChamado.CONCLUIDO).select_related("responsavel", "agendamento").order_by("aberto_em"))
    for c in abertos:
        c.sla = chamados.situacao_sla(c, agora)
    concluidos = _chamados_visiveis(request).filter(status=StatusChamado.CONCLUIDO).order_by("-concluido_em")[:50]
    for c in concluidos:
        c.sla = chamados.situacao_sla(c, agora)
    return render(request, "operacao/chamados.html", {
        "abertos": abertos, "concluidos": concluidos, "atualizar": request.GET.get("atualizar") != "0",
        "alerta_min": chamados.ALERTA_MIN, "prazo_min": chamados.PRAZO_RESPOSTA_MIN,
    })


@perfis(Perfil.SOLICITANTE, Perfil.FISCAL, Perfil.OPERADOR)
def novo_chamado(request):
    form = forms.ChamadoForm(request.POST or None, initial={"agendamento": request.GET.get("agendamento", "")})
    if request.method == "POST" and form.is_valid():
        d = form.cleaned_data
        ag = None
        if d["agendamento"].strip():
            ag = Agendamento.objects.filter(contrato=request.contrato, codigo=d["agendamento"].strip()).first()
            if ag is None or not agendamentos.pode_ver(ator(request), ag):
                messages.error(request, "Agendamento não encontrado.")
                return render(request, "operacao/form_simples.html", {"form": form, "titulo": "Novo chamado", "voltar": "operacao:chamados"})
        c = executar(request, chamados.abrir, ator(request), d["tipo"], d["titulo"], d["descricao"], ag, sucesso="Chamado aberto.")
        if c:
            return redirect("operacao:chamado", c.pk)
    return render(request, "operacao/form_simples.html", {"form": form, "titulo": "Novo chamado", "voltar": "operacao:chamados"})


@perfis()
def detalhe_chamado(request, pk):
    c = get_object_or_404(_chamados_visiveis(request), pk=pk)
    if request.method == "POST":
        acao = request.POST.get("acao")
        if acao == "responder":
            f = forms.TextoForm(request.POST)
            if f.is_valid():
                executar(request, chamados.responder, ator(request), c, f.cleaned_data["texto"])
        elif acao == "atribuir":
            f = forms.AtribuirForm(request.POST, contrato=request.contrato)
            if f.is_valid():
                executar(request, chamados.atribuir, ator(request), c, f.cleaned_data["responsavel"])
        elif acao == "concluir":
            f = forms.TextoForm(request.POST)
            if f.is_valid():
                executar(request, chamados.concluir, ator(request), c, f.cleaned_data["texto"])
        return redirect("operacao:chamado", c.pk)
    c.sla = chamados.situacao_sla(c)
    return render(request, "operacao/chamado_detalhe.html", {
        "c": c, "interacoes": c.interacoes.select_related("autor"),
        "f_texto": forms.TextoForm(), "f_atribuir": forms.AtribuirForm(contrato=request.contrato),
    })


# ------------------------------------------------------------ avisos e notificações
@perfis()
def avisos(request):
    if request.method == "POST":
        AvisoInterno.objects.filter(usuario=request.user, lido_em__isnull=True, notificacao__contrato=request.contrato).update(lido_em=timezone.now())
        return redirect("operacao:avisos")
    lista = AvisoInterno.objects.filter(usuario=request.user, notificacao__contrato=request.contrato).select_related("notificacao", "notificacao__agendamento").order_by("-notificacao__criada_em")[:200]
    envios = None
    if request.vinculo.perfil in GESTAO:
        envios = Notificacao.objects.filter(contrato=request.contrato).prefetch_related("tentativas_envio")[:200]
    return render(request, "operacao/avisos.html", {"avisos": lista, "envios": envios, "integracao": notificacoes.integracao_configurada()})


@require_POST
@perfis(Perfil.FISCAL, Perfil.ADMIN_TECNICO, Perfil.OPERADOR)
def reenviar_notificacao(request, pk):
    n = get_object_or_404(Notificacao, pk=pk, contrato=request.contrato)
    if n.status == StatusNotificacao.ENVIADA:
        messages.error(request, "Notificação já enviada; reenvio bloqueado para evitar duplicidade.")
    else:
        r = notificacoes.enviar(n.pk, forcar=True)
        auditoria.registrar(ator(request), "Notificacao", n.pk, "REENVIO_MANUAL", f"Resultado: {r.status if r else 'em processamento'}")
        messages.info(request, f"Tentativa registrada: {r.get_status_display() if r else 'em processamento por outro processo'}.")
    return redirect("operacao:avisos")


# ------------------------------------------------------------ relatórios
@perfis(*GESTAO)
def lista_relatorios(request):
    form = forms.CompetenciaForm(request.GET or None)
    previa = None
    if form.is_valid():
        previa = relatorios.consolidar(request.contrato, form.cleaned_data["competencia"])
        previa["prazo"] = relatorios.prazo_limite(request.contrato, form.cleaned_data["competencia"])
    return render(request, "operacao/relatorios.html", {
        "form": form, "previa": previa,
        "relatorios": RelatorioMensal.objects.filter(contrato=request.contrato).select_related("submetido_por", "decidido_por"),
    })


@require_POST
@perfis(Perfil.OPERADOR)
def submeter_relatorio(request):
    form = forms.CompetenciaForm(request.POST)
    if form.is_valid():
        r = executar(request, relatorios.submeter, ator(request), form.cleaned_data["competencia"], sucesso="Relatório submetido à conferência da Prefeitura.")
        if r:
            if not r.submetido_no_prazo:
                messages.warning(request, f"Submetido após o prazo (2º dia útil: {r.prazo_limite:%d/%m/%Y}).")
            return redirect("operacao:relatorio", r.pk)
    return redirect("operacao:relatorios")


@perfis(*GESTAO)
def detalhe_relatorio(request, pk):
    r = get_object_or_404(RelatorioMensal, pk=pk, contrato=request.contrato)
    if request.method == "POST":
        acao = request.POST.get("acao")
        if acao == "decidir":
            f = forms.DecisaoForm(request.POST)
            if f.is_valid():
                executar(request, relatorios.decidir, ator(request), r, f.cleaned_data["decisao"] == "aprovar", f.cleaned_data["parecer"])
        elif acao == "nf":
            f = forms.NotaFiscalForm(request.POST)
            if f.is_valid():
                d = f.cleaned_data
                executar(request, relatorios.registrar_nota_fiscal, ator(request), r, d["numero"], d["data_emissao"], d["valor"], d["observacao"])
        return redirect("operacao:relatorio", r.pk)
    fmt = request.GET.get("formato")
    c = r.conteudo
    if fmt in ("csv", "pdf"):
        cab = ["Código", "Evento", "Unidade", "Modalidade", "Local", "Situação", "Início previsto", "Duração prev. (min)",
               "Início real", "Fim real", "Intérpretes", "Horas", "Valor (R$)"]
        linhas = [[i["codigo"], i["evento"], i["unidade"], i["modalidade"], i["local"], i["status"], i["inicio_previsto"],
                   i["duracao_prevista_min"], i["inicio_realizado"], i["fim_realizado"], ", ".join(i["interpretes"]),
                   i["horas_faturaveis"] or "", i["valor"] or ""] for i in c["atendimentos"]]
        nome = f"relatorio-{c['competencia'].replace('/', '-')}-v{r.versao}"
        if fmt == "csv":
            linhas.append([])
            linhas.append(["TOTAIS", "", "", "", "", "", "", "", "", "", "", c["totais"]["horas_prestadas"], c["totais"]["valor_horas_prestadas"]])
            linhas.append(["INDENIZAÇÕES APROVADAS (separadas)", "", "", "", "", "", "", "", "", "", "", "", c["totais"]["valor_indenizacoes"]])
            linhas.append(["HASH SHA-256 DO CONTEÚDO", r.hash_conteudo])
            return exportacoes.csv_resposta(nome, cab, linhas)
        t = c["totais"]
        return exportacoes.pdf_resposta(nome, f"Relatório mensal {c['competencia']} — versão {r.versao}", [
            ("p", c["contrato"]),
            ("p", f"Situação: {r.get_status_display()}. Submetido em {_f(r.submetido_em)} (prazo: {r.prazo_limite:%d/%m/%Y}; "
                  f"{'no prazo' if r.submetido_no_prazo else 'FORA DO PRAZO'}). Layout v{r.layout_versao}."),
            ("h", "Serviços prestados"), ("tabela", cab, linhas),
            ("p", f"<b>Horas prestadas:</b> {t['horas_prestadas']} h — <b>Valor:</b> R$ {t['valor_horas_prestadas']}"),
            ("h", "Indenizações aprovadas (separadas das horas prestadas)"),
            ("tabela", ["Código", "Horas ref.", "Valor (R$)", "Memória"], [[i["codigo"], i["horas_referencia"], i["valor"], i["memoria"]] for i in c["indenizacoes_aprovadas"]]),
            ("h", "Pendências de medição (fora dos totais)"),
            ("tabela", ["Código", "Motivos"], [[p["codigo"], " ".join(p["motivos"])] for p in c["pendencias_medicao"]]),
            ("h", "Ocorrências/chamados"),
            ("tabela", ["Código", "Tipo", "Título", "Aberto", "1ª resposta", "Concluído", "Situação"],
             [[o["codigo"], o["tipo"], o["titulo"], o["aberto_em"], o["primeira_resposta_em"], o["concluido_em"], o["status"]] for o in c["ocorrencias"]]),
            ("p", f"<b>Valor geral (horas + indenizações):</b> R$ {t['valor_geral']}"),
        ], rodape=f"Hash SHA-256 do conteúdo submetido: {r.hash_conteudo}. {c['observacao']}")
    return render(request, "operacao/relatorio_detalhe.html", {
        "r": r, "c": c, "f_decisao": forms.DecisaoForm(), "f_nf": forms.NotaFiscalForm(initial={"valor": c["totais"]["valor_geral"]}),
        "notas": r.notas_fiscais.all(),
    })


# ------------------------------------------------------------ usuários e auditoria
@perfis(Perfil.ADMIN_TECNICO)
def usuarios(request):
    form = forms.UsuarioForm(request.POST or None)
    senha = None
    if request.method == "POST" and form.is_valid():
        d = form.cleaned_data
        r = executar(request, cadastros.criar_usuario_vinculo, ator(request), d["email"], d["nome_completo"], d["perfil"], sucesso="Acesso criado.")
        if r and r is not True:
            senha = r[1]
            form = forms.UsuarioForm()
    return render(request, "operacao/usuarios.html", {
        "form": form, "senha_temporaria": senha,
        "vinculos": Vinculo.objects.filter(contrato=request.contrato).select_related("usuario").order_by("usuario__nome_completo"),
        "f_vinculo": forms.VinculoForm(),
    })


@require_POST
@perfis(Perfil.ADMIN_TECNICO)
def vinculo_alterar(request, pk):
    v = get_object_or_404(Vinculo, pk=pk, contrato=request.contrato)
    f = forms.VinculoForm(request.POST)
    if f.is_valid():
        executar(request, cadastros.alterar_vinculo, ator(request), v, f.cleaned_data["ativo"], f.cleaned_data["perfil"], f.cleaned_data["justificativa"])
    else:
        messages.error(request, "Justificativa obrigatória.")
    return redirect("operacao:usuarios")


@perfis(Perfil.FISCAL, Perfil.ADMIN_TECNICO)
def auditoria_view(request):
    qs = EventoAuditoria.objects.filter(contrato=request.contrato).order_by("-id")
    ent = request.GET.get("entidade")
    if ent:
        qs = qs.filter(entidade=ent)
    integridade = None
    if request.GET.get("verificar") == "1":
        problemas = auditoria.verificar_cadeia()
        integridade = {"ok": not problemas, "problemas": problemas[:50]}
    if request.GET.get("formato") == "csv":
        return exportacoes.csv_resposta("auditoria", ["Nº", "Data/hora", "Usuário", "Perfil", "Entidade", "ID", "Ação", "Justificativa", "Antes", "Depois", "Hash anterior", "Hash"], [
            [e.id, _f(e.ocorrido_em), e.usuario_descricao, e.perfil, e.entidade, e.entidade_id, e.acao, e.justificativa,
             json.dumps(e.dados_anteriores, ensure_ascii=False) if e.dados_anteriores else "",
             json.dumps(e.dados_posteriores, ensure_ascii=False) if e.dados_posteriores else "", e.hash_anterior, e.hash]
            for e in qs.iterator()
        ])
    entidades = EventoAuditoria.objects.filter(contrato=request.contrato).values_list("entidade", flat=True).distinct().order_by("entidade")
    return render(request, "operacao/auditoria.html", {"eventos": qs[:300], "entidades": entidades, "integridade": integridade, "ent": ent})
