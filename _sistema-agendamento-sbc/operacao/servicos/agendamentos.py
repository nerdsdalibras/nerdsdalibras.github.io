"""Ciclo de vida dos agendamentos: solicitação, escala, confirmação,
alteração de horário, cancelamento e registro de realização."""
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from ..models import (
    Agendamento,
    ClassificacaoCancelamento,
    Contrato,
    Escala,
    Interprete,
    Modalidade,
    Parte,
    Perfil,
    StatusAgendamento,
    TipoNotificacao,
)
from . import auditoria, calendario, notificacoes
from .base import ErroRegra, exigir_mesmo_contrato, exigir_perfil, exigir_texto

ANTECEDENCIA_MINIMA = {Modalidade.REMOTO: 1, Modalidade.PRESENCIAL: 3}
PERFIS_SOLICITACAO = (Perfil.SOLICITANTE, Perfil.FISCAL, Perfil.OPERADOR)
STATUS_ATIVOS = (StatusAgendamento.SOLICITADO, StatusAgendamento.CONFIRMADO)


def _truncar_minuto(dt):
    return dt.replace(second=0, microsecond=0)


def pode_ver(ator, ag):
    if ag.contrato_id != ator.contrato.id:
        return False
    if ator.perfil == Perfil.SOLICITANTE:
        return ag.criado_por_id == ator.usuario.pk
    return True


def exigir_acesso(ator, ag):
    from django.core.exceptions import PermissionDenied

    if not pode_ver(ator, ag):
        raise PermissionDenied("Sem acesso a este agendamento.")


def _validar_dados(modalidade, inicio, duracao, qtd):
    if modalidade not in Modalidade.values:
        raise ErroRegra("Modalidade inválida.")
    if inicio is None:
        raise ErroRegra("Informe data e horário do evento.")
    if duracao is None or duracao <= 0:
        raise ErroRegra("Duração estimada deve ser positiva.")
    if qtd is None or qtd < 1:
        raise ErroRegra("Quantidade de profissionais deve ser ao menos 1.")
    if duracao > 60 and qtd < 2:
        raise ErroRegra("Atendimentos com duração superior a uma hora exigem ao menos dois intérpretes em revezamento.")


def calcular_antecedencia(contrato, modalidade, criado_em, inicio):
    feriados = calendario.feriados_do_contrato(contrato)
    dias = calendario.dias_uteis_entre(calendario.local(criado_em).date(), calendario.local(inicio).date(), feriados)
    minimo = ANTECEDENCIA_MINIMA[modalidade]
    return dias, minimo, dias < minimo


def _notificar(ag, tipo, chave, assunto, corpo):
    from django.conf import settings

    link = f"{settings.URL_BASE}/agendamentos/{ag.pk}/"
    corpo = (
        f"{corpo}\n\nAgendamento: {ag.codigo} — {ag.titulo}\n"
        f"Início previsto: {calendario.local(ag.inicio_previsto):%d/%m/%Y %H:%M} (horário de Brasília)\n"
        f"Duração estimada: {ag.duracao_prevista_min} min | Modalidade: {ag.get_modalidade_display()}\n"
        f"Local/plataforma: {ag.local}\n\nDetalhes (acesso autenticado): {link}\n\n"
        "Mensagem automática do SGI. Dados de contato dos intérpretes estão disponíveis apenas no sistema."
    )
    notificacoes.enfileirar(ag.contrato, tipo, chave, f"[SGI {ag.codigo}] {assunto}", corpo, agendamento=ag)


@transaction.atomic
def criar(ator, *, titulo, unidade_solicitante, modalidade, local, inicio_previsto, duracao_prevista_min,
          qtd_profissionais, observacoes=""):
    exigir_perfil(ator, *PERFIS_SOLICITACAO)
    _validar_dados(modalidade, inicio_previsto, duracao_prevista_min, qtd_profissionais)
    agora = timezone.now()
    inicio_previsto = _truncar_minuto(inicio_previsto)
    if inicio_previsto <= agora:
        raise ErroRegra("O início do evento deve ser posterior ao momento da solicitação.")
    contrato = Contrato.objects.select_for_update().get(pk=ator.contrato.pk)
    numero = contrato.proximo_numero
    contrato.proximo_numero += 1
    contrato.save(update_fields=["proximo_numero"])
    dias, minimo, fora = calcular_antecedencia(contrato, modalidade, agora, inicio_previsto)
    ag = Agendamento.objects.create(
        contrato=contrato,
        codigo=f"{contrato.prefixo_codigo}-{calendario.local(agora).year}-{numero:06d}",
        titulo=exigir_texto(titulo, "Evento"),
        unidade_solicitante=exigir_texto(unidade_solicitante, "Unidade solicitante"),
        modalidade=modalidade,
        local=exigir_texto(local, "Local ou plataforma"),
        inicio_previsto=inicio_previsto,
        duracao_prevista_min=duracao_prevista_min,
        qtd_profissionais=qtd_profissionais,
        observacoes=observacoes or "",
        criado_em=agora,
        criado_por=ator.usuario,
        parte_criadora=ator.parte,
        antecedencia_dias_uteis=dias,
        antecedencia_minima_dias_uteis=minimo,
        fora_do_prazo=fora,
    )
    auditoria.registrar(ator, "Agendamento", ag.pk, "CRIACAO", "Registro original da solicitação", depois=auditoria.serializar(ag))
    return ag


