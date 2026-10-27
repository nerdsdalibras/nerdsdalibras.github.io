from datetime import datetime

from django import forms
from django.utils import timezone

from .models import Modalidade, Perfil, StatusAgendamento, TipoChamado
from .servicos.calendario import FUSO

DT = {"type": "datetime-local"}


class CampoDataHora(forms.DateTimeField):
    """Interpreta a data/hora digitada no fuso America/Sao_Paulo."""

    widget = forms.DateTimeInput(attrs=DT, format="%Y-%m-%dT%H:%M")

    def __init__(self, *a, **kw):
        kw.setdefault("input_formats", ["%Y-%m-%dT%H:%M", "%d/%m/%Y %H:%M"])
        super().__init__(*a, **kw)

    def to_python(self, value):
        if isinstance(value, str) and value:
            for fmt in self.input_formats:
                try:
                    return datetime.strptime(value, fmt).replace(tzinfo=FUSO)
                except ValueError:
                    continue
            raise forms.ValidationError("Data/hora inválida.")
        v = super().to_python(value)
        return timezone.make_aware(v, FUSO) if v and timezone.is_naive(v) else v


class AgendamentoForm(forms.Form):
    titulo = forms.CharField(label="Evento", max_length=200)
    unidade_solicitante = forms.CharField(label="Unidade solicitante", max_length=200)
    modalidade = forms.ChoiceField(choices=Modalidade.choices)
    local = forms.CharField(label="Local (presencial) ou plataforma (remoto)", max_length=300)
    inicio_previsto = CampoDataHora(label="Data e horário de início (horário de Brasília)")
    duracao_prevista_min = forms.IntegerField(label="Duração estimada (minutos)", min_value=1, max_value=24 * 60)
    qtd_profissionais = forms.IntegerField(label="Quantidade de profissionais", min_value=1, max_value=20,
                                           help_text="Acima de 60 minutos: mínimo de 2 (revezamento).")
    observacoes = forms.CharField(label="Observações (não informe dados pessoais desnecessários)", widget=forms.Textarea(attrs={"rows": 3}), required=False)


class FiltroAgendamentosForm(forms.Form):
    de = forms.DateField(label="De", required=False, widget=forms.DateInput(attrs={"type": "date"}))
    ate = forms.DateField(label="Até", required=False, widget=forms.DateInput(attrs={"type": "date"}))
    modalidade = forms.ChoiceField(choices=[("", "Todas")] + Modalidade.choices, required=False)
    status = forms.ChoiceField(label="Situação", choices=[("", "Todas")] + StatusAgendamento.choices, required=False)
    interprete = forms.ModelChoiceField(label="Profissional", queryset=None, required=False, empty_label="Todos")
    pendencias = forms.BooleanField(label="Somente com pendência/fora do prazo", required=False)

    def __init__(self, *a, contrato=None, mostrar_interprete=True, **kw):
        super().__init__(*a, **kw)
        if mostrar_interprete:
            self.fields["interprete"].queryset = contrato.interpretes.all()
        else:
            del self.fields["interprete"]


class JustificativaForm(forms.Form):
    justificativa = forms.CharField(widget=forms.Textarea(attrs={"rows": 2}))


class AlterarHorarioForm(forms.Form):
    inicio_previsto = CampoDataHora(label="Novo início")
    duracao_prevista_min = forms.IntegerField(label="Nova duração (min)", min_value=1)
    qtd_profissionais = forms.IntegerField(label="Quantidade de profissionais", min_value=1)
    justificativa = forms.CharField(widget=forms.Textarea(attrs={"rows": 2}))


class RealizacaoForm(forms.Form):
    inicio_realizado = CampoDataHora(label="Início realizado")
    fim_realizado = CampoDataHora(label="Fim realizado")
    justificativa = forms.CharField(label="Justificativa (obrigatória em correção)", required=False, widget=forms.Textarea(attrs={"rows": 2}))


class EscalarForm(forms.Form):
    interprete = forms.ModelChoiceField(label="Intérprete", queryset=None)

    def __init__(self, *a, contrato=None, **kw):
        super().__init__(*a, **kw)
        self.fields["interprete"].queryset = contrato.interpretes.filter(ativo=True)


class CancelarEscalaForm(forms.Form):
    motivo = forms.CharField(widget=forms.Textarea(attrs={"rows": 2}))
    substituto = forms.ModelChoiceField(label="Substituto (opcional)", queryset=None, required=False)

    def __init__(self, *a, contrato=None, **kw):
        super().__init__(*a, **kw)
        self.fields["substituto"].queryset = contrato.interpretes.filter(ativo=True)


class DecisaoForm(forms.Form):
    decisao = forms.ChoiceField(choices=[("aprovar", "Aprovar"), ("rejeitar", "Rejeitar/Indeferir")])
    parecer = forms.CharField(widget=forms.Textarea(attrs={"rows": 2}))


