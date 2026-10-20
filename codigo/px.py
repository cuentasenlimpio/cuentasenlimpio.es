"""Lector mínimo de ficheros PC-Axis (.px) de la Seguridad Social, sin dependencias.

Devuelve las variables con sus valores y una función para leer una celda por nombre de valor. Los datos van en el
orden STUB × HEADING: la última variable cambia más deprisa.
"""
import re


def leer_px(ruta):
    texto = open(ruta, encoding="cp1252", errors="replace").read()
    cabecera, datos = texto.split("DATA=", 1)
    claves = {}
    for m in re.finditer(r'([A-Z\-]+(?:\("[^"]*"\))?)=(.*?);\s*\n', cabecera, re.S):
        claves[m.group(1)] = m.group(2)
    nombres = re.findall(r'"([^"]*)"', claves["STUB"]) + re.findall(r'"([^"]*)"', claves["HEADING"])
    valores = {n: re.findall(r'"([^"]*)"', claves[f'VALUES("{n}")']) for n in nombres}
    celdas = []
    for x in datos.replace(";", " ").split():
        x = x.strip('"')
        celdas.append(None if x in ("..", ".", "-", "") else float(x))
    tamaños = [len(valores[n]) for n in nombres]
    total = 1
    for t in tamaños:
        total *= t
    if len(celdas) != total:
        raise ValueError(f"{ruta}: {len(celdas)} celdas y se esperaban {total}")

    def celda(**eleccion):
        pos = 0
        for n, t in zip(nombres, tamaños):
            pos = pos * t + valores[n].index(eleccion[n])
        return celdas[pos]

    return {"variables": nombres, "valores": valores, "celda": celda,
            "actualizado": (claves.get("LAST-UPDATED") or claves.get("CREATION-DATE") or "").strip('"')}
