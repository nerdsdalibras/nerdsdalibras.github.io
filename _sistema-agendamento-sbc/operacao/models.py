"""Modelos do SGI-SBC.

Regras de proteção que NÃO dependem da aplicação ficam em triggers do
PostgreSQL (ver migração 0002_triggers_imutabilidade). Os métodos delete()
abaixo são uma segunda barreira, não a única.
"""
import uuid
from datetime import timedelta

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone


class ExclusaoProibida(ValidationError):
    pass


class SemExclusao(models.Model):
    """Base para registros que nunca podem ser apagados pela aplicação."""

    class Meta:
        abstract = True

    def delete(self, *args, **kwargs):
        raise ExclusaoProibida("Registros deste tipo não podem ser excluídos.")


# ---------------------------------------------------------------- enums
class Perfil(models.TextChoices):
    SOLICITANTE = "SOLICITANTE", "Solicitante da Prefeitura"
    FISCAL = "FISCAL", "Fiscal/Gestor da Prefeitura"
    OPERADOR = "OPERADOR", "Operador da contratada"
    ADMIN_TECNICO = "ADMIN_TECNICO", "Administrador técnico"


class Parte(models.TextChoices):
    PREFEITURA = "PREFEITURA", "Prefeitura"
    CONTRATADA = "CONTRATADA", "Contratada"


PARTE_DO_PERFIL = {
    Perfil.SOLICITANTE: Parte.PREFEITURA,
    Perfil.FISCAL: Parte.PREFEITURA,
    Perfil.OPERADOR: Parte.CONTRATADA,
    Perfil.ADMIN_TECNICO: Parte.CONTRATADA,
}


class Modalidade(models.TextChoices):
    PRESENCIAL = "PRESENCIAL", "Presencial"
    REMOTO = "REMOTO", "Remoto"


class StatusAgendamento(models.TextChoices):
    SOLICITADO = "SOLICITADO", "Solicitado"
    CONFIRMADO = "CONFIRMADO", "Confirmado"
    REALIZADO = "REALIZADO", "Realizado (aguardando homologação)"
    HOMOLOGADO = "HOMOLOGADO", "Homologado pelas partes"
    CANCELADO = "CANCELADO", "Cancelado"


class ClassificacaoCancelamento(models.TextChoices):
    ANTECEDENCIA_SUPERIOR = "ANTECEDENCIA_SUPERIOR", "Antecedência superior (ambos os critérios)"
    TARDIO = "TARDIO", "Tardio (inferior em ambos os critérios)"
    AMBIGUO = "AMBIGUO", "Pendente de esclarecimento (critérios divergem ou exatamente 24 h)"


# ---------------------------------------------------------------- contrato
class Contrato(SemExclusao):
    """Unidade de isolamento. Nenhum dado atravessa contratos."""

    codigo = models.SlugField(unique=True)
    cidade = models.CharField(max_length=120, blank=True)
    uf = models.CharField("UF", max_length=2, blank=True)
    orgao = models.CharField("órgão contratante", max_length=200)
    contratada = models.CharField(max_length=200)
    referencia = models.CharField("referência (licitação/processo)", max_length=200)
    objeto = models.TextField(blank=True)
    prefixo_codigo = models.CharField(max_length=10)
    vigencia_inicio = models.DateField(null=True, blank=True)
    vigencia_fim = models.DateField(null=True, blank=True)
    proximo_numero = models.PositiveIntegerField(default=1)
    proximo_numero_chamado = models.PositiveIntegerField(default=1)
    criado_em = models.DateTimeField(default=timezone.now, editable=False)

    def __str__(self):
        return f"{self.orgao} — {self.referencia}"

    @property
    def nome_curto(self):
        return f"{self.cidade}/{self.uf}" if self.cidade else self.orgao


class Vinculo(models.Model):
    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="vinculos")
    contrato = models.ForeignKey(Contrato, on_delete=models.PROTECT, related_name="vinculos")
    perfil = models.CharField(max_length=20, choices=Perfil.choices)
    ativo = models.BooleanField(default=True)
    criado_em = models.DateTimeField(default=timezone.now, editable=False)
    criado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )

    class Meta:
        constraints = [models.UniqueConstraint(fields=["usuario", "contrato"], name="vinculo_unico_por_contrato")]

    def delete(self, *args, **kwargs):
        raise ExclusaoProibida("Vínculos são desativados, não excluídos.")

    @property
    def parte(self):
        return PARTE_DO_PERFIL[self.perfil]

    def __str__(self):
        return f"{self.usuario} — {self.get_perfil_display()}"