def _conflitos(interprete, inicio, fim, ignorar_agendamento=None):
    qs = Escala.objects.filter(
        interprete=interprete,
        ativa=True,
        agendamento__status__in=(StatusAgendamento.SOLICITADO, StatusAgendamento.CONFIRMADO),
    ).select_related("agendamento")
    if ignorar_agendamento is not None:
        qs = qs.exclude(agendamento=ignorar_agendamento)
    return [e.agendamento for e in qs if e.agendamento.inicio_previsto < fim and inicio < e.agendamento.fim_previsto]


def _bloquear(ag):
    return Agendamento.objects.select_for_update().get(pk=ag.pk)


@transaction.atomic
def escalar(ator, ag, interprete, substitui=None):
    exigir_perfil(ator, Perfil.OPERADOR)
    exigir_mesmo_contrato(ator, ag, interprete)
    ag = _bloquear(ag)
    if ag.status not in STATUS_ATIVOS:
        raise ErroRegra("Só é possível escalar em agendamentos solicitados ou confirmados.")
    interprete = Interprete.objects.select_for_update().get(pk=interprete.pk)
    if not interprete.ativo:
        raise ErroRegra("Intérprete inativo.")
    if ag.escalas.filter(ativa=True, interprete=interprete).exists():
        raise ErroRegra("Intérprete já escalado neste agendamento.")
    conflitos = _conflitos(interprete, ag.inicio_previsto, ag.fim_previsto, ignorar_agendamento=ag)
    if conflitos:
        raise ErroRegra(f"Intérprete já escalado em horário sobreposto: {', '.join(c.codigo for c in conflitos)}.")
    e = Escala.objects.create(agendamento=ag, interprete=interprete, escalado_por=ator.usuario, substitui=substitui)
    auditoria.registrar(ator, "Escala", e.pk, "ESCALA", f"{interprete.nome_completo} escalado(a) em {ag.codigo}", depois=auditoria.serializar(e))
    return e


@transaction.atomic
def cancelar_escala(ator, escala, motivo, substituto=None):
    exigir_perfil(ator, Perfil.OPERADOR)
    ag = _bloquear(escala.agendamento)
    exigir_mesmo_contrato(ator, ag)
    motivo = exigir_texto(motivo, "Motivo do cancelamento da escala")
    escala = Escala.objects.select_for_update().get(pk=escala.pk)
    if not escala.ativa:
        raise ErroRegra("Escala já cancelada.")
    if ag.status not in STATUS_ATIVOS:
        raise ErroRegra("Agendamento não permite alteração de escala.")
    antes = auditoria.serializar(escala)
    escala.ativa = False
    escala.cancelada_em = timezone.now()
    escala.cancelada_por = ator.usuario
    escala.motivo_cancelamento = motivo
    escala.save()
    evento = auditoria.registrar(ator, "Escala", escala.pk, "CANCELAMENTO_ESCALA", motivo, antes, auditoria.serializar(escala))
    nova = None
    if substituto is not None:
        nova = escalar(ator, ag, substituto, substitui=escala)
    ag.refresh_from_db()
    if ag.status == StatusAgendamento.CONFIRMADO and ag.escalas.filter(ativa=True).count() < ag.qtd_profissionais:
        _mudar_status(ator, ag, StatusAgendamento.SOLICITADO, "Escala incompleta após cancelamento: requer nova confirmação.")
    texto = f"Escala cancelada: {escala.interprete.nome_completo}. Motivo: {motivo}."
    if nova:
        texto += f" Substituto(a): {nova.interprete.nome_completo}."
    _notificar(ag, TipoNotificacao.CANCELAMENTO_ESCALA, f"CANCELAMENTO_ESCALA:{escala.pk}:{evento.pk}", "Cancelamento de escala", texto)
    return nova


def _mudar_status(ator, ag, novo, justificativa, **campos):
    antes = auditoria.serializar(ag)
    ag.status = novo
    for k, v in campos.items():
        setattr(ag, k, v)
    ag.versao += 1
    ag.save()
    return auditoria.registrar(ator, "Agendamento", ag.pk, f"STATUS_{novo}", justificativa, antes, auditoria.serializar(ag))


