"""Extrae las iniciativas del Plan Anual Normativo de la Administración General del Estado (Portal de Transparencia).

Cada plan es un PDF con, por ministerio y rango, una entrada por norma: el título en mayúsculas, «Objetivo: …» y
«Ministerio: …». Se ejecuta una vez por plan (el PDF no cambia) y el resultado se guarda en datos/pan/pan_<año>.json.
Necesita pypdf (solo para esta extracción; el resto del proyecto no tiene dependencias). Los PDF no se republican: se
enlazan.

Uso: python3 extraer_pan.py <año> <pdf> <url del pdf>
"""
import json
import pathlib
import re
import sys

import pypdf

RANGOS = ("LEY ORGÁNICA", "LEY", "REAL DECRETO LEGISLATIVO", "REAL DECRETO-LEY", "REAL DECRETO")


def main():
    año, pdf, url = sys.argv[1], sys.argv[2], sys.argv[3]
    lector = pypdf.PdfReader(pdf)
    lineas = []
    for n, pagina in enumerate(lector.pages, 1):
        for x in (pagina.extract_text() or "").splitlines():
            x = x.strip()
            # Fuera la cabecera y el pie de cada página (título repetido, número de página, año).
            if not x or x.startswith("PLAN ANUAL NORMATIVO") or re.fullmatch(r"\d{1,3}|20\d\d", x):
                continue
            lineas.append((n, x))
    # Una entrada empieza en una línea en mayúsculas que comienza por un rango y acaba antes de «Objetivo:».
    entradas, actual = [], None
    for n, x in lineas:
        mayus = sum(c.isupper() for c in x) >= 0.8 * max(1, sum(c.isalpha() for c in x))
        if mayus and any(x.startswith(r) for r in RANGOS) and (actual is None or actual["objetivo"] is not None):
            actual = {"titulo": x, "objetivo": None, "ministerio": None, "pagina": n}
            entradas.append(actual)
        elif actual is None:
            continue
        elif x.startswith("Objetivo:"):
            actual["objetivo"] = x[len("Objetivo:"):].strip()
        elif x.startswith("Ministerio:"):
            actual["ministerio"] = x[len("Ministerio:"):].strip()
            actual["_cerrado"] = True
        elif x.startswith("Norma sujeta a evaluación"):
            actual["_cerrado"] = True
        elif actual["objetivo"] is None:
            # Las tablas del resumen inicial (texto en minúsculas) pueden pegarse delante del primer título real: el
            # título empieza en la última línea en mayúsculas que comienza por un rango.
            if mayus and any(x.startswith(r) for r in RANGOS) and sum(c.islower() for c in actual["titulo"]) > 20:
                actual["titulo"], actual["pagina"] = x, n
            else:
                actual["titulo"] += " " + x
        elif not actual.get("_cerrado"):
            actual["objetivo"] += " " + x
    salida = []
    for e in entradas:
        titulo = re.sub(r"\s*-\s+(?=[A-ZÁÉÍÓÚÑ])", "", e["titulo"])  # palabras partidas con guion al final de línea
        titulo = re.sub(r"\s+", " ", titulo).strip()
        rango = next(r for r in RANGOS if titulo.startswith(r))
        salida.append({"plan": int(año), "rango": rango, "titulo": titulo, "ministerio": e["ministerio"],
                       "objetivo": re.sub(r"\s+", " ", re.sub(r"(\w) -\s*(\w)", r"\1\2", e["objetivo"] or "")).strip(),
                       "pagina": e["pagina"], "url": f"{url}#page={e['pagina']}"})
    destino = pathlib.Path(__file__).parent / "pan" / f"pan_{año}.json"
    destino.parent.mkdir(exist_ok=True)
    destino.write_text(json.dumps(salida, ensure_ascii=False, indent=1))
    import collections
    print(f"Plan {año}: {len(salida)} iniciativas; {dict(collections.Counter(e['rango'] for e in salida))}; "
          f"sin objetivo: {sum(not e['objetivo'] for e in salida)}; sin ministerio: {sum(not e['ministerio'] for e in salida)}")


if __name__ == "__main__":
    main()
