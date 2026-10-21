#!/usr/bin/env python3
"""Construye los datos de la web a partir de la última descarga de cada tabla.

Lee datos/manifiesto.json, abre el fichero crudo más reciente de cada tabla y escribe:
  web/datos/aapp.json   lo que dibuja la web, con la procedencia de cada serie
  web/datos/aapp.csv    los mismos números, para descargar
  web/crudo/…json.gz    copia comprimida de cada fichero crudo usado, para que cualquiera lo compruebe

Distingue siempre entre DATO (tal cual lo publica la fuente) y LECTURA (un cálculo nuestro, con su fórmula).

Uso:  python3 datos/construir.py
"""
import csv
import datetime as dt
import gzip
import hashlib
import json
import os
import pathlib
import re
import shutil
import unicodedata
import zipfile

from xlsx import hojas
from px import leer_px
from xls import hojas as hojas_xls

CODIGO = pathlib.Path(__file__).resolve().parent
# Descargas y manifiesto: junto al código o en CUENTAS_DATOS. La web se escribe en CUENTAS_WEB (por defecto, web/ del
# repo); en el servidor es una copia de trabajo de las plantillas, para no tocar el clon.
AQUI = pathlib.Path(os.environ.get("CUENTAS_DATOS") or CODIGO)
WEB = pathlib.Path(os.environ.get("CUENTAS_WEB") or CODIGO.parent / "web")
MANIFIESTO = AQUI / "manifiesto.json"

DESDE = 1995

NAVEGADOR = "https://ec.europa.eu/eurostat/databrowser/view/{tabla}/default/table?lang=es"


def es(n, decimales=0):
    """Número a la española: 1 234 567,8 (espacio fino como separador de miles)."""
    texto = f"{n:,.{decimales}f}"
    return texto.replace(",", "\u202f").replace(".", ",")


FIRMAS = {".zip": b"PK", ".xlsx": b"PK", ".xls": b"\xd0\xcf\x11\xe0", ".pdf": b"%PDF"}


def ultimas_descargas():
    """La última copia de cada tabla con el formato que toca: si una web caída devolvió su página de aviso en lugar del
    fichero, se queda la copia buena anterior."""
    manifiesto = json.loads(MANIFIESTO.read_text())
    ultimas = {}
    for m in manifiesto:
        ruta = AQUI / m["fichero"]
        firma = FIRMAS.get(ruta.suffix)
        if firma and ruta.exists():
            with open(ruta, "rb") as f:
                if not f.read(len(firma)) == firma:
                    continue
        ultimas[m["tabla"]] = m
    return ultimas


def leer_jsonstat(ruta):
    """Devuelve {(dim1, dim2, …): (valor, marca)} y el JSON entero."""
    d = json.loads(ruta.read_text())
    ids, tam = d["id"], d["size"]
    claves = {}
    for k in ids:
        indice = d["dimension"][k]["category"]["index"]
        claves[k] = sorted(indice, key=indice.get) if isinstance(indice, dict) else list(indice)
    marcas = d.get("status", {})
    celdas = {}
    for pos, valor in d["value"].items():
        resto, coords = int(pos), []
        for k, s in reversed(list(zip(ids, tam))):
            coords.append(claves[k][resto % s])
            resto //= s
        celdas[tuple(reversed(coords))] = (valor, marcas.get(pos))
    return celdas, d


def serie(celdas, d, **filtro):
    """{año: (valor, marca)} para las celdas que cumplen el filtro."""
    ids = d["id"]
    salida = {}
    for coords, vm in celdas.items():
        dims = dict(zip(ids, coords))
        if all(dims.get(k) == v for k, v in filtro.items()):
            salida[int(dims["time"])] = vm
    return salida


MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre",
         "noviembre", "diciembre"]


def fecha_es(iso):
    a, m, d = int(iso[:4]), int(iso[5:7]), int(iso[8:10])
    return f"{d} de {MESES[m - 1]} de {a}"


TIPO_FIJO = 166.386  # pesetas por euro, fijado de forma irrevocable desde el 1 de enero de 1999


def comprobar_pesetas(tablas, años):
    """Antes de 1999 Eurostat da dos «euros»: MIO_EUR (pesetas al tipo de mercado del ECU de cada año) y MIO_NAC
    (pesetas al tipo fijo). Comprueba que la diferencia es exactamente esa, con el tipo de cierre que publica Eurostat."""
    edp_c, edp_d = tablas["gov_10dd_edpt1"]
    ert_c, ert_d = tablas["ert_h_eur_a"]
    eur = serie(edp_c, edp_d, geo="ES", sector="S13", na_item="GD", unit="MIO_EUR")
    nac = serie(edp_c, edp_d, geo="ES", sector="S13", na_item="GD", unit="MIO_NAC")
    cierre = serie(ert_c, ert_d, currency="ESP", statinfo="END", unit="NAT")
    previos = [a for a in años if a < 1999]
    peor = max(abs(eur[a][0] - nac[a][0] * TIPO_FIJO / cierre[a][0]) for a in previos)
    tipos = ", ".join(f"{a}: {es(cierre[a][0], 3)}" for a in previos)
    return {
        "que": "¿Por qué la deuda en euros de 1995 a 1998 no es igual en todas las fuentes?",
        "resultado": (f"Porque entonces la moneda era la peseta y hay dos formas de pasarla a euros. Eurostat, en su unidad "
                      f"«euros», usa el tipo de cambio de cierre del ECU de cada año ({tipos} pesetas); el Banco de España "
                      f"y la unidad «moneda nacional» de Eurostat usan el tipo fijo de {es(TIPO_FIJO, 3)}. Con esos tipos, "
                      f"las dos versiones cuadran (diferencia máxima: {es(peor, 1)} millones de euros). En esta web usamos "
                      f"el tipo fijo, que es el que permite comparar años"),
        "ok": peor < 1,
    }


PAISES = {
    "BE": "Bélgica", "BG": "Bulgaria", "CZ": "Chequia", "DK": "Dinamarca", "DE": "Alemania", "EE": "Estonia",
    "IE": "Irlanda", "EL": "Grecia", "ES": "España", "FR": "Francia", "HR": "Croacia", "IT": "Italia", "CY": "Chipre",
    "LV": "Letonia", "LT": "Lituania", "LU": "Luxemburgo", "HU": "Hungría", "MT": "Malta", "NL": "Países Bajos",
    "AT": "Austria", "PL": "Polonia", "PT": "Portugal", "RO": "Rumanía", "SI": "Eslovenia", "SK": "Eslovaquia",
    "FI": "Finlandia", "SE": "Suecia", "EU27_2020": "UE-27",
}


def construir_ue(descargas, años):
    """Ingresos, gastos, saldo y deuda en % del PIB de los 27 países y la media de la UE (UE-27 de 2020)."""
    main_c, main_d = leer_jsonstat(AQUI / descargas["ue_gov_10a_main"]["fichero"])
    edp_c, edp_d = leer_jsonstat(AQUI / descargas["ue_gov_10dd_edpt1"]["fichero"])
    indicadores = {}
    for clave, (c, d, item) in {"ingresos": (main_c, main_d, "TR"), "gastos": (main_c, main_d, "TE"),
                                 "saldo": (main_c, main_d, "B9"), "deuda": (edp_c, edp_d, "GD")}.items():
        por_pais = {}
        for pais in PAISES:
            s_ = serie(c, d, geo=pais, sector="S13", na_item=item, unit="PC_GDP")
            por_pais[pais] = [None if a not in s_ or s_[a][0] is None else s_[a][0] for a in años]
        indicadores[clave] = por_pais
    return {"paises": PAISES, "indicadores": indicadores}


def construir_cambio_deuda(tablas, años, deflactor, base, poblacion):
    """Por qué cambió la deuda cada año, con la contabilidad oficial de Eurostat (gov_10dd_edpt3):

        variación de la deuda = déficit + compra neta de activos financieros + ajustes + discrepancias estadísticas

    El déficit se separa en intereses (D41PAY, gov_10dd_edpt1) y déficit sin intereses (la resta). En % del PIB se
    añade el efecto del crecimiento del PIB, de la identidad exacta
        D_t/Y_t − D_{t−1}/Y_{t−1} = ΔD_t/Y_t − (D_{t−1}/Y_{t−1})·g_t/(1+g_t),   g_t = Y_t/Y_{t−1} − 1
    con Y el PIB que usa la propia notificación (B1GQ de gov_10dd_edpt1)."""
    e1_c, e1_d = tablas["gov_10dd_edpt1"]
    e3_c, e3_d = tablas["gov_10dd_edpt3"]
    e3 = {}
    for co, (v, _) in e3_c.items():
        x = dict(zip(e3_d["id"], co))
        if x["geo"] == "ES" and x["sector"] == "S13" and x["unit"] == "MIO_NAC":
            e3[(x["na_item"], int(x["time"]))] = v or 0.0
    intereses = serie(e1_c, e1_d, geo="ES", sector="S13", na_item="D41PAY", unit="MIO_NAC")
    deuda = serie(e1_c, e1_d, geo="ES", sector="S13", na_item="GD", unit="MIO_NAC")
    deuda_pib = serie(e1_c, e1_d, geo="ES", sector="S13", na_item="GD", unit="PC_GDP")
    pib = serie(e1_c, e1_d, geo="ES", sector="S1", na_item="B1GQ", unit="MIO_NAC")

    def g(item, a):
        return e3.get((item, a), 0.0)

    comp = {"deficit_primario": [], "intereses": [], "activos": [], "ajustes": [], "variacion": []}
    peor = 0.0
    for a in años:
        variacion = g("GD_CH", a)
        deficit = g("B9_T3", a)
        i = intereses[a][0]
        activos = g("F_ASS", a)
        ajustes = g("ORADJ", a) + g("YA3", a)
        peor = max(peor, abs(variacion - (deficit + activos + ajustes)))
        comp["deficit_primario"].append(round(deficit - i, 1))
        comp["intereses"].append(round(i, 1))
        comp["activos"].append(round(activos, 1))
        comp["ajustes"].append(round(ajustes, 1))
        comp["variacion"].append(round(variacion, 1))

    def en(unidad):
        salida = {}
        for k, v in comp.items():
            fila = []
            for j, a in enumerate(años):
                if unidad == "corrientes":
                    fila.append(v[j])
                elif unidad == "constantes":
                    fila.append(round(v[j] * base / deflactor[a][0], 1))
                elif unidad == "habitante":
                    fila.append(round(v[j] * 1e6 / (poblacion[a][0] * 1e3)))
                else:
                    fila.append(None if a - 1 not in pib else round(100 * v[j] / pib[a][0], 2))
            salida[k] = fila
        if unidad == "pib":
            crecimiento, variacion_ratio, desvio = [], [], 0.0
            for a in años:
                if a - 1 not in pib:
                    crecimiento.append(None)
                    variacion_ratio.append(None)
                    continue
                d_ant = deuda[a - 1][0] / pib[a - 1][0]
                gr = pib[a][0] / pib[a - 1][0] - 1
                crecimiento.append(round(-100 * d_ant * gr / (1 + gr), 2))
                variacion_ratio.append(round(100 * (deuda[a][0] / pib[a][0] - d_ant), 2))
                publicada = deuda_pib[a][0] - deuda_pib[a - 1][0]
                desvio = max(desvio, abs(variacion_ratio[-1] - publicada))
            salida["crecimiento"] = crecimiento
            salida["variacion"] = variacion_ratio
            salida["_desvio_publicado"] = round(desvio, 2)
        return salida

    cambio = {u: en(u) for u in ("pib", "corrientes", "constantes", "habitante")}
    desvio = cambio["pib"].pop("_desvio_publicado")
    comprobacion = {
        "que": "¿Las partes de «por qué cambió la deuda» suman exactamente la variación publicada?",
        "resultado": (f"Sí: en euros, déficit + activos financieros + ajustes da la variación de la deuda de cada año con una "
                      f"diferencia máxima de {es(peor, 1)} millones (redondeo de Eurostat); en % del PIB, la suma reproduce "
                      f"la variación del porcentaje publicado con una diferencia máxima de {es(desvio, 2)} puntos, porque "
                      f"Eurostat publica ese porcentaje redondeado a un decimal"),
        "ok": peor < 1 and desvio <= 0.1 + 1e-9,
    }
    return cambio, comprobacion


FUNCIONES = [
    ("GF01", "Servicios públicos generales"), ("GF02", "Defensa"), ("GF03", "Orden público y seguridad"),
    ("GF04", "Asuntos económicos"), ("GF05", "Medio ambiente"), ("GF06", "Vivienda y servicios comunitarios"),
    ("GF07", "Sanidad"), ("GF08", "Ocio, cultura y religión"), ("GF09", "Educación"), ("GF10", "Protección social"),
]
NIVELES = [("S1311", "Administración Central"), ("S1312", "Comunidades autónomas"), ("S1313", "Entidades locales"),
           ("S1314", "Seguridad Social")]


def en_unidades(meur, pc_pib, años, deflactor, base, poblacion):
    """Una serie en millones (moneda nacional) y su % del PIB publicado → las cuatro unidades de la web."""
    def v(s, a):
        return None if a not in s or s[a][0] is None else s[a][0]
    return {
        "pib": [v(pc_pib, a) for a in años],
        "corrientes": [v(meur, a) for a in años],
        "constantes": [None if v(meur, a) is None else round(v(meur, a) * base / deflactor[a][0], 1) for a in años],
        "habitante": [None if v(meur, a) is None else round(v(meur, a) * 1e6 / (poblacion[a][0] * 1e3)) for a in años],
    }


def construir_gasto(descargas, tabla_main, deflactor, base, poblacion):
    """En qué se gasta (COFOG, gov_10a_exp) y qué parte paga cada nivel de administración."""
    c, d = leer_jsonstat(AQUI / descargas["gov_10a_exp"]["fichero"])
    v = {}
    for co, (valor, marca) in c.items():
        x = dict(zip(d["id"], co))
        if x["geo"] == "ES" and x["na_item"] == "TE":
            v[(x["sector"], x["cofog99"], x["unit"], int(x["time"]))] = (valor, marca)
    años = sorted({a for (s, f, u, a), (val, _) in v.items() if s == "S13" and f == "TOTAL" and u == "MIO_NAC"
                   and val is not None and a >= DESDE})

    def serie_(sector, funcion, unidad):
        return {a: v[(sector, funcion, unidad, a)] for a in años if (sector, funcion, unidad, a) in v}

    def val(sector, funcion, unidad, a):
        r = v.get((sector, funcion, unidad, a))
        return None if r is None else r[0]

    funciones = []
    for codigo, nombre in FUNCIONES:
        funciones.append({
            "codigo": codigo, "nombre": nombre,
            **en_unidades(serie_("S13", codigo, "MIO_NAC"), serie_("S13", codigo, "PC_GDP"), años, deflactor, base, poblacion),
            "provisional": [v.get(("S13", codigo, "MIO_NAC", a), (None, None))[1] == "p" for a in años],
        })

    # De cada 100 € de gasto: el porcentaje que publica Eurostat (PC_TOT), con los intereses de la deuda (GF0107)
    # separados de los servicios generales. Esa separación es una resta: GF01 − intereses.
    reparto = []
    for a in años:
        total = val("S13", "TOTAL", "MIO_NAC", a)
        intereses = 100 * val("S13", "GF0107", "MIO_NAC", a) / total
        fila = {"intereses": round(intereses, 2)}
        for codigo, _ in FUNCIONES:
            pc = val("S13", codigo, "PC_TOT", a)
            fila[codigo] = None if pc is None else round(pc - (intereses if codigo == "GF01" else 0), 2)
        reparto.append(fila)

    # Quién paga cada función: gasto del nivel ÷ gasto de todas las administraciones (lectura). A cada nivel se le
    # quitan las transferencias generales a otras administraciones (GF0108, por ejemplo la financiación autonómica),
    # que desaparecen al consolidar el total: si no, el Estado «pagaría» más del 200 % de los servicios generales.
    # Quedan otras transferencias entre niveles, así que las partes pueden sumar algo más de 100.
    def neto(sector, codigo, a):
        bruto = val(sector, codigo, "MIO_NAC", a)
        if bruto is None or codigo not in ("GF01", "TOTAL"):
            return bruto
        return bruto - (val(sector, "GF0108", "MIO_NAC", a) or 0.0)

    quien = []
    for a in años:
        fila = {}
        for codigo, _ in FUNCIONES + [("TOTAL", "Total")]:
            total = neto("S13", codigo, a)
            fila[codigo] = {n: (None if not total or neto(n, codigo, a) is None
                                else round(100 * neto(n, codigo, a) / total, 1)) for n, _ in NIVELES}
        quien.append(fila)

    # Comprobaciones: las funciones suman el total, el total es el gasto de gov_10a_main, y cada función coincide con
    # la serie COFOG de la IGAE.
    mc, md = tabla_main
    te = serie(mc, md, geo="ES", sector="S13", na_item="TE", unit="MIO_NAC")
    suma = max(abs(sum(val("S13", f, "MIO_NAC", a) for f, _ in FUNCIONES) - val("S13", "TOTAL", "MIO_NAC", a)) for a in años)
    contra_te = max(abs(val("S13", "TOTAL", "MIO_NAC", a) - te[a][0]) for a in años)
    libro = hojas(AQUI / descargas["igae_cofog"]["fichero"])
    igae = {}
    for nombre, filas in libro.items():
        m = re.match(r"(\d{4})", nombre)
        if not m:
            continue
        cab = next((f for f in filas if any(isinstance(x, str) and x.startswith("Total 0") for x in f)
                    or any(isinstance(x, str) and x == "Total 10" for x in f)), None)
        total = next((f for f in filas if len(f) > 1 and f[1] == "GASTO TOTAL"), None)
        if cab is None or total is None:
            continue
        for i, x in enumerate(cab):
            if isinstance(x, str) and x.startswith("Total ") and i < len(total) and isinstance(total[i], float):
                igae[(int(m.group(1)), "GF" + x[6:8])] = total[i]
    comunes = sorted({a for a, _ in igae} & set(años))
    coinciden = sum(all(abs(igae[(a, f)] - val("S13", f, "MIO_NAC", a)) < 1 for f, _ in FUNCIONES) for a in comunes)
    comprobaciones = [
        {"que": "¿Las diez funciones suman el gasto total?",
         "resultado": f"Sí, en los {len(años)} años" if suma < 1 else f"No: diferencia máxima de {es(suma)} millones",
         "ok": suma < 1},
        {"que": "¿El total del gasto por funciones es el mismo gasto total de la página de cuentas?",
         "resultado": f"Sí, en los {len(años)} años" if contra_te < 1 else f"No: diferencia máxima de {es(contra_te)} millones",
         "ok": contra_te < 1},
        {"que": "¿El gasto de cada función coincide con la serie de la IGAE?",
         "resultado": (f"Sí: las diez funciones coinciden al millón de euros en los {len(comunes)} años ({comunes[0]}–{comunes[-1]})"
                       if coinciden == len(comunes) else f"No del todo: coinciden las diez en {coinciden} de {len(comunes)} años"),
         "ok": coinciden == len(comunes)},
    ]
    return {"años": años, "funciones": funciones, "reparto": reparto, "quien": quien,
            "niveles": [{"codigo": n, "nombre": t} for n, t in NIVELES]}, comprobaciones


# Gasto por tipo (clasificación económica de gov_10a_main). Las ocho partes suman exactamente el gasto total (TE);
# el gasto de capital es P.5 + NP + D.9 (definición del SEC 2010) y el corriente, todo lo demás.
TIPOS = [
    ("sueldos", "Sueldos de los empleados públicos", [("D1PAY", 1)]),
    ("compras", "Compras de bienes y servicios", [("P2", 1)]),
    ("prestaciones", "Pensiones y otras prestaciones sociales (también en especie, como las recetas)", [("D62PAY", 1), ("D632PAY", 1)]),
    ("intereses", "Intereses de la deuda", [("D41PAY", 1)]),
    ("subvenciones", "Subvenciones a empresas", [("D3PAY", 1)]),
    ("otros_corrientes", "Otros gastos corrientes (transferencias, aportación a la UE, impuestos pagados…)",
     [("D29PAY", 1), ("D4PAY", 1), ("D41PAY", -1), ("D5PAY", 1), ("D7PAY", 1), ("D8", 1)]),
    ("inversion", "Inversión: obras, edificios, equipos y programas", [("P51G", 1)]),
    ("otros_capital", "Otros gastos de capital (ayudas a la inversión de otros, terrenos, existencias)",
     [("P5", 1), ("P51G", -1), ("NP", 1), ("D9PAY", 1)]),
]
CAPITAL = ("inversion", "otros_capital")


