"""Lector mínimo de .xlsx con la biblioteca estándar (sin openpyxl): hojas y valores de celda, nada más.

Un .xlsx es un zip de XML. Basta con la lista de hojas (workbook.xml y sus relaciones), las cadenas compartidas
(sharedStrings.xml) y cada hoja (sheetN.xml). Las fórmulas se leen por su último valor guardado.
"""
import re
import zipfile
import xml.etree.ElementTree as ET

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
      "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
      "rel": "http://schemas.openxmlformats.org/package/2006/relationships"}


def _columna(ref):
    letras = re.match(r"[A-Z]+", ref).group(0)
    n = 0
    for c in letras:
        n = n * 26 + ord(c) - 64
    return n - 1


def hojas(ruta):
    """{nombre de hoja: [[valor, …], …]} con las filas en orden y los huecos como None."""
    with zipfile.ZipFile(ruta) as z:
        compartidas = []
        if "xl/sharedStrings.xml" in z.namelist():
            for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS):
                compartidas.append("".join(t.text or "" for t in si.iter(f"{{{NS['m']}}}t")))
        libro = ET.fromstring(z.read("xl/workbook.xml"))
        relaciones = {r.get("Id"): r.get("Target") for r in
                      ET.fromstring(z.read("xl/_rels/workbook.xml.rels")).findall("rel:Relationship", NS)}
        salida = {}
        for hoja in libro.find("m:sheets", NS):
            destino = relaciones[hoja.get(f"{{{NS['r']}}}id")].lstrip("/")
            destino = destino if destino.startswith("xl/") else f"xl/{destino}"
            filas = []
            for fila in ET.fromstring(z.read(destino)).iter(f"{{{NS['m']}}}row"):
                valores = []
                for celda in fila.findall("m:c", NS):
                    i = _columna(celda.get("r"))
                    v = celda.find("m:v", NS)
                    tipo = celda.get("t")
                    if tipo == "s" and v is not None:
                        valor = compartidas[int(v.text)]
                    elif tipo == "inlineStr":
                        valor = "".join(t.text or "" for t in celda.iter(f"{{{NS['m']}}}t"))
                    elif v is not None and v.text is not None:
                        try:
                            valor = float(v.text)
                        except ValueError:
                            valor = v.text
                    else:
                        valor = None
                    valores.extend([None] * (i - len(valores)))
                    valores.append(valor)
                filas.append(valores)
            salida[hoja.get("name")] = filas
        return salida
