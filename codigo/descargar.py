#!/usr/bin/env python3
"""Descarga literal de las fuentes oficiales.

Cada fichero se guarda tal cual lo sirve la fuente, en datos/crudo/<fecha>/<tabla>.json, y se anota en
datos/manifiesto.json con su URL, la hora de descarga, su huella sha256 y la fecha de actualización que declara
la propia fuente. Nunca se edita un fichero descargado: si la fuente cambia, se descarga otro.

Uso:  python3 datos/descargar.py
"""
import datetime as dt
import hashlib
import json
import os
import pathlib
import urllib.error
import urllib.parse
import urllib.request

# Dónde se guardan las descargas y el manifiesto: junto al código (en el Mac) o donde diga CUENTAS_DATOS (en el
# servidor, fuera del clon del repo para que este se quede limpio).
AQUI = pathlib.Path(os.environ.get("CUENTAS_DATOS") or pathlib.Path(__file__).resolve().parent)
CRUDO = AQUI / "crudo"
MANIFIESTO = AQUI / "manifiesto.json"

EUROSTAT = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/"

UE = ["BE", "BG", "CZ", "DK", "DE", "EE", "IE", "EL", "ES", "FR", "HR", "IT", "CY", "LV", "LT", "LU", "HU", "MT", "NL",
      "AT", "PL", "PT", "RO", "SI", "SK", "FI", "SE"]

# Qué se descarga. Las cuatro tablas de cuentas públicas van enteras para España (las usarán otras piezas);
# PIB y población, solo los agregados que hacen falta para cambiar de unidad.
TABLAS = [
    {"tabla": "gov_10a_main", "nombre": "Ingresos, gastos y saldo de las administraciones públicas",
     "filtros": {"geo": "ES"}},
    {"tabla": "gov_10dd_edpt1", "nombre": "Déficit y deuda según el Procedimiento de Déficit Excesivo",
     "filtros": {"geo": "ES"}},
    {"tabla": "gov_10dd_edpt3", "nombre": "Del déficit a la variación de la deuda (notificación del Procedimiento de Déficit Excesivo)",
     "filtros": {"geo": "ES"}},
    {"tabla": "gov_10a_exp", "nombre": "Gasto de las administraciones públicas por funciones (COFOG)",
     "filtros": {"geo": "ES"}},
    {"tabla": "gov_10a_taxag", "nombre": "Impuestos y cotizaciones sociales",
     "filtros": {"geo": "ES"}},
    # Comparación europea: los 27 países y la media de la UE, solo lo que se dibuja (en % del PIB)
    {"tabla": "gov_10a_main", "clave": "ue_gov_10a_main",
     "nombre": "Ingresos, gastos y saldo de las administraciones públicas (UE-27)",
     "filtros": {"geo": UE + ["EU27_2020"], "sector": "S13", "na_item": ["TR", "TE", "B9"], "unit": "PC_GDP"}},
    {"tabla": "gov_10dd_edpt1", "clave": "ue_gov_10dd_edpt1",
     "nombre": "Deuda según el Procedimiento de Déficit Excesivo (UE-27)",
     "filtros": {"geo": UE + ["EU27_2020"], "sector": "S13", "na_item": "GD", "unit": "PC_GDP"}},
    {"tabla": "nama_10_gdp", "nombre": "PIB y sus componentes",
     "filtros": {"geo": "ES", "na_item": "B1GQ"}},
    {"tabla": "nama_10_pe", "nombre": "Población y empleo",
     "filtros": {"geo": "ES", "na_item": "POP_NC"}},
    {"tabla": "ert_h_eur_a", "nombre": "Tipos de cambio de las antiguas monedas del euro frente al euro/ECU",
     "filtros": {"currency": "ESP"}},
]


# Listados: una página oficial que enlaza un fichero por año. Se lee la página y se descarga cada fichero, para que
# los años nuevos entren solos cuando se publiquen.
LISTADOS = [
    {"fuente": "IGAE", "prefijo": "liq_estado_",
     "nombre": "Liquidación del presupuesto del Estado, ejercicio {año} (cuadros)",
     "pagina": "https://www.igae.pap.hacienda.gob.es/sitios/igae/es-ES/Contabilidad/ContabilidadPublica/CPE/EjecucionPresupuestaria/Paginas/ialiquidacionestado.aspx",
     "patron": r'<a[^>]+href="([^"]+\.xlsx)"[^>]*>\s*Cuadros\. Ejercicio (\d{4})\s*</a>',
     "desde": 2015},
]
PAGINAS_DIN = []
SEPG = "https://www.sepg.pap.hacienda.gob.es/sitios/sepg/es-ES/Presupuestos/accesodocumentacion/DocumentacionEstadisticas/Estadisticas/Documents/{v}/02%20Presupuestos%20del%20Estado.xlsx"


