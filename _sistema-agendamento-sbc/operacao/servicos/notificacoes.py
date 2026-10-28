"""Alertas aos fiscais/gestores da Prefeitura.

Padrão outbox: a notificação é gravada na MESMA transação da operação que a
originou e enviada logo após o commit. Se o envio falhar, o comando
`processar_notificacoes` (agendado no servidor) faz novas tentativas.

Proteções contra duplicidade:
- `chave_idempotencia` única no banco (a mesma operação não gera 2 notificações);
- bloqueio de linha (SELECT ... FOR UPDATE SKIP LOCKED) durante o envio;
- notificações ENVIADAS nunca são reenviadas;
- cabeçalho Message-ID determinístico, que permite ao servidor/cliente de
  e-mail descartar repetição caso a confirmação do envio se perca.

Sem credenciais SMTP ou sem autorização (EMAIL_ENVIO_HABILITADO=false), o
status fica INTEGRACAO_PENDENTE — nunca é registrado sucesso simulado.
"""
import hashlib
import logging
from datetime import timedelta

from django.conf import settings
from django.core.mail import EmailMessage, get_connection
from django.db import transaction
from django.utils import timezone

from ..models import AvisoInterno, Notificacao, Perfil, StatusNotificacao, TentativaEnvio, Vinculo

log = logging.getLogger(__name__)

FINAIS = {StatusNotificacao.ENVIADA, StatusNotificacao.FALHA_DEFINITIVA, StatusNotificacao.SEM_DESTINATARIO}


def diagnostico_email():
    """Lista o que impede o envio real (vazia = configurado). Não expõe segredos."""
    from email.utils import parseaddr

    problemas = []
    if not settings.EMAIL_ENVIO_HABILITADO:
        problemas.append("Envio desabilitado (EMAIL_ENVIO_HABILITADO=false): aguardando autorização para envio real.")
    if settings.EMAIL_BACKEND.endswith("smtp.EmailBackend"):
        if not settings.EMAIL_HOST:
            problemas.append("Servidor SMTP não informado (EMAIL_HOST).")
        if settings.EMAIL_HOST_USER and not settings.EMAIL_HOST_PASSWORD:
            problemas.append(f"Senha da conta {settings.EMAIL_HOST_USER} não configurada (EMAIL_HOST_PASSWORD; no Gmail, use uma senha de app).")
        if settings.EMAIL_HOST.lower() == "smtp.gmail.com":
            remetente = parseaddr(settings.DEFAULT_FROM_EMAIL)[1].lower()
            if remetente != settings.EMAIL_HOST_USER.lower():
                problemas.append(f"No Gmail o remetente ({remetente or 'vazio'}) deve ser a própria conta autenticada ({settings.EMAIL_HOST_USER}).")
            if not (settings.EMAIL_USE_TLS or settings.EMAIL_USE_SSL):
                problemas.append("Gmail exige conexão cifrada (EMAIL_USE_TLS=true na porta 587).")
    return problemas


def integracao_configurada():
    return not diagnostico_email()


def destinatarios_prefeitura(contrato):
    return list(
        Vinculo.objects.filter(contrato=contrato, perfil=Perfil.FISCAL, ativo=True, usuario__is_active=True)
        .select_related("usuario")
        .order_by("usuario__email")
    )


def enfileirar(contrato, tipo, chave, assunto, corpo, agendamento=None):
    """Cria (uma única vez por chave) a notificação e os avisos internos."""
    vinculos = destinatarios_prefeitura(contrato)
    notif, criada = Notificacao.objects.get_or_create(
        chave_idempotencia=chave,
        defaults=dict(
            contrato=contrato,
            tipo=tipo,
            agendamento=agendamento,
            assunto=assunto[:300],
            corpo=corpo,
            destinatarios=[v.usuario.email for v in vinculos],
        ),
    )
    if criada:
        for v in vinculos:
            AvisoInterno.objects.create(notificacao=notif, usuario=v.usuario)
        transaction.on_commit(lambda: enviar(notif.pk))
    return notif


def _filtrar_dominios(emails):
    permitidos = [d.lower() for d in settings.EMAIL_DOMINIOS_PERMITIDOS]
    if not permitidos:
        return emails, []
    ok = [e for e in emails if e.rsplit("@", 1)[-1].lower() in permitidos]
    return ok, [e for e in emails if e not in ok]


def _message_id(notif):
    h = hashlib.sha256(notif.chave_idempotencia.encode()).hexdigest()[:32]
    return f"<sgi-{h}@{settings.URL_BASE.split('//')[-1].split('/')[0].split(':')[0] or 'sgi'}>"


