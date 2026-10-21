"""Extrae de la Memoria de Beneficios Fiscales de cada proyecto de Presupuestos (SEPG) el cuadro resumen por impuestos y
escribe datos/beneficios_fiscales.json (versionado: es un documento que no se revisa, así que se extrae una vez por
memoria nueva). Cada cifra lleva la página del PDF de donde sale; los PDF no se republican, solo se enlazan.

Necesita pypdf (solo para esta extracción). Uso:
    python3.12 herramientas/extraer_pbf.py <carpeta con pbfAA.pdf> datos/beneficios_fiscales.json
Las memorias están en https://www.sepg.pap.hacienda.gob.es/Presup/PGE20AAProyecto/MaestroTomos/PGE-ROM/doc/L_AA_A_A2.PDF
(no hay memoria de 2019 ni de 2020, ni desde 2024: fueron años de presupuesto prorrogado).
"""
import json
import pathlib
import re
import sys

import pypdf

URL = "https://www.sepg.pap.hacienda.gob.es/Presup/PGE20{aa}Proyecto/MaestroTomos/PGE-ROM/doc/L_{aa}_A_A2.PDF"
# Primera palabra significativa de cada partida del cuadro resumen → clave
CLAVES = [("RENTA DE LAS PERSONAS", "irpf"), ("RENTA DE NO RESIDENTES", "irnr"), ("SOCIEDADES", "sociedades"),
          ("PATRIMONIO", "patrimonio"), ("SUCESIONES", "sucesiones"), ("IMPUESTOS DIRECTOS", "directos"),
          ("GASES FLUORADOS", "gases"), ("VALOR AÑADIDO", "iva"), ("PRIMAS DE SEGUROS", "primas"), ("ESPECIALES", "especiales"),
          ("IMPUESTOS INDIRECTOS", "indirectos"), ("TASAS", "tasas"), ("TOTAL BENEFICIOS FISCALES", "total")]
NUMERO = r"(-?\d{1,3}(?:\.\d{3})*,\d{2})"


def a_float(t):
    return float(t.replace(".", "").replace(",", "."))