@transaction.atomic
def confirmar(ator, ag):
    exigir_perfil(ator, Perfil.OPERADOR)
    exigir_mesmo_contrato(ator, ag)
    ag = _bloquear(ag)
    if ag.status != StatusAgendamento.SOLICITADO:
        raise ErroRegra("Só agendamentos no status Solicitado podem ser confirmados.")
    escalas = list(ag.escalas_ativas())
    if len(escalas) < ag.qtd_profissionais:
        raise ErroRegra(f"Escale {ag.qtd_profissionais} intérprete(s) antes de confirmar (há {len(escalas)}).")
    if ag.duracao_prevista_min > 60 and len(escalas) < 2:
        raise ErroRegra("Atendimento acima de uma hora exige ao menos dois intérpretes em revezamento.")
    evento = _mudar_status(
        ator, ag, StatusAgendamento.CONFIRMADO, "Confirmação de atendimento",
        confirmado_em=timezone.now(), confirmado_por=ator.usuario,
    )
    nomes = "; ".join(e.interprete.nome_completo for e in escalas)
    _notificar(ag, TipoNotificacao.CONFIRMACAO, f"CONFIRMACAO:{ag.pk}:{evento.pk}", "Atendimento confirmado",
               f"Atendimento confirmado por {ator.usuario.nome_completo}. Intérpretes escalados: {nomes}.")
    return ag


@transaction.atomic
def alterar_horario(ator, ag, novo_inicio, nova_duracao, justificativa, nova_qtd=None):
    exigir_perfil(ator, *PERFIS_SOLICITACAO)
    exigir_acesso(ator, ag)
    ag = _bloquear(ag)
    justificativa = exigir_texto(justificativa, "Justificativa da alteração")
    if ag.status not in STATUS_ATIVOS:
        raise ErroRegra("Só é possível alterar horário de agendamentos solicitados ou confirmados.")
    novo_inicio = _truncar_minuto(novo_inicio)
    qtd = nova_qtd if nova_qtd is not None else ag.qtd_profissionais
    _validar_dados(ag.modalidade, novo_inicio, nova_duracao, qtd)
    if novo_inicio <= timezone.now():
        raise ErroRegra("O novo horário deve ser futuro.")
    if novo_inicio == ag.inicio_previsto and nova_duracao == ag.duracao_prevista_min and qtd == ag.qtd_profissionais:
        raise ErroRegra("Nenhuma alteração informada.")
    fim = novo_inicio + timedelta(minutes=nova_duracao)
    for e in ag.escalas_ativas():
        c = _conflitos(e.interprete, novo_inicio, fim, ignorar_agendamento=ag)
        if c:
            raise ErroRegra(f"{e.interprete.nome_completo} tem conflito com {', '.join(x.codigo for x in c)}. Substitua a escala antes.")
    antes = auditoria.serializar(ag)
    inicio_anterior, duracao_anterior = ag.inicio_previsto, ag.duracao_prevista_min
    ag.inicio_previsto, ag.duracao_prevista_min, ag.qtd_profissionais = novo_inicio, nova_duracao, qtd
    ag.versao += 1
    reconfirmar = ag.status == StatusAgendamento.CONFIRMADO and ag.escalas.filter(ativa=True).count() < qtd
    if reconfirmar:
        ag.status = StatusAgendamento.SOLICITADO
    ag.save()
    evento = auditoria.registrar(ator, "Agendamento", ag.pk, "ALTERACAO_HORARIO", justificativa, antes, auditoria.serializar(ag))
    texto = (
        f"Horário alterado por {ator.usuario.nome_completo}. De {calendario.local(inicio_anterior):%d/%m/%Y %H:%M} "
        f"({duracao_anterior} min) para {calendario.local(novo_inicio):%d/%m/%Y %H:%M} ({nova_duracao} min). "
        f"Justificativa: {justificativa}."
    )
    if reconfirmar:
        texto += " A escala ficou incompleta e o agendamento voltou a 'Solicitado' (requer nova confirmação)."
    _notificar(ag, TipoNotificacao.ALTERACAO_HORARIO, f"ALTERACAO_HORARIO:{ag.pk}:{evento.pk}", "Alteração de horário", texto)
    return ag


