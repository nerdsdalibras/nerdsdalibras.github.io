from datetime import timedelta

from django.conf import settings
from django.contrib.auth.backends import ModelBackend
from django.utils import timezone

from .models import TentativaLogin, Usuario


def esta_bloqueado(email):
    desde = timezone.now() - timedelta(minutes=settings.LOGIN_BLOQUEIO_MINUTOS)
    ultimas = TentativaLogin.objects.filter(email=email, ocorrida_em__gte=desde).order_by("-ocorrida_em")
    falhas = 0
    for t in ultimas[: settings.LOGIN_MAX_TENTATIVAS]:
        if t.sucesso:
            break
        falhas += 1
    return falhas >= settings.LOGIN_MAX_TENTATIVAS


class EmailBackend(ModelBackend):
    def authenticate(self, request, username=None, password=None, **kwargs):
        email = (username or kwargs.get("email") or "").strip().lower()
        if not email or password is None:
            return None
        ip = request.META.get("REMOTE_ADDR") if request else None
        if esta_bloqueado(email):
            TentativaLogin.objects.create(email=email, ip=ip, sucesso=False)
            return None
        try:
            usuario = Usuario.objects.get(email=email)
        except Usuario.DoesNotExist:
            Usuario().set_password(password)  # equaliza tempo de resposta
            TentativaLogin.objects.create(email=email, ip=ip, sucesso=False)
            return None
        ok = usuario.check_password(password) and self.user_can_authenticate(usuario)
        TentativaLogin.objects.create(email=email, ip=ip, sucesso=ok)
        return usuario if ok else None
