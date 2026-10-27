"""Infraestrutura comum dos serviços: identificação do ator e checagem de perfil."""
from dataclasses import dataclass

from django.core.exceptions import PermissionDenied

from ..models import PARTE_DO_PERFIL, Perfil


class ErroRegra(Exception):
    """Violação de regra de negócio, exibida ao usuário."""


@dataclass(frozen=True)
class Ator:
    """Quem executa a operação: usuário + perfil no contrato + IP de origem."""

    usuario: object
    contrato: object
    perfil: str
    ip: str | None = None

    @property
    def parte(self):
        return PARTE_DO_PERFIL[self.perfil]

    @property
    def descricao(self):
        return f"{self.usuario.nome_completo} <{self.usuario.email}>"

    @classmethod
    def do_request(cls, request):
        v = request.vinculo
        return cls(usuario=request.user, contrato=v.contrato, perfil=v.perfil, ip=request.META.get("REMOTE_ADDR"))


def exigir_perfil(ator, *perfis):
    if ator.perfil not in perfis:
        nomes = ", ".join(Perfil(p).label for p in perfis)
        raise PermissionDenied(f"Operação permitida apenas para: {nomes}.")


def exigir_mesmo_contrato(ator, *objetos):
    for obj in objetos:
        if obj is not None and obj.contrato_id != ator.contrato.id:
            raise PermissionDenied("Registro de outro contrato.")


def exigir_texto(valor, nome):
    if not valor or not str(valor).strip():
        raise ErroRegra(f"{nome} é obrigatório(a).")
    return str(valor).strip()
