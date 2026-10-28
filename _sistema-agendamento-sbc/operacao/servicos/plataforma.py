"""Administração da plataforma multi-cidades (Nerds da Libras).

Cada cidade é um Contrato: dados, usuários, calendário, parâmetros e histórico
ficam isolados por contrato. O administrador da plataforma cria cidades e
libera acessos, mas NÃO aprova nada em nome da Prefeitura (ver cadastros.py).
"""
import re
from datetime import date
from decimal import Decimal

from django.core.exceptions import PermissionDenied
from django.db import transaction
from django.utils.text import slugify

from ..models import Contrato, Feriado, ParametroMedicao, Perfil, Vinculo
from . import auditoria
from .base import Ator, ErroRegra, exigir_texto
from .parametros import FAIXAS_EDITAL, PRECO_INICIAL_PROPOSTA, validar_preco

# Feriados nacionais 2026–2027 (Lei 662/1949 e alterações; Lei 14.759/2023) e estaduais conhecidos.
# Municipais, pontos facultativos e recessos devem ser cadastrados pelo Fiscal de cada cidade.
FERIADOS_NACIONAIS = [
    ("2026-01-01", "Confraternização Universal"), ("2026-04-03", "Paixão de Cristo"),
    ("2026-04-21", "Tiradentes"), ("2026-05-01", "Dia do Trabalho"), ("2026-09-07", "Independência do Brasil"),
    ("2026-10-12", "Nossa Senhora Aparecida"), ("2026-11-02", "Finados"), ("2026-11-15", "Proclamação da República"),
    ("2026-11-20", "Dia Nacional de Zumbi e da Consciência Negra"), ("2026-12-25", "Natal"),
    ("2027-01-01", "Confraternização Universal"), ("2027-03-26", "Paixão de Cristo"),
    ("2027-04-21", "Tiradentes"), ("2027-05-01", "Dia do Trabalho"), ("2027-09-07", "Independência do Brasil"),
    ("2027-10-12", "Nossa Senhora Aparecida"), ("2027-11-02", "Finados"), ("2027-11-15", "Proclamação da República"),
    ("2027-11-20", "Dia Nacional de Zumbi e da Consciência Negra"), ("2027-12-25", "Natal"),
]
FERIADOS_ESTADUAIS = {
    "SP": [("2026-07-09", "Revolução Constitucionalista (feriado estadual SP)"),
           ("2027-07-09", "Revolução Constitucionalista (feriado estadual SP)")],
}
UFS = ("AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO").split()


def exigir_admin_plataforma(usuario):
    if not getattr(usuario, "administrador_plataforma", False):
        raise PermissionDenied("Apenas o administrador da plataforma.")


def ator_plataforma(usuario, contrato, ip=None):
    return Ator(usuario=usuario, contrato=contrato, perfil="ADMIN_PLATAFORMA", ip=ip)


def carregar_feriados_base(ator, contrato):
    lista = FERIADOS_NACIONAIS + FERIADOS_ESTADUAIS.get(contrato.uf, [])
    for d, desc in lista:
        f, criado = Feriado.objects.get_or_create(contrato=contrato, data=date.fromisoformat(d), defaults={"descricao": desc})
        if criado:
            auditoria.registrar(ator, "Feriado", f.pk, "INCLUSAO", "Carga inicial (nacional/estadual)", depois=auditoria.serializar(f))


@transaction.atomic
def criar_cidade(usuario, *, cidade, uf, orgao, referencia, prefixo, vigencia_inicio=None, vigencia_fim=None,
                 preco_inicial=None, meu_perfil=Perfil.OPERADOR, objeto="", ip=None):
    exigir_admin_plataforma(usuario)
    cidade, orgao, referencia = exigir_texto(cidade, "Cidade"), exigir_texto(orgao, "Órgão"), exigir_texto(referencia, "Referência")
    uf = (uf or "").upper().strip()
    if uf not in UFS:
        raise ErroRegra("UF inválida.")
    prefixo = (prefixo or "").upper().strip()
    if not re.fullmatch(r"[A-Z]{2,6}", prefixo):
        raise ErroRegra("Prefixo deve ter de 2 a 6 letras (ex.: SBC, FRA).")
    if Contrato.objects.filter(prefixo_codigo=prefixo).exists():
        raise ErroRegra(f"Prefixo {prefixo} já usado por outra cidade.")
    if meu_perfil not in (Perfil.OPERADOR, Perfil.ADMIN_TECNICO):
        raise ErroRegra("Seu perfil na cidade deve ser Operador ou Administrador técnico (lado da contratada).")
    if vigencia_inicio and vigencia_fim and vigencia_fim < vigencia_inicio:
        raise ErroRegra("Fim da vigência anterior ao início.")
    base = slugify(f"{cidade}-{uf}-{referencia}")[:45] or "contrato"
    codigo, n = base, 2
    while Contrato.objects.filter(codigo=codigo).exists():
        codigo, n = f"{base}-{n}", n + 1
    c = Contrato.objects.create(codigo=codigo, cidade=cidade.strip(), uf=uf, orgao=orgao, referencia=referencia,
                                objeto=objeto or "", prefixo_codigo=prefixo, vigencia_inicio=vigencia_inicio,
                                vigencia_fim=vigencia_fim, contratada="Nerds da Libras")
    ator = ator_plataforma(usuario, c, ip)
    auditoria.registrar(ator, "Contrato", c.pk, "CRIACAO_CIDADE", f"{cidade}/{uf}", depois=auditoria.serializar(c))
    carregar_feriados_base(ator, c)
    preco = validar_preco(preco_inicial) if preco_inicial not in (None, "") else PRECO_INICIAL_PROPOSTA
    p = ParametroMedicao.objects.create(
        contrato=c, versao=1, preco_unitario_hora=preco, faixas_excedente=FAIXAS_EDITAL,
        vigente_desde=vigencia_inicio or date(date.today().year, 1, 1), proposto_por=usuario,
        justificativa="Valor inicial da proposta, sujeito ao resultado da licitação; aguarda aprovação do Fiscal/Gestor.",
    )
    auditoria.registrar(ator, "ParametroMedicao", p.pk, "PROPOSTA", p.justificativa, depois=auditoria.serializar(p))
    v = Vinculo.objects.create(usuario=usuario, contrato=c, perfil=meu_perfil, criado_por=usuario)
    auditoria.registrar(ator, "Vinculo", v.pk, "CRIACAO_VINCULO", "Administrador da plataforma na nova cidade", depois=auditoria.serializar(v))
    return c, v


@transaction.atomic
def vincular_me(usuario, contrato, perfil=Perfil.OPERADOR, ip=None):
    """Dá ao administrador da plataforma acesso (lado da contratada) a uma cidade existente."""
    exigir_admin_plataforma(usuario)
    if perfil not in (Perfil.OPERADOR, Perfil.ADMIN_TECNICO):
        raise ErroRegra("Perfil deve ser do lado da contratada.")
    if Vinculo.objects.filter(usuario=usuario, contrato=contrato).exists():
        raise ErroRegra("Você já tem vínculo com esta cidade.")
    v = Vinculo.objects.create(usuario=usuario, contrato=contrato, perfil=perfil, criado_por=usuario)
    auditoria.registrar(ator_plataforma(usuario, contrato, ip), "Vinculo", v.pk, "CRIACAO_VINCULO",
                        "Administrador da plataforma vinculado à cidade", depois=auditoria.serializar(v))
    return v


def tem_fiscal_ativo(contrato):
    return Vinculo.objects.filter(contrato=contrato, perfil=Perfil.FISCAL, ativo=True, usuario__is_active=True).exists()