# Otras fuentes (páginas y CSV): se guardan tal cual y el script de construcción extrae lo que necesita.
PAGINAS = [
    {"fuente": "Congreso de los Diputados", "tabla": "legislaturas",
     "nombre": "Historia de las legislaturas: sesiones constitutivas",
     "url": "https://www.congreso.es/es/cem/histxivleg", "extension": "html"},
    {"fuente": "Banco de España", "tabla": "bde_be1106",
     "nombre": "Deuda según el Procedimiento de Déficit Excesivo, por subsectores (Boletín Estadístico, cuadro 11.6)",
     "url": "https://www.bde.es/webbe/es/estadisticas/compartido/datos/csv/be1106.csv", "extension": "csv"},
    {"fuente": "INE", "tabla": "ine_pib",
     "nombre": "PIB a precios de mercado, precios corrientes, trimestral (Contabilidad Nacional Trimestral)",
     "url": "https://servicios.ine.es/wstempus/js/ES/DATOS_SERIE/CNTR6548?nult=200", "extension": "json"},
    {"fuente": "INE", "tabla": "ine_poblacion",
     "nombre": "Población residente (Estadística Continua de Población)",
     "url": "https://servicios.ine.es/wstempus/js/ES/DATOS_SERIE/ECP320?nult=200", "extension": "json"},
    {"fuente": "IGAE", "tabla": "igae_cofog",
     "nombre": "Gasto de las Administraciones públicas por funciones (COFOG), serie anual desde 1995",
     "url": "https://www.igae.pap.hacienda.gob.es/sitios/igae/es-ES/Contabilidad/ContabilidadNacional/Publicaciones/Documents/AAPP_A/COFOG_A_AAPP.xlsx",
     "extension": "xlsx"},
    {"fuente": "Ministerio de Hacienda", "tabla": "sepg_estado_2025p",
     "nombre": "Estadísticas del Presupuesto del Estado (edición 2025-P): gastos por capítulos",
     "url": SEPG.format(v="2025-P"), "extension": "xlsx"},
    {"fuente": "Ministerio de Hacienda", "tabla": "sepg_estado_2023",
     "nombre": "Estadísticas del Presupuesto del Estado (edición 2023): gastos por capítulos",
     "url": SEPG.format(v="2023"), "extension": "xlsx"},
    {"fuente": "IGAE", "tabla": "igae_cap_serie",
     "nombre": "Cuentas de las Administraciones públicas, serie anual desde 1995",
     "url": "https://www.igae.pap.hacienda.gob.es/sitios/igae/es-ES/Contabilidad/ContabilidadNacional/Publicaciones/Documents/CAAP/CAP_Serie.xlsx",
     "extension": "xlsx"},
]


def url_de(t):
    consulta = urllib.parse.urlencode({**t["filtros"], "lang": "EN"}, doseq=True)
    return f"{EUROSTAT}{t['tabla']}?{consulta}"


