"""Usuários/vínculos, intérpretes e calendário de feriados."""
import secrets

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from django.utils import timezone

from ..models import Feriado, Interprete, Parte, PARTE_DO_PERFIL, Perfil, TipoNotificacao, Vinculo
from . import auditoria, notificacoes
from .base import ErroRegra, exigir_mesmo_contrato, exigir_perfil, exigir_texto

CAMPOS_USUARIO = ["email", "nome_completo", "is_active"]


def gerar_senha_temporaria():
    return secrets.token_urlsafe(12) + "-Aa1"


@transaction.atomic
def criar_usuario_vinculo(ator, email, nome_completo, perfil, senha=None):
    """Cria (ou reaproveita) usuário e vincula ao contrato do ator.

    Retorna (vinculo, senha_temporaria). A senha é exibida uma única vez.
    """
    if getattr(ator, "perfil", None) != "SISTEMA":
        exigir_perfil(ator, Perfil.ADMIN_TECNICO)
    if perfil not in Perfil.values:
        raise ErroRegra("Perfil inválido.")
    Usuario = get_user_model()
    email = exigir_texto(email, "E-mail").lower()
    usuario = Usuario.objects.filter(email=email).first()
    senha_temp = None
    if usuario is None:
        senha_temp = senha or gerar_senha_temporaria()
        validate_password(senha_temp)
        usuario = Usuario.objects.create_user(email=email, nome_completo=exigir_texto(nome_completo, "Nome"), password=senha_temp)
        auditoria.registrar(ator, "Usuario", usuario.pk, "CRIACAO_USUARIO", depois=auditoria.serializar(usuario, CAMPOS_USUARIO))
    if Vinculo.objects.filter(usuario=usuario, contrato=ator.contrato).exists():
        raise ErroRegra("Usuário já possui vínculo com este contrato (altere o existente).")
    v = Vinculo.objects.create(usuario=usuario, contrato=ator.contrato, perfil=perfil, criado_por=getattr(ator, "usuario", None))
    ev = auditoria.registrar(ator, "Vinculo", v.pk, "CRIACAO_VINCULO", depois=auditoria.serializar(v))
    if PARTE_DO_PERFIL[perfil] == Parte.PREFEITURA:
        notificacoes.enfileirar(
            ator.contrato, TipoNotificacao.ACESSO_PREFEITURA, f"ACESSO_PREFEITURA:{v.pk}:{ev.pk}",
            "[SGI] Novo acesso com perfil da Prefeitura",
            f"Foi criado acesso de {Perfil(perfil).label} para {usuario.nome_completo} <{usuario.email}> "
            f"por {ator.descricao} em {timezone.localtime():%d/%m/%Y %H:%M}. Se não reconhece este acesso, "
            "comunique a gestão do contrato.",
        )
    return v, senha_temp


@transaction.atomic
def alterar_vinculo(ator, vinculo, ativo, perfil, justificativa):
    exigir_perfil(ator, Perfil.ADMIN_TECNICO)
    exigir_mesmo_contrato(ator, vinculo)
    justificativa = exigir_texto(justificativa, "Justificativa")
    if vinculo.usuario_id == ator.usuario.pk:
        raise ErroRegra("Não é permitido alterar o próprio vínculo.")
    antes = auditoria.serializar(vinculo)
    perfil_antigo = vinculo.perfil
    vinculo.ativo, vinculo.perfil = ativo, perfil
    vinculo.save()
    ev = auditoria.registrar(ator, "Vinculo", vinculo.pk, "ALTERACAO_VINCULO", justificativa, antes, auditoria.serializar(vinculo))
    if ativo and PARTE_DO_PERFIL[perfil] == Parte.PREFEITURA and perfil != perfil_antigo:
        notificacoes.enfileirar(
            ator.contrato, TipoNotificacao.ACESSO_PREFEITURA, f"ACESSO_PREFEITURA:{vinculo.pk}:{ev.pk}",
            "[SGI] Perfil da Prefeitura atribuído",
            f"{vinculo.usuario.nome_completo} recebeu o perfil {Perfil(perfil).label} por {ator.descricao}. Justificativa: {justificativa}",
        )
    return vinculo


@transaction.atomic
def salvar_interprete(ator, dados, interprete=None, justificativa=""):
    exigir_perfil(ator, Perfil.OPERADOR)
    campos = {
        "nome_completo": exigir_texto(dados.get("nome_completo"), "Nome completo"),
        "telefone": exigir_texto(dados.get("telefone"), "Telefone"),
        "email": exigir_texto(dados.get("email"), "E-mail").lower(),
        "ativo": bool(dados.get("ativo", True)),
    }
    if interprete is None:
        i = Interprete.objects.create(contrato=ator.contrato, **campos)
        auditoria.registrar(ator, "Interprete", i.pk, "CADASTRO", depois=auditoria.serializar(i))
        return i
    exigir_mesmo_contrato(ator, interprete)
    antes = auditoria.serializar(interprete)
    for k, v in campos.items():
        setattr(interprete, k, v)
    interprete.save()
    auditoria.registrar(ator, "Interprete", interprete.pk, "ALTERACAO", justificativa, antes, auditoria.serializar(interprete))
    return interprete


@transaction.atomic
def adicionar_feriado(ator, data, descricao):
    exigir_perfil(ator, Perfil.FISCAL)
    f = Feriado.objects.filter(contrato=ator.contrato, data=data).first()
    if f and f.ativo:
        raise ErroRegra("Data já cadastrada.")
    if f:
        antes = auditoria.serializar(f)
        f.ativo, f.descricao = True, exigir_texto(descricao, "Descrição")
        f.save()
        auditoria.registrar(ator, "Feriado", f.pk, "REATIVACAO", descricao, antes, auditoria.serializar(f))
        return f
    f = Feriado.objects.create(contrato=ator.contrato, data=data, descricao=exigir_texto(descricao, "Descrição"), criado_por=ator.usuario)
    auditoria.registrar(ator, "Feriado", f.pk, "INCLUSAO", descricao, depois=auditoria.serializar(f))
    return f


@transaction.atomic
def desativar_feriado(ator, feriado, justificativa):
    exigir_perfil(ator, Perfil.FISCAL)
    exigir_mesmo_contrato(ator, feriado)
    justificativa = exigir_texto(justificativa, "Justificativa")
    antes = auditoria.serializar(feriado)
    feriado.ativo = False
    feriado.save()
    auditoria.registrar(ator, "Feriado", feriado.pk, "DESATIVACAO", justificativa, antes, auditoria.serializar(feriado))
    return feriado
