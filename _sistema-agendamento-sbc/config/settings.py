"""Configuração do SGI-SBC.

Todos os segredos e parâmetros de ambiente vêm de variáveis de ambiente.
Nenhuma credencial deve ser escrita neste arquivo.
"""
import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent


def env(nome, padrao=None, obrigatorio=False):
    valor = os.environ.get(nome, padrao)
    if obrigatorio and not valor:
        raise ImproperlyConfigured(f"Variável de ambiente obrigatória ausente: {nome}")
    return valor


def env_bool(nome, padrao=False):
    valor = os.environ.get(nome)
    if valor is None:
        return padrao
    return valor.strip().lower() in {"1", "true", "sim", "yes", "on"}


def env_lista(nome, padrao=""):
    return [v.strip() for v in os.environ.get(nome, padrao).split(",") if v.strip()]


DEBUG = env_bool("DJANGO_DEBUG", False)
SECRET_KEY = env("DJANGO_SECRET_KEY", obrigatorio=True)
ALLOWED_HOSTS = env_lista("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")
CSRF_TRUSTED_ORIGINS = env_lista("DJANGO_CSRF_TRUSTED_ORIGINS")

INSTALLED_APPS = [
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "contas",
    "operacao",
]
# Observação: o django.contrib.admin NÃO é instalado de propósito. Ele permitiria
# editar registros contornando as regras de negócio e a trilha de auditoria.

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "operacao.middleware.ContratoAtivoMiddleware",
    "operacao.middleware.CabecalhosSegurancaMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
                "operacao.contexto.contexto_global",
            ],
        },
    },
]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env("DB_NAME", "sgi"),
        "USER": env("DB_USER", "sgi"),
        "PASSWORD": env("DB_PASSWORD", ""),
        "HOST": env("DB_HOST", "localhost"),
        "PORT": env("DB_PORT", "5432"),
        "CONN_MAX_AGE": 60,
        "OPTIONS": {"sslmode": env("DB_SSLMODE", "prefer")},
        "TEST": {"NAME": env("DB_TEST_NAME", "test_sgi")},
    }
}

AUTH_USER_MODEL = "contas.Usuario"
AUTHENTICATION_BACKENDS = ["contas.backends.EmailBackend"]
LOGIN_URL = "contas:login"
LOGIN_REDIRECT_URL = "operacao:painel"
LOGOUT_REDIRECT_URL = "contas:login"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 12}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# Bloqueio após tentativas de login malsucedidas.
LOGIN_MAX_TENTATIVAS = int(env("LOGIN_MAX_TENTATIVAS", "5"))
LOGIN_BLOQUEIO_MINUTOS = int(env("LOGIN_BLOQUEIO_MINUTOS", "15"))

LANGUAGE_CODE = "pt-br"
TIME_ZONE = "America/Sao_Paulo"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"
        if not DEBUG
        else "django.contrib.staticfiles.storage.StaticFilesStorage"
    },
}
# Arquivos enviados (comprovações) NUNCA são servidos diretamente: o download
# passa por uma view que confere autenticação, perfil e contrato.
MEDIA_ROOT = Path(env("MEDIA_ROOT", str(BASE_DIR / "media")))
ANEXO_TAMANHO_MAXIMO_MB = int(env("ANEXO_TAMANHO_MAXIMO_MB", "10"))

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ---- Segurança HTTP ----
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_AGE = int(env("SESSAO_DURACAO_SEGUNDOS", str(8 * 3600)))
SESSION_EXPIRE_AT_BROWSER_CLOSE = True
CSRF_COOKIE_HTTPONLY = True
X_FRAME_OPTIONS = "DENY"
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
HTTPS_ATIVO = env_bool("HTTPS_ATIVO", not DEBUG)
SESSION_COOKIE_SECURE = HTTPS_ATIVO
CSRF_COOKIE_SECURE = HTTPS_ATIVO
SECURE_SSL_REDIRECT = HTTPS_ATIVO and env_bool("SECURE_SSL_REDIRECT", True)
SECURE_HSTS_SECONDS = int(env("SECURE_HSTS_SECONDS", "31536000" if HTTPS_ATIVO else "0"))
if env_bool("ATRAS_DE_PROXY", False):
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# ---- E-mail (alertas) ----
# Envio real só acontece se EMAIL_ENVIO_HABILITADO=true E houver EMAIL_HOST.
# Sem isso, as notificações ficam registradas como "INTEGRACAO_PENDENTE".
EMAIL_ENVIO_HABILITADO = env_bool("EMAIL_ENVIO_HABILITADO", False)
EMAIL_BACKEND = env("EMAIL_BACKEND", "django.core.mail.backends.smtp.EmailBackend")
EMAIL_HOST = env("EMAIL_HOST", "")
EMAIL_PORT = int(env("EMAIL_PORT", "587"))
EMAIL_HOST_USER = env("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", True)
EMAIL_USE_SSL = env_bool("EMAIL_USE_SSL", False)
EMAIL_TIMEOUT = int(env("EMAIL_TIMEOUT", "20"))
DEFAULT_FROM_EMAIL = env("EMAIL_REMETENTE", "nao-responda@exemplo.invalid")
# Lista opcional de domínios permitidos (proteção em homologação). Vazia = sem filtro.
EMAIL_DOMINIOS_PERMITIDOS = env_lista("EMAIL_DOMINIOS_PERMITIDOS")
NOTIFICACAO_MAX_TENTATIVAS = int(env("NOTIFICACAO_MAX_TENTATIVAS", "6"))

# Endereço público do sistema (usado nos links dos e-mails).
URL_BASE = env("URL_BASE", "http://localhost:8000")

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": env("LOG_LEVEL", "INFO")},
}