class Interprete(SemExclusao):
    contrato = models.ForeignKey(Contrato, on_delete=models.PROTECT, related_name="interpretes")
    nome_completo = models.CharField(max_length=200)
    telefone = models.CharField("telefone corporativo/celular", max_length=30)
    email = models.EmailField("e-mail")
    ativo = models.BooleanField(default=True)
    criado_em = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        ordering = ["nome_completo"]
        constraints = [models.UniqueConstraint(fields=["contrato", "email"], name="interprete_email_unico_contrato")]

    def __str__(self):
        return self.nome_completo


class Feriado(SemExclusao):
    """Calendário de dias não úteis por contrato. Desativa-se, não se exclui."""

    contrato = models.ForeignKey(Contrato, on_delete=models.PROTECT, related_name="feriados")
    data = models.DateField()
    descricao = models.CharField(max_length=200)
    ativo = models.BooleanField(default=True)
    criado_em = models.DateTimeField(default=timezone.now, editable=False)
    criado_por = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, related_name="+")

    class Meta:
        ordering = ["data"]
        constraints = [models.UniqueConstraint(fields=["contrato", "data"], name="feriado_unico")]


class SituacaoAprovacao(models.TextChoices):
    PROPOSTO = "PROPOSTO", "Proposto (aguardando Prefeitura)"
    APROVADO = "APROVADO", "Aprovado pela Prefeitura"
    REJEITADO = "REJEITADO", "Rejeitado pela Prefeitura"


class ParametroMedicao(SemExclusao):
    """Parâmetros versionados. Uma versão aprovada nunca muda (trigger)."""

    contrato = models.ForeignKey(Contrato, on_delete=models.PROTECT, related_name="parametros")
    versao = models.PositiveIntegerField()
    preco_unitario_hora = models.DecimalField(max_digits=14, decimal_places=4)
    faixas_excedente = models.JSONField()
    casas_decimais_total = models.PositiveSmallIntegerField(default=2)
    modo_arredondamento = models.CharField(max_length=20, default="ROUND_HALF_UP")
    vigente_desde = models.DateField()
    situacao = models.CharField(max_length=10, choices=SituacaoAprovacao.choices, default=SituacaoAprovacao.PROPOSTO)
    justificativa = models.TextField()
    proposto_por = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, related_name="+")
    proposto_em = models.DateTimeField(default=timezone.now, editable=False)
    decidido_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    decidido_em = models.DateTimeField(null=True, blank=True)
    parecer = models.TextField(blank=True)

    class Meta:
        ordering = ["-versao"]
        constraints = [
            models.UniqueConstraint(fields=["contrato", "versao"], name="parametro_versao_unica"),
            models.CheckConstraint(condition=models.Q(preco_unitario_hora__gt=0), name="parametro_preco_positivo"),
        ]


class PoliticaRetencao(SemExclusao):
    """Política de retenção documentada. O sistema NÃO elimina dados automaticamente."""

    contrato = models.ForeignKey(Contrato, on_delete=models.PROTECT, related_name="politicas_retencao")
    versao = models.PositiveIntegerField()
    prazo_descricao = models.TextField("prazo de retenção (texto)")
    fundamento = models.TextField("fundamento legal/normativo informado")
    situacao = models.CharField(max_length=10, choices=SituacaoAprovacao.choices, default=SituacaoAprovacao.PROPOSTO)
    proposto_por = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    proposto_em = models.DateTimeField(default=timezone.now, editable=False)
    decidido_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    decidido_em = models.DateTimeField(null=True, blank=True)
    parecer = models.TextField(blank=True)

    class Meta:
        ordering = ["-versao"]
        constraints = [models.UniqueConstraint(fields=["contrato", "versao"], name="retencao_versao_unica")]