def extraer(pdf, año):
    """Cuadro resumen por impuestos con una sola columna de importes («Importe / Estructura»): su primer número es el
    del año de la memoria. (Hay otro cuadro con dos columnas, la del año anterior y la del año; ese no se usa.)"""
    r = pypdf.PdfReader(pdf)
    textos = [p.extract_text() or "" for p in r.pages]
    total_pag = next(i for i in range(len(textos) - 1, len(textos) // 2, -1)
                     if "TOTAL BENEFICIOS FISCALES" in textos[i].upper() and "Estructura" in textos[i] and f"PBF {año - 1}" not in textos[i])
    fila = re.compile(rf"\s*(\d+)\.\s+(.*?)\s+{NUMERO}\s+-?[\d\.,]+\s*%?\s*$")
    sub_ = re.compile(rf"\s*([a-h])\.\s+(.*?):?\s+{NUMERO}\s+-?[\d\.,]+\s*%?\s*$")
    partidas, paginas, detalle = {}, {}, {"irpf": [], "iva": []}
    actual = None
    for j in range(max(0, total_pag - 4), total_pag + 1):
        if "Estructura" not in textos[j]:
            continue
        for linea in textos[j].splitlines():
            u = linea.upper()
            m = fila.match(linea)
            if m and m.group(2).upper() == m.group(2):
                clave = next((c for t, c in CLAVES if t.replace(" ", "") in u.replace(" ", "")), None)  # pypdf mete espacios dentro de las palabras
                if clave and clave not in partidas:
                    partidas[clave], paginas[clave] = a_float(m.group(3)), j + 1
                    actual = clave
                else:
                    actual = None
                continue
            m = sub_.match(linea)
            if m and actual in detalle and m.group(1) not in [d["letra"] for d in detalle[actual]]:
                detalle[actual].append({"letra": m.group(1), "nombre": m.group(2).rstrip(":").strip(), "importe": a_float(m.group(3)), "pagina": j + 1})
    # Segundo cuadro: el que compara con el año anterior (tres números: año anterior, año, tasa). Su segunda columna es el
    # mismo año: rellena las partidas que el PDF parte en dos líneas y, donde ya hay dato, sirve de comprobación.
    doble = re.compile(rf"\s*(\d+)\.\s+(.*?)\s+{NUMERO}\s+{NUMERO}\s+-?[\d\.,]+\s*%?\s*$")
    segundo, anterior, pag2 = {}, {}, {}
    for j in range(max(0, total_pag - 6), min(len(textos), total_pag + 8)):
        t = textos[j]
        if "Tasa" not in t or "Estructura" in t:
            continue
        for linea in t.splitlines():
            m = doble.match(linea)
            if m and m.group(2).upper() == m.group(2):
                clave = next((c for tx, c in CLAVES if tx.replace(" ", "") in linea.upper().replace(" ", "")), None)
                if clave and clave not in segundo:
                    anterior[clave], segundo[clave], pag2[clave] = a_float(m.group(3)), a_float(m.group(4)), j + 1
    # Tercer cuadro: beneficios fiscales frente a la recaudación de cada impuesto («Impuesto sobre el Valor Añadido 31.334
    # 19.241,27 38,0%»: recaudación, beneficio fiscal y porcentaje). Los nombres van en minúsculas.
    nombres3 = [("Renta de las Personas", "irpf"), ("Renta de no Residentes", "irnr"), ("Sociedades", "sociedades"), ("Patrimonio", "patrimonio"),
                ("Valor Añadido", "iva"), ("Primas de Seguros", "primas"), ("Impuestos Especiales", "especiales"), ("Tasas y otros ingresos", "tasas")]
    tercera = re.compile(rf"^\s*(Impuesto|Impuestos|Tasas)(.*?)\s+[\d\.]+(?:,\d+)?\s+{NUMERO}\s+-?[\d\.,]+\s*%?\s*$")
    for j in range(max(0, total_pag - 2), min(len(textos), total_pag + 12)):
        for linea in textos[j].splitlines():
            m = tercera.match(re.sub(r"\s{2,}", " ", linea))
            if m:
                clave = next((c for tx, c in nombres3 if tx.lower().replace(" ", "") in linea.lower().replace(" ", "")), None)
                if clave and clave not in segundo:
                    segundo[clave], pag2[clave] = a_float(m.group(3)), j + 1
    rellenadas, distintas = [], []
    for clave, v in segundo.items():
        if clave not in partidas:
            partidas[clave], paginas[clave] = v, pag2[clave]
            rellenadas.append(clave)
        elif abs(partidas[clave] - v) > 0.005:
            distintas.append(clave)
    return {"año": año, "url": URL.format(aa=str(año)[2:]), "partidas": partidas, "paginas": paginas, "detalle": detalle,
            "año_anterior_reestimado": anterior, "rellenadas_del_segundo_cuadro": rellenadas, "distintas_entre_cuadros": distintas}


def main():
    carpeta, destino = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
    memorias = []
    for pdf in sorted(carpeta.glob("pbf*.pdf")):
        if pdf.read_bytes()[:4] != b"%PDF":
            continue
        año = 2000 + int(pdf.stem[3:])
        m = extraer(pdf, año)
        memorias.append(m)
        p = m["partidas"]
        print(año, {k: p.get(k) for k in ("irpf", "sociedades", "iva", "tasas", "total")})
    destino.write_text(json.dumps({"_nota": "Generado por herramientas/extraer_pbf.py a partir de las memorias en PDF de la SEPG. "
                                             "Millones de euros; estimaciones previas (ex ante) de cada proyecto de presupuestos.",
                                   "memorias": memorias}, ensure_ascii=False, indent=1) + "\n")


if __name__ == "__main__":
    main()
