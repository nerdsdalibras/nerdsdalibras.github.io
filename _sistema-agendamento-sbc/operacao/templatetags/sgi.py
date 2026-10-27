from decimal import Decimal, InvalidOperation

from django import template

register = template.Library()


@register.filter
def brl(valor):
    """Formata Decimal/str como moeda brasileira sem perder casas (mín. 2)."""
    if valor in (None, ""):
        return "—"
    try:
        d = Decimal(str(valor))
    except InvalidOperation:
        return valor
    casas = max(2, -d.as_tuple().exponent) if d.as_tuple().exponent < 0 else 2
    txt = f"{d:,.{casas}f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"R$ {txt}"


@register.filter
def horas(valor):
    if valor in (None, ""):
        return "—"
    return str(valor).replace(".", ",") + " h"


@register.filter
def minutos_hm(m):
    if m in (None, ""):
        return "—"
    m = int(m)
    return f"{m // 60} h {m % 60:02d} min" if m >= 60 else f"{m} min"
