from django.contrib import messages
from django.contrib.auth import views as auth_views
from django.contrib.auth.forms import AuthenticationForm
from django.urls import reverse_lazy

from .backends import esta_bloqueado


class FormLogin(AuthenticationForm):
    error_messages = {
        "invalid_login": "E-mail ou senha inválidos, ou acesso temporariamente bloqueado por excesso de tentativas.",
        "inactive": "Usuário inativo.",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["username"].label = "E-mail"
        self.fields["username"].widget.attrs.update({"autocomplete": "username", "type": "email"})


class EntrarView(auth_views.LoginView):
    template_name = "contas/login.html"
    authentication_form = FormLogin
    redirect_authenticated_user = True

    def form_invalid(self, form):
        email = (self.request.POST.get("username") or "").strip().lower()
        if email and esta_bloqueado(email):
            messages.error(self.request, "Acesso temporariamente bloqueado por excesso de tentativas.")
        return super().form_invalid(form)


class TrocarSenhaView(auth_views.PasswordChangeView):
    template_name = "contas/trocar_senha.html"
    success_url = reverse_lazy("operacao:painel")

    def form_valid(self, form):
        resposta = super().form_valid(form)
        self.request.user.deve_trocar_senha = False
        self.request.user.save(update_fields=["deve_trocar_senha"])
        messages.success(self.request, "Senha alterada.")
        return resposta