def construir_tipo(tabla_main, años, deflactor, base, poblacion):
    """Gasto corriente frente a gasto de capital e inversión, 1995–último año (gov_10a_main)."""
    mc, md = tabla_main

    def s(item, unidad="MIO_NAC"):
        return serie(mc, md, geo="ES", sector="S13", na_item=item, unit=unidad)

    codigos = {c for _, _, f in TIPOS for c, _ in f}
    m = {c: s(c) for c in codigos | {"TE"}}
    te_pib = s("TE", "PC_GDP")
    años = [a for a in años if all(m[c].get(a, (None,))[0] is not None for c in m)]
    partes = {}
    for clave, _, formula in TIPOS:
        partes[clave] = {a: sum(sg * m[c][a][0] for c, sg in formula) for a in años}
    descuadre = max(abs(sum(partes[k][a] for k in partes) - m["TE"][a][0]) for a in años)

    def como_serie(f):
        return {a: (round(f(a), 1), None) for a in años}

    corriente = como_serie(lambda a: m["TE"][a][0] - sum(partes[k][a] for k in CAPITAL))
    # % del PIB del gasto corriente: su parte del gasto total por el % del PIB que publica Eurostat para el total.
    corriente_pib = {a: (round(corriente[a][0] / m["TE"][a][0] * te_pib[a][0], 1), None) for a in años}
    salida = {
        "años": años,
        "corriente": en_unidades(corriente, corriente_pib, años, deflactor, base, poblacion),
        "inversion": en_unidades(m["P51G"], s("P51G", "PC_GDP"), años, deflactor, base, poblacion),
        "partes": [{"clave": k, "nombre": n, "formula": " ".join(("+ " if sg > 0 else "− ") + c for c, sg in f).lstrip("+ "),
                    "de_cada_100": [round(100 * partes[k][a] / m["TE"][a][0], 2) for a in años]} for k, n, f in TIPOS],
    }
    comprobacion = {
        "que": "¿Las ocho partes del gasto por tipo suman exactamente el gasto total?",
        "resultado": f"Sí, en los {len(años)} años ({años[0]}–{años[-1]})" if descuadre < 1
        else f"No: diferencia máxima de {es(descuadre)} millones",
        "ok": descuadre < 1,
    }
    return salida, comprobacion


# ---- Datos recientes (en curso) y previsiones, desde el 20/10/2026 ----

def _tabla_trimestral(filas):
    """IGAE T_AAPP: {(etiqueta, año, trimestre): valor}. Los años van en la fila «Índice», uno cada cuatro columnas."""
    cab = next(i for i, f in enumerate(filas) if len(f) > 1 and f[1] == "Índice")
    años, actual = [], None
    for x in filas[cab]:
        if isinstance(x, str) and x[:4].isdigit():
            actual = int(x[:4])
        años.append(actual)
    trimestres = filas[cab + 1]
    salida = {}
    for f in filas[cab + 2:]:
        etiqueta = (f[0] or "").strip() if f[0] else (f[1] or "").strip() if len(f) > 1 and isinstance(f[1], str) else ""
        for j, v in enumerate(f):
            if j < len(años) and años[j] and isinstance(v, float) and isinstance(trimestres[j], str):
                salida[(etiqueta, años[j], int(trimestres[j][1]))] = v
    return salida


def _anual_igae(filas):
    """IGAE A_AAPP: {(etiqueta, año): valor}, con la marca de provisional de cada año."""
    cab = next(i for i, f in enumerate(filas) if len(f) > 1 and f[1] == "CONCEPTOS")
    columnas = {j: (int(x[:4]), "(P)" in x) for j, x in enumerate(filas[cab]) if isinstance(x, str) and x[:4].isdigit()}
    salida, provisional = {}, {}
    for f in filas[cab + 1:]:
        etiqueta = (f[0] or "").strip() if f[0] else (f[1] or "").strip() if len(f) > 1 and isinstance(f[1], str) else ""
        for j, (a, p) in columnas.items():
            if j < len(f) and isinstance(f[j], float):
                salida[(etiqueta, a)] = f[j]
                provisional[a] = p
    return salida, provisional


def construir_recientes(descargas, datos_series, años):
    """Lo que hay después del último año cerrado y su grado de comprobación: el año en curso (IGAE trimestral, Banco de
    España) y las previsiones de cada institución, por separado. Devuelve el bloque para aapp.json y sus comprobaciones."""
    comprobaciones = []
    ultimo = años[-1]
    salida = {"ultimo_cerrado": ultimo, "fiabilidad": {}, "en_curso": None, "previsiones": {}}

    # 1. El último año: ¿la IGAE (segunda fuente) da lo mismo que Eurostat?
    if "igae_a_aapp" in descargas:
        filas_a = hojas(AQUI / descargas["igae_a_aapp"]["fichero"])["Tabla1a"]
        anual, prov = _anual_igae(filas_a)
        m_fecha = next((re.search(r"(\d{2})/(\d{2})/(\d{4})", f[0]) for f in filas_a[:6] if f and isinstance(f[0], str) and "actualización" in f[0]), None)
        fecha_igae = f"{int(m_fecha.group(1))} de {MESES[int(m_fecha.group(2)) - 1]} de {m_fecha.group(3)}" if m_fecha else "hace poco"
        for a in años[-3:]:
            igae = anual.get(("B.9", a))
            eurostat = datos_series["saldo"]["meur"].get(a, (None,))[0]
            if igae is None or eurostat is None:
                continue
            dif = igae - eurostat
            salida["fiabilidad"][str(a)] = {
                "igae_provisional": prov.get(a, False),
                "cuadra": abs(dif) < 1,
                "nota": (f"Las dos fuentes oficiales, Eurostat y la IGAE, dan el mismo saldo ({es(eurostat)} millones)." if abs(dif) < 1 else
                         f"Las dos fuentes oficiales aún no coinciden del todo: la IGAE da un saldo de {es(igae)} millones y Eurostat, "
                         f"de {es(eurostat)}. La diferencia, {es(abs(dif))} millones, se debe a que la IGAE revisó sus cifras el "
                         f"{fecha_igae} y Eurostat todavía no lo ha recogido."),
            }
        a = ultimo
        f = salida["fiabilidad"].get(str(a))
        comprobaciones.append({
            "que": f"¿El saldo de {a} es el mismo en Eurostat y en la IGAE?",
            "resultado": ("Sí" if f and f["cuadra"] else "Todavía no" if f else "La IGAE aún no lo publica") +
                         (f": {f['nota'][0].lower() + f['nota'][1:]}" if f else ""),
            "ok": bool(f and f["cuadra"]),
        })

    # 2. El año en curso: acumulado hasta el último trimestre (IGAE) y deuda del último trimestre (Banco de España).
    if "igae_t_aapp" in descargas and "ine_pib" in descargas:
        libro = hojas(AQUI / descargas["igae_t_aapp"]["fichero"])
        t = _tabla_trimestral(libro["Tabla1a"])
        tp = _tabla_trimestral(libro["Tabla1b"])
        conceptos = {"ingresos": "RECURSOS NO FINANCIEROS", "gastos": "EMPLEOS NO FINANCIEROS", "saldo": "B.9"}
        hay = sorted({(a, q) for (e, a, q) in t if e == "B.9"})
        a, q = hay[-1]
        if a > ultimo:
            pib = json.loads((AQUI / descargas["ine_pib"]["fichero"]).read_text())
            pib_t = {(d["Anyo"], d["FK_Periodo"] - 18): d["Valor"] for d in pib["Data"]}
            # PIB de los cuatro últimos trimestres (del 2.º de hace un año al último).
            ventana = [((a - 1, k) if k > q else (a, k)) for k in range(1, 5)]
            pib_12 = sum(pib_t[x] for x in ventana) if all(x in pib_t for x in ventana) else None
            en_curso = {"año": a, "trimestre": q, "x": a - 1 + (3 * q) / 12 + 0.0, "series": {}}
            for clave, etiqueta in conceptos.items():
                acum = t[(etiqueta, a, q)]
                antes = t[(etiqueta, a - 1, q)]
                año_antes = t[(etiqueta, a - 1, 4)]
                doce = año_antes - antes + acum
                en_curso["series"][clave] = {
                    "acumulado_meur": acum, "acumulado_anterior_meur": antes,
                    "acumulado_pib": round(tp[(etiqueta, a, q)], 2), "acumulado_anterior_pib": round(tp[(etiqueta, a - 1, q)], 2),
                    "doce_meses_meur": doce, "doce_meses_pib": None if not pib_12 else round(100 * doce / pib_12, 1),
                }
            en_curso["pib_doce_meses_meur"] = pib_12
            # Deuda: el último trimestre del Banco de España, ya en % del PIB (cuadro 11.7).
            if "bde_be1107" in descargas:
                texto = (AQUI / descargas["bde_be1107"]["fichero"]).read_bytes().decode("latin-1")
                filas = list(csv.reader(texto.splitlines()))
                meses = {"MAR": 1, "JUN": 2, "SEP": 3, "DIC": 4}
                ult = None
                for f_ in filas:
                    m_ = re.match(r"([A-Z]{3}) (\d{4})$", f_[0] if f_ else "")
                    if m_ and m_.group(1) in meses and f_[1] not in ("_", ""):
                        ult = (int(m_.group(2)), meses[m_.group(1)], float(f_[1]))
                if ult and ult[0] > ultimo:
                    en_curso["deuda"] = {"año": ult[0], "trimestre": ult[1], "pib": ult[2],
                                         "x": ult[0] - 1 + (3 * ult[1]) / 12}
            salida["en_curso"] = en_curso
            # Comprobación: la suma de los cuatro trimestres de la IGAE del último año cerrado es su total anual.
            if "igae_a_aapp" in descargas:
                igae_b9 = anual.get(("B.9", a - 1))
                comprobaciones.append({
                    "que": f"¿El trimestral de la IGAE (4.º trimestre de {a - 1}) coincide con su dato anual?",
                    "resultado": "Sí" if igae_b9 is not None and abs(t[("B.9", a - 1, 4)] - igae_b9) < 1 else "No",
                    "ok": igae_b9 is not None and abs(t[("B.9", a - 1, 4)] - igae_b9) < 1,
                })

    # 3. Previsiones: una serie por institución, con la publicación de la que sale cada punto.
    cfg = json.loads((CODIGO / "previsiones.json").read_text())
    previsiones = {"criterio": cfg["criterio"], "emisores": [], "abanico": None}
    for e in cfg["emisores"]:
        series = {}
        if e.get("automatico") == "ameco":
            codigos = {"saldo": ("ameco16", "UBLGE"), "deuda": ("ameco18", "UDGG"), "ingresos": ("ameco16", "URTG"), "gastos": ("ameco16", "UUTG")}
            for clave, (fichero, codigo) in codigos.items():
                if fichero not in descargas:
                    continue
                try:
                    with zipfile.ZipFile(AQUI / descargas[fichero]["fichero"]) as z:
                        texto = z.read(z.namelist()[0]).decode("latin-1")
                except zipfile.BadZipFile:
                    print(f"AVISO: {fichero} no es un zip válido; se omite esa previsión")
                    continue
                lineas = texto.splitlines()
                cab = lineas[0].split(";")
                for l in lineas:
                    if l.startswith(f"ESP.1.0.319.0.{codigo};"):
                        campos = l.split(";")
                        series[clave] = {int(c): float(v) for c, v in zip(cab, campos) if c.isdigit() and int(c) > ultimo
                                         and v not in ("NA", "")}
            pub = e["publicacion"]
            puntos = {k: [{"año": a_, "valor": round(v, 2), "publicacion": 0} for a_, v in sorted(s_.items())] for k, s_ in series.items()}
            pubs = [pub | {"url": pub["pagina"]}]
        elif e.get("automatico") == "weo":
            codigos = {"saldo": "GGXCNL_NGDP", "deuda": "GGXWDG_NGDP", "ingresos": "GGR_NGDP", "gastos": "GGX_NGDP"}
            for clave, codigo in codigos.items():
                k = f"fmi_weo_{codigo.lower()}"
                if k not in descargas:
                    continue
                xml = (AQUI / descargas[k]["fichero"]).read_text()
                series[clave] = {int(a_): float(v) for a_, v in re.findall(r'TIME_PERIOD="(\d{4})" OBS_VALUE="([-\d.]+)"', xml) if int(a_) > ultimo}
            pub = e["publicacion"]
            puntos = {k: [{"año": a_, "valor": round(v, 2), "publicacion": 0} for a_, v in sorted(s_.items())] for k, s_ in series.items()}
            pubs = [pub | {"url": pub["pagina"]}]
        else:
            # Transcritas: para cada año, la publicación más reciente que lo da.
            pubs = sorted(e["publicaciones"], key=lambda p_: p_["fecha"])
            puntos = {}
            for k_pub, p_ in enumerate(pubs):
                for clave, vals in p_["valores"].items():
                    for a_, v in vals.items():
                        if int(a_) > ultimo:
                            puntos.setdefault(clave, {})[int(a_)] = {"año": int(a_), "valor": v, "publicacion": k_pub}
                # Las que salen de una hoja de cálculo se comprueban contra el fichero descargado.
                if p_["fichero"].lower().endswith(".xlsx") and p_.get("tabla") in descargas:
                    celdas = [round(x, 2) for filas in hojas(AQUI / descargas[p_["tabla"]]["fichero"]).values()
                              for f_ in filas for x in f_ if isinstance(x, float)]
                    todos = [v for vals in p_["valores"].values() for v in vals.values()]
                    todos += [v for b in p_.get("abanico", {}).values() for vals in b.values() for v in vals.values()]
                    faltan = [v for v in todos if not any(abs(c - v) < 0.006 for c in celdas)]
                    comprobaciones.append({
                        "que": f"¿Las cifras que copiamos de «{p_['titulo']}» están en su hoja de cálculo?",
                        "resultado": f"Sí, las {len(todos)}" if not faltan else f"No: faltan {', '.join(es(v, 2) for v in faltan)}",
                        "ok": not faltan,
                    })
                if p_.get("abanico"):
                    previsiones["abanico"] = {"emisor": e["id"], "publicacion": p_["titulo"], "fecha": p_["fecha"], "url": p_["fichero"],
                                              "donde": p_["donde"],
                                              "deuda": {k: {int(a_): v for a_, v in vals.items()} for k, vals in p_["abanico"]["deuda"].items()}}
            puntos = {k: [v for _, v in sorted(d_.items())] for k, d_ in puntos.items()}
            pubs = [{"fecha": p_["fecha"], "titulo": p_["titulo"], "url": p_["fichero"], "donde": p_["donde"]} for p_ in pubs]
        previsiones["emisores"].append({"id": e["id"], "nombre": e["nombre"], "largo": e.get("largo"), "tipo": e["tipo"],
                                        "publicaciones": pubs, "series": puntos})
    salida["previsiones"] = previsiones
    return salida, comprobaciones


INGRESOS_PARTES = [
    # clave, nombre, fórmula sobre gov_10a_taxag (S13): lista de (código, signo)
    ("iva", "IVA", [("D211", 1)]),
    ("productos", "Otros impuestos sobre productos (especiales, actos jurídicos, primas de seguros…)", [("D21", 1), ("D211", -1)]),
    ("produccion", "Otros impuestos sobre la producción (sobre inmuebles de empresas, licencias de actividad, contaminación…)", [("D29", 1)]),
    ("renta", "Impuestos sobre la renta de los hogares", [("D51A_C1", 1)]),
    ("sociedades", "Impuestos sobre los beneficios de las empresas", [("D51B_C2", 1)]),
    ("otros_corrientes", "Otros impuestos corrientes (sobre el capital y el patrimonio, premios de juego, licencias…)", [("D5", 1), ("D51A_C1", -1), ("D51B_C2", -1)]),
    ("capital", "Impuestos sobre el capital (sucesiones, donaciones…)", [("D91", 1)]),
    ("cotizaciones", "Cotizaciones sociales", [("D61", 1)]),
    ("no_cobrado", "Menos lo liquidado que no se espera cobrar", [("D995", -1)]),
]


def construir_ingresos(descargas, tabla_main, deflactor, base, poblacion):
    """De dónde sale el dinero: impuestos por tipo (gov_10a_taxag), cotizaciones y el resto de ingresos."""
    c, d = leer_jsonstat(AQUI / descargas["gov_10a_taxag"]["fichero"])
    v = {}
    for co, (valor, marca) in c.items():
        x = dict(zip(d["id"], co))
        if x["geo"] == "ES" and x["sector"] == "S13":
            v[(x["na_item"], x["unit"], int(x["time"]))] = (valor, marca)
    mc, md = tabla_main
    tr = serie(mc, md, geo="ES", sector="S13", na_item="TR", unit="MIO_NAC")
    tr_pib = serie(mc, md, geo="ES", sector="S13", na_item="TR", unit="PC_GDP")
    años = sorted(a for a in tr if a >= DESDE and ("D2_D5_D91_D61_M_D995", "MIO_NAC", a) in v
                  and v[("D2_D5_D91_D61_M_D995", "MIO_NAC", a)][0] is not None)

    def val(item, unidad, a):
        r = v.get((item, unidad, a))
        return 0.0 if r is None or r[0] is None else r[0]

    partes, peor_suma = [], 0.0
    for clave, nombre, formula in INGRESOS_PARTES:
        meur = {a: (sum(s * val(i, "MIO_NAC", a) for i, s in formula), None) for a in años}
        pib = {a: (round(sum(s * val(i, "PC_GDP", a) for i, s in formula), 2), None) for a in años}
        partes.append({"clave": clave, "nombre": nombre, "codigos": " ".join(("−" if s < 0 else "") + i for i, s in formula),
                       **en_unidades(meur, pib, años, deflactor, base, poblacion)})
    for a in años:
        peor_suma = max(peor_suma, abs(sum(p["corrientes"][años.index(a)] for p in partes) - val("D2_D5_D91_D61_M_D995", "MIO_NAC", a)))
    otros_meur = {a: (tr[a][0] - val("D2_D5_D91_D61_M_D995", "MIO_NAC", a), None) for a in años}
    otros_pib = {a: (round(tr_pib[a][0] - val("D2_D5_D91_D61_M_D995", "PC_GDP", a), 2), None) for a in años}
    partes.append({"clave": "otros_ingresos", "nombre": "Otros ingresos (ventas, rentas de la propiedad, transferencias…)",
                   "codigos": "TR − impuestos y cotizaciones",
                   **en_unidades(otros_meur, otros_pib, años, deflactor, base, poblacion)})
    reparto = [{p["clave"]: round(100 * p["corrientes"][i] / tr[a][0], 2) for p in partes} for i, a in enumerate(años)]

    # Contraste con la IGAE: las operaciones que también publica en su secuencia de cuentas.
    igae = leer_igae(descargas)
    # Se comparan las operaciones que usa la web (D.21 y D.29, no su suma D.2, que a Eurostat le falta en 1995).
    pares = {"D211": "D.211", "D21": "D.21", "D29": "D.29", "D5": "D.5", "D61": "D.61", "D91": "D.91r"}
    comunes = sorted(set(igae) & set(años))
    fallos = []
    for item, cod in pares.items():
        for a in comunes:
            _, recursos = igae[a]
            ref = recursos.get(cod)
            if ref is None or abs(ref - val(item, "MIO_NAC", a)) >= 1:
                fallos.append((item, a))
    comprobaciones = [
        {"que": "¿Las partes de los impuestos y cotizaciones suman su total publicado?",
         "resultado": f"Sí, en los {len(años)} años" if peor_suma < 1 else f"No: diferencia máxima de {es(peor_suma)} millones",
         "ok": peor_suma < 1},
        {"que": "¿Los impuestos y las cotizaciones coinciden con la IGAE?",
         "resultado": (f"Sí: IVA, impuestos sobre la producción, sobre la renta, sobre el capital y cotizaciones coinciden al "
                       f"millón de euros en los {len(comunes)} años ({comunes[0]}–{comunes[-1]}). El reparto entre renta de los "
                       f"hogares y beneficios de empresas solo lo publica Eurostat" if not fallos else
                       f"No del todo: {len(fallos)} cifras no coinciden (por ejemplo, {fallos[0][0]} en {fallos[0][1]})"),
         "ok": not fallos},
    ]
    return {"años": años, "partes": partes, "reparto": reparto}, comprobaciones