def classificar_cancelamento(contrato, momento, inicio):
    """Aplica os DOIS critérios do edital sem escolher entre eles.

    - critério de horas: antecedência > 24 h (superior) / < 24 h (inferior); exatamente 24 h é ambíguo;
    - critério de dia útil: >= 1 dia útil (superior) / 0 (inferior).
    Se os critérios divergem, ou se a antecedência é exatamente 24 h → AMBIGUO (pendente de esclarecimento).
    """
    minutos = int((inicio - momento).total_seconds() // 60)
    feriados = calendario.feriados_do_contrato(contrato)
    dias = calendario.dias_uteis_entre(calendario.local(momento).date(), calendario.local(inicio).date(), feriados)
    if minutos == 24 * 60:
        return minutos, dias, ClassificacaoCancelamento.AMBIGUO
    horas_superior = minutos > 24 * 60
    dia_superior = dias >= 1
    if horas_superior and dia_superior:
        c = ClassificacaoCancelamento.ANTECEDENCIA_SUPERIOR
    elif not horas_superior and not dia_superior:
        c = ClassificacaoCancelamento.TARDIO
    else:
        c = ClassificacaoCancelamento.AMBIGUO
    return minutos, dias, c


@transaction.atomic
def cancelar(ator, ag, justificativa):
    exigir_perfil(ator, *PERFIS_SOLICITACAO)
    exigir_acesso(ator, ag)
    ag = _bloquear(ag)
    justificativa = exigir_texto(justificativa, "Justificativa do cancelamento")
    if ag.status not in STATUS_ATIVOS:
        raise ErroRegra("Só agendamentos solicitados ou confirmados podem ser cancelados.")
    agora = timezone.now()
    minutos, dias, classe = classificar_cancelamento(ag.contrato, agora, ag.inicio_previsto)
    escalas = list(ag.escalas_ativas())
    for e in escalas:
        antes_e = auditoria.serializar(e)
        e.ativa, e.cancelada_em, e.cancelada_por = False, agora, ator.usuario
        e.motivo_cancelamento = f"Cancelamento do agendamento: {justificativa}"
        e.save()
        auditoria.registrar(ator, "Escala", e.pk, "CANCELAMENTO_ESCALA", e.motivo_cancelamento, antes_e, auditoria.serializar(e))
    evento = _mudar_status(
        ator, ag, StatusAgendamento.CANCELADO, justificativa,
        cancelado_em=agora, cancelado_por=ator.usuario, cancelamento_parte=ator.parte,
        cancelamento_justificativa=justificativa, cancelamento_minutos_antecedencia=minutos,
        cancelamento_dias_uteis=dias, cancelamento_classificacao=classe,
    )
    texto = (
        f"Agendamento cancelado por {ator.usuario.nome_completo} ({Parte(ator.parte).label}). Justificativa: {justificativa}.\n"
        f"Antecedência: {minutos // 60} h {minutos % 60} min; {dias} dia(s) útil(eis). "
        f"Classificação: {ClassificacaoCancelamento(classe).label}."
    )
    if escalas:
        texto += " Escalas canceladas: " + "; ".join(e.interprete.nome_completo for e in escalas) + "."
    _notificar(ag, TipoNotificacao.CANCELAMENTO_AGENDAMENTO, f"CANCELAMENTO_AGENDAMENTO:{ag.pk}:{evento.pk}", "Cancelamento de agendamento/escala", texto)
    return ag


@transaction.atomic
def registrar_realizacao(ator, ag, inicio_real, fim_real, justificativa=""):
    """Registra horários efetivamente realizados e gera nova versão de medição."""
    from . import medicao

    exigir_perfil(ator, Perfil.OPERADOR)
    exigir_mesmo_contrato(ator, ag)
    ag = _bloquear(ag)
    if ag.status not in (StatusAgendamento.CONFIRMADO, StatusAgendamento.REALIZADO):
        raise ErroRegra("Só atendimentos confirmados (ou já realizados, para correção) aceitam horários realizados.")
    if ag.status == StatusAgendamento.REALIZADO:
        justificativa = exigir_texto(justificativa, "Justificativa da correção")
    inicio_real, fim_real = _truncar_minuto(inicio_real), _truncar_minuto(fim_real)
    if fim_real <= inicio_real:
        raise ErroRegra("O fim realizado deve ser posterior ao início.")
    if fim_real > timezone.now():
        raise ErroRegra("Não é possível registrar realização no futuro.")
    antes = auditoria.serializar(ag)
    ag.inicio_realizado, ag.fim_realizado = inicio_real, fim_real
    ag.realizado_registrado_em, ag.realizado_registrado_por = timezone.now(), ator.usuario
    ag.status = StatusAgendamento.REALIZADO
    ag.versao += 1
    ag.save()
    auditoria.registrar(ator, "Agendamento", ag.pk, "REGISTRO_REALIZACAO", justificativa or "Registro dos horários realizados", antes, auditoria.serializar(ag))
    return medicao.medir(ator, ag)