def enviar(notificacao_id, forcar=False):
    """Tenta enviar uma notificação. Seguro para chamadas concorrentes."""
    with transaction.atomic():
        notif = (
            Notificacao.objects.select_for_update(skip_locked=True).filter(pk=notificacao_id).first()
        )
        if notif is None or notif.status in FINAIS and not (forcar and notif.status == StatusNotificacao.FALHA_DEFINITIVA):
            return notif
        agora = timezone.now()
        if not notif.destinatarios:
            _resultado(notif, StatusNotificacao.SEM_DESTINATARIO, "Nenhum fiscal/gestor ativo cadastrado.")
            return notif
        if not integracao_configurada():
            _resultado(
                notif,
                StatusNotificacao.INTEGRACAO_PENDENTE,
                "E-mail não enviado: " + " ".join(diagnostico_email()) + " Aviso disponível na caixa interna do sistema.",
            )
            return notif
        para, bloqueados = _filtrar_dominios(notif.destinatarios)
        if not para:
            _resultado(notif, StatusNotificacao.SEM_DESTINATARIO, f"Destinatários fora dos domínios permitidos: {bloqueados}")
            return notif
        notif.tentativas += 1
        try:
            msg = EmailMessage(
                subject=notif.assunto,
                body=notif.corpo,
                from_email=settings.DEFAULT_FROM_EMAIL,
                to=para,
                headers={"Message-ID": _message_id(notif), "X-SGI-Chave": notif.chave_idempotencia},
                reply_to=settings.EMAIL_RESPONDER_PARA or None,
                connection=get_connection(fail_silently=False),
            )
            msg.send(fail_silently=False)
        except Exception as exc:  # noqa: BLE001 — qualquer falha de envio é registrada
            log.warning("Falha ao enviar notificação %s: %s", notif.pk, exc)
            if notif.tentativas >= settings.NOTIFICACAO_MAX_TENTATIVAS:
                _resultado(notif, StatusNotificacao.FALHA_DEFINITIVA, repr(exc))
            else:
                notif.proxima_tentativa_em = agora + timedelta(minutes=2 ** notif.tentativas)
                _resultado(notif, StatusNotificacao.FALHA, repr(exc))
            return notif
        notif.enviada_em = agora
        notif.message_id = _message_id(notif)
        detalhe = f"Enviado a {len(para)} destinatário(s)."
        if bloqueados:
            detalhe += f" Não enviados (domínio não permitido): {bloqueados}"
        _resultado(notif, StatusNotificacao.ENVIADA, detalhe)
        return notif


def _resultado(notif, status, detalhe):
    notif.status = status
    notif.ultimo_erro = "" if status == StatusNotificacao.ENVIADA else detalhe
    notif.save()
    TentativaEnvio.objects.create(notificacao=notif, resultado=status, detalhe=detalhe[:2000])


def processar_pendentes(limite=100):
    """Reenvio: pendentes, falhas vencidas e integração pendente (se agora configurada)."""
    agora = timezone.now()
    from django.db.models import Q

    filtro = Q(status=StatusNotificacao.PENDENTE) | Q(
        status=StatusNotificacao.FALHA, proxima_tentativa_em__lte=agora
    )
    if integracao_configurada():
        filtro |= Q(status=StatusNotificacao.INTEGRACAO_PENDENTE)
    ids = list(Notificacao.objects.filter(filtro).order_by("criada_em").values_list("pk", flat=True)[:limite])
    return [enviar(i) for i in ids]


def enviar_teste(para, executor):
    """Envia UMA mensagem de teste a um endereço informado explicitamente. Auditado."""
    from . import auditoria
    from .auditoria import AtorSistema

    problemas = diagnostico_email()
    if problemas:
        return False, " ".join(problemas)
    try:
        EmailMessage(
            subject="[SGI] Teste de envio de e-mail",
            body=(
                "Mensagem de TESTE do Sistema de Agendamento de Intérpretes (SGI).\n"
                f"Solicitada por: {executor} em {timezone.localtime():%d/%m/%Y %H:%M}.\n"
                "Não contém dados de atendimentos."
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[para],
            connection=get_connection(fail_silently=False),
        ).send(fail_silently=False)
        ok, detalhe = True, f"Mensagem de teste aceita pelo servidor {settings.EMAIL_HOST}."
    except Exception as exc:  # noqa: BLE001
        ok, detalhe = False, repr(exc)
    auditoria.registrar(AtorSistema(None, f"Linha de comando — {executor}"), "Email", para, "TESTE_ENVIO", detalhe)
    return ok, detalhe