# ---------------------------------------------------------------- agendamentos
class Agendamento(SemExclusao):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    contrato = models.ForeignKey(Contrato, on_delete=models.PROTECT, related_name="agendamentos")
    codigo = models.CharField(max_length=30, unique=True, editable=False)
    titulo = models.CharField("evento", max_length=200)
    unidade_solicitante = models.CharField("unidade solicitante", max_length=200)
    modalidade = models.CharField(max_length=10, choices=Modalidade.choices)
    local = models.CharField("local ou plataforma", max_length=300)
    inicio_previsto = models.DateTimeField("início previsto")
    duracao_prevista_min = models.PositiveIntegerField("duração estimada (min)")
    qtd_profissionais = models.PositiveSmallIntegerField("quantidade de profissionais")
    observacoes = models.TextField(blank=True)
    status = models.CharField(max_length=12, choices=StatusAgendamento.choices, default=StatusAgendamento.SOLICITADO)

    criado_em = models.DateTimeField(default=timezone.now, editable=False)
    criado_por = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    parte_criadora = models.CharField(max_length=10, choices=Parte.choices)

    antecedencia_dias_uteis = models.IntegerField()
    antecedencia_minima_dias_uteis = models.PositiveSmallIntegerField()
    fora_do_prazo = models.BooleanField(default=False)

    confirmado_em = models.DateTimeField(null=True, blank=True)
    confirmado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )

    inicio_realizado = models.DateTimeField(null=True, blank=True)
    fim_realizado = models.DateTimeField(null=True, blank=True)
    realizado_registrado_em = models.DateTimeField(null=True, blank=True)
    realizado_registrado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )

    cancelado_em = models.DateTimeField(null=True, blank=True)
    cancelado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    cancelamento_parte = models.CharField(max_length=10, choices=Parte.choices, blank=True)
    cancelamento_justificativa = models.TextField(blank=True)
    cancelamento_minutos_antecedencia = models.IntegerField(null=True, blank=True)
    cancelamento_dias_uteis = models.IntegerField(null=True, blank=True)
    cancelamento_classificacao = models.CharField(max_length=25, choices=ClassificacaoCancelamento.choices, blank=True)

    homologado_em = models.DateTimeField(null=True, blank=True)
    versao = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ["inicio_previsto"]
        constraints = [
            models.CheckConstraint(condition=models.Q(duracao_prevista_min__gt=0), name="duracao_positiva"),
            models.CheckConstraint(condition=models.Q(qtd_profissionais__gte=1), name="qtd_profissionais_minima"),
            models.CheckConstraint(
                condition=models.Q(duracao_prevista_min__lte=60) | models.Q(qtd_profissionais__gte=2),
                name="revezamento_acima_de_uma_hora",
            ),
            models.CheckConstraint(
                condition=models.Q(fim_realizado__isnull=True)
                | models.Q(inicio_realizado__isnull=True)
                | models.Q(fim_realizado__gt=models.F("inicio_realizado")),
                name="realizado_fim_apos_inicio",
            ),
            models.CheckConstraint(
                condition=~models.Q(status="CANCELADO") | ~models.Q(cancelamento_justificativa=""),
                name="cancelamento_exige_justificativa",
            ),
        ]
        indexes = [models.Index(fields=["contrato", "inicio_previsto"]), models.Index(fields=["contrato", "status"])]

    def __str__(self):
        return f"{self.codigo} — {self.titulo}"

    @property
    def fim_previsto(self):
        return self.inicio_previsto + timedelta(minutes=self.duracao_prevista_min)

    @property
    def duracao_realizada_min(self):
        if self.inicio_realizado and self.fim_realizado:
            return int((self.fim_realizado - self.inicio_realizado).total_seconds() // 60)
        return None

    def escalas_ativas(self):
        return self.escalas.filter(ativa=True).select_related("interprete")


class Escala(SemExclusao):
    agendamento = models.ForeignKey(Agendamento, on_delete=models.PROTECT, related_name="escalas")
    interprete = models.ForeignKey(Interprete, on_delete=models.PROTECT, related_name="escalas")
    ativa = models.BooleanField(default=True)
    escalado_em = models.DateTimeField(default=timezone.now, editable=False)
    escalado_por = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    substitui = models.ForeignKey("self", on_delete=models.PROTECT, null=True, blank=True, related_name="+")
    cancelada_em = models.DateTimeField(null=True, blank=True)
    cancelada_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    motivo_cancelamento = models.TextField(blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["agendamento", "interprete"], condition=models.Q(ativa=True), name="escala_ativa_unica"
            )
        ]


