"""Extrae de cada Infocifras de la OIReScon (un PDF de una página por trimestre) las tablas de importe licitado y
adjudicado por trimestre, los totales de los cuatro últimos trimestres que da el texto y el número medio de
licitadores, y escribe datos/contratacion.json (versionado: se extrae una vez por edición nueva). Los PDF no se
republican, solo se enlazan.

Necesita pypdf (solo para esta extracción). Uso:
    python3.12 herramientas/extraer_infocifras.py <carpeta con infocifras-NT-AAAA.pdf> datos/contratacion.json
Los PDF están en https://www.hacienda.gob.es/rsc/oirescon/infocifras/infocifras-NT-AAAA.pdf (lista en
https://www.hacienda.gob.es/es-ES/Oirescon/Paginas/infocifras.aspx). Algunas ediciones traen las tablas como imagen:
de esas solo queda el número de licitadores.
"""
import json
import pathlib
import re
import sys

import pypdf

URL = "https://www.hacienda.gob.es/rsc/oirescon/infocifras/{nombre}.pdf"
num = lambda s: float(s.replace(".", "").replace(",", ".").replace("€", ""))


def tabla(texto, titulo, fin=None):
    i = texto.find(titulo)
    if i < 0:
        return None
    bloque = texto[i:i + 900]
    if fin and fin in bloque:
        bloque = bloque[:bloque.find(fin)]
    filas = {}
    for m in re.finditer(r"^[ \t]*(20\d\d)((?:[ \t]+[\d.]+,\d+€?)+)", bloque, re.M):
        filas[m.group(1)] = [num(x) for x in re.findall(r"[\d.]+,\d+", m.group(2))]
    # Tabla completa: cuatro trimestres en todos los años menos el último (si no, la maquetación no se ha leído bien)
    años = sorted(filas)
    if not años or any(len(filas[a]) != 4 for a in años[:-1]) or not 1 <= len(filas[años[-1]]) <= 4:
        return None
    return filas


def edicion(ruta):
    texto = "\n".join(p.extract_text() for p in pypdf.PdfReader(ruta).pages)
    t, a = re.match(r"infocifras-(\d)t-(\d{4})", ruta.stem).groups()
    salida = {"trimestre": int(t), "año": int(a), "url": URL.format(nombre=ruta.stem),
              "licitado": tabla(texto, "PRESUPUESTO BASE DE LICITACI", "IMPORTE DE ADJUDICACI"),
              "adjudicado": tabla(texto, "IMPORTE DE ADJUDICACI")}
    m = re.search(r"([\d,]+)\s*licitadores por (?:contrato|licitaci)", texto)
    salida["licitadores"] = float(m.group(1).replace(",", ".")) if m else None
    # Totales que da el texto: los cuatro últimos trimestres (ediciones de T1–T3) o el año (ediciones de T4)
    for clave in ("licitados", "adjudicados"):
        m = re.search(rf"^([\d.]+,\d+)\s*millones de euros {clave}", texto, re.M)
        salida[f"total_texto_{clave}"] = num(m.group(1)) if m else None
    return salida


if __name__ == "__main__":
    carpeta, destino = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
    eds = sorted((edicion(p) for p in carpeta.glob("infocifras-*.pdf")), key=lambda e: (e["año"], e["trimestre"]))
    destino.write_text(json.dumps({"_nota": "Generado por herramientas/extraer_infocifras.py a partir de los PDF de Infocifras (OIReScon). "
                                            "Millones de euros sin impuestos. Cada edición recalcula los trimestres anteriores con los datos "
                                            "vivos de las plataformas de contratación, así que las cifras cambian de una a otra.",
                                   "ediciones": eds}, ensure_ascii=False, indent=1))
    for e in eds:
        print(e["año"], e["trimestre"], "tablas" if e["licitado"] else "sin tablas", e["licitadores"], e["total_texto_licitados"], e["total_texto_adjudicados"])
