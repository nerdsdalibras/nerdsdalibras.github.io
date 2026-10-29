"""Trilha de auditoria append-only.

O banco preenche data/hora e a cadeia de hash (trigger). Esta camada apenas
monta o conteúdo: quem, o quê, justificativa e valores anteriores/posteriores.
"""
import datetime
import hashlib
import decimal
import uuid
from zoneinfo import ZoneInfo

from django.db import connection
from django.db.models.fields.files import FieldFile
from django.utils import timezone

from ..models import EventoAuditoria

FUSO = ZoneInfo("America/Sao_Paulo")


def _valor_json(v):
    if isinstance(v, datetime.datetime) and timezone.is_aware(v):
        # Sempre no horário de Brasília: o mesmo instante não pode aparecer como
        # "12:00+00:00" no valor anterior e "09:00-03:00" no posterior.
        return timezone.localtime(v, FUSO).isoformat()
    if isinstance(v, (datetime.datetime, datetime.date, datetime.time)):
        return v.isoformat()
    if isinstance(v, decimal.Decimal):
        return str(v)
    if isinstance(v, uuid.UUID):
        return str(v)
    if isinstance(v, FieldFile):
        return v.name or None
    if isinstance(v, (bytes, bytearray, memoryview)):
        dados = bytes(v)
        return {"bytes": len(dados), "sha256": hashlib.sha256(dados).hexdigest()}  # nunca o conteúdo
    return v


def serializar(obj, campos=None):
    dados = {}
    for f in obj._meta.concrete_fields:
        if campos is not None and f.name not in campos:
            continue
        nome = f.attname
        dados[nome] = _valor_json(getattr(obj, nome))
    return dados


def diferenca(antes, depois):
    """Retorna apenas os campos alterados (antes, depois)."""
    chaves = sorted(set(antes) | set(depois))
    a = {k: antes.get(k) for k in chaves if antes.get(k) != depois.get(k)}
    d = {k: depois.get(k) for k in chaves if antes.get(k) != depois.get(k)}
    return a, d


def registrar(ator, entidade, entidade_id, acao, justificativa="", antes=None, depois=None, contrato=None):
    if antes is not None and depois is not None:
        antes, depois = diferenca(antes, depois)
    return EventoAuditoria.objects.create(
        contrato=contrato if contrato is not None else getattr(ator, "contrato", None),
        entidade=entidade,
        entidade_id=str(entidade_id),
        acao=acao,
        usuario=getattr(ator, "usuario", None),
        usuario_descricao=getattr(ator, "descricao", "Sistema"),
        perfil=getattr(ator, "perfil", ""),
        justificativa=justificativa or "",
        dados_anteriores=antes,
        dados_posteriores=depois,
        ip=getattr(ator, "ip", None),
    )


class AtorSistema:
    """Ator para comandos de linha de comando (acesso à infraestrutura)."""

    usuario = None
    perfil = "SISTEMA"
    ip = None

    def __init__(self, contrato, descricao="Sistema (linha de comando)"):
        self.contrato = contrato
        self.descricao = descricao


SQL_HASH = """
encode(sha256(convert_to(concat_ws('|',
    e.hash_anterior, e.id::text, coalesce(e.contrato_id::text, ''), e.entidade, e.entidade_id, e.acao,
    coalesce(e.usuario_id::text, ''), e.usuario_descricao, e.perfil,
    to_char(e.ocorrido_em AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
    e.justificativa, coalesce(e.dados_anteriores::text, ''), coalesce(e.dados_posteriores::text, ''),
    coalesce(host(e.ip), '')), 'UTF8')), 'hex')
"""


def verificar_cadeia():
    """Recalcula a cadeia de hash. Retorna lista de ids com problema (vazia = íntegra)."""
    with connection.cursor() as c:
        c.execute(
            f"""
            SELECT e.id,
                   e.hash = {SQL_HASH} AS hash_ok,
                   e.hash_anterior = coalesce(lag(e.hash) OVER (ORDER BY e.id), '') AS elo_ok
            FROM operacao_eventoauditoria e ORDER BY e.id
            """
        )
        return [linha[0] for linha in c.fetchall() if not (linha[1] and linha[2])]