def main():
    ahora = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
    carpeta = CRUDO / ahora.date().isoformat()
    carpeta.mkdir(parents=True, exist_ok=True)
    AQUI.mkdir(parents=True, exist_ok=True)
    manifiesto = json.loads(MANIFIESTO.read_text()) if MANIFIESTO.exists() else []

    for t in TABLAS:
        url = url_de(t)
        with urllib.request.urlopen(url, timeout=120) as r:
            cuerpo = r.read()
        datos = json.loads(cuerpo)
        huella = hashlib.sha256(cuerpo).hexdigest()
        clave = t.get("clave", t["tabla"])
        anterior = next((m for m in reversed(manifiesto) if m["tabla"] == clave), None)
        novedad = anterior is None or anterior["sha256"] != huella
        # Si el fichero es idéntico al último, no se guarda otra copia: la entrada nueva apunta al mismo fichero.
        destino = carpeta / f"{clave}.json" if novedad or not (AQUI / anterior["fichero"]).exists() else AQUI / anterior["fichero"]
        if not destino.exists():
            destino.write_bytes(cuerpo)
        manifiesto.append({
            "fuente": "Eurostat",
            "tabla": clave,
            "dataset": t["tabla"],
            "nombre": t["nombre"],
            "url": url,
            "descargado": ahora.isoformat(),
            "actualizado_fuente": datos.get("updated"),
            "sha256": huella,
            "bytes": len(cuerpo),
            "fichero": str(destino.relative_to(AQUI)),
        })
        print(f"{clave:18} {len(cuerpo):>10} B  actualizado {datos.get('updated')}  "
              f"{'NUEVO' if novedad else 'sin cambios'}")

    for t in PAGINAS:
        peticion = urllib.request.Request(t["url"], headers={"User-Agent": "Mozilla/5.0 (cuentas del pais)"})
        with urllib.request.urlopen(peticion, timeout=120) as r:
            cuerpo = r.read()
        huella = hashlib.sha256(cuerpo).hexdigest()
        anterior = next((m for m in reversed(manifiesto) if m["tabla"] == t["tabla"]), None)
        novedad = anterior is None or anterior["sha256"] != huella
        destino = carpeta / f"{t['tabla']}.{t['extension']}" if novedad or not (AQUI / anterior["fichero"]).exists() else AQUI / anterior["fichero"]
        if not destino.exists():
            destino.write_bytes(cuerpo)
        manifiesto.append({
            "fuente": t["fuente"], "tabla": t["tabla"], "nombre": t["nombre"], "url": t["url"],
            "descargado": ahora.isoformat(), "actualizado_fuente": None, "sha256": huella, "bytes": len(cuerpo),
            "fichero": str(destino.relative_to(AQUI)),
        })
        print(f"{t['tabla']:18} {len(cuerpo):>10} B  ({t['fuente']})  {'NUEVO' if novedad else 'sin cambios'}")

    import html as html_
    import re
    for listado in LISTADOS:
        peticion = urllib.request.Request(listado["pagina"], headers={"User-Agent": "Mozilla/5.0 (cuentas en limpio)"})
        with urllib.request.urlopen(peticion, timeout=120) as r:
            pagina = r.read().decode("utf-8", errors="replace")
        base = re.match(r"https?://[^/]+", listado["pagina"]).group(0)
        for enlace, año in re.findall(listado["patron"], pagina):
            if int(año) < listado["desde"]:
                continue
            ruta = html_.unescape(enlace)
            url = base + urllib.parse.quote(ruta, safe="/%()") if ruta.startswith("/") else ruta
            PAGINAS_DIN.append({"fuente": listado["fuente"], "tabla": f"{listado['prefijo']}{año}",
                                "nombre": listado["nombre"].format(año=año), "url": url, "extension": "xlsx"})
    # Avance: ejecución mensual de diciembre de los años sin liquidación, y del último que la tiene (para comprobar que
    # el avance coincide con la liquidación definitiva). Cada año tiene su página en la IGAE.
    liquidados = sorted(int(t["tabla"][-4:]) for t in PAGINAS_DIN if t["tabla"].startswith("liq_estado_"))
    if liquidados:
        base_ejec = ("https://www.igae.pap.hacienda.gob.es/sitios/igae/es-ES/Contabilidad/ContabilidadPublica/CPE/"
                     "EjecucionPresupuestaria/Paginas/imejecucionpresupuesto{año}.aspx")
        for año in range(liquidados[-1], ahora.year):
            try:
                peticion = urllib.request.Request(base_ejec.format(año=año), headers={"User-Agent": "Mozilla/5.0 (cuentas en limpio)"})
                with urllib.request.urlopen(peticion, timeout=120) as r:
                    pagina = r.read().decode("utf-8", errors="replace")
            except urllib.error.HTTPError:
                continue
            for enlace in re.findall(r'href="([^"]+\.xlsx)"', pagina):
                ruta = html_.unescape(enlace)
                if "DICIEMBRE" in ruta.upper() and "ANEXO" not in ruta.upper():
                    url = "https://www.igae.pap.hacienda.gob.es" + urllib.parse.quote(ruta, safe="/%()") if ruta.startswith("/") else ruta
                    PAGINAS_DIN.append({"fuente": "IGAE", "tabla": f"ejec_dic_{año}",
                                        "nombre": f"Ejecución presupuestaria del Estado a 31 de diciembre de {año} (avance mensual)",
                                        "url": url, "extension": "xlsx"})
                    break
    for t in PAGINAS_DIN:
        peticion = urllib.request.Request(t["url"], headers={"User-Agent": "Mozilla/5.0 (cuentas en limpio)"})
        with urllib.request.urlopen(peticion, timeout=120) as r:
            cuerpo = r.read()
        huella = hashlib.sha256(cuerpo).hexdigest()
        anterior = next((m for m in reversed(manifiesto) if m["tabla"] == t["tabla"]), None)
        novedad = anterior is None or anterior["sha256"] != huella
        destino = carpeta / f"{t['tabla']}.{t['extension']}" if novedad or not (AQUI / anterior["fichero"]).exists() else AQUI / anterior["fichero"]
        if not destino.exists():
            destino.write_bytes(cuerpo)
        manifiesto.append({
            "fuente": t["fuente"], "tabla": t["tabla"], "nombre": t["nombre"], "url": t["url"],
            "descargado": ahora.isoformat(), "actualizado_fuente": None, "sha256": huella, "bytes": len(cuerpo),
            "fichero": str(destino.relative_to(AQUI)),
        })
        print(f"{t['tabla']:18} {len(cuerpo):>10} B  ({t['fuente']})  {'NUEVO' if novedad else 'sin cambios'}")

    MANIFIESTO.write_text(json.dumps(manifiesto, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
