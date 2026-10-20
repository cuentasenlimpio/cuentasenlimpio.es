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
import json
import os
import pathlib
import re
import shutil
import zipfile

from xlsx import hojas

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


def ultimas_descargas():
    manifiesto = json.loads(MANIFIESTO.read_text())
    ultimas = {}
    for m in manifiesto:
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
                "nota": (f"Eurostat y la IGAE dan el mismo saldo ({es(eurostat)} millones)." if abs(dif) < 1 else
                         f"La IGAE da un saldo de {es(igae)} millones y Eurostat de {es(eurostat)} (diferencia de {es(abs(dif))}): "
                         f"la IGAE publicó una revisión el {fecha_igae} que Eurostat todavía no ha recogido."),
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
                with zipfile.ZipFile(AQUI / descargas[fichero]["fichero"]) as z:
                    texto = z.read(z.namelist()[0]).decode("latin-1")
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
                                 "bde_proyecciones_2026t3", "hacienda_objetivos_2027") if k in descargas]):
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


if __name__ == "__main__":
    main()