def ampliar_ingresos_igae(ingresos, descargas, pib, deflactor, base, poblacion):
    """Añade a los ingresos el año siguiente al último de Eurostat con el desglose de la IGAE (A_AAPP_Imp y A_AAPP),
    marcado como provisional y sin segunda fuente. La correspondencia de categorías se comprueba en los años que
    publican los dos."""
    if "igae_a_aapp_imp" not in descargas or "igae_a_aapp" not in descargas:
        return []

    def tabla(filas):
        cab = next(i for i, f in enumerate(filas) if len(f) > 1 and f[1] == "CONCEPTOS")
        cols = {j: (int(x[:4]), "(P)" in x) for j, x in enumerate(filas[cab]) if isinstance(x, str) and x[:4].isdigit()}
        out, prov = {}, {}
        for f in filas[cab + 1:]:
            cad = [x.strip() for x in f[:2] if isinstance(x, str) and x.strip()]
            if not cad:
                continue
            for j, (a, pr) in cols.items():
                if j < len(f) and isinstance(f[j], float):
                    out.setdefault((cad[0], a), f[j])
                    prov[a] = pr
        return out, prov

    t, prov = tabla(hojas(AQUI / descargas["igae_a_aapp_imp"]["fichero"])["Tabla1a"])
    a_, _ = tabla(hojas(AQUI / descargas["igae_a_aapp"]["fichero"])["Tabla1a"])
    etiquetas = {k for k, _ in t}
    irpf = next(k for k in etiquetas if k.startswith("Impuesto sobre la Renta de Personas"))
    soc = [next(k for k in etiquetas if k.startswith("Impuesto sobre Sociedades")),
           "Gravamen Temporal Entidades de Crédito y Establecimientos Financieros",
           "Impuesto sobre el margen de intereses y comisiones de determinadas entidades financieras"]

    def partes(y):
        g = lambda k: t.get((k, y), 0.0)
        renta, sociedades = g(irpf), sum(g(k) for k in soc)
        impuestos = {"iva": g("D.211"), "productos": g("D.21") - g("D.211"), "produccion": g("D.29"), "renta": renta,
                     "sociedades": sociedades, "otros_corrientes": g("D.5") - renta - sociedades, "capital": g("D.91"),
                     "cotizaciones": g("D.611") + g("D.612") + g("D.613"), "no_cobrado": 0.0}
        impuestos["otros_ingresos"] = a_[("RECURSOS NO FINANCIEROS", y)] - sum(impuestos.values())
        return impuestos

    años = ingresos["años"]
    comunes = [y for y in años if ("D.211", y) in t]
    cuadran = [y for y in comunes if all(abs(partes(y)[p["clave"]] - p["corrientes"][años.index(y)]) < 1
                                         for p in ingresos["partes"] if p["clave"] != "otros_ingresos")]
    comprobaciones = [{
        "que": "¿El desglose de impuestos de la IGAE coincide con el de Eurostat?",
        "resultado": (f"Coincide al millón de euros en {len(cuadran)} de los {len(comunes)} años que publican los dos"
                      + ("" if len(cuadran) == len(comunes) else
                         f"; no en {', '.join(str(y) for y in comunes if y not in cuadran)}, que la IGAE revisó después")
                      + ". Por eso usamos el de la IGAE para el año que Eurostat aún no tiene"),
        "ok": bool(cuadran) and cuadran[-1] >= comunes[-1] - 1,
    }]
    nuevo = años[-1] + 1
    if ("D.211", nuevo) not in t or ("RECURSOS NO FINANCIEROS", nuevo) not in a_ or nuevo not in pib:
        ingresos["provisional_igae"] = [False] * len(años)
        return comprobaciones
    valores = partes(nuevo)
    for p in ingresos["partes"]:
        m = valores[p["clave"]]
        p["pib"].append(round(100 * m / pib[nuevo][0], 2))
        p["corrientes"].append(m)
        p["constantes"].append(round(m * base / deflactor[nuevo][0], 1))
        p["habitante"].append(round(m * 1e6 / (poblacion[nuevo][0] * 1e3)))
    total = a_[("RECURSOS NO FINANCIEROS", nuevo)]
    ingresos["reparto"].append({k: round(100 * v / total, 2) for k, v in valores.items()})
    ingresos["años"] = años + [nuevo]
    ingresos["provisional_igae"] = [False] * len(años) + [True]
    ingresos["igae_marca_provisional"] = prov.get(nuevo, False)
    return comprobaciones


