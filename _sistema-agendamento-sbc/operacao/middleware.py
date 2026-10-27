"""Define o contrato ativo da requisição a partir do vínculo do usuário.

Todo acesso a dados de negócio passa por `request.vinculo`/`request.contrato`;
sem vínculo ativo, o usuário não vê nenhum dado.
"""
from django.shortcuts import redirect
from django.urls import reverse

from .models import Vinculo

CHAVE_SESSAO = "vinculo_id"
LIVRES = ("/contas/", "/static/", "/sem-vinculo/", "/selecionar-contrato/")


class ContratoAtivoMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.vinculo = None
        request.contrato = None
        if request.user.is_authenticated:
            vinculos = Vinculo.objects.filter(usuario=request.user, ativo=True).select_related("contrato")
            escolhido = vinculos.filter(pk=request.session.get(CHAVE_SESSAO)).first()
            if escolhido is None and vinculos.count() == 1:
                escolhido = vinculos.first()
                request.session[CHAVE_SESSAO] = escolhido.pk
            if escolhido:
                request.vinculo, request.contrato = escolhido, escolhido.contrato
            caminho = request.path
            if not caminho.startswith(LIVRES):
                if request.user.deve_trocar_senha:
                    return redirect(reverse("contas:trocar_senha"))
                if request.vinculo is None:
                    if vinculos.exists():
                        return redirect(reverse("operacao:selecionar_contrato"))
                    return redirect(reverse("operacao:sem_vinculo"))
        return self.get_response(request)


class CabecalhosSegurancaMiddleware:
    """CSP restritiva: nenhum script/estilo de terceiros, sem rastreadores."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        resposta = self.get_response(request)
        resposta.setdefault(
            "Content-Security-Policy",
            "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
            "form-action 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
        )
        resposta.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        if request.user.is_authenticated:
            resposta.setdefault("Cache-Control", "no-store")
        return resposta
