"""Exportação CSV (padrão Excel pt-BR: ';' e UTF-8 com BOM) e PDF (ReportLab)."""
import csv
import io

from django.http import HttpResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def _neutralizar(v):
    """Evita injeção de fórmulas ao abrir o CSV em planilhas."""
    s = "" if v is None else str(v)
    return "'" + s if s[:1] in ("=", "+", "-", "@", "\t", "\r") else s


def csv_resposta(nome, cabecalho, linhas):
    r = HttpResponse(content_type="text/csv; charset=utf-8")
    r["Content-Disposition"] = f'attachment; filename="{nome}.csv"'
    r.write("﻿")
    w = csv.writer(r, delimiter=";")
    w.writerow(cabecalho)
    for linha in linhas:
        w.writerow([_neutralizar(c) for c in linha])
    return r


def pdf_resposta(nome, titulo, blocos, rodape=""):
    """blocos: lista de ("p", texto) | ("tabela", cabecalho, linhas) | ("h", texto)."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), leftMargin=12 * mm, rightMargin=12 * mm,
                            topMargin=12 * mm, bottomMargin=12 * mm, title=titulo)
    est = getSampleStyleSheet()
    pequeno = est["BodyText"].clone("pequeno", fontSize=7, leading=8.5)
    conteudo = [Paragraph(titulo, est["Title"])]
    for b in blocos:
        if b[0] == "h":
            conteudo.append(Paragraph(b[1], est["Heading3"]))
        elif b[0] == "p":
            conteudo.append(Paragraph(b[1], est["BodyText"]))
        elif b[0] == "tabela":
            dados = [[Paragraph(f"<b>{_esc(c)}</b>", pequeno) for c in b[1]]]
            dados += [[Paragraph(_esc(c), pequeno) for c in linha] for linha in b[2]]
            if len(dados) == 1:
                conteudo.append(Paragraph("Nenhum registro.", est["BodyText"]))
                continue
            t = Table(dados, repeatRows=1)
            t.setStyle(TableStyle([
                ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e8eef5")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]))
            conteudo.append(t)
        conteudo.append(Spacer(1, 4 * mm))
    if rodape:
        conteudo.append(Paragraph(rodape, pequeno))
    doc.build(conteudo)
    r = HttpResponse(buf.getvalue(), content_type="application/pdf")
    r["Content-Disposition"] = f'attachment; filename="{nome}.pdf"'
    return r


def _esc(v):
    from xml.sax.saxutils import escape

    return escape("" if v is None else str(v))
