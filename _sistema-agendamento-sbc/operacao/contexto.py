from .models import AvisoInterno, Perfil


def contexto_global(request):
    v = getattr(request, "vinculo", None)
    ctx = {"vinculo": v, "Perfil": Perfil}
    if v is not None:
        ctx["avisos_nao_lidos"] = AvisoInterno.objects.filter(
            usuario=request.user, lido_em__isnull=True, notificacao__contrato=v.contrato
        ).count()
    return ctx
