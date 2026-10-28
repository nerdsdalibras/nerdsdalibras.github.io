from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone


class UsuarioManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, email, nome_completo, password=None, **extra):
        if not email:
            raise ValueError("E-mail é obrigatório.")
        usuario = self.model(email=self.normalize_email(email).lower(), nome_completo=nome_completo, **extra)
        usuario.set_password(password)
        usuario.save(using=self._db)
        return usuario

    def create_superuser(self, *args, **kwargs):
        # Não há superusuário de aplicação: todo poder passa por perfis e é auditado.
        raise NotImplementedError("Use o comando criar_usuario com um perfil.")


class Usuario(AbstractBaseUser, PermissionsMixin):
    """Usuário individual. Login por e-mail; nunca há contas compartilhadas."""

    email = models.EmailField("e-mail", unique=True)
    nome_completo = models.CharField("nome completo", max_length=200)
    is_active = models.BooleanField("ativo", default=True)
    criado_em = models.DateTimeField(default=timezone.now, editable=False)
    deve_trocar_senha = models.BooleanField(default=True)
    # Administrador da plataforma (Nerds da Libras): cria cidades/contratos e libera
    # acessos. Só é concedido por linha de comando/variável de implantação, nunca pela tela.
    administrador_plataforma = models.BooleanField(default=False)

    objects = UsuarioManager()

    USERNAME_FIELD = "email"
    EMAIL_FIELD = "email"
    REQUIRED_FIELDS = ["nome_completo"]

    class Meta:
        verbose_name = "usuário"

    def __str__(self):
        return f"{self.nome_completo} <{self.email}>"

    @property
    def is_staff(self):
        return False


class TentativaLogin(models.Model):
    """Registro de tentativas de login para bloqueio por força bruta."""

    email = models.CharField(max_length=254, db_index=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    sucesso = models.BooleanField()
    ocorrida_em = models.DateTimeField(default=timezone.now, db_index=True)