class SituacaoMedicao(models.TextChoices):
    AUTOMATICA = "AUTOMATICA", "Calculada pela tabela do edital"
    PENDENTE_REGRA = "PENDENTE_REGRA", "Pendente de regra (caso não previsto)"
    PROPOSTA = "PROPOSTA", "Medição fundamentada proposta"
    APROVADA = "APROVADA", "Medição fundamentada aprovada pela Prefeitura"
    REJEITADA = "REJEITADA", "Medição fundamentada rejeitada"


SITUACOES_MEDICAO_VALIDAS = (SituacaoMedicao.AUTOMATICA, SituacaoMedicao.APROVADA)


class Medicao(SemExclusao):
    """Cada recálculo ou medição fundamentada é uma NOVA versão; nada é sobrescrito."""

    agendamento = models.ForeignKey(Agendamento, on_delete=models.PROTECT, related_name="medicoes")
    versao = models.PositiveIntegerField()
    parametro = models.ForeignKey(ParametroMedicao, on_delete=models.PROTECT, related_name="+")
    minutos_previstos = models.PositiveIntegerField()
    minutos_realizados = models.PositiveIntegerField()
    excedente_min = models.IntegerField()
    acrescimo_min = models.PositiveIntegerField(null=True, blank=True)
    minutos_faturaveis = models.PositiveIntegerField(null=True, blank=True)
    horas_faturaveis = models.DecimalField(max_digits=12, decimal_places=4, null=True, blank=True)
    preco_unitario = models.DecimalField(max_digits=14, decimal_places=4)
    valor_bruto = models.DecimalField(max_digits=20, decimal_places=8, null=True, blank=True)
    valor_total = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    situacao = models.CharField(max_length=15, choices=SituacaoMedicao.choices)
    pendencias = models.JSONField(default=list)
    regra_aplicada = models.TextField()
    alerta_revezamento = models.BooleanField(default=False)
    fundamentacao = models.TextField(blank=True)
    criada_em = models.DateTimeField(default=timezone.now, editable=False)
    criada_por = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    decidida_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    decidida_em = models.DateTimeField(null=True, blank=True)
    parecer = models.TextField(blank=True)

    class Meta:
        ordering = ["-versao"]
        constraints = [models.UniqueConstraint(fields=["agendamento", "versao"], name="medicao_versao_unica")]


class SituacaoIndenizacao(models.TextChoices):
    SOLICITADA = "SOLICITADA", "Solicitada (em análise)"
    APROVADA = "APROVADA", "Aprovada pela Prefeitura"
    INDEFERIDA = "INDEFERIDA", "Indeferida"


class PedidoIndenizacao(SemExclusao):
    """Indenização por cancelamento tardio. Separada das horas prestadas."""

    agendamento = models.ForeignKey(Agendamento, on_delete=models.PROTECT, related_name="indenizacoes")
    solicitado_por = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    solicitado_em = models.DateTimeField(default=timezone.now, editable=False)
    comprovacao = models.TextField("descrição da comprovação de reserva/mobilização")
    anexo = models.FileField(upload_to="comprovacoes/%Y/%m/", null=True, blank=True)
    anexo_nome_original = models.CharField(max_length=255, blank=True)
    anexo_sha256 = models.CharField(max_length=64, blank=True)
    # Conteúdo do anexo guardado no próprio banco (sobrevive a reimplantações e entra no backup).
    anexo_conteudo = models.BinaryField(null=True, blank=True, editable=False)
    anexo_tipo = models.CharField(max_length=100, blank=True)
    parametro = models.ForeignKey(ParametroMedicao, on_delete=models.PROTECT, related_name="+")
    percentual = models.DecimalField(max_digits=5, decimal_places=2)
    minutos_referencia = models.DecimalField(max_digits=10, decimal_places=2)
    horas_referencia = models.DecimalField(max_digits=12, decimal_places=4)
    valor_referencia = models.DecimalField(max_digits=14, decimal_places=2)
    memoria_calculo = models.TextField()
    situacao = models.CharField(max_length=12, choices=SituacaoIndenizacao.choices, default=SituacaoIndenizacao.SOLICITADA)
    reserva_comprovada = models.BooleanField(null=True)
    imputavel_contratada = models.BooleanField(null=True)
    decidido_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    decidido_em = models.DateTimeField(null=True, blank=True)
    parecer = models.TextField(blank=True)