# ---- La economía detrás de las cuentas (desde el 20/10/2026) ----
MESES_CORTOS = {"Ene": 1, "Feb": 2, "Mar": 3, "Abr": 4, "May": 5, "Jun": 6, "Jul": 7, "Ago": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dic": 12}
MESES_LARGOS = {m.capitalize(): i + 1 for i, m in enumerate(MESES)}


def _ine(descargas, codigo):
    """Serie del INE (Tempus): lista de (periodo, valor), con periodo «AAAA-MM», «AAAATn» o «AAAA»."""
    k = f"ine_{codigo.lower()}"
    if k not in descargas:
        return []
    d = json.loads((AQUI / descargas[k]["fichero"]).read_text())
    salida = []
    for x in d["Data"]:
        if x.get("Valor") is None:
            continue
        p_, a = x["FK_Periodo"], x["Anyo"]
        periodo = f"{a}-{p_:02d}" if 1 <= p_ <= 12 else f"{a}T{p_ - 18}" if 19 <= p_ <= 22 else str(a)
        salida.append((periodo, x["Valor"]))
    return sorted(salida)


def construir_economia(descargas, ingresos):
    comprobaciones = []
    eco = {}

    # 1. Afiliación: bruta (01m, desde 2012) y desestacionalizada oficial (10mb09 hasta 2020, 10mb25 desde 2021).
    if "ss_afiliados_medios" in descargas:
        px = leer_px(AQUI / descargas["ss_afiliados_medios"]["fichero"])
        periodos = px["valores"]["Periodo"]
        total = lambda per, reg="Todos los Regimenes", edad="Total Edad": px["celda"](
            Periodo=per, **{"Tramos de edad": edad, "Regímenes": reg, "Sexo": "Total Sexo"})
        bruta = {f"{p_[:4]}-{p_[4:]}": round(total(p_)) for p_ in periodos}
        desest = {}
        for clave in ("ss_afiliados_desest_09", "ss_afiliados_desest"):
            if clave in descargas:
                d_ = leer_px(AQUI / descargas[clave]["fichero"])
                h = d_["variables"][2]
                for p_ in d_["valores"]["Periodo"]:
                    if clave == "ss_afiliados_desest_09" and int(p_[:4]) >= 2021:
                        continue
                    desest[f"{p_[:4]}-{p_[4:]}"] = round(d_["celda"](Periodo=p_, Sector="Total", **{h: "Total"}))
        meses = sorted(set(bruta) | set(desest))
        ult = periodos[-1]
        regimenes = [("REGIMEN GENERAL", "Régimen general (sin agrario ni hogar)"), ("R.G.(S.E.AGRARIO)", "Agrario (dentro del general)"),
                     ("R.G.(S.E. EM. HOGAR)", "Empleo del hogar (dentro del general)"), ("REG. ESP. AUTONOMOS", "Autónomos"),
                     ("R.E.MAR(CUENTA AJENA)", "Mar, cuenta ajena"), ("R.E.MAR(C. PROPIA)", "Mar, cuenta propia"),
                     ("R.E. MINERIA CARBON", "Minería del carbón")]
        por_regimen = [{"nombre": n, "valor": round(total(ult, reg=r))} for r, n in regimenes]
        suma = sum(x["valor"] for x in por_regimen)
        edades = [e for e in px["valores"]["Tramos de edad"] if e != "Total Edad"]
        por_edad = [{"nombre": e.replace("Entre ", "").replace("Mas de 64 años", "65 y más"), "valor": round(total(ult, edad=e))} for e in edades]
        # Media anual (años completos), para cruzar con las cotizaciones.
        anual = {}
        for a in sorted({int(m[:4]) for m in bruta}):
            vals = [bruta[f"{a}-{k:02d}"] for k in range(1, 13) if f"{a}-{k:02d}" in bruta]
            if len(vals) == 12:
                anual[a] = round(sum(vals) / 12)
        eco["afiliacion"] = {
            "meses": meses, "bruta": [bruta.get(m) for m in meses], "desest": [desest.get(m) for m in meses],
            "ultimo": f"{ult[:4]}-{ult[4:]}", "por_regimen": por_regimen, "por_edad": por_edad,
            "anual": {"años": list(anual), "afiliados": list(anual.values())},
        }
        comprobaciones.append({"que": "¿Los regímenes de la Seguridad Social suman el total de afiliados?",
                               "resultado": "Sí" if abs(suma - round(total(ult))) <= len(regimenes) else f"No: {es(suma)} frente a {es(total(ult))}",
                               "ok": abs(suma - round(total(ult))) <= len(regimenes)})
        # Las dos series desestacionalizadas (CNAE 2009 y CNAE 2025) en sus años comunes.
        if "ss_afiliados_desest_09" in descargas and "ss_afiliados_desest" in descargas:
            a09 = leer_px(AQUI / descargas["ss_afiliados_desest_09"]["fichero"])
            a25 = leer_px(AQUI / descargas["ss_afiliados_desest"]["fichero"])
            comunes = sorted(set(a09["valores"]["Periodo"]) & set(a25["valores"]["Periodo"]))
            dif = max(abs(a09["celda"](Periodo=p_, Sector="Total", **{a09["variables"][2]: "Total"}) -
                          a25["celda"](Periodo=p_, Sector="Total", **{a25["variables"][2]: "Total"})) for p_ in comunes)
            comprobaciones.append({"que": "¿Las dos series desestacionalizadas de la Seguridad Social enlazan bien?",
                                   "resultado": f"Diferencia máxima de {es(dif)} afiliados en los {len(comunes)} meses comunes; usamos la nueva desde 2021",
                                   "ok": dif < 50000})

    # 1 bis. Paro registrado (SEPE): total y sectores de cada mes desde 2001. Los meses de antes de mayo de 2005 son
    # reconstruidos por el propio SEPE.
    paro, sectores_ult, peor, peor_sispe, descuadres = {}, None, 0.0, 0.0, 0
    for clave in ("sepe_paro_2001", "sepe_paro"):
        if clave not in descargas:
            continue
        for f in hojas_xls(AQUI / descargas[clave]["fichero"])["Sectores"]:
            nums = [x for x in f if isinstance(x, float)]
            codigo = next((int(x) for x in nums if 199001 <= x <= 210012), None)
            if codigo is None:
                continue
            datos_ = [x for x in nums if x != codigo and not (1990 <= x <= 2100)]
            if len(datos_) >= 6:
                total, partes_ = datos_[0], datos_[1:6]
                paro[f"{codigo // 100}-{codigo % 100:02d}"] = round(total)
                d_ = abs(sum(partes_) - total)
                peor = max(peor, d_)
                descuadres += d_ >= 1
                if codigo >= 200505:
                    peor_sispe = max(peor_sispe, d_)
                sectores_ult = (f"{codigo // 100}-{codigo % 100:02d}", partes_)
    if paro:
        m_ = sorted(paro)
        nombres = ["Agricultura", "Industria", "Construcción", "Servicios", "Sin empleo anterior"]
        eco["paro_registrado"] = {"meses": m_, "total": [paro[k] for k in m_], "ultimo": sectores_ult[0],
                                  "por_sector": [{"nombre": n, "valor": round(v)} for n, v in zip(nombres, sectores_ult[1])]}
        comprobaciones.append({"que": "¿Los sectores del paro registrado suman el total de cada mes?",
                               "resultado": (f"Sí, en los {len(m_)} meses" if peor < 1 else
                                             f"Sí desde mayo de 2005; antes, en {descuadres} meses de la serie que el SEPE reconstruyó, "
                                             f"difieren en {es(peor)} parados como mucho") if peor_sispe < 1 else
                                            f"No: diferencia máxima de {es(peor_sispe)} parados desde mayo de 2005",
                               "ok": peor_sispe < 1})

    # 2. EPA (INE), trimestral.
    epa = {k: dict(_ine(descargas, c)) for k, c in (("ocupados", "EPA387796"), ("parados", "EPA387800"), ("tasa_paro", "EPA423474"),
                                                    ("tasa_actividad", "EPA388079"), ("tasa_empleo", "EPA441060"))}
    if epa["ocupados"]:
        t_ = sorted(epa["ocupados"])
        eco["epa"] = {"trimestres": t_, **{k: [round(v.get(x), 2) if v.get(x) is not None else None for x in t_] for k, v in epa.items()}}

    # 3. Pensiones contributivas (avance mensual del INSS): diciembre de cada año desde 2016 y meses recientes.
    if "ss_pensiones_avance" in descargas:
        libro = hojas(AQUI / descargas["ss_pensiones_avance"]["fichero"])

        def leer(hoja):
            # La hoja trae debajo otras tablas con la misma forma (variaciones): vale la primera aparición de cada periodo.
            filas, año, salida = libro[hoja], None, {}
            for f in filas:
                v = [x for x in f if x not in (None, "")]
                if not v:
                    continue
                if isinstance(v[0], float) and 2000 < v[0] < 2100:
                    año = int(v[0])
                    if len(v) > 1 and isinstance(v[1], str) and v[1] in MESES_CORTOS:
                        if len(v) >= 8:
                            salida.setdefault(f"{año}-{MESES_CORTOS[v[1]]:02d}", v[7])
                    elif len(v) >= 7:
                        salida.setdefault(f"{año}", v[6])
                elif isinstance(v[0], str) and v[0] in MESES_CORTOS and año and len(v) >= 7:
                    salida.setdefault(f"{año}-{MESES_CORTOS[v[0]]:02d}", v[6])
            return salida
        numero, nomina, media = leer("Nº Pens. Clases"), leer("Importe €"), leer("P. Media €")
        claves = sorted(k for k in numero if "-" in k)
        años = sorted(int(k) for k in numero if "-" not in k)
        afi = eco.get("afiliacion")
        bruta_m = dict(zip(afi["meses"], afi["bruta"])) if afi else {}
        por_pension = lambda mes: None if bruta_m.get(mes) is None else round(bruta_m[mes] / numero_mes(mes), 2)
        numero_mes = lambda mes: numero[mes] if mes in numero else numero[mes[:4]]
        eco["pensiones"] = {
            "meses": claves, "numero": [numero[k] for k in claves], "nomina": [round(nomina[k] * 1000) for k in claves],
            "media": [round(media[k], 2) for k in claves],
            "años": años, "numero_anual": [numero[str(a)] for a in años], "nomina_anual": [round(nomina[str(a)] * 1000) for a in años],
            "media_anual": [round(media[str(a)], 2) for a in años],
            # Afiliados medios del mes ÷ pensiones en vigor a día 1 de ese mes; en los años, diciembre.
            "afiliados_por_pension_meses": [por_pension(k) for k in claves],
            "afiliados_por_pension_años": [None if bruta_m.get(f"{a}-12") is None else round(bruta_m[f"{a}-12"] / numero[str(a)], 2) for a in años],
        }
        peor = max(abs(numero[k] * media[k] - nomina[k] * 1000) / (nomina[k] * 1000) for k in claves)
        comprobaciones.append({"que": "¿Número de pensiones × pensión media da la nómina mensual?",
                               "resultado": "Sí, en todos los meses (diferencia por redondeo menor del 0,01 %)" if peor < 1e-4 else f"No del todo: diferencia máxima del {es(100 * peor, 3)} %",
                               "ok": peor < 1e-4})

    # 4. Precios (IPC), crecimiento (PIB real) y población (dependencia), del INE.
    ipc_g, ipc_s = dict(_ine(descargas, "IPC290750")), dict(_ine(descargas, "IPC292510"))
    if ipc_g:
        m_ = sorted(k for k in ipc_g if k >= "2002-01")
        eco["ipc"] = {"meses": m_, "general": [ipc_g[k] for k in m_], "subyacente": [ipc_s.get(k) for k in m_]}
    pib = _ine(descargas, "CNTR6654")
    if pib:
        eco["pib"] = {"trimestres": [p_ for p_, _ in pib], "interanual": [round(v, 2) for _, v in pib]}
    dep, may = dict(_ine(descargas, "IDB53241")), dict(_ine(descargas, "IDB53262"))
    pdep, pmay = dict(_ine(descargas, "PROP7465")), dict(_ine(descargas, "PROP7467"))
    if dep:
        a_ = sorted(dep)
        b_ = sorted(pdep)
        eco["dependencia"] = {"años": [int(x) for x in a_], "total": [dep[x] for x in a_], "mayores": [may.get(x) for x in a_],
                              "proyeccion": {"años": [int(x) for x in b_], "total": [pdep[x] for x in b_], "mayores": [pmay.get(x) for x in b_]}}

    # 5. Coste de financiarse: bono a 10 años (BCE) y tipo medio de la deuda viva del Estado (Tesoro).
    if "bce_bono_10" in descargas:
        filas = list(csv.DictReader((AQUI / descargas["bce_bono_10"]["fichero"]).read_text().splitlines()))
        es_ = {f["TIME_PERIOD"]: float(f["OBS_VALUE"]) for f in filas if f.get("KEY", "").startswith("IRS.M.ES") and f["OBS_VALUE"]}
        de_ = {f["TIME_PERIOD"]: float(f["OBS_VALUE"]) for f in filas if f.get("KEY", "").startswith("IRS.M.DE") and f["OBS_VALUE"]}
        m_ = sorted(set(es_) & set(de_))
        eco["bono"] = {"meses": m_, "espana": [es_[k] for k in m_], "alemania": [de_[k] for k in m_],
                       "prima_pb": [round(100 * (es_[k] - de_[k])) for k in m_]}
    tipo = {}
    for clave in ("tesoro_tipo_medio_historico", "tesoro_tipo_medio"):
        if clave not in descargas:
            continue
        hoja = list(hojas(AQUI / descargas[clave]["fichero"]).values())[0]
        año = None
        for f in hoja:
            v = [x for x in f if x not in (None, "")]
            if not v:
                continue
            if isinstance(v[0], (float, str)) and str(v[0]).replace(".0", "").isdigit() and 1990 < float(v[0]) < 2100:
                año = int(float(v[0]))
                if len(v) >= 8 and clave == "tesoro_tipo_medio":
                    tipo.setdefault(f"{año}", (v[1], v[7]))
                continue
            if isinstance(v[0], str) and v[0].strip() in MESES_LARGOS and año and len(v) >= 9:
                tipo[f"{año}-{MESES_LARGOS[v[0].strip()]:02d}"] = (v[1], v[7])
    if tipo:
        m_ = sorted(k for k in tipo if "-" in k)
        eco["tesoro"] = {"meses": m_, "total": [tipo[k][1] for k in m_], "letras": [tipo[k][0] for k in m_]}
    if "tesoro_vida_media" in descargas:
        hoja = list(hojas(AQUI / descargas["tesoro_vida_media"]["fichero"]).values())[0]
        año, ultimo_vm = None, None
        for f in hoja:
            v = [x for x in f if x not in (None, "")]
            if v and str(v[0]).strip().isdigit():
                año = int(str(v[0]).strip())
            elif v and isinstance(v[0], str) and v[0].strip() in MESES_LARGOS and año and len(v) == 10:
                ultimo_vm = {"mes": f"{año}-{MESES_LARGOS[v[0].strip()]:02d}", "años": v[9]}
        if ultimo_vm:
            eco.setdefault("tesoro", {})["vida_media"] = ultimo_vm

    # 6. Cruce: afiliados medios del año y cotizaciones sociales (las de la página de ingresos).
    if "afiliacion" in eco:
        k_ = next((p_ for p_ in ingresos["partes"] if p_["clave"] == "cotizaciones"), None)
        if k_:
            años_c = [a for a in eco["afiliacion"]["anual"]["años"] if a in ingresos["años"]]
            eco["cruce_cotizaciones"] = {"años": años_c,
                                         "afiliados": [eco["afiliacion"]["anual"]["afiliados"][eco["afiliacion"]["anual"]["años"].index(a)] for a in años_c],
                                         "cotizaciones_constantes": [k_["constantes"][ingresos["años"].index(a)] for a in años_c],
                                         "base_constantes": ingresos.get("año_base_constantes")}
    eco["comprobaciones"] = comprobaciones
    return eco


# ---- Comunidades autónomas (desde el 20/10/2026) ----
# Orden alfabético a propósito: la web no ordena comunidades de mejor a peor.
CCAA = [  # sufijo del Banco de España, nombre, código ECP del INE, régimen
    ("AAN", "Andalucía", "ECP115502", "común"), ("AAR", "Aragón", "ECP115501", "común"),
    ("ACA", "Canarias", "ECP115498", "común"), ("ACB", "Cantabria", "ECP115497", "común"),
    ("ACL", "Castilla-La Mancha", "ECP115495", "común"), ("ACO", "Castilla y León", "ECP115496", "común"),
    ("ACT", "Cataluña", "ECP115494", "común"), ("AMA", "Comunidad de Madrid", "ECP115490", "común"),
    ("ANA", "Comunidad Foral de Navarra", "ECP115488", "foral"), ("AVA", "Comunitat Valenciana", "ECP115493", "común"),
    ("AEX", "Extremadura", "ECP115492", "común"), ("AGA", "Galicia", "ECP115491", "común"),
    ("ABA", "Illes Balears", "ECP115499", "común"), ("ALR", "La Rioja", "ECP115486", "común"),
    ("APV", "País Vasco", "ECP115487", "foral"), ("AAS", "Principado de Asturias", "ECP115500", "común"),
    ("AMU", "Región de Murcia", "ECP115489", "común"),
]


def ccaa_de(nombre):
    """Sufijo de la comunidad a partir de cómo la escribe cada fuente."""
    n = (nombre or "").strip().lower()
    for clave, suf in (("andaluc", "AAN"), ("arag", "AAR"), ("asturias", "AAS"), ("balear", "ABA"), ("canarias", "ACA"),
                       ("cantabria", "ACB"), ("castilla y le", "ACO"), ("mancha", "ACL"), ("catalu", "ACT"), ("valencia", "AVA"),
                       ("extremadura", "AEX"), ("galicia", "AGA"), ("madrid", "AMA"), ("murcia", "AMU"), ("navarra", "ANA"),
                       ("vasco", "APV"), ("rioja", "ALR")):
        if clave in n:
            return suf
    return None


def _bde_csv(descargas, clave):
    """CSV del Boletín Estadístico del Banco de España → {código de serie: {«AAAATn»: valor}}."""
    texto = (AQUI / descargas[clave]["fichero"]).read_bytes().decode("latin-1")
    filas = list(csv.reader(texto.splitlines()))
    codigos = filas[0][1:]
    salida = {c: {} for c in codigos}
    trimestre = {"MAR": 1, "JUN": 2, "SEP": 3, "DIC": 4}
    for f in filas:
        m = re.match(r"([A-Z]{3}) (\d{4})$", f[0] if f else "")
        if not m or m.group(1) not in trimestre:
            continue
        for c, v in zip(codigos, f[1:]):
            if v not in ("", "_"):
                salida[c][f"{m.group(2)}T{trimestre[m.group(1)]}"] = float(v)
    return salida


def construir_territorio(descargas):
    comprobaciones = []
    datos = {s_: {"id": s_, "nombre": n, "regimen": r} for s_, n, _, r in CCAA}

    # 1. Déficit (B.9) de cada comunidad, en millones y en % de su PIB regional (IGAE, un fichero por año).
    años, total_igae, total_igae_pib, peor = [], {}, {}, 0.0
    for a in range(2000, 2100):
        k = f"igae_ccaa_{a}"
        if k not in descargas:
            continue
        libro = hojas(AQUI / descargas[k]["fichero"])
        for hoja, unidad in (("Tabla1a", "meur"), ("Tabla1b", "pib")):
            filas = libro[hoja]
            cab = next(f for f in filas if len(f) > 1 and f[1] == "CONCEPTOS")
            fila = next(f for f in filas if f and isinstance(f[0], str) and f[0].strip() == "B.9")
            suma = 0.0
            for j, nombre in enumerate(cab):
                suf = ccaa_de(nombre) if isinstance(nombre, str) else None
                if suf and j < len(fila) and isinstance(fila[j], float):
                    datos[suf].setdefault("deficit", {"años": [], "meur": [], "pib": []})
                    if unidad == "meur":
                        datos[suf]["deficit"]["años"].append(a)
                        suma += fila[j]
                    datos[suf]["deficit"][unidad].append(round(fila[j], 2 if unidad == "pib" else 0))
                elif isinstance(nombre, str) and nombre.startswith("Total"):
                    if unidad == "meur":
                        total_igae[a] = fila[j]
                    else:
                        total_igae_pib[a] = round(fila[j], 2)
            if unidad == "meur":
                peor = max(peor, abs(suma - total_igae.get(a, suma)))
        años.append(a)
        provisional = "(P)" in str(libro["Tabla1a"][2][0])
    comprobaciones.append({"que": "¿El déficit de las 17 comunidades suma el del conjunto de la administración regional?",
                           "resultado": f"Sí, al millón de euros, en los {len(años)} años ({años[0]}–{años[-1]})" if peor < 1.5
                           else f"No: diferencia máxima de {es(peor)} millones", "ok": peor < 1.5})

    # 2. Deuda PDE (Banco de España): miles de euros, % del PIB regional y préstamos del Estado (mecanismos).
    eur, pib, est = _bde_csv(descargas, "bde_be1309"), _bde_csv(descargas, "bde_be1310"), _bde_csv(descargas, "bde_be1306")
    for s_, *_ in CCAA:
        e_ = eur.get(f"DTNPDE2010_P00000_PS_ACS_{s_}", {})
        t_ = sorted(e_)
        datos[s_]["deuda"] = {"trimestres": t_, "meur": [round(e_[x] / 1000) for x in t_],
                              "pib": [pib.get(f"DTNPDE2010_P0000P_PS_ACS_{s_}", {}).get(x) for x in t_],
                              "estado_meur": [None if x not in est.get(f"DTNPDE2010_F42116_PS_ACS_{s_}", {}) else
                                              round(est[f"DTNPDE2010_F42116_PS_ACS_{s_}"][x] / 1000) for x in t_]}
    tot = eur["DTNPDE2010_P00000_PS_ACS"]
    ult = max(tot)
    suma = sum(eur[f"DTNPDE2010_P00000_PS_ACS_{s_}"][ult] for s_, *_ in CCAA)
    comprobaciones.append({"que": "¿La deuda de las 17 comunidades suma la del conjunto?",
                           "resultado": "Sí" if abs(suma - tot[ult]) < 1000 else
                           f"No del todo: {es(suma / 1000)} frente a {es(tot[ult] / 1000)} millones (el conjunto incluye unidades no asignadas a una comunidad)",
                           "ok": abs(suma - tot[ult]) < 1000})
    total = {"deuda": {"trimestres": sorted(tot), "meur": [round(tot[x] / 1000) for x in sorted(tot)],
                       "pib": [pib.get("DTNPDE2010_P0000P_PS_ACS", {}).get(x) for x in sorted(tot)],
                       "estado_meur": [None if x not in est.get("DTNPDE2010_F42116_PS_ACS", {}) else round(est["DTNPDE2010_F42116_PS_ACS"][x] / 1000) for x in sorted(tot)]},
             "deficit": {"años": años, "meur": [round(total_igae[a]) for a in años], "pib": [total_igae_pib.get(a) for a in años]}}

    # 3. Población (Estadística Continua de Población, último dato) para las cifras por habitante.
    for s_, _, ecp, _ in CCAA:
        serie_ = _ine(descargas, ecp)
        if serie_:
            k = f"ine_{ecp.lower()}"
            d_ = json.loads((AQUI / descargas[k]["fichero"]).read_text())["Data"]
            u = max(d_, key=lambda x: x["Fecha"])
            datos[s_]["poblacion"] = {"fecha": dt.datetime.fromtimestamp(u["Fecha"] / 1000 + 43200, dt.timezone.utc).date().isoformat(), "valor": u["Valor"]}

    # 4. Financiación homogénea por habitante ajustado (régimen común), de cada liquidación.
    liq_años = sorted(int(k[-4:]) for k in descargas if k.startswith("hacienda_liquidacion_"))
    for a in liq_años:
        libro = hojas(AQUI / descargas[f"hacienda_liquidacion_{a}"]["fichero"])
        hoja = next((h for h in libro if h.startswith("2.2.3")), None)
        if not hoja:
            continue
        for f in libro[hoja]:
            v = [x for x in f if x not in (None, "")]
            if len(v) >= 6 and isinstance(v[0], str) and isinstance(v[5], float):
                suf = ccaa_de(v[0])
                clave_ = suf if suf else ("media" if v[0].strip().startswith("Total") else None)
                if clave_ == "media":
                    total.setdefault("financiacion", {"años": [], "por_hab_ajustado": []})
                    total["financiacion"]["años"].append(a)
                    total["financiacion"]["por_hab_ajustado"].append(round(v[5], 2))
                elif clave_:
                    datos[suf].setdefault("financiacion", {"años": [], "por_hab_ajustado": []})
                    datos[suf]["financiacion"]["años"].append(a)
                    datos[suf]["financiacion"]["por_hab_ajustado"].append(round(v[5], 2))

    # 5. Gasto por funciones (COFOG) de cada comunidad, último año publicado.
    cof = sorted(int(k[-4:]) for k in descargas if k.startswith("igae_cofog_ccaa_"))
    if cof:
        a = cof[-1]
        libro = hojas(AQUI / descargas[f"igae_cofog_ccaa_{a}"]["fichero"])
        for nombre_h, filas in libro.items():
            if not nombre_h.startswith("Tabla") or nombre_h == "Tabla1a" or not filas:
                continue
            suf = ccaa_de(str(filas[0][0]))
            cab = next((f for f in filas if any(isinstance(x, str) and "Defensa" in x for x in f)), None)
            fila = next((f for f in filas if f and any(isinstance(x, str) and x.strip() == "GASTO TOTAL" for x in f[:2])), None)
            if not (suf and cab and fila):
                continue
            divisiones = []
            for j, x in enumerate(cab):
                if isinstance(x, str) and re.match(r"\d{2}\.", x.strip()):
                    nombre_ = re.sub(r"^\s*\d+\.\s*", "", x.strip())
                    nombre_ = {"Salud": "Sanidad"}.get(nombre_, nombre_)
                    divisiones.append({"nombre": nombre_, "meur": fila[j]})
                elif isinstance(x, str) and "TOTAL" in x:
                    total_g = fila[j]
            datos[suf]["gasto"] = {"año": a, "provisional": True, "divisiones": divisiones, "total": total_g}
        fecha_cofog = next((str(f[0]) for f in libro.get("Tabla2a", []) if f and "actualización" in str(f[0])), "")
    comprobaciones.append({"que": "¿Las divisiones del gasto por funciones suman el gasto total de cada comunidad?",
                           "resultado": "Sí, en las 17" if all(abs(sum(d_["meur"] for d_ in c["gasto"]["divisiones"]) - c["gasto"]["total"]) < 1.5
                                                               for c in datos.values() if "gasto" in c) else "No en todas",
                           "ok": all(abs(sum(d_["meur"] for d_ in c["gasto"]["divisiones"]) - c["gasto"]["total"]) < 1.5 for c in datos.values() if "gasto" in c)})
    return {"ccaa": [datos[s_] for s_, *_ in CCAA], "total": total, "comprobaciones": comprobaciones}


# ---- Desigualdad (desde el 20/10/2026). En EU-SILC/ECV, el año es el de la encuesta; la renta, la del año anterior. ----
def construir_desigualdad(descargas):
    comprobaciones, out = [], {}

    def eu(tabla, **filtro):
        if tabla not in descargas:
            return {}, {}
        c, d = leer_jsonstat(AQUI / descargas[tabla]["fichero"])
        return ({a: v for a, (v, _) in serie(c, d, geo="ES", **filtro).items() if v is not None},
                {a: v for a, (v, _) in serie(c, d, geo="EU27_2020", **filtro).items() if v is not None} if "EU27_2020" in d["dimension"]["geo"]["category"]["index"] else {})

    def bloque(es_, ue_, desde=2008):
        a_ = sorted(a for a in es_ if a >= desde)
        return {"años": a_, "es": [es_[a] for a in a_], "ue": [ue_.get(a) for a in a_]}

    # Gini: Eurostat desde 2014 (la tabla se reestructuró en 2026) y el INE para 2008-2013 (las mismas cifras).
    g_es, g_ue = eu("ilc_di12", age="TOTAL")
    ine = dict((int(p_), v) for p_, v in _ine(descargas, "ECV7186")) if "ine_ecv7186" in descargas else {}
    comunes = sorted(set(ine) & set(g_es))
    peor = max((abs(ine[a] - g_es[a]) for a in comunes), default=0)
    comprobaciones.append({"que": "¿El índice de Gini del INE y el de Eurostat son el mismo?",
                           "resultado": f"Sí, en los {len(comunes)} años comunes; por eso usamos el del INE para 2008-{min(g_es) - 1}" if peor < 0.051
                           else f"No: diferencia máxima de {es(peor, 1)} puntos", "ok": peor < 0.051})
    for a, v in ine.items():
        g_es.setdefault(a, v)
    out["gini"] = bloque(g_es, g_ue)
    for clave, tabla in (("gini_sin_transferencias", "ilc_di12b"), ("gini_solo_pensiones", "ilc_di12c")):
        out[clave] = bloque(*eu(tabla))
    for clave, tabla in (("pobreza", "ilc_li02"), ("pobreza_sin_transferencias", "ilc_li09"), ("pobreza_solo_pensiones", "ilc_li10")):
        out[clave] = bloque(*eu(tabla, statinfo="MED_EI", rskpovth="B_60", unit="PC", sex="T", age="TOTAL"))
    out["s80s20"] = bloque(*eu("ilc_di11", sex="T", age="TOTAL", unit="RAT"))
    out["arope"] = bloque(*eu("ilc_peps01n", sex="T", age="TOTAL", unit="PC"), desde=2015)
    out["carencia"] = bloque(*eu("ilc_mdsd11", sex="T", age="TOTAL", unit="PC"), desde=2015)
    u_es, _ = eu("ilc_li01", statinfo="MED_EI", rskpovth="B_60", unit="EUR", hhcomp="A1")
    out["umbral"] = bloque(u_es, {})
    # Comprobación: la reducción de la pobreza por las transferencias (sin pensiones) se puede rehacer con dos tablas.
    if out["pobreza"]["años"] and out["pobreza_solo_pensiones"]["años"]:
        a = out["pobreza"]["años"][-1]
        antes = out["pobreza_solo_pensiones"]["es"][out["pobreza_solo_pensiones"]["años"].index(a)]
        despues = out["pobreza"]["es"][-1]
        out["reduccion_pobreza"] = {"año": a, "pct": round(100 * (antes - despues) / antes, 1)}

    # OCDE: Gini de la renta de mercado, bruta (con transferencias) y disponible (después de impuestos). Año de renta.
    if "ocde_idd" in descargas:
        filas = list(csv.DictReader((AQUI / descargas["ocde_idd"]["fichero"]).read_text().splitlines()))
        m_ = {}
        for f in filas:
            if f["OBS_VALUE"]:
                m_.setdefault(f["MEASURE"], {})[int(f["TIME_PERIOD"])] = round(float(f["OBS_VALUE"]), 3)
        a_ = sorted(set(m_.get("INC_MRKT_GINI", {})) & set(m_.get("INC_DISP_GINI", {})) & set(m_.get("INC_GROSS_GINI", {})))
        out["ocde"] = {"años_renta": a_, "mercado": [m_["INC_MRKT_GINI"][a] for a in a_], "bruta": [m_["INC_GROSS_GINI"][a] for a in a_],
                       "disponible": [m_["INC_DISP_GINI"][a] for a in a_]}

    # Riqueza: cuentas distributivas (BCE y Banco de España), trimestrales, experimentales.
    riq = {}
    for k in ("gini", "top10", "bottom50"):
        if f"bce_dwa_{k}" in descargas:
            filas = list(csv.DictReader((AQUI / descargas[f"bce_dwa_{k}"]["fichero"]).read_text().splitlines()))
            riq[k] = {f["TIME_PERIOD"].replace("-Q", "T"): round(float(f["OBS_VALUE"]), 2) for f in filas if f.get("OBS_VALUE")}
    if riq.get("gini"):
        t_ = sorted(riq["gini"])
        out["riqueza"] = {"trimestres": t_, **{k: [v.get(x) for x in t_] for k, v in riq.items()}}
        u = t_[-1]
        if riq.get("top10") and riq.get("bottom50"):
            comprobaciones.append({"que": "¿Las partes de la riqueza son coherentes (el 10 % más rico más el 50 % menos rico no pasan de 100)?",
                                   "resultado": "Sí" if riq["top10"][u] + riq["bottom50"][u] < 100 else "No", "ok": riq["top10"][u] + riq["bottom50"][u] < 100})
    out["comprobaciones"] = comprobaciones
    return out


# ---- Hechos de la XV Legislatura (desde el 20/10/2026): normas, su paso por el Congreso y sus votaciones clave ----
GRUPOS = {"GP": "PP", "GS": "PSOE", "GVOX": "Vox", "GSUMAR": "Sumar", "GR": "ERC", "GJxCAT": "Junts", "GEH Bildu": "EH Bildu",
          "GV (EAJ-PNV)": "PNV", "GMx": "Grupo Mixto"}


def paso_de_votacion(info):
    """Qué paso de la tramitación es una votación (solo las decisivas; las enmiendas sueltas se dejan fuera)."""
    t, sub = info.get("titulo") or "", (info.get("textoSubGrupo") or "") + " " + (info.get("tituloSubGrupo") or "")
    if t.startswith("Convalidación o derogación"):
        return "Tramitación como proyecto de ley" if "proyecto de ley" in sub.lower() else "Convalidación"
    if t.startswith("Toma en consideración"):
        return "Toma en consideración"
    if t.startswith("Debates de totalidad"):
        # En el mismo debate se vota también si el Pleno avoca la votación final: eso no decide sobre el texto.
        return None if "avocación" in sub.lower() else "Enmienda a la totalidad"
    if "lectura única" in t:
        return "Votación en lectura única" if not t.startswith("Acuerdo") else None
    if t.startswith("Veto del Senado"):
        return "Votación sobre el veto del Senado"
    if t.startswith("Dictámenes"):
        if "conjunto" in sub.lower():
            return "Votación de conjunto"
        if "dictamen" in sub.lower() and "enmienda" not in sub.lower():
            return "Votación del dictamen"
    return None


CONGRESO_INI = ("https://www.congreso.es/es/busqueda-de-iniciativas?p_p_id=iniciativas&p_p_lifecycle=0&p_p_state=normal"
                "&p_p_mode=view&_iniciativas_mode=mostrarDetalle&_iniciativas_legislatura=XV&_iniciativas_id=")
PASO_CM = {"ANTEPROYECTO": "Anteproyecto de ley aprobado por el Consejo de Ministros", "PROYECTO": "Proyecto de ley aprobado por el Consejo de Ministros",
           "REAL DECRETO-LEY": "Aprobado por el Consejo de Ministros"}


def _palabras_titulo(texto):
    """Palabras de un título de ley para compararlo con otro (sin el tipo de norma ni palabras vacías)."""
    t = unicodedata.normalize("NFKD", texto.lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    t = re.sub(r"^.*?\b(anteproyecto de ley|proyecto de ley|real decreto-ley(?: \d+/\d{4})?)( organica)?", "", t, count=1)
    # La coletilla de la primera vuelta la llevan todos los anteproyectos: no dice nada del contenido.
    t = re.sub(r",? a los efectos previstos en el articulo 26\.4.*$", "", t)
    return {w for w in re.findall(r"[a-z0-9/]{4,}", t)} - {"para", "sobre", "como", "entre", "desde", "establece", "aprueba",
                                                         "modifica", "regula", "medidas", "octubre", "noviembre", "diciembre"}


def _parecido(a, b):
    if not a or not b:
        return 0.0
    return len(a & b) / min(len(a), len(b)) * min(1.0, 2 * len(a & b) / (len(a) + len(b)) + 0.3)


def _fecha(t):
    if not t:
        return None
    t = t.strip()[:10]
    if "/" in t:
        d, m, a = t.split("/")
        return dt.date(int(a), int(m), int(d))
    return dt.date.fromisoformat(t)


def _apartado_ampliacion(ampliacion, titulo):
    """El apartado de la ampliación de una referencia que explica un anteproyecto: el que comparte más palabras con su
    título y habla de un (ante)proyecto. Vacío si ninguno se parece lo bastante."""
    lineas = ampliacion.split("\n")
    es_titulo = lambda x: len(x) > 15 and sum(c.isupper() for c in x) > 0.8 * sum(c.isalpha() for c in x)
    apartados, actual = [], []
    for x in lineas:
        if es_titulo(x) and actual:
            apartados.append("\n".join(actual))
            actual = []
        actual.append(x)
    if actual:
        apartados.append("\n".join(actual))
    w = _palabras_titulo(titulo)
    mejor, puntos = "", (0.0, 0.0)
    for a in apartados:
        if "proyecto" not in a.lower():
            continue
        # Solo el título del apartado y su primera frase, que es donde la referencia nombra el anteproyecto.
        p = len(w & _palabras_titulo("proyecto de ley " + a[:600])) / max(1, len(w))
        # A igualdad, gana el apartado cuyo título nombra el anteproyecto (un título corto puede salir de pasada en otro).
        p_titulo = len(w & _palabras_titulo("proyecto de ley " + a.split("\n", 1)[0])) / max(1, len(w))
        if (p, p_titulo) > puntos:
            mejor, puntos = a, (p, p_titulo)
    return re.sub(r"\s*\n\s*", " ", mejor)[:4000] if puntos[0] >= 0.6 else ""


def _palabras_pan(texto):
    """Palabras de un título para enlazar el Plan Anual Normativo (sin el rango, el número ni las fórmulas de siempre)."""
    t = unicodedata.normalize("NFKD", texto.lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    t = re.sub(r"^.*?\b(ley organica|ley|real decreto legislativo|real decreto-ley|real decreto)( \d+/\d{4})?(, de \d+ de [a-z]+)?",
               "", t, count=1)
    t = re.sub(r",? a los efectos previstos en el articulo 26\.4.*$", "", t)
    return {w for w in re.findall(r"[a-z0-9/]{4,}", t)} - {
        "para", "sobre", "como", "entre", "desde", "establece", "aprueba", "modifica", "modifican", "regula", "regulan",
        "medidas", "real", "decreto", "texto", "refundido", "aprobado", "determinadas", "enero", "febrero", "marzo", "abril",
        "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre", "proyecto", "anteproyecto"}


def enlazar_pan(planes, cat, iniciativas, sueltos):
    """Enlaza cada iniciativa del Plan Anual Normativo con lo que salió de ella, sin IA: la norma del BOE publicada desde
    el 1 de enero del año del plan (mismo rango, o decreto-ley para una ley), o si no la hay, el expediente del Congreso
    o el anteproyecto del Consejo de Ministros (desde el año anterior). Hace falta que casi todas las palabras del título más corto estén en el otro (≥ 0,85) y que
    los dos títulos se parezcan en conjunto (Jaccard ≥ 0,4): un título corto encaja en casi cualquiera."""
    # Una ley planificada a veces sale como real decreto-ley (p. ej., el subsidio por desempleo, RDL 2/2024).
    rangos = {"LEY ORGÁNICA": ("LO",), "LEY": ("L", "RDL"), "REAL DECRETO": ("RD",), "REAL DECRETO LEGISLATIVO": ("RDLeg",),
              "REAL DECRETO-LEY": ("RDL",)}
    destinos = ([("norma", n["clave"], n["rango"], n["publicada"], _palabras_pan(n["titulo"])) for n in cat["normas"]]
                + [("iniciativa", i["clave"], "INI", iso_es(i["presentada"]), _palabras_pan(i["titulo"]))
                   for i in iniciativas if i["clave"].startswith("121/")]
                + [("consejo", c["clave"], "CM", c["fecha"], _palabras_pan(c["texto"])) for c in sueltos])
    por_hecho, sueltos_pan = {}, []
    for e in planes:
        w = _palabras_pan(e["titulo"])
        mejor = None
        for tipo, clave, rango, fecha, w2 in destinos:
            # La norma, desde el año del plan; el anteproyecto o el expediente pueden ser del año anterior (el plan
            # recoge lo que se quiere aprobar ese año, aunque su tramitación empezara antes).
            desde = f"{e['plan']}-01-01" if tipo == "norma" else f"{e['plan'] - 1}-01-01"
            if not w or not w2 or not fecha or fecha < desde:
                continue
            if tipo == "norma" and rango not in rangos[e["rango"]]:
                continue
            if tipo != "norma" and e["rango"] not in ("LEY", "LEY ORGÁNICA"):
                continue
            comun = len(w & w2)
            contencion, jaccard = comun / min(len(w), len(w2)), comun / len(w | w2)
            if contencion >= 0.85 and jaccard >= 0.4 and (mejor is None or (jaccard, tipo == "norma") > mejor[0]):
                mejor = ((jaccard, tipo == "norma"), clave)
        paso = {"paso": f"Planificado en el Plan Anual Normativo {e['plan']}", "fecha": f"{e['plan']}-01-01",
                "texto": e["titulo"], "url": e["url"]}
        if mejor:
            por_hecho.setdefault(mejor[1], []).append(paso)
        else:
            sueltos_pan.append(paso | {"clave": f"PAN {e['plan']} {hashlib.sha1(e['titulo'].encode()).hexdigest()[:6]}",
                                       "rango": e["rango"], "ministerio": e["ministerio"], "objetivo": e["objetivo"]})
    return por_hecho, sueltos_pan


def iso_es(f):
    """d/m/aaaa → aaaa-mm-dd."""
    if not f:
        return None
    d, m, a = f.strip()[:10].split("/")
    return f"{a}-{int(m):02d}-{int(d):02d}"


def enlazar_consejo(cat, expedientes):
    """Enlaza las referencias del Consejo de Ministros con el Congreso y el BOE, sin IA: por parecido del título y por
    fechas. Anteproyecto (primera vuelta) → proyecto (segunda vuelta) → expediente 121/ del Congreso → ley; y real
    decreto-ley aprobado → real decreto-ley del BOE (publicado en los tres días siguientes)."""
    puntos = [p for p in cat.get("consejo", []) if p["fecha"] and p["tipo"] in
              ("ANTEPROYECTO DE LEY", "ANTEPROYECTO DE LEY ORGÁNICA", "PROYECTO DE LEY", "PROYECTO DE LEY ORGÁNICA", "REAL DECRETO-LEY")]
    for p in puntos:
        p["_w"] = _palabras_titulo(p["texto"])
        p["_f"] = _fecha(p["fecha"])
        p["_clase"] = "REAL DECRETO-LEY" if p["tipo"] == "REAL DECRETO-LEY" else p["tipo"].split()[0]
    paso = lambda p: {"paso": PASO_CM[p["_clase"]], "fecha": p["fecha"], "texto": p["texto"][:600], "url": p["url"]}
    proyectos121 = [i for i in cat["iniciativas"] if i["expediente"].startswith("121/")]
    for i in proyectos121:
        i["_w"] = _palabras_titulo(i["objeto"] or "")
        i["_f"] = _fecha(i["presentada"])
    exp_a_norma = {e["expediente"]: n for n, es in expedientes.items() for e in es}
    por_expediente, por_norma, usados = {}, {}, set()
    # (Ante)proyecto → expediente 121/. La referencia llama «anteproyecto» tanto a la primera vuelta («a los efectos del
    # artículo 26.4 de la Ley del Gobierno») como, a veces, al texto que se remite a las Cortes; se enlaza en tres pasos:
    # 1) expediente presentado en los 60 días siguientes; 2) si no, a través de un punto posterior del Consejo con el
    # mismo título que sí se enlazó; 3) si no, expediente de hasta 400 días después con un título casi idéntico.
    leyes = sorted((p for p in puntos if p["_clase"] != "REAL DECRETO-LEY"), key=lambda p: p["_f"])
    destino = {}

    def mejor(p, dias, umbral):
        cand = [(_parecido(p["_w"], i["_w"]), i) for i in proyectos121 if i["_f"] and 0 <= (i["_f"] - p["_f"]).days <= dias]
        cand = [c for c in cand if c[0] >= umbral]
        return max(cand, key=lambda c: c[0])[1]["expediente"] if cand else None

    # Un anteproyecto en primera vuelta no se remite a las Cortes: solo se enlaza a través de un punto posterior.
    primera = lambda p: "artículo 26.4" in p["texto"]
    for p in leyes:
        destino[id(p)] = None if primera(p) else mejor(p, 60, 0.75)
    for p in reversed(leyes):
        if not destino[id(p)]:
            cand = [(_parecido(p["_w"], q["_w"]), q) for q in leyes if q["_f"] > p["_f"] and destino[id(q)]]
            cand = [c for c in cand if c[0] >= 0.7]
            destino[id(p)] = (destino[id(max(cand, key=lambda c: c[0])[1])] if cand
                              else None if primera(p) else mejor(p, 400, 0.9))
    for p in leyes:
        if destino[id(p)]:
            por_expediente.setdefault(destino[id(p)], []).append(paso(p))
            usados.add(id(p))
    # Real decreto-ley aprobado → el del BOE.
    rdl = [n for n in cat["normas"] if n["rango"] == "RDL"]
    for p in (p for p in puntos if p["_clase"] == "REAL DECRETO-LEY"):
        # Uno de los dos títulos a veces abrevia el otro: con la ventana de fechas tan estrecha basta con que las palabras
        # del más corto estén en el más largo.
        cand = [(len(p["_w"] & w) / max(1, min(len(p["_w"]), len(w))), n) for n in rdl for w in [_palabras_titulo(n["titulo"])]
                if 0 <= (_fecha(n["publicada"]) - p["_f"]).days <= 3]
        cand = [c for c in cand if c[0] >= 0.75]
        if cand:
            n = max(cand, key=lambda c: c[0])[1]
            por_norma.setdefault(n["clave"], []).append(paso(p))
            usados.add(id(p))
    for exp, pasos in por_expediente.items():
        pasos.sort(key=lambda x: x["fecha"])
        if exp in exp_a_norma:
            por_norma.setdefault(exp_a_norma[exp], []).extend(pasos)
    # Anteproyectos y proyectos que no llegaron (o aún no) al Congreso: hechos por sí mismos.
    # La clave sale del texto (no del orden), para que no cambie al añadirse referencias nuevas.
    sueltos = [paso(p) | {"clave": f"CM {p['fecha']} {hashlib.sha1(p['texto'].encode()).hexdigest()[:6]}", "tipo": p["tipo"]} for p in puntos
               if id(p) not in usados and p["_clase"] != "REAL DECRETO-LEY"]
    # Lo que explica la referencia de cada uno (para relacionarlo con promesas; el sumario es solo el título).
    for c in sueltos:
        f = AQUI / "hechos" / "moncloa_ampliacion" / (re.sub(r"[^\w.-]", "_", c["url"].rsplit("/", 1)[-1]) + ".txt")
        c["_detalle"] = _apartado_ampliacion(f.read_text(), c["texto"]) if f.exists() else ""
    return {"por_expediente": por_expediente, "por_norma": por_norma, "sueltos": sueltos,
            "sin_enlace_rdl": sum(1 for p in puntos if p["_clase"] == "REAL DECRETO-LEY" and id(p) not in usados)}


def construir_hechos(relaciones_dirs=None):
    ruta = AQUI / "hechos" / "catalogo.json"
    if not ruta.exists():
        print("Hechos: no hay catálogo en esta copia; no se genera datos/hechos.json")
        return
    cat = json.loads(ruta.read_text())
    # Formación con la que se presentó cada diputado (para desglosar el Grupo Mixto).
    formacion = {}
    for f in ("diputados_activos.json", "diputados_baja.json"):
        r_ = AQUI / "hechos" / f
        if r_.exists():
            for d in json.loads(r_.read_text()):
                formacion[d["NOMBRE"]] = d.get("FORMACIONELECTORAL")
    votos_dir = AQUI / "hechos" / "votaciones"

    def resumen_votacion(url):
        m = re.search(r"Sesion(\d+)/(\d{8})/Votacion(\d+)", url)
        r_ = votos_dir / f"{m.group(2)}_{m.group(1)}_{m.group(3)}.json"
        if not r_.exists():
            return None
        d = json.loads(r_.read_text())["datos"]
        if not d:
            return None
        paso = paso_de_votacion(d["informacion"])
        if not paso:
            return None
        grupos = {}
        mixto = {}
        for v in d["votaciones"]:
            g = GRUPOS.get(v["grupo"], v["grupo"])
            grupos.setdefault(g, {"Sí": 0, "No": 0, "Abstención": 0, "No vota": 0})
            grupos[g][v["voto"]] = grupos[g].get(v["voto"], 0) + 1
            if v["grupo"] == "GMx":
                fo = formacion.get(v["diputado"], "?")
                mixto.setdefault(fo, {"Sí": 0, "No": 0, "Abstención": 0, "No vota": 0})
                mixto[fo][v["voto"]] = mixto[fo].get(v["voto"], 0) + 1
        t = d["totales"]
        f_ = d["informacion"]["fecha"]
        return {"paso": paso, "fecha": f_, "titulo": (d["informacion"].get("textoExpediente") or d["informacion"].get("titulo") or "").strip(),
                "asentimiento": t.get("asentimiento") == "Sí", "si": t.get("afavor"), "no": t.get("enContra"), "abstencion": t.get("abstenciones"),
                "grupos": grupos, "mixto_por_formacion": mixto, "url": url}

    expedientes = {}
    for i in cat["iniciativas"]:
        for n in i.get("ficha", {}).get("normas", []):
            expedientes.setdefault(n, []).append({"expediente": i["expediente"], "tipo": i["tipo"], "autor": i["autor"],
                                                  "presentada": i["presentada"], "url": i["ficha"]["url"], "votaciones": i["ficha"]["votaciones"]})
    for c in cat["convalidaciones"]:
        for n in c["normas"]:
            expedientes.setdefault(n, []).append({"expediente": c["expediente"], "tipo": "Convalidación de real decreto-ley", "autor": "Gobierno",
                                                  "presentada": None, "url": c["url"], "votaciones": c["votaciones"]})
    # Votaciones de las páginas de cada día: añaden las que la ficha no enlaza (las públicas por llamamiento no tienen
    # fichero con el voto de cada diputado; quedan sus totales y el enlace al Diario de Sesiones).
    por_exp = {}
    for dia, puntos in (cat.get("dias") or {}).items():
        for pt in puntos:
            for v in pt["votaciones"]:
                por_exp.setdefault(pt["expediente"], []).append((dia, pt["punto"], v))

    def paso_de_punto(punto):
        p_ = punto.lower()
        for clave_, paso in (("votación de conjunto", "Votación de conjunto"), ("veto del senado", "Votación sobre el veto del Senado"),
                             ("convalidación", "Convalidación"),
                             ("toma en consideración", "Toma en consideración"), ("totalidad", "Enmienda a la totalidad"),
                             ("lectura única", "Votación en lectura única")):
            if clave_ in p_:
                return paso
        return None

    def votaciones_de(expediente, de_ficha):
        urls = set(de_ficha) | {v["json"] for _, _, v in por_exp.get(expediente, []) if v["json"]}
        vs = [x for x in (resumen_votacion(u) for u in sorted(urls)) if x]
        for dia, punto, v in por_exp.get(expediente, []):
            # Primero lo que dice el propio bloque de la votación; si no, el título del punto del orden del día.
            paso = paso_de_punto(v.get("texto", "")) or paso_de_punto(punto)
            if v["json"] or not paso:
                continue
            vs.append({"paso": paso, "fecha": f"{int(dia[6:8])}/{int(dia[4:6])}/{dia[:4]}", "titulo": punto,
                       "asentimiento": v["asentimiento"], "si": v["si"], "no": v["no"], "abstencion": v["abstenciones"],
                       "grupos": {}, "mixto_por_formacion": {}, "url": v["pdf"],
                       "nota": "Votación sin fichero de voto por diputado en los datos abiertos del Congreso (por ejemplo, pública por llamamiento): el detalle está en el Diario de Sesiones."})
        vs.sort(key=lambda x: [int(c) for c in x["fecha"].split("/")[::-1]])
        return vs

    consejo = enlazar_consejo(cat, expedientes)
    normas = []
    for n in cat["normas"]:
        if n["rango"] not in ("LO", "L", "RDL", "RD"):
            continue
        tram = [{k: e[k] for k in ("expediente", "tipo", "autor", "presentada", "url")} | {"votaciones": votaciones_de(e["expediente"], e["votaciones"])}
                for e in expedientes.get(n["clave"], [])]
        normas.append({k: n[k] for k in ("clave", "rango", "numero", "año", "id", "titulo", "publicada", "url")}
                      | {"tramitacion": tram, "consejo": consejo["por_norma"].get(n["clave"], [])})
    # Iniciativas del Congreso que no acabaron en ley (rechazadas, retiradas, caducadas al disolverse las Cortes…).
    con_ley = {e["expediente"] for es in expedientes.values() for e in es}
    iniciativas = []
    for i in cat["iniciativas"]:
        if i["expediente"] in con_ley or (i.get("ficha") or {}).get("normas"):
            continue
        url = (i.get("ficha") or {}).get("url") or (f"{CONGRESO_INI}{i['expediente']}")
        iniciativas.append({"clave": i["expediente"], "tipo": i["tipo"], "titulo": re.sub(r"\s+", " ", i["objeto"] or "").strip(),
                            "autor": [a.strip() for a in (i["autor"] or "").split("\n") if a.strip()],
                            "presentada": i["presentada"], "resultado": re.sub(r"\s+", " ", i["resultado"] or "").strip() or None,
                            "situacion": i["situacion"], "url": url,
                            "votaciones": votaciones_de(i["expediente"], (i.get("ficha") or {}).get("votaciones", [])),
                            "consejo": consejo["por_expediente"].get(i["expediente"], [])})
    # Plan Anual Normativo: cada iniciativa del plan, enlazada con lo que salió de ella; las que no, hechos por sí mismas.
    planes = [e for f in sorted((AQUI / "pan").glob("pan_*.json")) for e in json.loads(f.read_text())]
    por_plan, plan_sueltos = enlazar_pan(planes, cat, iniciativas, consejo["sueltos"])
    for h_ in normas + iniciativas + consejo["sueltos"]:
        h_["plan"] = por_plan.get(h_["clave"], [])
    # Cada tanda de la relación hechos–promesas (normas; iniciativas y Consejo de Ministros) tiene su carpeta y su fiabilidad.
    relaciones, fiabilidad = [], {}
    for tanda, carpeta in (relaciones_dirs or {}).items():
        if (carpeta / "relaciones.json").exists():
            relaciones += [{k: r[k] for k in ("hecho", "promesa", "clase", "parcial", "motivo")}
                           for r in json.loads((carpeta / "relaciones.json").read_text())]
            fiabilidad[tanda] = json.loads((carpeta / "fiabilidad.json").read_text())
    # En la web solo hacen falta las iniciativas y los anteproyectos enlazados con alguna promesa (el resto pesa y no se ve).
    enlazados = {r["hecho"] for r in relaciones}
    # Las normas con rango de ley, todas; los reales decretos, solo los enlazados (son 950).
    salida = {"generado": cat["generado"], "normas": [n for n in normas if n["rango"] != "RD" or n["clave"] in enlazados],
              "iniciativas": [i for i in iniciativas if i["clave"] in enlazados],
              "consejo": [c_ for c_ in consejo["sueltos"] if c_["clave"] in enlazados],
              "plan": [p_ for p_ in plan_sueltos if p_["clave"] in enlazados],
              "relaciones": relaciones, "fiabilidad": fiabilidad,
              "fuentes": {"boe": "https://www.boe.es/datosabiertos/", "congreso": "https://www.congreso.es/es/datos-abiertos",
                          "consejo": "https://www.lamoncloa.gob.es/consejodeministros/referencias/Paginas/index.aspx",
                          "plan": "https://transparencia.gob.es/transparencia/es/Catalogo/normativa/plan-anual-normativo.html"}}
    # Para relacionarlos con promesas (no se publica en la web: lleva el comienzo del texto de cada hecho).
    textos = {i["expediente"]: i.get("texto", "") for i in cat["iniciativas"]}
    para_promesas = ([{"clave": n["clave"], "tipo": n["rango"], "titulo": n["titulo"], "fecha": n["publicada"], "referencia": n["id"],
                       "materias": n.get("materias", []), "inicio": n.get("inicio", "")} for n in cat["normas"] if n["rango"] in ("LO", "L", "RDL", "RD")]
                     + [{"clave": i["clave"], "tipo": "INI", "titulo": i["titulo"], "fecha": i["presentada"], "referencia": i["clave"],
                         "autor": i["autor"], "materias": [], "inicio": textos.get(i["clave"], "")} for i in iniciativas]
                     + [{"clave": c["clave"], "tipo": "CM", "titulo": c["texto"][:300], "fecha": c["fecha"], "referencia": c["url"],
                         "materias": [], "inicio": c["texto"] + "\n\n" + c.pop("_detalle", "")} for c in consejo["sueltos"]]
                     + [{"clave": p_["clave"], "tipo": "PAN", "titulo": p_["texto"], "fecha": p_["fecha"], "referencia": p_["url"],
                         "materias": [], "inicio": p_["texto"] + "\n\nObjetivo: " + p_["objetivo"]} for p_ in plan_sueltos])
    (AQUI / "hechos" / "para_promesas.json").write_text(json.dumps(para_promesas, ensure_ascii=False))
    (WEB / "datos" / "hechos.json").write_text(json.dumps(salida, ensure_ascii=False, separators=(",", ":")))
    sin_tram = [n["clave"] for n in normas if not n["tramitacion"] and n["rango"] != "RD"]
    leyes = [n for n in normas if n["rango"] != "RD"]
    print(f"Hechos: {len(leyes)} normas con rango de ley, {sum(bool(n['tramitacion']) for n in leyes)} con su tramitación en el Congreso"
          f" y {len(normas) - len(leyes)} reales decretos"
          f"{'; sin ella: ' + ', '.join(sin_tram) if sin_tram else ''}; {len(iniciativas)} iniciativas sin ley; Consejo de Ministros: "
          f"{sum(bool(n['consejo']) for n in normas)} normas con su aprobación, {len(consejo['sueltos'])} anteproyectos o proyectos sin"
          f" expediente en el Congreso, {consejo['sin_enlace_rdl']} decretos-leyes sin enlazar; Plan Anual Normativo: "
          f"{len(planes) - len(plan_sueltos)} iniciativas enlazadas y {len(plan_sueltos)} sin hecho; {len(relaciones)} relaciones con promesas")


def escribir_csv_paginas(gasto, ingresos):
    """Todos los números de las páginas de gasto e ingresos, con su tipo y su fórmula."""
    unidades = {"pib": "% del PIB", "corrientes": "millones de euros corrientes",
                "constantes": f"millones de euros de {gasto['año_base_constantes']}", "habitante": "euros por habitante"}
    with open(WEB / "datos" / "gasto.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["año", "pieza", "partida", "unidad", "valor", "tipo", "fórmula o código (Eurostat gov_10a_exp)"])
        for fn in gasto["funciones"]:
            for u, nombre_u in unidades.items():
                for i, a in enumerate(gasto["años"]):
                    w.writerow([a, "evolución", fn["nombre"], nombre_u, fn[u][i],
                                "dato" if u in ("pib", "corrientes") else "lectura", fn["codigo"]])
        for i, a in enumerate(gasto["años"]):
            for clave, valor in gasto["reparto"][i].items():
                nombre = "Intereses de la deuda" if clave == "intereses" else dict(FUNCIONES)[clave]
                formula = {"intereses": "GF0107 ÷ TOTAL × 100", "GF01": "PC_TOT de GF01 − intereses"}.get(clave, f"PC_TOT de {clave}")
                w.writerow([a, "de cada 100 €", nombre, "euros de cada 100", valor,
                            "lectura" if clave in ("intereses", "GF01") else "dato", formula])
            for codigo, por_nivel in gasto["quien"][i].items():
                for nivel, valor in por_nivel.items():
                    w.writerow([a, "quién paga", "Todo el gasto" if codigo == "TOTAL" else dict(FUNCIONES)[codigo],
                                f"% pagado por {dict(NIVELES)[nivel]}", valor, "lectura",
                                (f"({codigo} − GF0108) de {nivel} ÷ ({codigo} − GF0108) de S13 × 100" if codigo in ("GF01", "TOTAL")
                                 else f"{codigo} de {nivel} ÷ {codigo} de S13 × 100")])
        t = gasto["tipo"]
        for clave, nombre in (("corriente", "Gasto corriente"), ("inversion", "Inversión")):
            for u, nombre_u in unidades.items():
                for i, a in enumerate(t["años"]):
                    dato = u == "corrientes" or (u == "pib" and clave == "inversion")
                    w.writerow([a, "gasto por tipo", nombre, nombre_u, t[clave][u][i], "dato" if dato else "lectura",
                                "P51G (gov_10a_main)" if clave == "inversion" else "TE − P5 − NP − D9PAY (gov_10a_main)"])
        for p_ in t["partes"]:
            for i, a in enumerate(t["años"]):
                w.writerow([a, "gasto por tipo, de cada 100 €", p_["nombre"], "euros de cada 100", p_["de_cada_100"][i],
                            "lectura", f"({p_['formula']}) ÷ TE × 100 (gov_10a_main)"])
    with open(WEB / "datos" / "ingresos.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["año", "pieza", "partida", "unidad", "valor", "tipo", "fórmula o código (Eurostat gov_10a_taxag y gov_10a_main)"])
        for p in ingresos["partes"]:
            for u, nombre_u in unidades.items():
                for i, a in enumerate(ingresos["años"]):
                    igae = ingresos.get("provisional_igae", [False] * (i + 1))[i]
                    w.writerow([a, "evolución", p["nombre"], nombre_u, p[u][i],
                                "provisional (IGAE, sin segunda fuente)" if igae else
                                "dato" if u in ("pib", "corrientes") and " " not in p["codigos"].strip("−") else "lectura",
                                "IGAE A_AAPP_Imp y A_AAPP (misma partida)" if igae else p["codigos"]])
            for i, a in enumerate(ingresos["años"]):
                igae = ingresos.get("provisional_igae", [False] * (i + 1))[i]
                w.writerow([a, "de cada 100 €", p["nombre"], "euros de cada 100", ingresos["reparto"][i][p["clave"]],
                            "provisional (IGAE, sin segunda fuente)" if igae else "lectura",
                            "partida ÷ recursos no financieros × 100 (IGAE)" if igae else f"({p['codigos']}) ÷ TR × 100"])


# Qué presupuesto rigió cada año (comprobado en el BOE; ver la página «Cómo se miente con datos»).
VIGENCIA = {
    2017: ("mitad", "Prorrogado hasta la Ley 3/2017, de 27 de junio"),
    2018: ("mitad", "Prorrogado hasta la Ley 6/2018, de 3 de julio"),
    2019: ("prorrogado", "Prorrogados los de 2018 (Ley 6/2018)"),
    2020: ("prorrogado", "Prorrogados los de 2018 (Ley 6/2018)"),
    2024: ("prorrogado", "Prorrogados los de 2023 (Ley 31/2022)"),
    2025: ("prorrogado", "Prorrogados los de 2023 (Ley 31/2022)"),
    2026: ("prorrogado", "Prorrogados los de 2023 (Ley 31/2022)"),
}
# Hasta qué año está comprobado en el BOE. Un año posterior aparece como «por confirmar» y salta un aviso.
VIGENCIA_COMPROBADA_HASTA = 2026
SIN_CONFIRMAR = ("sin_confirmar", "Por confirmar en el BOE si hubo presupuesto propio o prorrogado")


def numeros(fila):
    """Los valores de una fila de la liquidación, en orden; «-» es cero."""
    salida = []
    for v in fila[1:]:
        if isinstance(v, float):
            salida.append(v)
        elif isinstance(v, str) and v.strip() == "-":
            salida.append(0.0)
    return salida


def por_politicas(filas, cuantos):
    """Filas de áreas y políticas de gasto de una hoja de la liquidación → {código: (nombre, área, valores)}."""
    import re as re_
    salida, area, total = {}, None, None
    for f in filas:
        if not f or not isinstance(f[0], str):
            continue
        etiqueta = f[0].replace("\t", " ")
        limpia = " ".join(etiqueta.split())
        if limpia.startswith("TOTALES"):
            total = numeros(f)[:cuantos]
            continue
        m = re_.match(r"(\s*)(\d)\.\s+(.*)", etiqueta)
        if not m:
            continue
        valores = numeros(f)
        if len(valores) < cuantos:
            continue
        if not m.group(1):
            area = m.group(2)
            salida[f"A{area}"] = (" ".join(m.group(3).split()).capitalize(), area, valores[:cuantos])
        else:
            salida[f"{area}{m.group(2)}"] = (" ".join(m.group(3).split()), area, valores[:cuantos])
    return salida, total


def construir_presupuesto(descargas):
    """Presupuesto del Estado frente a su ejecución, por áreas y políticas de gasto (liquidaciones de la IGAE)."""
    liquidados = sorted(int(k[-4:]) for k in descargas if k.startswith("liq_estado_"))
    # Avance: años sin liquidación con ejecución a 31 de diciembre (hoja GTOS 008 de la ejecución mensual)
    avances = sorted(int(k[-4:]) for k in descargas if k.startswith("ejec_dic_") and int(k[-4:]) not in liquidados)
    años = liquidados + avances
    capitulos_liq, filas_años, totales, comprobaciones = {}, [], [], []
    peor_suma, peor_cruce = 0.0, 0.0
    for a in años:
        if a in avances:
            libro = hojas(AQUI / descargas[f"ejec_dic_{a}"]["fichero"])
            g8, t8 = por_politicas(libro["GTOS 008"], 8)
            # Mismo formato que la liquidación: (iniciales, …, definitivos) y (definitivos, obligaciones, %, pagos)
            mods = {k: (n, ar, [v[0]] + [0.0] * 6 + [v[2]]) for k, (n, ar, v) in g8.items()}
            ejec = {k: (n, ar, [v[2], v[4], 0.0, v[5]]) for k, (n, ar, v) in g8.items()}
            total_mods = [t8[0]] + [0.0] * 6 + [t8[2]]
            total_ejec = [t8[2], t8[4], 0.0, t8[5]]
        else:
            libro = hojas(AQUI / descargas[f"liq_estado_{a}"]["fichero"])
            mods, total_mods = por_politicas(libro["LIQ 004"], 8)
            ejec, total_ejec = por_politicas(libro["LIQ 007"], 6)
        politicas = []
        for codigo, (nombre, area, v) in mods.items():
            e = ejec.get(codigo)
            ini, defin = v[0] / 1000, v[7] / 1000
            oblig, pagos = (e[2][1] / 1000, e[2][3] / 1000) if e else (None, None)
            if e:
                peor_cruce = max(peor_cruce, abs(e[2][0] / 1000 - defin))
            politicas.append({"codigo": codigo, "nombre": nombre, "area": area, "es_area": codigo.startswith("A"),
                              "iniciales": round(ini, 1), "definitivos": round(defin, 1),
                              "obligaciones": None if oblig is None else round(oblig, 1),
                              "pagos": None if pagos is None else round(pagos, 1)})
        # Las políticas suman su área y las áreas el total
        areas = [p for p in politicas if p["es_area"]]
        for ar in areas:
            suma = sum(p["iniciales"] for p in politicas if not p["es_area"] and p["area"] == ar["area"])
            peor_suma = max(peor_suma, abs(suma - ar["iniciales"]))
        peor_suma = max(peor_suma, abs(sum(ar["iniciales"] for ar in areas) - total_mods[0] / 1000))
        totales.append({"iniciales": round(total_mods[0] / 1000, 1), "definitivos": round(total_mods[7] / 1000, 1),
                        "obligaciones": round(total_ejec[1] / 1000, 1), "pagos": round(total_ejec[3] / 1000, 1)})
        filas_años.append(politicas)
        # Créditos iniciales por capítulo, identificado por su número (el nombre cambia entre años: en 2015 el 2 es
        # «gastos corrientes en bienes y servicios» y desde 2016 «gastos en bienes y servicios»).
        capitulos = {}
        for f in (libro["LIQ 005"] if a in liquidados else []):
            if f and isinstance(f[0], str) and numeros(f):
                m_ = re.match(r"\s*(\d)\.", f[0])
                if m_:
                    capitulos[m_.group(1)] = numeros(f)[0] / 1000
        capitulos_liq[a] = capitulos

    # Créditos iniciales por capítulos frente a la estadística de Hacienda (en millones; Hacienda redondea a 0,1)
    hacienda = {}
    for clave in ("sepg_estado_2023", "sepg_estado_2025p"):
        hoja = hojas(AQUI / descargas[clave]["fichero"])["21"]
        cab = next(f for f in hoja if f and f[0] == "Capítulos")
        for f in hoja:
            if f and isinstance(f[0], str):
                for i, col in enumerate(cab[1:], 1):
                    if col is not None and i < len(f) and isinstance(f[i], float):
                        hacienda[(str(col).strip().replace(".0", ""), f[0].strip())] = f[i]
    pares = {"1": "Gastos de personal", "2": "Gastos corrientes en bienes y servicios", "3": "Gastos financieros",
             "4": "Transferencias corrientes", "5": "Fondo de Contingencia", "6": "Inversiones reales",
             "7": "Transferencias de capital", "8": "Activos financieros", "9": "Pasivos financieros"}
    cuadran, difieren = [], []
    for a in años:
        tipo = VIGENCIA.get(a, ("propio",))[0]
        col = f"{a}-P" if tipo == "prorrogado" and (f"{a}-P", "TOTAL PRESUPUESTO") in hacienda else str(a)
        if (col, "TOTAL PRESUPUESTO") not in hacienda:
            continue
        if a in avances:
            # El avance no trae los capítulos: se compara el total aprobado
            difs = {"TOTAL PRESUPUESTO": totales[años.index(a)]["iniciales"] - hacienda[(col, "TOTAL PRESUPUESTO")]}
        else:
            difs = {h: capitulos_liq[a].get(l, 0.0) - hacienda.get((col, h), 0.0) for l, h in pares.items()}
        peor_cap = max(difs, key=lambda h: abs(difs[h]))
        (cuadran if abs(difs[peor_cap]) < 0.15 else difieren).append((a, abs(difs[peor_cap]), peor_cap))
    resultado = f"Cuadran en {len(cuadran)} años ({', '.join(str(a) + (' (avance: solo el total)' if a in avances else '') for a, _, _ in cuadran)})"
    if difieren:
        resultado += "; difieren en " + ", ".join(f"{a} ({es(p, 1)} millones en {cap.lower()})" for a, p, cap in difieren) + \
                     ", sin explicación localizada todavía"
    sin = [a for a in años if a not in [x for x, _, _ in cuadran + difieren]]
    if sin:
        resultado += f". Para {', '.join(map(str, sin))} Hacienda no publica la estadística en un formato que podamos leer"
    comprobaciones += [
        {"que": "¿Las políticas de gasto suman su área y las áreas el total?",
         "resultado": f"Sí, en los {len(años)} años" if peor_suma < 1 else f"No: diferencia máxima de {es(peor_suma)} millones",
         "ok": peor_suma < 1},
        {"que": "¿Los créditos definitivos son los mismos en las dos tablas de la liquidación?",
         "resultado": f"Sí, en todas las políticas de los {len(años)} años" if peor_cruce < 1 else f"No: diferencia máxima de {es(peor_cruce)} millones",
         "ok": peor_cruce < 1},
        {"que": "¿Lo aprobado coincide con la estadística de presupuestos del Ministerio de Hacienda, capítulo a capítulo?",
         "resultado": resultado, "ok": not difieren},
    ]
    # El avance de diciembre frente a la liquidación definitiva, en los años que tienen las dos
    dobles = [a for a in liquidados if f"ejec_dic_{a}" in descargas]
    for a in dobles:
        g8, _ = por_politicas(hojas(AQUI / descargas[f"ejec_dic_{a}"]["fichero"])["GTOS 008"], 8)
        liq = filas_años[años.index(a)]
        peor = max(abs(p["iniciales"] - g8[p["codigo"]][2][0] / 1000) + abs(p["definitivos"] - g8[p["codigo"]][2][2] / 1000)
                   + abs((p["obligaciones"] or 0) - g8[p["codigo"]][2][4] / 1000) for p in liq if p["codigo"] in g8)
        faltan = [p["codigo"] for p in liq if p["codigo"] not in g8]
        comprobaciones.append({
            "que": f"¿El avance a 31 de diciembre de {a} coincidió con la liquidación definitiva?",
            "resultado": (f"Sí: lo aprobado, lo autorizado y lo gastado de las {len(liq) - len(faltan)} áreas y políticas coinciden al "
                          f"millón de euros. Por eso mostramos {', '.join(map(str, avances))} como avance" if peor < 1 and not faltan
                          else f"No del todo: diferencia máxima de {es(peor)} millones"),
            "ok": peor < 1 and not faltan,
        })
    def vigencia_de(a):
        if a in VIGENCIA:
            return VIGENCIA[a]
        return ("propio", "Presupuesto propio desde el 1 de enero") if a <= VIGENCIA_COMPROBADA_HASTA else SIN_CONFIRMAR
    vigencia = [{"tipo": vigencia_de(a)[0], "texto": vigencia_de(a)[1]} for a in años]
    sin_confirmar = [a for a in años if vigencia_de(a)[0] == "sin_confirmar"]
    comprobaciones.append({
        "que": "¿Está comprobado en el BOE qué presupuesto rigió cada año?",
        "resultado": (f"Sí, en los {len(años)} años" if not sin_confirmar else
                      f"Falta comprobarlo para {', '.join(map(str, sin_confirmar))}: se muestra como «por confirmar»"),
        "ok": not sin_confirmar,
    })
    return {"años": años, "totales": totales, "politicas": filas_años, "vigencia": vigencia,
            "avance": [a in avances for a in años]}, comprobaciones


def comprobar_ine(descargas, pib_eurostat, poblacion_eurostat):
    """PIB y población de Eurostat frente al INE, que es quien los elabora."""
    import collections
    pib = json.loads((AQUI / descargas["ine_pib"]["fichero"]).read_text())
    trimestres = collections.defaultdict(list)
    for d in pib["Data"]:
        trimestres[d["Anyo"]].append(d["Valor"])
    anual = {a: sum(v) for a, v in trimestres.items() if len(v) == 4}
    comunes = sorted(a for a in anual if a in pib_eurostat)
    peor = max(abs(anual[a] - pib_eurostat[a][0]) for a in comunes)
    salida = [{
        "que": "¿El PIB que usamos coincide con el del INE?",
        "resultado": (f"Sí, al millón de euros en los {len(comunes)} años ({comunes[0]}–{comunes[-1]}), sumando los cuatro "
                      f"trimestres de la Contabilidad Nacional Trimestral" if peor < 1 else
                      f"No: diferencia máxima de {es(peor)} millones de euros"),
        "ok": peor < 1,
    }]
    pob = json.loads((AQUI / descargas["ine_poblacion"]["fichero"]).read_text())
    enero = {d["Anyo"]: d["Valor"] for d in pob["Data"] if d["FK_Periodo"] == 19}
    difs = {a: 100 * (poblacion_eurostat[a][0] * 1000 - (enero[a] + enero[a + 1]) / 2) / ((enero[a] + enero[a + 1]) / 2)
            for a in sorted(poblacion_eurostat) if a in enero and a + 1 in enero}
    peor_a = max(difs, key=lambda a: abs(difs[a]))
    años = sorted(difs)
    salida.append({
        "que": "¿La población que usamos para las cifras por habitante coincide con la del INE?",
        "resultado": (f"Casi: de {años[0]} a {años[-1]} la diferencia máxima es del {es(abs(difs[peor_a]), 2)} % (en {peor_a}). "
                      f"Eurostat usa la población media de todo el año de la contabilidad nacional y el INE la publica a "
                      f"1 de enero, así que comparamos con la media de dos 1 de enero seguidos"),
        "ok": abs(difs[peor_a]) < 0.5,
    })
    return salida


def comprobar_saldo_igae(descargas, saldo_eurostat):
    """Saldo (B.9) de la IGAE, hoja «TablaNa AAPP <año>» del Excel de cuentas anuales, frente al de Eurostat."""
    libro = hojas(AQUI / descargas["igae_cap_serie"]["fichero"])
    igae = {}
    for nombre, filas in libro.items():
        m = re.match(r"Tabla\d+a AAPP (\d{4})(_P)?$", nombre)
        if not m:
            continue
        for f in filas:
            if len(f) > 6 and isinstance(f[6], str) and f[6].strip() == "B.9" and isinstance(f[1], float):
                igae[int(m.group(1))] = f[1]
    comunes = sorted(a for a in igae if a in saldo_eurostat)
    peor = max(abs(igae[a] - saldo_eurostat[a][0]) for a in comunes)
    ok = peor < 1
    return {
        "que": "¿El saldo coincide con el que publica la IGAE, la Intervención General del Estado?",
        "resultado": (f"Sí, al millón de euros en los {len(comunes)} años que publica ({comunes[0]}–{comunes[-1]})" if ok else
                      f"No: diferencia máxima de {es(peor)} millones de euros"),
        "ok": ok,
    }


# Operaciones que forman los totales europeos de ingresos (TR) y gastos (TE), y dónde está cada una en la hoja de la
# IGAE: ("e", código) = columna de empleos, ("r", código) = columna de recursos; signo −1 si la IGAE la anota en negativo.
GASTOS = {
    "P2": [("e", "P.2", 1)], "P5": [("e", "P.51g", 1), ("e", "P.52", 1), ("e", "P.53", 1)], "NP": [("e", "NP", 1)],
    "D1PAY": [("e", "D.1", 1)], "D29PAY": [("e", "D.29", 1)], "D3PAY": [("r", "D.3", -1)], "D4PAY": [("e", "D.4", 1)],
    "D5PAY": [("e", "D.5", 1)], "D62PAY": [("e", "D.62", 1)], "D632PAY": [("e", "D.632", 1)], "D7PAY": [("e", "D.7", 1)],
    "D8": [("e", "D.8", 1)], "D9PAY": [("r", "D.9p", -1)],
}
INGRESOS = {
    "P11_P12": [("r", "P.11", 1), ("r", "P.12", 1)], "P131": None, "D2REC": [("r", "D.2", 1)],
    "D39REC": [("e", "D.39", -1)], "D4REC": [("r", "D.4", 1)], "D5REC": [("r", "D.5", 1)], "D61REC": [("r", "D.61", 1)],
    "D7REC": [("r", "D.7", 1)], "D9REC": [("r", "D.9r", 1)],
}


def leer_igae(descargas):
    """{año: (empleos, recursos)} del total de las AAPP, primera aparición de cada código en la hoja del año."""
    libro = hojas(AQUI / descargas["igae_cap_serie"]["fichero"])
    salida = {}
    for nombre, filas in libro.items():
        m = re.match(r"Tabla\d+a AAPP (\d{4})(_P)?$", nombre)
        if not m:
            continue
        empleos, recursos = {}, {}
        for f in filas:
            f = f + [None] * 13
            codigo = f[6].strip() if isinstance(f[6], str) else None
            if not codigo:
                continue
            if isinstance(f[1], float):
                empleos.setdefault(codigo, f[1])
            if isinstance(f[8], float):
                recursos.setdefault(codigo, f[8])
        salida[int(m.group(1))] = (empleos, recursos)
    return salida


def comprobar_totales_igae(descargas, tabla_main):
    """Los totales europeos de ingresos y gastos, operación a operación frente a la IGAE."""
    c, d = tabla_main
    eu = {}
    for co, (v, _) in c.items():
        x = dict(zip(d["id"], co))
        if x["geo"] == "ES" and x["sector"] == "S13" and x["unit"] == "MIO_NAC":
            eu[(x["na_item"], int(x["time"]))] = v or 0.0
    igae = leer_igae(descargas)
    años = sorted(igae)

    def valor_igae(partes, a):
        empleos, recursos = igae[a]
        return sum(s * ((empleos if lado == "e" else recursos).get(cod) or 0.0) for lado, cod, s in partes)

    def revisar(mapa, total):
        coinciden, faltan = [], []
        for item, partes in mapa.items():
            if partes is None:
                faltan.append(item)
            elif all(abs(eu.get((item, a), 0.0) - valor_igae(partes, a)) < 1 for a in años):
                coinciden.append(item)
        suma_ok = all(abs(eu[(total, a)] - sum(eu.get((k, a), 0.0) for k in mapa)) < 1 for a in años)
        return coinciden, faltan, suma_ok

    g_ok, g_faltan, g_suma = revisar(GASTOS, "TE")
    i_ok, i_faltan, i_suma = revisar(INGRESOS, "TR")
    ultimo = años[-1]
    peso_p131 = 100 * eu[("P131", ultimo)] / eu[("TR", ultimo)]
    gastos = {
        "que": "¿El total de gastos coincide con el de la IGAE?",
        "resultado": (f"Sí: el total es la suma de {len(GASTOS)} operaciones y las {len(g_ok)} coinciden al millón de euros con "
                      f"la IGAE en los {len(años)} años ({años[0]}–{ultimo})" if len(g_ok) == len(GASTOS) and g_suma else
                      f"No del todo: coinciden {len(g_ok)} de {len(GASTOS)} operaciones"),
        "ok": len(g_ok) == len(GASTOS) and g_suma,
    }
    ingresos = {
        "que": "¿El total de ingresos coincide con el de la IGAE?",
        "resultado": (f"Casi entero: el total es la suma de {len(INGRESOS)} operaciones; {len(i_ok)} coinciden al millón de euros "
                      f"con la IGAE en los {len(años)} años, y la que falta (pagos por la producción no de mercado, P.131: el "
                      f"{es(peso_p131, 1)} % de los ingresos en {ultimo}) la IGAE no la publica por separado, así que solo "
                      f"tenemos la cifra de Eurostat" if len(i_ok) == len(INGRESOS) - len(i_faltan) and i_suma else
                      f"No del todo: coinciden {len(i_ok)} de {len(INGRESOS)} operaciones"),
        "ok": len(i_ok) == len(INGRESOS) - len(i_faltan) and i_suma,
        "nota": "La IGAE publica la secuencia completa de cuentas, no los totales con la definición europea; por eso se comparan las operaciones que los forman.",
    }
    return [gastos, ingresos]


def comprobar_deuda_bde(descargas, deuda_eurostat, años):
    """Deuda PDE de Eurostat frente a la del Banco de España (cuadro 11.6, dato de diciembre de cada año)."""
    texto = (AQUI / descargas["bde_be1106"]["fichero"]).read_text(encoding="latin-1")
    filas = list(csv.reader(texto.splitlines()))
    codigos = filas[0]
    col = codigos.index("DTNPDE2010_P00000_PS_APU")
    bde = {int(f[0][4:]): int(f[col]) / 1000 for f in filas if f and f[0].startswith("DIC ") and f[col]}
    exactos, finos, grandes = [], [], []
    for a in años:
        if a not in bde or a not in deuda_eurostat:
            continue
        dif = deuda_eurostat[a][0] - bde[a]
        if abs(dif) < 1:
            exactos.append(a)
        elif abs(dif) / bde[a] < 0.001:
            finos.append(a)
        else:
            grandes.append((a, dif, 100 * dif / bde[a]))
    partes = [f"Coinciden al millón de euros en {len(exactos)} de {len(exactos) + len(finos) + len(grandes)} años"]
    if finos:
        trimestre = [f[0] for f in filas if f and f[0][:3] in ("MAR", "JUN", "SEP", "DIC")][-1]
        mes = {"MAR": "marzo", "JUN": "junio", "SEP": "septiembre", "DIC": "diciembre"}[trimestre[:3]]
        ultimo_bde = f"{mes} de {trimestre[4:]}"
        partes.append(f"en {' y '.join(map(str, finos))} difieren menos de un 0,1 % (la tabla de Eurostat se actualizó el "
                      f"{fecha_es(descargas['gov_10dd_edpt1']['actualizado_fuente'])} y el cuadro del Banco de España "
                      f"llega hasta {ultimo_bde}; una revisión entre ambas fechas lo explicaría, sin confirmar)")
    if grandes:
        detalle = ", ".join(f"{a}: {es(p, 2).replace('-', '−')} %" for a, _, p in grandes)
        partes.append(f"en {len(grandes)} años la diferencia es mayor ({detalle}) y todavía no hemos encontrado "
                      "la explicación oficial; la buscamos antes de dar por buena ninguna de las dos")
    return {
        "que": "¿La deuda que publica Eurostat coincide con la del Banco de España?",
        "resultado": "; ".join(partes),
        "ok": not grandes,
    }


def construir_legislaturas(descargas):
    """Fecha de la sesión constitutiva de cada legislatura, sacada de la página del Congreso descargada."""
    import html as html_
    import re
    pagina = (AQUI / descargas["legislaturas"]["fichero"]).read_text(encoding="utf-8", errors="replace")
    pagina = re.sub(r"<script.*?</script>|<style.*?</style>", "", pagina, flags=re.S)
    texto = html_.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", pagina)))
    halladas = set(re.findall(r"[Ss]esi[óo]n constitutiva de la ([IVXL]+) Legislatura,? (\d{1,2}) de ([a-z]+) de (\d{4})", texto))
    legislaturas = sorted(
        ({"nombre": n, "inicio": f"{a}-{MESES.index(m) + 1:02d}-{int(d):02d}"} for n, d, m, a in halladas),
        key=lambda x: x["inicio"],
    )
    if len(legislaturas) < 10:
        raise SystemExit(f"legislaturas: solo {len(legislaturas)} sesiones constitutivas en la página del Congreso")
    return legislaturas


def construir_perimetro(descargas, fuentes):
    """Qué parte del gasto de cada función hace cada nivel de administración (gov_10a_exp).

    Usa el último año que Eurostat no marca como provisional. Es una LECTURA: el gasto de un subsector entre el
    gasto del conjunto; los subsectores no se consolidan entre sí, así que es una aproximación muy fina."""
    celdas, d = leer_jsonstat(AQUI / descargas["gov_10a_exp"]["fichero"])

    def te(sector, funcion):
        return serie(celdas, d, geo="ES", sector=sector, cofog99=funcion, na_item="TE", unit="MIO_EUR")

    total_sanidad = te("S13", "GF07")
    año = max(a for a, (v, marca) in total_sanidad.items() if v is not None and marca != "p")

    def parte(sector, funcion):
        return es(100 * te(sector, funcion)[año][0] / te("S13", funcion)[año][0], 1)

    f = fuentes["gov_10a_exp"]
    return {
        "perimetro_año": str(año),
        "ccaa_sanidad": parte("S1312", "GF07"),
        "ccaa_educacion": parte("S1312", "GF09"),
        "ss_vejez": parte("S1314", "GF1002"),
        "ss_desempleo": parte("S1314", "GF1005"),
        "exp_actualizada": fecha_es(f["actualizado_fuente"]),
        "@exp_copia": f["copia"],
        "@exp_navegador": f["url_navegador"],
    }


def inyectar(ruta, valores):
    """Escribe los valores en la página entre marcas <!--d:clave-->…<!--/d--> y en href="…" data-d="@clave"."""
    import re
    html = ruta.read_text()
    for clave, valor in valores.items():
        if clave.startswith("@"):
            html, n = re.subn(rf'href="[^"]*"(\s+data-d="{re.escape(clave)}")', rf'href="{valor}"\1', html)
        else:
            html, n = re.subn(rf"<!--d:{clave}-->.*?<!--/d-->", f"<!--d:{clave}-->{valor}<!--/d-->", html, flags=re.S)
        if n == 0:
            raise SystemExit(f"{ruta.name}: falta la marca de {clave}")
    ruta.write_text(html)


# Promesas: el resultado final de la extracción (doble clasificación y arbitraje) de cada documento, con su cita literal
# y su página. Quien gobierna (programas de PSOE y Sumar, acuerdo de coalición y acuerdos de investidura) va aparte de
# los demás partidos. Si la extracción no está (por ejemplo, en una copia del código público), no se genera.
DOCS_GOBIERNO = {"psoe-programa", "sumar-programa", "coalicion-psoe-sumar"}


def construir_promesas(documentos):
    carpeta = CODIGO / "promesas" / "extraccion"
    if not carpeta.exists():
        print("Promesas: no hay extracción en esta copia; no se genera datos/promesas.json")
        return
    docs, filas = [], []
    for d in documentos["documentos"]:
        if not d["en_alcance"]:
            continue
        r = json.loads((carpeta / ("bildu_resultado.json" if d["id"] == "bildu-compromiso" else f"{d['id']}_resultado.json")).read_text())
        gobierno = d["id"] in DOCS_GOBIERNO or d["tipo"] in ("coalicion", "investidura")
        docs.append({k: d[k] for k in ("id", "tipo", "partidos", "titulo", "idioma", "paginas", "original", "archivo", "archivo_crudo", "sha256")}
                    | {"gobierno": gobierno, "frases": sum(v for k, v in r["cuenta_frases"].items() if k != "titulo"),
                       "cuenta_frases": {k: v for k, v in r["cuenta_frases"].items() if k != "titulo"},
                       "promesas": r["promesas_total"], "distintas": r["promesas_distintas"]})
        for p in r["promesas"]:
            filas.append({"d": d["id"], "id": p["id"], "p": p["pagina"], "e": p["etiqueta"], "v": p["verbo"], "c": p["cita"],
                          "x": p["contexto"], "n": p["nota"], "r": p["repite"]})
    fiab = json.loads((carpeta / "fiabilidad.json").read_text())
    salida = {"fiabilidad": fiab,
              "clases": json.loads((carpeta / ("bildu_resultado.json")).read_text())["clases"], "documentos": docs, "promesas": filas}
    (WEB / "datos" / "promesas.json").write_text(json.dumps(salida, ensure_ascii=False, separators=(",", ":")))
    # Resumen ligero para la portada (promesas.json pesa varios MB).
    resumen = {"documentos": len(docs), "distintas": sum(d["distintas"] for d in docs), "legislatura": documentos["legislatura"]}
    (WEB / "datos" / "promesas-resumen.json").write_text(json.dumps(resumen, ensure_ascii=False, separators=(",", ":")))
    nombre = {d["id"]: d for d in docs}
    with open(WEB / "datos" / "promesas.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["documento", "partidos", "id", "página", "etiqueta (nuestra)", "verbo literal", "cita literal",
                    "frase que abre la lista", "nota", "repite (id)"])
        for x in filas:
            w.writerow([nombre[x["d"]]["titulo"], " – ".join(nombre[x["d"]]["partidos"]), x["id"], x["p"], x["e"], x["v"], x["c"], x["x"], x["n"], x["r"]])
    print(f"Promesas: {len(filas)} de {len(docs)} documentos; web/datos/promesas.json y promesas.csv escritos")


# ---- Paso «Dato» de las promesas (desde el 21/10/2026): series oficiales de las metas medibles ----
# Qué se descarga y cómo se calcula cada magnitud está en promesas/series_datos.json; aquí solo se lee y se calcula.
# El valor «al empezar la legislatura» es el del último periodo cerrado antes de la investidura (16/11/2023), con la
# edición más reciente de la serie; el «último», el del periodo más reciente publicado.
INICIO_LEGISLATURA = "2023-11-16"


def descargas_de_serie(m, hoy_año):
    """[(tabla, url, extensión)] de una magnitud automática. La misma URL se descarga una sola vez."""
    import hashlib
    if m.get("ree"):
        return [(f"dato_ree_{a}", "https://apidatos.ree.es/es/datos/generacion/evolucion-renovable-no-renovable?"
                 f"start_date={a}-01-01T00:00&end_date={a}-12-31T23:59&time_trunc=year", "json") for a in range(2019, hoy_año)]
    return [("dato_" + hashlib.sha1(u.encode()).hexdigest()[:10], u, "csv" if "format=csvfile" in u else "json")
            for u in m["descargas"].values()]


def _fin_periodo(p):
    """Último día de un periodo «AAAA», «AAAATn» o «AAAA-MM» (para compararlo con el inicio de la legislatura)."""
    import calendar
    if "T" in p:
        a, t = p.split("T")
        mes = 3 * int(t)
    elif "-" in p:
        a, mes = p.split("-")[:2]
        mes = int(mes)
    else:
        a, mes = p, 12
    return f"{a}-{mes:02d}-{calendar.monthrange(int(a), mes)[1]:02d}"


def _serie_fuente(ruta, url, ref):
    """{periodo: valor} de una referencia {"de", "filtro"} dentro del fichero descargado."""
    import csv
    filtro = ref.get("filtro", {})
    if "eurostat" in url:
        celdas, d = leer_jsonstat(ruta)
        ids = d["id"]
        out = {}
        for coords, (v, _) in celdas.items():
            dims = dict(zip(ids, coords))
            if v is not None and all(dims.get(k) == x for k, x in filtro.items()):
                t = dims["time"]
                out[t.replace("-Q", "T") if "-Q" in t else t] = v
        if len({tuple(c[i] for i, k in enumerate(ids) if k != "time") for c, (v, _) in celdas.items()
                if all(dict(zip(ids, c)).get(k) == x for k, x in filtro.items())}) > 1:
            raise ValueError(f"{url}: el filtro {filtro} no deja una sola serie")
        return out
    if "servicios.ine.es" in url:
        d = json.loads(ruta.read_text())
        series = [d] if isinstance(d, dict) else [x for x in d if x.get("Nombre") == filtro.get("nombre")]
        if len(series) != 1:
            raise ValueError(f"{url}: el filtro {filtro} deja {len(series)} series")
        out = {}
        for x in series[0]["Data"]:
            if x.get("Valor") is None:
                continue
            if "FK_Periodo" not in x:  # las tablas (DATOS_TABLA) solo traen el nombre del periodo: aquí, años
                out[x["NombrePeriodo"]] = x["Valor"]
                continue
            p_, a = x["FK_Periodo"], x["Anyo"]
            out[f"{a}-{p_:02d}" if 1 <= p_ <= 12 else f"{a}T{p_ - 18}" if 19 <= p_ <= 22 else str(a)] = x["Valor"]
        return out
    if "sdmx.oecd.org" in url:
        out = {}
        filas = list(csv.DictReader(ruta.read_text(encoding="utf-8-sig").splitlines()))
        claves = {tuple((k, f[k]) for k in sorted(f) if k not in ("TIME_PERIOD", "OBS_VALUE") and k.isupper())
                  for f in filas if all(f.get(k) == x for k, x in filtro.items())}
        for f in filas:
            if all(f.get(k) == x for k, x in filtro.items()) and f["OBS_VALUE"] not in ("", None):
                out[f["TIME_PERIOD"]] = float(f["OBS_VALUE"])
        if len(claves) > 1:
            raise ValueError(f"{url}: el filtro {filtro} no deja una sola serie ({len(claves)})")
        return out
    raise ValueError(f"fuente sin lector: {url}")


def calcular_dato(m, descargas):
    """{periodo: valor} de una magnitud automática, o None si falta alguna descarga."""
    if m.get("ree"):
        out = {}
        for tabla, url, _ in descargas_de_serie(m, 9999):
            if tabla in descargas:
                d = json.loads((AQUI / descargas[tabla]["fichero"]).read_text())
                ren = next(x for x in d["included"] if x["type"] == "Renovable")
                for v in ren["attributes"]["values"]:
                    out[v["datetime"][:4]] = 100 * v["percentage"]
        return out or None
    tablas = dict(zip(m["descargas"], descargas_de_serie(m, 0)))

    def lee(ref):
        refs = ref if isinstance(ref, list) else [ref]
        partes = []
        for r in refs:
            tabla, url, _ = tablas[r["de"]]
            if tabla not in descargas:
                return None
            partes.append(_serie_fuente(AQUI / descargas[tabla]["fichero"], url, r))
        comunes = set.intersection(*(set(p) for p in partes))
        return {p: sum(x[p] for x in partes) for p in comunes}

    c = m["calculo"]
    x = lee(c["x"])
    if x is None:
        return None
    por = c.get("por", 1)
    if c["op"] == "valor":
        return {p: v * por for p, v in x.items()}
    if c["op"] in ("cociente", "diferencia"):
        y = lee(c["y"])
        if y is None:
            return None
        if c["op"] == "diferencia":
            return {p: x[p] - y[p] for p in x if p in y}
        return {p: x[p] / y[p] * por for p in x if p in y and y[p]}
    if c["op"] == "variacion_base":
        b = x.get(c["base"])
        return {p: (v / b - 1) * 100 for p, v in x.items() if b and p > c["base"]}
    if c["op"] == "variacion_anual":
        return {p: (v / x[str(int(p) - 1)] - 1) * 100 for p, v in x.items() if str(int(p) - 1) in x}
    raise ValueError(f"cálculo desconocido: {c['op']}")


def inicio_y_ultimo(serie_):
    """(periodo, valor) al empezar la legislatura y el último publicado."""
    if not serie_:
        return None, None
    orden = sorted(serie_, key=_fin_periodo)
    antes = [p for p in orden if _fin_periodo(p) <= INICIO_LEGISLATURA]
    return ((antes[-1], serie_[antes[-1]]) if antes else None), (orden[-1], serie_[orden[-1]])


def construir_datos_promesas(descargas):
    """web/datos/datos_promesas.json: por promesa, sus metas medibles y, por magnitud, la serie oficial con su valor al
    empezar la legislatura y el último publicado (o el motivo por el que no hay dato oficial)."""
    carpeta = CODIGO / "promesas" / "extraccion" / "datos"
    if not carpeta.exists():
        print("Datos de promesas: no hay extracción en esta copia; no se genera datos/datos_promesas.json")
        return
    spec = {m["id"]: m for m in json.loads((CODIGO / "promesas" / "series_datos.json").read_text())}
    hoy = dt.date.today()
    magnitudes, avisos = {}, []
    for c in json.loads((carpeta / "magnitudes.json").read_text()):
        m = spec.get(c["id"])
        if not c["serie"] or not m:
            magnitudes[c["id"]] = {"nombre": c["nombre"], "ambito": c["ambito"], "sin_dato": c["motivo"]}
            continue
        if m["tipo"] == "automatica":
            try:
                ini, ult = inicio_y_ultimo(calcular_dato(m, descargas))
            except (ValueError, KeyError, StopIteration, json.JSONDecodeError) as error:
                ini, ult = None, None
                avisos.append(f"{c['id']}: la descarga no tiene la forma esperada ({error})")
            if ult is None:
                avisos.append(f"{c['id']}: no se pudo calcular")
                magnitudes[c["id"]] = {"nombre": c["nombre"], "ambito": c["ambito"], "sin_dato": "La serie oficial no se ha podido descargar."}
                continue
            comprobado = None
        else:
            ini = (m["inicio"]["periodo"], m["inicio"]["valor"]) if m["inicio"] else None
            ult = (m["ultimo"]["periodo"], m["ultimo"]["valor"])
            comprobado = m["comprobado"]
            if (hoy - dt.date.fromisoformat(comprobado)).days > 365:
                avisos.append(f"{c['id']}: el dato fijo se comprobó el {comprobado}, hace más de un año")
        magnitudes[c["id"]] = {"nombre": c["nombre"], "ambito": c["ambito"], "unidad": m["unidad"], "decimales": m["decimales"],
                               "organismo": m["organismo"], "serie": m["nombre"], "definicion": m["definicion"], "ficha": m["ficha"],
                               "coincidencia": m["coincidencia"], "nota": m["nota"], "comprobado": comprobado,
                               "inicio": list(ini) if ini else None, "ultimo": list(ult)}
    metas = {}
    por_meta = {mt: c["id"] for c in json.loads((carpeta / "magnitudes.json").read_text()) for mt in c["metas"]}
    for x in json.loads((carpeta / "metas.json").read_text()):
        metas.setdefault(x["promesa"], []).append({"magnitud": por_meta[x["meta"]], "valor": x["valor"], "fecha": x["fecha"], "ambito": x["ambito"]})
    salida = {"inicio_legislatura": INICIO_LEGISLATURA, "fiabilidad": json.loads((carpeta / "fiabilidad.json").read_text()),
              "magnitudes": magnitudes, "metas": metas}
    (WEB / "datos" / "datos_promesas.json").write_text(json.dumps(salida, ensure_ascii=False, separators=(",", ":")))
    con = sum("sin_dato" not in v for v in magnitudes.values())
    print(f"Datos de promesas: {sum(len(v) for v in metas.values())} metas en {len(metas)} promesas; {len(magnitudes)} magnitudes, "
          f"{con} con dato oficial ({sum(v.get('comprobado') is None and 'sin_dato' not in v for v in magnitudes.values())} automáticas)")
    for a in avisos:
        print("AVISO Datos de promesas: " + a)


def main():
    descargas = ultimas_descargas()
    tablas = {}
    for nombre in ("gov_10a_main", "gov_10dd_edpt1", "gov_10dd_edpt3", "nama_10_gdp", "nama_10_pe", "ert_h_eur_a"):
        m = descargas[nombre]
        tablas[nombre] = leer_jsonstat(AQUI / m["fichero"])

    main_c, main_d = tablas["gov_10a_main"]
    edp_c, edp_d = tablas["gov_10dd_edpt1"]
    gdp_c, gdp_d = tablas["nama_10_gdp"]
    pob_c, pob_d = tablas["nama_10_pe"]

    def de_main(item, unidad):
        return serie(main_c, main_d, geo="ES", sector="S13", na_item=item, unit=unidad)

    def de_edp(item, unidad):
        return serie(edp_c, edp_d, geo="ES", sector="S13", na_item=item, unit=unidad)

    datos = {
        "ingresos": {"meur": de_main("TR", "MIO_NAC"), "pib": de_main("TR", "PC_GDP"), "tabla": "gov_10a_main", "codigo": "TR"},
        "gastos": {"meur": de_main("TE", "MIO_NAC"), "pib": de_main("TE", "PC_GDP"), "tabla": "gov_10a_main", "codigo": "TE"},
        "saldo": {"meur": de_main("B9", "MIO_NAC"), "pib": de_main("B9", "PC_GDP"), "tabla": "gov_10a_main", "codigo": "B9"},
        "deuda": {"meur": de_edp("GD", "MIO_NAC"), "pib": de_edp("GD", "PC_GDP"), "tabla": "gov_10dd_edpt1", "codigo": "GD"},
    }
    deflactor = serie(gdp_c, gdp_d, geo="ES", na_item="B1GQ", unit="PD20_NAC")
    pib_nama = serie(gdp_c, gdp_d, geo="ES", na_item="B1GQ", unit="CP_MNAC")
    poblacion = serie(pob_c, pob_d, geo="ES", na_item="POP_NC", unit="THS_PER")
    pib_edp = serie(edp_c, edp_d, geo="ES", sector="S1", na_item="B1GQ", unit="MIO_NAC")
    saldo_edp = de_edp("B9", "MIO_NAC")

    años = sorted(a for a in datos["ingresos"]["meur"] if a >= DESDE and datos["ingresos"]["meur"][a][0] is not None)
    ultimo = años[-1]
    base = deflactor[ultimo][0]

    def valor(s, a):
        v = s.get(a)
        return None if v is None else v[0]

    def provisional(*series):
        return [any((s.get(a) or (None, None))[1] == "p" for s in series) for a in años]

    salida_series = {}
    for clave, s in datos.items():
        meur, pib = s["meur"], s["pib"]
        salida_series[clave] = {
            "tabla": s["tabla"],
            "codigo": s["codigo"],
            "pib": [valor(pib, a) for a in años],
            "corrientes": [valor(meur, a) for a in años],
            "constantes": [None if valor(meur, a) is None else round(valor(meur, a) * base / valor(deflactor, a), 1) for a in años],
            "habitante": [None if valor(meur, a) is None else round(valor(meur, a) * 1e6 / (valor(poblacion, a) * 1e3)) for a in años],
            "provisional": {
                "pib": provisional(pib), "corrientes": provisional(meur),
                "constantes": provisional(meur, deflactor), "habitante": provisional(meur, poblacion),
            },
        }

    # Comprobaciones: que lo publicado cuadre consigo mismo. Se enseñan en la web tal cual salgan.
    comprobaciones = []
    dif = max(abs(valor(datos["ingresos"]["meur"], a) - valor(datos["gastos"]["meur"], a) - valor(datos["saldo"]["meur"], a)) for a in años)
    comprobaciones.append({
        "que": "¿Ingresos menos gastos da exactamente el saldo publicado en la misma tabla?",
        "resultado": f"Sí, en los {len(años)} años" if dif < 1 else f"diferencia máxima de {es(dif, 1)} millones de euros",
        "ok": dif < 1,
    })
    comunes = [a for a in años if valor(saldo_edp, a) is not None]
    dif = max(abs(valor(datos["saldo"]["meur"], a) - valor(saldo_edp, a)) for a in comunes)
    peor = max(comunes, key=lambda a: abs(valor(datos["saldo"]["meur"], a) - valor(saldo_edp, a)))
    comprobaciones.append({
        "que": "¿El saldo de la tabla de cuentas coincide con el de la notificación oficial de déficit?",
        "resultado": f"Sí, en los {len(comunes)} años" if dif < 1 else f"diferencia máxima de {es(dif)} millones de euros (en {peor})",
        "ok": dif < 1,
        **({} if dif < 1 else {"nota": "Las dos tablas se actualizan en fechas distintas; una diferencia puede deberse a una revisión entre ambas."}),
    })
    difs = [(a, valor(pib_nama, a) - valor(pib_edp, a)) for a in comunes if valor(pib_nama, a) and valor(pib_edp, a)]
    a_peor, d_peor = max(difs, key=lambda x: abs(x[1]))
    comprobaciones.append({
        "que": "¿Los porcentajes del PIB de la deuda usan el PIB más reciente?",
        "resultado": f"No del todo: el PIB se ha revisado después; la mayor diferencia es de {es(abs(d_peor))} millones de euros, en {a_peor} ({es(100 * d_peor / valor(pib_edp, a_peor), 2)} %)",
        "ok": abs(d_peor) < 1,
        "nota": "Mostramos el porcentaje del PIB tal como lo publica Eurostat, aunque su PIB sea anterior a la última revisión.",
    })

    comprobaciones.append(comprobar_deuda_bde(descargas, datos["deuda"]["meur"], años))
    comprobaciones.append(comprobar_pesetas(tablas, años))
    comprobaciones.append(comprobar_saldo_igae(descargas, datos["saldo"]["meur"]))
    comprobaciones.extend(comprobar_totales_igae(descargas, tablas["gov_10a_main"]))
    comprobaciones.extend(comprobar_ine(descargas, pib_nama, poblacion))

    fuentes = []
    (WEB / "crudo").mkdir(parents=True, exist_ok=True)
    for nombre in ("gov_10a_main", "gov_10dd_edpt1", "nama_10_gdp", "nama_10_pe", "gov_10a_exp", "legislaturas", "bde_be1106", "ert_h_eur_a", "igae_cap_serie", "gov_10dd_edpt3",
                   "ue_gov_10a_main", "ue_gov_10dd_edpt1", "ine_pib", "ine_poblacion",
                   "gov_10a_taxag", "igae_cofog", "sepg_estado_2023", "sepg_estado_2025p",
                   *sorted(k for k in descargas if k.startswith(("liq_estado_", "ejec_dic_"))),
                   *[k for k in ("igae_t_aapp", "igae_a_aapp", "igae_a_aapp_imp", "bde_be1107", "ameco16", "ameco18",
                                 "fmi_weo_ggxcnl_ngdp", "fmi_weo_ggxwdg_ngdp", "fmi_weo_ggr_ngdp", "fmi_weo_ggx_ngdp",
                                 "airef_pfemp_2026", "airef_ejecucion_2026", "airef_fichas_2026_08",
                                 "bde_proyecciones_2026t3", "hacienda_objetivos_2027") if k in descargas],
                   *sorted(k for k in descargas if k.startswith(("ine_epa", "ine_ipc", "ine_cntr", "ine_idb", "ine_prop", "ss_", "bce_", "tesoro_", "sepe_", "igae_ccaa_", "igae_cofog_ccaa_",
                                                       "hacienda_liquidacion_", "bde_be13", "ine_ecp11", "ilc_", "ine_ecv", "ocde_", "bce_dwa_")))):
        m = descargas[nombre]
        fecha = m["descargado"][:10]
        extension = pathlib.Path(m["fichero"]).suffix
        copia = f"{nombre}-{fecha}-{m['sha256'][:12]}{extension}.gz"
        destino = WEB / "crudo" / copia
        if extension == ".pdf":
            copia = None  # informes en PDF: se enlaza el original, no se republica
        elif not destino.exists():
            with open(AQUI / m["fichero"], "rb") as f, open(destino, "wb") as bruto, \
                    gzip.GzipFile(fileobj=bruto, mode="wb", mtime=0) as g:
                shutil.copyfileobj(f, g)
        eurostat = m.get("fuente", "Eurostat") == "Eurostat"
        uso = {"legislaturas": "De ella se extraen las fechas de las sesiones constitutivas.",
               "bde_be1106": "Se usa para comprobar la deuda de Eurostat (dato de diciembre de cada año).",
               "igae_cap_serie": "Se usa para comprobar el saldo y las operaciones que forman los totales de Eurostat.",
               "ine_pib": "Se usa para comprobar el PIB de Eurostat (suma de los cuatro trimestres).",
               "ine_poblacion": "Se usa para comprobar la población de Eurostat.",
               "igae_cofog": "Se usa para comprobar el gasto de cada función.",
               "sepg_estado_2023": "Se usa para comprobar los créditos iniciales por capítulos.",
               "sepg_estado_2025p": "Se usa para comprobar los créditos iniciales por capítulos.",
               "igae_t_aapp": "Ingresos, gastos y saldo del año en curso, acumulados trimestre a trimestre.",
               "igae_a_aapp": "Segunda fuente del saldo de los últimos años.",
               "igae_a_aapp_imp": "Impuestos y cotizaciones del último año, antes de que los publique Eurostat.",
               "bde_be1107": "Deuda del último trimestre publicado, en porcentaje del PIB.",
               "ameco16": "Previsiones de la Comisión Europea: ingresos, gastos y saldo.",
               "ameco18": "Previsiones de la Comisión Europea: deuda.",
               "airef_pfemp_2026": "Previsiones de saldo de la AIReF; las cifras copiadas se comprueban contra este fichero.",
               "airef_ejecucion_2026": "Previsiones de saldo y deuda de la AIReF, con su abanico de incertidumbre; las cifras copiadas se comprueban contra este fichero.",
               "airef_fichas_2026_08": "Última previsión de saldo de la AIReF para el año en curso (PDF; cifra copiada de la página 2).",
               "bde_proyecciones_2026t3": "Proyecciones del Banco de España (PDF; cifras copiadas del Cuadro 1).",
               "hacienda_objetivos_2027": "Objetivos de déficit y deuda del Gobierno (PDF; cifras copiadas de las páginas 7 y 9)."}.get(nombre) or \
              ("Previsiones del FMI." if nombre.startswith("fmi_weo_") else None) or \
              ({"ss_afiliados_medios": "Afiliados medios por régimen y edad; con ellos se calculan los afiliados por pensión.",
                "ss_afiliados_desest": "Serie desestacionalizada oficial desde 2021.",
                "ss_afiliados_desest_09": "Serie desestacionalizada oficial de 2008 a 2020.",
                "ss_pensiones_avance": "Número de pensiones, nómina y pensión media.",
                "bce_bono_10": "Rentabilidad del bono a 10 años de España y de Alemania; la prima de riesgo es la resta.",
                "tesoro_tipo_medio_historico": "Tipo de interés medio de la deuda viva del Estado desde 2001.",
                "tesoro_tipo_medio": "Tipo de interés medio de los últimos meses.",
                "tesoro_vida_media": "Vida media de la deuda del Estado.",
                "sepe_paro": "Paro registrado de los últimos diez años.",
                "sepe_paro_2001": "Paro registrado de 2001 a 2016 (antes de mayo de 2005, reconstruido por el SEPE).",
                "bde_be1309": "Deuda de cada comunidad autónoma, en euros.",
                "bde_be1310": "Deuda de cada comunidad autónoma, en % de su PIB.",
                "bde_be1306": "Deuda de cada comunidad con el Estado (préstamos de los mecanismos de financiación)."}.get(nombre)) or \
              ("Déficit de cada comunidad autónoma en ese año." if nombre.startswith("igae_ccaa_") else None) or \
              ("Gasto por funciones de cada comunidad autónoma." if nombre.startswith("igae_cofog_ccaa_") else None) or \
              ("Financiación por habitante ajustado de cada comunidad de régimen común." if nombre.startswith("hacienda_liquidacion_") else None) or \
              ("Población de una comunidad autónoma." if nombre.startswith("ine_ecp11") else None) or \
              ("Indicador de desigualdad o pobreza de la encuesta europea de ingresos (EU-SILC)." if nombre.startswith("ilc_") else None) or \
              ({"ine_ecv7186": "Índice de Gini del INE, para los años en que Eurostat ya no lo da (2008-2013).",
                "ocde_idd": "Gini antes y después de transferencias e impuestos, con el método de la OCDE.",
                "bce_dwa_gini": "Reparto de la riqueza (estadística experimental).", "bce_dwa_top10": "Reparto de la riqueza (estadística experimental).",
                "bce_dwa_bottom50": "Reparto de la riqueza (estadística experimental)."}.get(nombre)) or \
              ("Serie del INE usada en «La economía detrás de las cuentas»." if nombre.startswith(("ine_epa", "ine_ipc", "ine_cntr", "ine_idb", "ine_prop")) else None) or \
              ("Créditos iniciales, modificaciones, créditos definitivos y obligaciones reconocidas por políticas de gasto."
               if nombre.startswith("liq_estado_") else
               "Avance: ejecución a 31 de diciembre por políticas de gasto (hoja GTOS 008)." if nombre.startswith("ejec_dic_") else None)
        fuentes.append({
            "fuente": m.get("fuente", "Eurostat"),
            "tabla": nombre, "nombre": m["nombre"], "url_api": m["url"],
            "url_navegador": NAVEGADOR.format(tabla=m.get("dataset", nombre)) if eurostat else m["url"],
            "dataset": m.get("dataset", nombre),
            "uso": uso,
            "descargado": m["descargado"], "actualizado_fuente": m["actualizado_fuente"], "sha256": m["sha256"],
            "copia": f"crudo/{copia}" if copia else None,
        })

    ue = construir_ue(descargas, años)
    peor_ue = max(abs(ue["indicadores"][k]["ES"][i] - salida_series[k]["pib"][i])
                  for k in ("ingresos", "gastos", "saldo", "deuda") for i in range(len(años))
                  if ue["indicadores"][k]["ES"][i] is not None and salida_series[k]["pib"][i] is not None)
    comprobaciones.append({
        "que": "¿Las cifras de España en la comparación europea son las mismas que las del resto de la página?",
        "resultado": "Sí, en los cuatro indicadores y todos los años" if peor_ue < 0.001 else f"No: diferencia máxima de {es(peor_ue, 2)} puntos",
        "ok": peor_ue < 0.001,
    })
    cambio, comprobacion_cambio = construir_cambio_deuda(tablas, años, deflactor, base, poblacion)
    comprobaciones.append(comprobacion_cambio)

    recientes, comprobaciones_recientes = construir_recientes(descargas, datos, años)
    comprobaciones.extend(comprobaciones_recientes)
    salida = {
        "generado": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
        "años": años,
        "año_base_constantes": ultimo,
        "series": salida_series,
        "fuentes": fuentes,
        "legislaturas": construir_legislaturas(descargas),
        "cambio_deuda": cambio,
        "acontecimientos": json.loads((CODIGO / "acontecimientos.json").read_text()),
        "gobiernos": json.loads((CODIGO / "gobiernos.json").read_text()),
        "recientes": recientes,
        "ue": ue,
        "comprobaciones": comprobaciones,
    }
    (WEB / "datos").mkdir(parents=True, exist_ok=True)
    (WEB / "datos" / "aapp.json").write_text(json.dumps(salida, ensure_ascii=False, separators=(",", ":")))
    # Escala de persona (desde el 21/10/2026): población media y PIB de cada año, para que cualquier página pueda decir
    # una cifra en euros por habitante. Población: Eurostat nama_10_pe (POP_NC, miles); PIB: nama_10_gdp (B1GQ, millones).
    escala = {"años": [a for a in años if valor(poblacion, a) and valor(pib_nama, a)],
              "fuentes": "Eurostat: nama_10_pe (población media, POP_NC) y nama_10_gdp (PIB a precios corrientes, B1GQ)"}
    escala["poblacion"] = [round(valor(poblacion, a) * 1000) for a in escala["años"]]
    escala["pib_meur"] = [valor(pib_nama, a) for a in escala["años"]]
    (WEB / "datos" / "escala.json").write_text(json.dumps(escala, ensure_ascii=False, separators=(",", ":")))
    gasto, comprobaciones_gasto = construir_gasto(descargas, tablas["gov_10a_main"], deflactor, base, poblacion)
    gasto["tipo"], comprobacion_tipo = construir_tipo(tablas["gov_10a_main"], años, deflactor, base, poblacion)
    comprobaciones_gasto.append(comprobacion_tipo)
    ingresos, comprobaciones_ingresos = construir_ingresos(descargas, tablas["gov_10a_main"], deflactor, base, poblacion)
    comprobaciones_ingresos += ampliar_ingresos_igae(ingresos, descargas, pib_nama, deflactor, base, poblacion)
    for nombre, cuerpo, compr in (("gasto", gasto, comprobaciones_gasto), ("ingresos", ingresos, comprobaciones_ingresos)):
        cuerpo["comprobaciones"] = compr
        cuerpo["año_base_constantes"] = ultimo
        (WEB / "datos" / f"{nombre}.json").write_text(json.dumps(cuerpo, ensure_ascii=False, separators=(",", ":")))
        for c_ in compr:
            print(("OK    " if c_["ok"] else "AVISO ") + c_["que"] + " " + c_["resultado"])
    escribir_csv_paginas(gasto, ingresos)
    desigualdad = construir_desigualdad(descargas)
    (WEB / "datos" / "desigualdad.json").write_text(json.dumps(desigualdad, ensure_ascii=False, separators=(",", ":")))
    for c_ in desigualdad["comprobaciones"]:
        print(("OK    " if c_["ok"] else "AVISO ") + c_["que"] + " " + c_["resultado"])
    territorio = construir_territorio(descargas)
    (WEB / "datos" / "territorio.json").write_text(json.dumps(territorio, ensure_ascii=False, separators=(",", ":")))
    for c_ in territorio["comprobaciones"]:
        print(("OK    " if c_["ok"] else "AVISO ") + c_["que"] + " " + c_["resultado"])
    economia = construir_economia(descargas, ingresos)
    (WEB / "datos" / "economia.json").write_text(json.dumps(economia, ensure_ascii=False, separators=(",", ":")))
    for c_ in economia["comprobaciones"]:
        print(("OK    " if c_["ok"] else "AVISO ") + c_["que"] + " " + c_["resultado"])
    presupuesto, comprobaciones_presupuesto = construir_presupuesto(descargas)
    presupuesto["comprobaciones"] = comprobaciones_presupuesto
    (WEB / "datos" / "presupuesto.json").write_text(json.dumps(presupuesto, ensure_ascii=False, separators=(",", ":")))
    # Documentos de promesas: el catálogo tal cual (los PDF no se publican; se enlazan el original y la copia del archivo).
    # Explicaciones de los botones (i): el texto tal cual, con sus fuentes.
    (WEB / "datos" / "explicaciones.json").write_text(
        json.dumps(json.loads((CODIGO / "explicaciones.json").read_text()), ensure_ascii=False, separators=(",", ":")))
    documentos = json.loads((CODIGO / "promesas" / "documentos.json").read_text())
    (WEB / "datos" / "documentos.json").write_text(json.dumps(documentos, ensure_ascii=False, separators=(",", ":")))
    construir_promesas(documentos)
    construir_hechos({"normas": CODIGO / "promesas" / "extraccion" / "hechos",
                      "iniciativas": CODIGO / "promesas" / "extraccion" / "hechos_iniciativas",
                      "decretos": CODIGO / "promesas" / "extraccion" / "hechos_decretos"})
    construir_datos_promesas(descargas)
    for c_ in comprobaciones_presupuesto:
        print(("OK    " if c_["ok"] else "AVISO ") + c_["que"] + " " + c_["resultado"])
    with open(WEB / "datos" / "presupuesto.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["año", "presupuesto vigente", "código", "área o política de gasto", "créditos iniciales (M€)",
                    "créditos definitivos (M€)", "obligaciones reconocidas (M€)", "pagos (M€)", "fuente"])
        for i, a in enumerate(presupuesto["años"]):
            for p in presupuesto["politicas"][i]:
                w.writerow([a, presupuesto["vigencia"][i]["texto"], p["codigo"], p["nombre"], p["iniciales"], p["definitivos"],
                            p["obligaciones"], p["pagos"],
                            f"IGAE, avance: ejecución a 31 de diciembre de {a} (hoja GTOS 008)" if presupuesto["avance"][i]
                            else f"IGAE, liquidación del presupuesto del Estado {a} (hojas LIQ 004 y LIQ 007)"])

    with open(WEB / "datos" / "aapp.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["año", "serie", "unidad", "valor", "tipo", "provisional", "tabla_eurostat"])
        nombres_unidad = {"pib": "% del PIB", "corrientes": "millones de euros corrientes",
                          "constantes": f"millones de euros de {ultimo}", "habitante": "euros por habitante"}
        tipo = {"pib": "dato", "corrientes": "dato", "constantes": "lectura", "habitante": "lectura"}
        for clave, s in salida_series.items():
            for unidad in nombres_unidad:
                for i, a in enumerate(años):
                    w.writerow([a, clave, nombres_unidad[unidad], s[unidad][i], tipo[unidad],
                                "sí" if s["provisional"][unidad][i] else "no", s["tabla"]])
        # Por qué cambió la deuda: en euros, dato o resta directa de datos; en % del PIB, lectura (identidad exacta)
        nombres_unidad["pib"] = "puntos del PIB"
        tipo_cambio = {"pib": "lectura", "corrientes": "dato", "constantes": "lectura", "habitante": "lectura"}
        for unidad, series_ in cambio.items():
            for clave, valores in series_.items():
                for i, a in enumerate(años):
                    if valores[i] is None:
                        continue
                    t = "lectura" if clave == "deficit_primario" and unidad == "corrientes" else tipo_cambio[unidad]
                    w.writerow([a, f"cambio_deuda.{clave}", nombres_unidad[unidad], valores[i], t, "no",
                                "gov_10dd_edpt3" if clave not in ("intereses",) else "gov_10dd_edpt1"])

    perimetro = construir_perimetro(descargas, {f["tabla"]: f for f in fuentes})
    # Países de la UE con déficit en los dos golpes externos que cita «Cómo se miente» (distinción 5)
    saldo_ue = ue["indicadores"]["saldo"]
    for a_ in (2009, 2020):
        i_ = años.index(a_)
        valores = [v[i_] for p, v in saldo_ue.items() if p != "EU27_2020" and v[i_] is not None]
        perimetro[f"ue_deficit_{a_}"] = str(sum(1 for v in valores if v < 0))
        perimetro[f"ue_paises_{a_}"] = str(len(valores))
    inyectar(WEB / "como-se-miente.html", perimetro)

    for c in comprobaciones:
        print(("OK    " if c["ok"] else "AVISO ") + c["que"] + " " + c["resultado"])
    print(f"{len(años)} años ({años[0]}–{ultimo}); web/datos/aapp.json y aapp.csv escritos")


def versionar_estaticos(web):
    """Pone a cada script y hoja de estilos propios su versión (huella del contenido) en las páginas: «comun.js?v=…».
    GitHub Pages guarda cada fichero diez minutos en caché, por separado; sin versión, tras publicar, una visita podía
    juntar un comun.js viejo con un graficos.js nuevo y la página fallaba. Solo en la copia que se publica (CUENTAS_WEB):
    el repositorio no cambia."""
    huellas = {f.name: hashlib.sha256(f.read_bytes()).hexdigest()[:10] for f in list(web.glob("*.js")) + list(web.glob("*.css"))}
    for pagina in web.glob("*.html"):
        html = pagina.read_text()
        nuevo = re.sub(r'(src|href)="([\w.-]+\.(?:js|css))(\?v=\w+)?"',
                       lambda m: f'{m.group(1)}="{m.group(2)}?v={huellas[m.group(2)]}"' if m.group(2) in huellas else m.group(0), html)
        if nuevo != html:
            pagina.write_text(nuevo)


if __name__ == "__main__":
    main()
    if os.environ.get("CUENTAS_WEB"):
        versionar_estaticos(WEB)