class DecisaoIndenizacaoForm(DecisaoForm):
    reserva_comprovada = forms.BooleanField(label="Comprovação de reserva de agenda/mobilização conferida", required=False)
    imputavel_contratada = forms.BooleanField(label="Houve fato imputável à contratada", required=False)


class MedicaoFundamentadaForm(forms.Form):
    minutos_faturaveis = forms.IntegerField(label="Minutos faturáveis propostos", min_value=1)
    fundamentacao = forms.CharField(widget=forms.Textarea(attrs={"rows": 3}))


class IndenizacaoForm(forms.Form):
    comprovacao = forms.CharField(label="Comprovação de reserva de agenda/mobilização", widget=forms.Textarea(attrs={"rows": 3}))
    anexo = forms.FileField(label="Anexo (PDF/PNG/JPG, opcional)", required=False)


class InterpreteForm(forms.Form):
    nome_completo = forms.CharField(max_length=200)
    telefone = forms.CharField(label="Telefone corporativo/celular", max_length=30)
    email = forms.EmailField(label="E-mail")
    ativo = forms.BooleanField(required=False, initial=True)
    justificativa = forms.CharField(label="Justificativa (em alterações)", required=False)


class ParametroForm(forms.Form):
    preco_unitario_hora = forms.DecimalField(label="Preço unitário por hora de evento (R$)", max_digits=14, decimal_places=4)
    vigente_desde = forms.DateField(widget=forms.DateInput(attrs={"type": "date"}))
    faixas = forms.CharField(
        label="Faixas de excedente (uma por linha: de;até;acréscimo em minutos)",
        widget=forms.Textarea(attrs={"rows": 5}),
        initial="1;10;0\n11;30;30\n31;40;30\n41;60;60",
    )
    justificativa = forms.CharField(widget=forms.Textarea(attrs={"rows": 2}))

    def clean_faixas(self):
        faixas = []
        for linha in self.cleaned_data["faixas"].splitlines():
            if not linha.strip():
                continue
            partes = [p.strip() for p in linha.split(";")]
            if len(partes) != 3:
                raise forms.ValidationError(f"Linha inválida: {linha}")
            faixas.append({"de": partes[0], "ate": partes[1], "acrescimo_min": partes[2]})
        return faixas


class RetencaoForm(forms.Form):
    prazo_descricao = forms.CharField(label="Prazo de retenção", widget=forms.Textarea(attrs={"rows": 2}))
    fundamento = forms.CharField(label="Fundamento legal/normativo (informado pela Prefeitura)", widget=forms.Textarea(attrs={"rows": 2}))


class FeriadoForm(forms.Form):
    data = forms.DateField(widget=forms.DateInput(attrs={"type": "date"}))
    descricao = forms.CharField(max_length=200)


class ChamadoForm(forms.Form):
    tipo = forms.ChoiceField(choices=TipoChamado.choices)
    titulo = forms.CharField(max_length=200)
    descricao = forms.CharField(widget=forms.Textarea(attrs={"rows": 3}))
    agendamento = forms.CharField(label="Código do agendamento (opcional)", required=False)


class TextoForm(forms.Form):
    texto = forms.CharField(widget=forms.Textarea(attrs={"rows": 2}))


class AtribuirForm(forms.Form):
    responsavel = forms.ModelChoiceField(queryset=None)

    def __init__(self, *a, contrato=None, **kw):
        super().__init__(*a, **kw)
        from django.contrib.auth import get_user_model

        self.fields["responsavel"].queryset = get_user_model().objects.filter(
            vinculos__contrato=contrato, vinculos__perfil=Perfil.OPERADOR, vinculos__ativo=True
        )


class CompetenciaForm(forms.Form):
    competencia = forms.CharField(label="Competência (AAAA-MM)", widget=forms.TextInput(attrs={"type": "month"}))

    def clean_competencia(self):
        try:
            return datetime.strptime(self.cleaned_data["competencia"], "%Y-%m").date()
        except ValueError:
            raise forms.ValidationError("Use o formato AAAA-MM.")


class NotaFiscalForm(forms.Form):
    numero = forms.CharField(max_length=60)
    data_emissao = forms.DateField(widget=forms.DateInput(attrs={"type": "date"}))
    valor = forms.DecimalField(max_digits=14, decimal_places=2)
    observacao = forms.CharField(required=False, widget=forms.Textarea(attrs={"rows": 2}))


class UsuarioForm(forms.Form):
    nome_completo = forms.CharField(max_length=200)
    email = forms.EmailField()
    perfil = forms.ChoiceField(choices=Perfil.choices)


class VinculoForm(forms.Form):
    perfil = forms.ChoiceField(choices=Perfil.choices)
    ativo = forms.BooleanField(required=False)
    justificativa = forms.CharField()