class Homologacao(SemExclusao):
    """Conferência/homologação de uma parte, vinculada ao hash do estado conferido."""

    agendamento = models.ForeignKey(Agendamento, on_delete=models.PROTECT, related_name="homologacoes")
    parte = models.CharField(max_length=10, choices=Parte.choices)
    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    em = models.DateTimeField(default=timezone.now, editable=False)
    hash_estado = models.CharField(max_length=64)
    estado_conferido = models.JSONField()
    observacao = models.TextField(blank=True)


# ---------------------------------------------------------------- auditoria
class EventoAuditoria(models.Model):
    """Trilha append-only. UPDATE/DELETE/TRUNCATE bloqueados por trigger.

    `ocorrido_em`, `hash_anterior` e `hash` são preenchidos pelo PRÓPRIO banco
    (trigger), formando uma cadeia SHA-256 verificável.
    """

    contrato = models.ForeignKey(Contrato, on_delete=models.PROTECT, null=True, related_name="+")
    entidade = models.CharField(max_length=50)
    entidade_id = models.CharField(max_length=64)
    acao = models.CharField(max_length=50)
    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, related_name="+")
    usuario_descricao = models.CharField(max_length=300)
    perfil = models.CharField(max_length=20, blank=True)
    ocorrido_em = models.DateTimeField(default=timezone.now)
    justificativa = models.TextField(blank=True)
    dados_anteriores = models.JSONField(null=True, blank=True)
    dados_posteriores = models.JSONField(null=True, blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    hash_anterior = models.CharField(max_length=64, blank=True)
    hash = models.CharField(max_length=64, blank=True)

    class Meta:
        ordering = ["id"]
        indexes = [models.Index(fields=["entidade", "entidade_id"]), models.Index(fields=["contrato", "ocorrido_em"])]

    def save(self, *args, **kwargs):
        if self.pk:
            raise ExclusaoProibida("Eventos de auditoria não podem ser alterados.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ExclusaoProibida("Eventos de auditoria não podem ser excluídos.")


# ---------------------------------------------------------------- notificações
class TipoNotificacao(models.TextChoices):
    CONFIRMACAO = "CONFIRMACAO", "Confirmação de atendimento"
    ALTERACAO_HORARIO = "ALTERACAO_HORARIO", "Alteração de horário"
    CANCELAMENTO_ESCALA = "CANCELAMENTO_ESCALA", "Cancelamento de escala"
    CANCELAMENTO_AGENDAMENTO = "CANCELAMENTO_AGENDAMENTO", "Cancelamento de agendamento"
    ACESSO_PREFEITURA = "ACESSO_PREFEITURA", "Novo acesso com perfil da Prefeitura"


class StatusNotificacao(models.TextChoices):
    PENDENTE = "PENDENTE", "Pendente de envio"
    ENVIADA = "ENVIADA", "Enviada ao servidor de e-mail"
    FALHA = "FALHA", "Falha (nova tentativa agendada)"
    FALHA_DEFINITIVA = "FALHA_DEFINITIVA", "Falha definitiva (tentativas esgotadas)"
    INTEGRACAO_PENDENTE = "INTEGRACAO_PENDENTE", "Integração de e-mail pendente (não enviada)"
    SEM_DESTINATARIO = "SEM_DESTINATARIO", "Sem destinatário cadastrado"


class Notificacao(SemExclusao):
    contrato = models.ForeignKey(Contrato, on_delete=models.PROTECT, related_name="notificacoes")
    tipo = models.CharField(max_length=30, choices=TipoNotificacao.choices)
    agendamento = models.ForeignKey(Agendamento, on_delete=models.PROTECT, null=True, blank=True, related_name="+")
    chave_idempotencia = models.CharField(max_length=200, unique=True)
    assunto = models.CharField(max_length=300)
    corpo = models.TextField()
    destinatarios = models.JSONField(default=list)
    status = models.CharField(max_length=20, choices=StatusNotificacao.choices, default=StatusNotificacao.PENDENTE)
    tentativas = models.PositiveIntegerField(default=0)
    proxima_tentativa_em = models.DateTimeField(null=True, blank=True)
    enviada_em = models.DateTimeField(null=True, blank=True)
    ultimo_erro = models.TextField(blank=True)
    message_id = models.CharField(max_length=300, blank=True)
    criada_em = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        ordering = ["-criada_em"]


class TentativaEnvio(SemExclusao):
    notificacao = models.ForeignKey(Notificacao, on_delete=models.PROTECT, related_name="tentativas_envio")
    em = models.DateTimeField(default=timezone.now, editable=False)
    resultado = models.CharField(max_length=20, choices=StatusNotificacao.choices)
    detalhe = models.TextField(blank=True)


class AvisoInterno(SemExclusao):
    """Notificação eletrônica integrada (caixa de entrada no próprio sistema)."""

    notificacao = models.ForeignKey(Notificacao, on_delete=models.PROTECT, related_name="avisos")
    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="avisos")
    lido_em = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["notificacao", "usuario"], name="aviso_unico")]


