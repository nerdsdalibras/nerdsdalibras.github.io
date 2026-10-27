"""Dias úteis, feriados e fuso horário (America/Sao_Paulo).

Método de contagem adotado (documentado em docs/02-pendencias-esclarecimento.md):
a antecedência em dias úteis é o número de dias úteis no intervalo
(data do pedido, data do evento] — exclui o dia do pedido e inclui o dia do
evento. Equivale a: "data do evento >= data do pedido + N dias úteis".
O horário do pedido dentro do dia não é considerado.
"""
from datetime import date, timedelta
from zoneinfo import ZoneInfo

from django.utils import timezone

from ..models import Feriado

FUSO = ZoneInfo("America/Sao_Paulo")


def local(dt):
    return timezone.localtime(dt, FUSO)


def feriados_do_contrato(contrato):
    return set(Feriado.objects.filter(contrato=contrato, ativo=True).values_list("data", flat=True))


def eh_dia_util(d, feriados):
    return d.weekday() < 5 and d not in feriados


def somar_dias_uteis(d, n, feriados):
    atual = d
    contados = 0
    while contados < n:
        atual += timedelta(days=1)
        if eh_dia_util(atual, feriados):
            contados += 1
    return atual


def dias_uteis_entre(inicio, fim, feriados):
    """Dias úteis em (inicio, fim]. Negativo se fim < inicio."""
    if fim == inicio:
        return 0
    sinal = 1
    if fim < inicio:
        inicio, fim, sinal = fim, inicio, -1
    total = 0
    atual = inicio
    while atual < fim:
        atual += timedelta(days=1)
        if eh_dia_util(atual, feriados):
            total += 1
    return total * sinal


def n_esimo_dia_util(ano, mes, n, feriados):
    atual = date(ano, mes, 1) - timedelta(days=1)
    return somar_dias_uteis(atual, n, feriados)
