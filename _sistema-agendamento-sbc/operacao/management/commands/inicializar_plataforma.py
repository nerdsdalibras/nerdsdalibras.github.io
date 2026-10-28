"""Cria o PRIMEIRO administrador da plataforma a partir de variáveis de ambiente.

Idempotente: se já existe administrador da plataforma, não faz nada (nunca
redefine senha). Usado no início do serviço na hospedagem:
  SGI_ADMIN_EMAIL, SGI_ADMIN_NOME, SGI_ADMIN_SENHA (troca obrigatória no 1º acesso).
"""
import os

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError

from operacao.servicos import auditoria
from operacao.servicos.auditoria import AtorSistema


class Command(BaseCommand):
    help = "Cria o primeiro administrador da plataforma (SGI_ADMIN_EMAIL/NOME/SENHA). Idempotente."

    def handle(self, *args, **o):
        U = get_user_model()
        if U.objects.filter(administrador_plataforma=True).exists():
            self.stdout.write("Administrador da plataforma já existe; nada a fazer.")
            return
        email = (os.environ.get("SGI_ADMIN_EMAIL") or "").strip().lower()
        senha = os.environ.get("SGI_ADMIN_SENHA") or ""
        nome = os.environ.get("SGI_ADMIN_NOME") or "Administrador da plataforma"
        if not email or not senha:
            self.stdout.write(self.style.WARNING("SGI_ADMIN_EMAIL/SGI_ADMIN_SENHA não definidos: nenhum administrador criado."))
            return
        u = U.objects.filter(email=email).first()
        if u is None:
            try:
                validate_password(senha)
            except ValidationError as e:
                raise CommandError("Senha inicial fraca: " + "; ".join(e.messages))
            u = U.objects.create_user(email=email, nome_completo=nome, password=senha)
        u.administrador_plataforma = True
        u.deve_trocar_senha = True
        u.save()
        auditoria.registrar(AtorSistema(None, "Implantação (variáveis de ambiente)"), "Usuario", u.pk,
                            "ADMIN_PLATAFORMA_CRIADO", depois=auditoria.serializar(u, ["email", "nome_completo", "administrador_plataforma"]))
        self.stdout.write(self.style.SUCCESS(f"Administrador da plataforma criado: {email} (troca de senha obrigatória no 1º acesso)."))