# ---------------------------------------------------------------- chamados
class TipoChamado(models.TextChoices):
    INTERCORRENCIA = "INTERCORRENCIA", "Intercorrência"
    SUBSTITUICAO = "SUBSTITUICAO", "Substituição de intérprete"
    VALIDACAO = "VALIDACAO", "Validação de chamado/atendimento"
    OUTRO = "OUTRO", "Outro"


class StatusChamado(models.TextChoices):
    ABERTO = "ABERTO", "Aberto (sem resposta)"
    EM_ATENDIMENTO = "EM_ATENDIMENTO", "Em atendimento"
    CONCLUIDO = "CONCLUIDO", "Concluído"


class Chamado(SemExclusao):
    contrato = models.ForeignKey(Contrato, on_delete=models.PROTECT, related_name="chamados")
    codigo = models.CharField(max_length=30, unique=True, editable=False)
    tipo = models.CharField(max_length=20, choices=TipoChamado.choices)
    agendamento = models.ForeignKey(Agendamento, on_delete=models.PROTECT, null=True, blank=True, related_name="chamados")
    titulo = models.CharField(max_length=200)
    descricao = models.TextField()
    status = models.CharField(max_length=15, choices=StatusChamado.choices, default=StatusChamado.ABERTO)
    aberto_em = models.DateTimeField(default=timezone.now, editable=False)
    aberto_por = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    responsavel = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    primeira_resposta_em = models.DateTimeField(null=True, blank=True)
    primeira_resposta_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    concluido_em = models.DateTimeField(null=True, blank=True)
    concluido_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )

    class Meta:
        ordering = ["-aberto_em"]


class InteracaoChamado(SemExclusao):
    chamado = models.ForeignKey(Chamado, on_delete=models.PROTECT, related_name="interacoes")
    autor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    em = models.DateTimeField(default=timezone.now, editable=False)
    texto = models.TextField()

    class Meta:
        ordering = ["em"]


# ---------------------------------------------------------------- relatório mensal
class StatusRelatorio(models.TextChoices):
    SUBMETIDO = "SUBMETIDO", "Submetido à conferência"
    DEVOLVIDO = "DEVOLVIDO", "Devolvido para ajustes"
    ATESTADO = "ATESTADO", "Atestado pela Prefeitura"


class RelatorioMensal(SemExclusao):
    contrato = models.ForeignKey(Contrato, on_delete=models.PROTECT, related_name="relatorios")
    competencia = models.DateField(help_text="Primeiro dia do mês de referência")
    versao = models.PositiveIntegerField()
    status = models.CharField(max_length=10, choices=StatusRelatorio.choices, default=StatusRelatorio.SUBMETIDO)
    conteudo = models.JSONField()
    hash_conteudo = models.CharField(max_length=64)
    layout_versao = models.CharField(max_length=20)
    prazo_limite = models.DateField()
    submetido_no_prazo = models.BooleanField()
    submetido_em = models.DateTimeField(default=timezone.now, editable=False)
    submetido_por = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    decidido_em = models.DateTimeField(null=True, blank=True)
    decidido_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    parecer = models.TextField(blank=True)

    class Meta:
        ordering = ["-competencia", "-versao"]
        constraints = [models.UniqueConstraint(fields=["contrato", "competencia", "versao"], name="relatorio_versao_unica")]


class RegistroNotaFiscal(SemExclusao):
    relatorio = models.ForeignKey(RelatorioMensal, on_delete=models.PROTECT, related_name="notas_fiscais")
    numero = models.CharField(max_length=60)
    data_emissao = models.DateField()
    valor = models.DecimalField(max_digits=14, decimal_places=2)
    registrado_por = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    registrado_em = models.DateTimeField(default=timezone.now, editable=False)
    observacao = models.TextField(blank=True)
