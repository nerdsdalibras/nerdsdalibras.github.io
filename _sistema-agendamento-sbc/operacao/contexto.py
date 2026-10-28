from .models import AvisoInterno, Perfil


def contexto_global(request):
    v = getattr(request, "vinculo", None)
    ctx = {"vinculo": v, "Perfil": Perfil}
    if getattr(request, "user", None) is not None and request.user.is_authenticated:
        from .models import Vinculo
        from .servicos.base import Ator
        from .servicos.cadastros import pode_gerir_usuarios

        ctx["admin_plataforma"] = request.user.administrador_plataforma
        ctx["varias_cidades"] = Vinculo.objects.filter(usuario=request.user, ativo=True).count() > 1
        ctx["gere_usuarios"] = bool(v) and pode_gerir_usuarios(Ator(request.user, v.contrato, v.perfil))
    if v is not None:
        ctx["avisos_nao_lidos"] = AvisoInterno.objects.filter(
            usuario=request.user, lido_em__isnull=True, notificacao__contrato=v.contrato
        ).count()
    return ctx
