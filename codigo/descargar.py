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
     "filtros": {"geo": UE + ["EU27_2020"], "sector": "S13", "na_item": ["TR", "TE", "B9", "D1PAY"], "unit": "PC_GDP"}},
    {"tabla": "gov_10dd_edpt1", "clave": "ue_gov_10dd_edpt1",
     "nombre": "Deuda según el Procedimiento de Déficit Excesivo (UE-27)",
     "filtros": {"geo": UE + ["EU27_2020"], "sector": "S13", "na_item": "GD", "unit": "PC_GDP"}},
    {"tabla": "nama_10_gdp", "nombre": "PIB y sus componentes",
     "filtros": {"geo": "ES", "na_item": "B1GQ"}},
    {"tabla": "nama_10_pe", "nombre": "Población y empleo",
     "filtros": {"geo": "ES", "na_item": "POP_NC"}},
    {"tabla": "ert_h_eur_a", "nombre": "Tipos de cambio de las antiguas monedas del euro frente al euro/ECU",
     "filtros": {"currency": "ESP"}},
    # Desigualdad (EU-SILC; el año es el de la encuesta, la renta es la del año anterior). Desde el 20/10/2026.
    {"tabla": "ilc_di12", "nombre": "Índice de Gini de la renta disponible equivalente",
     "filtros": {"geo": ["ES", "EU27_2020"], "age": "TOTAL"}},
    {"tabla": "ilc_di12b", "nombre": "Índice de Gini antes de transferencias sociales (sin ninguna transferencia, tampoco pensiones)",
     "filtros": {"geo": ["ES", "EU27_2020"]}},
    {"tabla": "ilc_di12c", "nombre": "Índice de Gini antes de transferencias sociales (con las pensiones como renta)",
     "filtros": {"geo": ["ES", "EU27_2020"]}},
    *[{"tabla": t, "nombre": n,
       "filtros": {"geo": ["ES", "EU27_2020"], "statinfo": "MED_EI", "rskpovth": "B_60", "unit": "PC", "sex": "T", "age": "TOTAL"}}
      for t, n in (("ilc_li02", "Tasa de riesgo de pobreza (umbral: 60 % de la mediana)"),
                   ("ilc_li09", "Tasa de riesgo de pobreza antes de transferencias sociales (sin ninguna, tampoco pensiones)"),
                   ("ilc_li10", "Tasa de riesgo de pobreza antes de transferencias sociales (con las pensiones como renta)"))],
    {"tabla": "ilc_di11", "nombre": "Ratio S80/S20 de la renta disponible equivalente",
     "filtros": {"geo": ["ES", "EU27_2020"], "sex": "T", "age": "TOTAL", "unit": "RAT"}},
    {"tabla": "ilc_peps01n", "nombre": "Personas en riesgo de pobreza o exclusión social (AROPE)",
     "filtros": {"geo": ["ES", "EU27_2020"], "sex": "T", "age": "TOTAL", "unit": "PC"}},
    {"tabla": "ilc_mdsd11", "nombre": "Tasa de carencia material y social severa",
     "filtros": {"geo": ["ES", "EU27_2020"], "sex": "T", "age": "TOTAL", "unit": "PC"}},
    {"tabla": "ilc_li01", "nombre": "Umbral de riesgo de pobreza",
     "filtros": {"geo": "ES", "statinfo": "MED_EI", "rskpovth": "B_60", "unit": "EUR", "hhcomp": ["A1", "A2_2CH_LT14"]}},
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
SS_PX = "https://w6.seg-social.es/PXWeb/Resources/PX/Databases/Afiliados%20en%20alta%20laboral/"
IGAE_CN = "https://www.igae.pap.hacienda.gob.es/sitios/igae/es-ES/Contabilidad/ContabilidadNacional/Publicaciones/Documents/"
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
    # ---- Datos recientes y previsiones (desde el 20/10/2026). Si fallan, se avisa y se sigue con la copia anterior. ----
    {"fuente": "IGAE", "tabla": "igae_t_aapp", "opcional": True,
     "nombre": "Operaciones no financieras de las Administraciones públicas, trimestrales acumuladas (contabilidad nacional)",
     "url": IGAE_CN + "AAPP_Trimestral/T_AAPP.xlsx", "extension": "xlsx"},
    {"fuente": "IGAE", "tabla": "igae_a_aapp", "opcional": True,
     "nombre": "Operaciones no financieras de las Administraciones públicas, anuales (contabilidad nacional)",
     "url": IGAE_CN + "AAPP_A/A_AAPP.xlsx", "extension": "xlsx"},
    {"fuente": "IGAE", "tabla": "igae_a_aapp_imp", "opcional": True,
     "nombre": "Impuestos y cotizaciones sociales de las Administraciones públicas, anuales (contabilidad nacional)",
     "url": IGAE_CN + "AAPP_A/A_AAPP_Imp.xlsx", "extension": "xlsx"},
    # «Cómo va este año»: contabilidad nacional mensual (Estado, comunidades y Seguridad Social, sin ayuntamientos), un
    # fichero por año que se sobrescribe cada mes; se guardan los tres últimos años para comparar con el anterior.
    *[{"fuente": "IGAE", "tabla": f"igae_m_aapp_{a}", "opcional": True, "si_existe": True,
       "nombre": f"Operaciones no financieras mensuales de las administraciones sin las locales, {a} (contabilidad nacional)",
       "url": IGAE_CN + f"AAPP-M/M_CONSOLIDADO_{a}.xlsx", "extension": "xlsx"} for a in range(dt.date.today().year - 2, dt.date.today().year + 1)],
    {"fuente": "Agencia Tributaria", "tabla": "aeat_recaudacion_series", "opcional": True,
     "nombre": "Informe mensual de recaudación tributaria: series de ingresos tributarios por mes desde 1995",
     "url": "https://sede.agenciatributaria.gob.es/static_files/Sede/Tema/Estadisticas/Recaudacion_Tributaria/Informes_mensuales/Cuadros_estadisticos_series_es_es.xlsx",
     "extension": "xlsx"},
    {"fuente": "Banco de España", "tabla": "bde_be1107", "opcional": True,
     "nombre": "Deuda según el Procedimiento de Déficit Excesivo, en porcentaje del PIB (Boletín Estadístico, cuadro 11.7)",
     "url": "https://www.bde.es/webbe/es/estadisticas/compartido/datos/csv/be1107.csv", "extension": "csv"},
    {"fuente": "Comisión Europea", "tabla": "ameco16", "opcional": True,
     "nombre": "AMECO: cuentas de las administraciones públicas (previsiones de la Comisión Europea)",
     "url": "https://ec.europa.eu/economy_finance/db_indicators/ameco/documents/ameco16.zip", "extension": "zip"},
    {"fuente": "Comisión Europea", "tabla": "ameco18", "opcional": True,
     "nombre": "AMECO: deuda de las administraciones públicas (previsiones de la Comisión Europea)",
     "url": "https://ec.europa.eu/economy_finance/db_indicators/ameco/documents/ameco18.zip", "extension": "zip"},
    *[{"fuente": "FMI", "tabla": f"fmi_weo_{c.lower()}", "opcional": True,
       "nombre": f"Perspectivas de la Economía Mundial (WEO): {n}, España",
       "url": f"https://api.imf.org/external/sdmx/2.1/data/IMF.RES,WEO/ESP.{c}.A?startPeriod=2020&endPeriod=2031",
       "extension": "xml"}
      for c, n in (("GGXCNL_NGDP", "saldo de las administraciones públicas en % del PIB"),
                   ("GGXWDG_NGDP", "deuda bruta de las administraciones públicas en % del PIB"),
                   ("GGR_NGDP", "ingresos de las administraciones públicas en % del PIB"),
                   ("GGX_NGDP", "gastos de las administraciones públicas en % del PIB"))],
    # ---- La economía detrás de las cuentas (desde el 20/10/2026) ----
    *[{"fuente": "INE", "tabla": f"ine_{c.lower()}", "opcional": True, "nombre": n,
       "url": f"https://servicios.ine.es/wstempus/js/ES/DATOS_SERIE/{c}?nult=5000", "extension": "json"}
      for c, n in (("EPA387796", "EPA: ocupados (miles)"), ("EPA387800", "EPA: parados (miles)"),
                   ("EPA423474", "EPA: tasa de paro (%)"), ("EPA388079", "EPA: tasa de actividad (%)"),
                   ("EPA441060", "EPA: tasa de empleo (%)"),
                   ("IPC290750", "IPC: índice general, variación anual (%)"),
                   ("IPC292510", "IPC: subyacente, variación anual (%)"),
                   ("CNTR6654", "PIB: índice de volumen encadenado, variación anual (ajustado de estacionalidad y calendario)"),
                   ("CNTR6721", "PIB: índice de volumen encadenado, no ajustado"),
                   ("IDB53241", "Tasa de dependencia (%)"), ("IDB53262", "Tasa de dependencia de mayores de 64 años (%)"),
                   ("PROP7465", "Proyección de la tasa de dependencia (%)"),
                   ("PROP7467", "Proyección de la tasa de dependencia de mayores de 64 años (%)"))],
    {"fuente": "Seguridad Social", "tabla": "ss_afiliados_medios", "opcional": True,
     "nombre": "Afiliados medios por sexo, edad y régimen (PX-Web, 01m)",
     "url": SS_PX + "Afiliados%20Medios/01m.%20Por%20sexo,%20edad%20y%20regimen.px", "extension": "px"},
    {"fuente": "Seguridad Social", "tabla": "ss_afiliados_desest", "opcional": True,
     "nombre": "Afiliados medios desestacionalizados (PX-Web, 10mb25, desde enero de 2021)",
     "url": SS_PX + "Afiliados%20Medios/10mb25.%20Afiliados%20medios%20DESESTACIONALIZADOS%20por%20dependencia%20laboral%20y%20sector%20de%20actividad%20CNAE%2025%20(desde%20ene-21).px",
     "extension": "px"},
    {"fuente": "Seguridad Social", "tabla": "ss_afiliados_desest_09", "opcional": True,
     "nombre": "Afiliados medios desestacionalizados (PX-Web, 10mb09, de enero de 2008 a diciembre de 2025)",
     "url": SS_PX + "Afiliados%20Medios/10mb09.%20Afiliados%20medios%20DESESTACIONALIZADOS%20por%20dependencia%20laboral%20y%20sector%20de%20actividad%20CNAE%2009%20(ene-08%20a%20dic-25).px",
     "extension": "px"},
    {"fuente": "SEPE", "tabla": "sepe_paro", "opcional": True,
     "nombre": "Paro registrado por sectores, últimos diez años (datos de avance)",
     "url": "https://www.sepe.es/SiteSepe/contenidos/que_es_el_sepe/estadisticas/datos_avance/xls/empleo/evolparoseries.xls",
     "extension": "xls"},
    {"fuente": "SEPE", "tabla": "sepe_paro_2001", "opcional": True,
     "nombre": "Paro registrado por sectores, 2001 a 2016",
     "url": "https://www.sepe.es/SiteSepe/contenidos/que_es_el_sepe/estadisticas/datos_avance/xls/empleo/evolparoseries2001.xls",
     "extension": "xls"},
    *[{"fuente": "Banco de España", "tabla": f"bde_{c}", "opcional": True, "nombre": n,
       "url": f"https://www.bde.es/webbe/es/estadisticas/compartido/datos/csv/{c}.csv", "extension": "csv"}
      for c, n in (("be1309", "Deuda PDE de cada comunidad autónoma, miles de euros (Boletín Estadístico, cuadro 13.9)"),
                   ("be1310", "Deuda PDE de cada comunidad autónoma, % de su PIB (Boletín Estadístico, cuadro 13.10)"),
                   ("be1306", "Deuda PDE de las comunidades autónomas por instrumentos (Boletín Estadístico, cuadro 13.6)"))],
    *[{"fuente": "INE", "tabla": f"ine_{c.lower()}", "opcional": True, "nombre": f"Población residente (Estadística Continua de Población), {n}",
       "url": f"https://servicios.ine.es/wstempus/js/ES/DATOS_SERIE/{c}?nult=40", "extension": "json"}
      for c, n in (("ECP115502", "Andalucía"), ("ECP115501", "Aragón"), ("ECP115500", "Asturias"), ("ECP115499", "Illes Balears"),
                   ("ECP115498", "Canarias"), ("ECP115497", "Cantabria"), ("ECP115496", "Castilla y León"),
                   ("ECP115495", "Castilla-La Mancha"), ("ECP115494", "Cataluña"), ("ECP115493", "Comunitat Valenciana"),
                   ("ECP115492", "Extremadura"), ("ECP115491", "Galicia"), ("ECP115490", "Comunidad de Madrid"),
                   ("ECP115489", "Región de Murcia"), ("ECP115488", "Comunidad Foral de Navarra"), ("ECP115487", "País Vasco"),
                   ("ECP115486", "La Rioja"))],
    {"fuente": "INE", "tabla": "ine_ecv7186", "opcional": True, "nombre": "Encuesta de Condiciones de Vida: índice de Gini",
     "url": "https://servicios.ine.es/wstempus/js/ES/DATOS_SERIE/ECV7186?nult=100", "extension": "json"},
    # ---- Avales y otros pasivos contingentes (desde el 22/10/2026) ----
    *[{"fuente": "Eurostat", "tabla": t, "opcional": True, "nombre": n, "url": f"{EUROSTAT}{t}?geo=ES&lang=EN", "extension": "json"}
      for t, n in (("gov_cl_guar", "Garantías de las administraciones públicas (pasivos contingentes, Directiva 2011/85)"),
                   ("gov_10dd_guar", "Garantías de las administraciones públicas (notificación del Procedimiento de Déficit Excesivo)"),
                   ("gov_cl_ppp", "Pasivos por asociaciones público-privadas fuera del balance de las administraciones"),
                   ("gov_cl_npl", "Préstamos morosos concedidos por las administraciones públicas"),
                   ("gov_cl_liab", "Pasivos de entidades controladas por las administraciones y clasificadas fuera de ellas"))],
    {"fuente": "Banco de España", "tabla": "bde_be1208", "opcional": True,
     "nombre": "Deuda PDE del Estado y avales prestados por el Estado (Boletín Estadístico, cuadro 12.8)",
     "url": "https://www.bde.es/webbe/es/estadisticas/compartido/datos/csv/be1208.csv", "extension": "csv"},
    *[{"fuente": "Banco de España", "tabla": f"bde_{c}", "opcional": True, "nombre": n,
       "url": f"https://www.bde.es/webbe/es/estadisticas/compartido/datos/csv/{c}.csv", "extension": "csv"}
      for c, n in (("be1406", "Deuda PDE de las corporaciones locales por tipo y de los ayuntamientos de más de 300.000 habitantes (Boletín Estadístico, cuadro 14.6)"),
                   ("be1408", "Deuda PDE de las corporaciones locales, en euros y en % del PIB (Boletín Estadístico, cuadro 14.8)"))],
    {"fuente": "Ministerio de Hacienda", "tabla": "hacienda_pmp_series", "opcional": True,
     "nombre": "Periodo medio de pago a proveedores de las administraciones públicas: series mensuales desde abril de 2018 (RD 1040/2017)",
     "url": "https://www.hacienda.gob.es/cdi/pmp/pmp-series-rd-1040-2017.xlsx", "extension": "xlsx"},
    {"fuente": "INE", "tabla": "ine_padron_municipios", "opcional": True,
     "nombre": "Cifras oficiales de población de los municipios (revisión del padrón, tabla 29005)",
     "url": "https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/29005?nult=1&tip=AM", "extension": "json"},
    {"fuente": "Banco de España", "tabla": "bde_be12c", "opcional": True,
     "nombre": "Avales prestados por el Estado, por destino: otras administraciones, programas de la UE, entidades de crédito y COVID (Boletín Estadístico, cuadro 12.c)",
     "url": "https://www.bde.es/webbe/es/estadisticas/compartido/datos/csv/be12c.csv", "extension": "csv"},
    # ---- Empleo público y fondos europeos (desde el 21/10/2026) ----
    *[{"fuente": "INE", "tabla": f"ine_{c.lower()}", "opcional": True, "nombre": n,
       "url": f"https://servicios.ine.es/wstempus/js/ES/DATOS_SERIE/{c}?nult=400", "extension": "json"}
      for c, n in (("EPA416131", "EPA: asalariados del sector público, total (miles)"),
                   ("EPA416132", "EPA: asalariados del sector público en la Administración central (miles)"),
                   ("EPA416133", "EPA: asalariados del sector público en la Seguridad Social (miles)"),
                   ("EPA416134", "EPA: asalariados del sector público en las comunidades autónomas (miles)"),
                   ("EPA416135", "EPA: asalariados del sector público en la Administración local (miles)"),
                   ("EPA416136", "EPA: asalariados del sector público en empresas e instituciones públicas (miles)"),
                   ("EPA416137", "EPA: asalariados del sector público de otro tipo (miles)"),
                   ("EPA416138", "EPA: asalariados del sector público que no saben de qué administración (miles)"),
                   ("EPA450290", "EPA: asalariados del sector público, % del total de asalariados"),
                   ("EPA416424", "EPA: asalariados del sector público con contrato temporal, % del total"))],
    {"fuente": "INE", "tabla": "ine_epa_t65327", "opcional": True,
     "nombre": "EPA: asalariados por sector público o privado y comunidad autónoma (tabla 65327)",
     "url": "https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/65327?nult=4", "extension": "json"},
    *[{"fuente": "Eurostat", "tabla": t, "opcional": True, "nombre": n, "url": f"{EUROSTAT}{t}?geo=ES&lang=EN", "extension": "json"}
      for t, n in (("gov_rrf_fa", "Mecanismo de Recuperación y Resiliencia: fondos recibidos (contabilidad nacional)"),
                   ("gov_rrf_use", "Mecanismo de Recuperación y Resiliencia: en qué se han usado (contabilidad nacional)"))],
    {"fuente": "OCDE", "tabla": "ocde_idd", "opcional": True,
     "nombre": "Income Distribution Database: Gini de la renta de mercado, bruta y disponible, España",
     "url": "https://sdmx.oecd.org/public/rest/data/OECD.WISE.INE,DSD_WISE_IDD@DF_IDD,/ESP.A.INC_MRKT_GINI+INC_GROSS_GINI+INC_DISP_GINI..._T.METH2012.D_CUR.?format=csv",
     "extension": "csv"},
    *[{"fuente": "BCE", "tabla": f"bce_dwa_{k}", "opcional": True, "nombre": n,
       "url": f"https://data-api.ecb.europa.eu/service/data/DWA/Q.ES.S14._Z._Z.NWA.{c}.S.N?format=csvdata", "extension": "csv"}
      for k, c, n in (("gini", "_Z.GI", "Cuentas distributivas de la riqueza: índice de Gini de la riqueza neta (experimental)"),
                      ("top10", "T10.PT", "Cuentas distributivas de la riqueza: parte del 10 % con más riqueza (experimental)"),
                      ("bottom50", "B50.PT", "Cuentas distributivas de la riqueza: parte del 50 % con menos riqueza (experimental)"))],
    {"fuente": "BCE", "tabla": "bce_bono_10", "opcional": True,
     "nombre": "Rentabilidad de la deuda pública a 10 años, España y Alemania (criterio de convergencia, media mensual)",
     "url": "https://data-api.ecb.europa.eu/service/data/IRS/M.ES+DE.L.L40.CI.0000.EUR.N.Z?format=csvdata&detail=dataonly",
     "extension": "csv"},
    {"fuente": "Tesoro Público", "tabla": "tesoro_tipo_medio_historico", "opcional": True,
     "nombre": "Tipo de interés medio de la deuda del Estado en circulación, histórico mensual",
     "url": "https://www.tesoro.es/documents/d/tesoro/historico_t-int-medio-xlsx", "extension": "xlsx"},
    {"fuente": "Tesoro Público", "tabla": "tesoro_tipo_medio", "opcional": True,
     "nombre": "Tipo de interés medio de la deuda del Estado en circulación (último año)",
     "url": "https://www.tesoro.es/documents/d/tesoro/03-xlsx", "extension": "xlsx"},
    {"fuente": "Tesoro Público", "tabla": "tesoro_vida_media", "opcional": True,
     "nombre": "Vida media de la deuda del Estado",
     "url": "https://www.tesoro.es/documents/d/tesoro/02-xlsx", "extension": "xlsx"},
]


# Los servidores de la AIReF y del Tesoro no envían el certificado intermedio de la FNMT («AC Componentes Informáticos») y Python
# rechaza la conexión. Se añade ese intermedio (público, de http://www.cert.fnmt.es/certs/ACCOMP.crt) a los de
# confianza del sistema solo para esas descargas: la cadena se sigue verificando hasta la raíz de la FNMT.
def contexto_para(url):
    import ssl
    ctx = ssl.create_default_context()
    if urllib.parse.urlparse(url).hostname.endswith(("airef.es", "tesoro.es")):
        ctx.load_verify_locations(cafile=str(pathlib.Path(__file__).resolve().parent / "certificados" / "fnmt-ac-componentes-informaticos.pem"))
    return ctx


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
        # Si ya cambió antes el mismo día, la copia nueva lleva la huella en el nombre para no pisar la anterior
        if novedad and destino.exists() and hashlib.sha256(destino.read_bytes()).hexdigest() != huella:
            destino = destino.with_name(f"{destino.stem}-{huella[:12]}{destino.suffix}")
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

    # Las publicaciones de previsiones (AIReF, Banco de España, Gobierno) cambian de URL con cada informe: están en
    # previsiones.json, que dice de qué fichero sale cada cifra; aquí solo se guarda una copia de cada uno.
    previsiones = json.loads((pathlib.Path(__file__).resolve().parent / "previsiones.json").read_text())
    for e in previsiones["emisores"]:
        for pub in e.get("publicaciones", []):
            if pub.get("tabla"):
                PAGINAS.append({"fuente": e["nombre"], "tabla": pub["tabla"], "opcional": True, "nombre": pub["titulo"],
                                "url": pub["fichero"], "extension": pub["fichero"].rsplit(".", 1)[-1].lower()})

    # Paso «Dato» de las promesas: las series oficiales automáticas de promesas/series_datos.json (desde el 21/10/2026).
    import hashlib as hashlib_
    vistas = set()
    for m in json.loads((pathlib.Path(__file__).resolve().parent / "promesas" / "series_datos.json").read_text()):
        if m["tipo"] != "automatica":
            continue
        if m.get("ree"):
            urls = [(f"dato_ree_{a}", "https://apidatos.ree.es/es/datos/generacion/evolucion-renovable-no-renovable?"
                     f"start_date={a}-01-01T00:00&end_date={a}-12-31T23:59&time_trunc=year", "json") for a in range(2019, ahora.year)]
        else:
            urls = [("dato_" + hashlib_.sha1(u.encode()).hexdigest()[:10], u, "csv" if "format=csvfile" in u else "json")
                    for u in m["descargas"].values()]
        for tabla, u, ext in urls:
            if tabla not in vistas:
                vistas.add(tabla)
                PAGINAS.append({"fuente": m["organismo"], "tabla": tabla, "opcional": True, "url": u, "extension": ext,
                                "nombre": f"Dato de promesas: {m['nombre']}"})

    # Pensiones: el avance mensual de la Seguridad Social cambia de dirección cada mes; se busca en su página, que es fija.
    try:
        import html as html_
        import re
        pagina_pens = ("https://www.seg-social.es/wps/portal/wss/internet/EstadisticasPresupuestosEstudios/Estadisticas/"
                       "EST23/ee1edbd1-84be-4848-91b1-f2e3e840dffe")
        peticion = urllib.request.Request(pagina_pens, headers={"User-Agent": "Mozilla/5.0 (cuentas en limpio)"})
        with urllib.request.urlopen(peticion, timeout=120) as r:
            texto = r.read().decode("utf-8", errors="replace")
        m = re.search(r'href="(/wps/wcm/connect/wss/[^"?]+_Avance\+mensual\.xlsx)\?', texto)
        if m:
            PAGINAS.append({"fuente": "Seguridad Social", "tabla": "ss_pensiones_avance", "opcional": True,
                            "nombre": "Evolución mensual de las pensiones del sistema (avance mensual del INSS)",
                            "url": "https://www.seg-social.es" + html_.unescape(m.group(1)) + "?MOD=AJPERES", "extension": "xlsx"})
        else:
            print("AVISO ss_pensiones_avance: no se encontró el enlace en la página")
    except (urllib.error.URLError, TimeoutError) as error:
        print(f"AVISO ss_pensiones_avance: no se pudo leer la página ({error})")

    # Deuda viva de cada ayuntamiento (Hacienda): un fichero por año con un nombre que cambia de convención; se busca en su
    # página el del último año publicado.
    try:
        import html as html_
        import re
        pagina_dv = "https://www.hacienda.gob.es/es-ES/CDI/Paginas/SistemasFinanciacionDeuda/InformacionEELLs/DeudaViva.aspx"
        with urllib.request.urlopen(urllib.request.Request(pagina_dv, headers={"User-Agent": "Mozilla/5.0 (cuentas en limpio)"}), timeout=120) as r:
            texto = r.read().decode("utf-8", errors="replace")
        enlaces = sorted({(int(m.group(1)), html_.unescape(m.group(0))) for m in
                          re.finditer(r"/cdi/sist[^\"]*?informacioneells/(\d{4})/deuda-viva-ayuntamientos-\d{6}\.xlsx", texto, re.I)})
        if enlaces:
            año_dv, ruta_dv = enlaces[-1]
            PAGINAS.append({"fuente": "Ministerio de Hacienda", "tabla": "hacienda_deuda_viva_aytos", "opcional": True,
                            "nombre": f"Deuda viva de cada ayuntamiento a 31 de diciembre de {año_dv}",
                            "url": "https://www.hacienda.gob.es" + ruta_dv.replace(" ", "%20"), "extension": "xlsx"})
            resumen = sorted({html_.unescape(m.group(0)) for m in re.finditer(
                rf"/cdi/sist[^\"]*?informacioneells/{año_dv}/[^\"]*resumen[^\"]*\.xlsx", texto, re.I)})
            if resumen:
                PAGINAS.append({"fuente": "Ministerio de Hacienda", "tabla": "hacienda_deuda_viva_resumen", "opcional": True,
                                "nombre": f"Deuda viva de las entidades locales a 31 de diciembre de {año_dv}: resumen por tipo de entidad",
                                "url": "https://www.hacienda.gob.es" + resumen[0].replace(" ", "%20"), "extension": "xlsx"})
        else:
            print("AVISO hacienda_deuda_viva_aytos: no se encontró el enlace en la página")
    except (urllib.error.URLError, TimeoutError) as error:
        print(f"AVISO hacienda_deuda_viva_aytos: no se pudo leer la página ({error})")

    # Comunidades autónomas: un fichero por año en la IGAE y en Hacienda. Los años que aún no existen se saltan sin aviso.
    hoy_año = ahora.year
    for a in range(2000, hoy_año):
        PAGINAS.append({"fuente": "IGAE", "tabla": f"igae_ccaa_{a}", "opcional": True, "si_existe": True,
                        "nombre": f"Operaciones no financieras de las comunidades autónomas, detalle por comunidad, {a}",
                        "url": IGAE_CN + f"CCAA-A/A_CCAA_Det_{a}.xlsx", "extension": "xlsx"})
    for a in range(hoy_año - 3, hoy_año):
        PAGINAS.append({"fuente": "IGAE", "tabla": f"igae_cofog_ccaa_{a}", "opcional": True, "si_existe": True,
                        "nombre": f"Gasto de las comunidades autónomas por funciones (COFOG), detalle por comunidad, {a}",
                        "url": IGAE_CN + f"CCAA-A/COFOG_A_Detalle_CCAA_{a}.xlsx", "extension": "xlsx"})
    for a in range(2019, hoy_año - 1):
        PAGINAS.append({"fuente": "Ministerio de Hacienda", "tabla": f"hacienda_liquidacion_{a}", "opcional": True, "si_existe": True,
                        "nombre": f"Liquidación del sistema de financiación de las comunidades autónomas de régimen común, {a} (cuadros)",
                        "url": "https://www.hacienda.gob.es/cdi/sist%20financiacion%20y%20deuda/informaci%c3%b3nccaa/"
                               f"cuadros-liquidacion-{a}.xlsx", "extension": "xlsx"})

    for t in PAGINAS:
        peticion = urllib.request.Request(t["url"], headers={"User-Agent": "Mozilla/5.0 (cuentas del pais)"})
        try:
            with urllib.request.urlopen(peticion, timeout=120, context=contexto_para(t["url"])) as r:
                cuerpo = r.read()
        except (urllib.error.URLError, TimeoutError) as error:
            if not t.get("opcional"):
                raise
            if t.get("si_existe") and isinstance(error, urllib.error.HTTPError) and error.code == 404:
                continue
            print(f"AVISO {t['tabla']}: no se pudo descargar ({error}); se usa la copia anterior")
            continue
        # Una web caída a veces responde con su página de aviso en lugar del fichero: se comprueba el formato.
        firma = {"zip": b"PK", "xlsx": b"PK", "xls": b"\xd0\xcf\x11\xe0", "pdf": b"%PDF"}.get(t["extension"])
        if firma and not cuerpo.startswith(firma):
            if not t.get("opcional"):
                raise ValueError(f"{t['tabla']}: lo descargado no es un {t['extension']} (¿web caída?)")
            print(f"AVISO {t['tabla']}: lo descargado no es un {t['extension']}; se usa la copia anterior")
            continue
        huella = hashlib.sha256(cuerpo).hexdigest()
        anterior = next((m for m in reversed(manifiesto) if m["tabla"] == t["tabla"]), None)
        novedad = anterior is None or anterior["sha256"] != huella
        destino = carpeta / f"{t['tabla']}.{t['extension']}" if novedad or not (AQUI / anterior["fichero"]).exists() else AQUI / anterior["fichero"]
        # Si ya cambió antes el mismo día, la copia nueva lleva la huella en el nombre para no pisar la anterior
        if novedad and destino.exists() and hashlib.sha256(destino.read_bytes()).hexdigest() != huella:
            destino = destino.with_name(f"{destino.stem}-{huella[:12]}{destino.suffix}")
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
    # Ejecución mensual del Estado (modificaciones de crédito): el último mes publicado del año en curso y el mismo mes de
    # los tres años anteriores, para comparar. El año en curso está en imejecucionpresupuesto.aspx; los demás, en la
    # página de su año. Los ficheros se llaman «MENSUAL <MES> <AÑO>.xlsx» (algunos años, con « (EXCEL)»).
    pag_ejec = ("https://www.igae.pap.hacienda.gob.es/sitios/igae/es-ES/Contabilidad/ContabilidadPublica/CPE/"
                "EjecucionPresupuestaria/Paginas/imejecucionpresupuesto{sufijo}.aspx")

    def mensuales(sufijo):
        try:
            peticion = urllib.request.Request(pag_ejec.format(sufijo=sufijo), headers={"User-Agent": "Mozilla/5.0 (cuentas en limpio)"})
            with urllib.request.urlopen(peticion, timeout=120) as r:
                pagina = r.read().decode("utf-8", errors="replace")
        except (urllib.error.URLError, TimeoutError):
            return []
        salida = []
        for enlace in re.findall(r'href="([^"]+\.xlsx)"', pagina):
            ruta = html_.unescape(enlace)
            m = re.search(r"MENSUAL[ %20]+([A-ZÁÉÍÓÚ]+)[ %20]+(\d{4})", urllib.parse.unquote(ruta).upper())
            if m and "ANEXO" not in ruta.upper():
                url = "https://www.igae.pap.hacienda.gob.es" + urllib.parse.quote(urllib.parse.unquote(ruta), safe="/%()") if ruta.startswith("/") else ruta
                salida.append((m.group(1), int(m.group(2)), url))
        return salida
    actuales = [x for x in mensuales("") if x[1] == ahora.year] or [x for x in mensuales("") if x[1] == ahora.year - 1]
    if actuales:
        mes_ejec, año_ejec, url_ejec = actuales[0]  # la página los lista del más reciente al más antiguo
        PAGINAS_DIN.append({"fuente": "IGAE", "tabla": f"ejec_mes_{año_ejec}", "opcional": True,
                            "nombre": f"Ejecución presupuestaria del Estado hasta {mes_ejec.lower()} de {año_ejec} (modificaciones de crédito)",
                            "url": url_ejec, "extension": "xlsx"})
        for año in range(año_ejec - 3, año_ejec):
            igual = [x for x in mensuales(str(año)) if x[0] == mes_ejec and x[1] == año]
            if igual:
                PAGINAS_DIN.append({"fuente": "IGAE", "tabla": f"ejec_mes_{año}", "opcional": True,
                                    "nombre": f"Ejecución presupuestaria del Estado hasta {mes_ejec.lower()} de {año} (modificaciones de crédito)",
                                    "url": igual[0][2], "extension": "xlsx"})
    else:
        print("AVISO ejec_mes: no se encontró la ejecución mensual del año en curso")
    for t in PAGINAS_DIN:
        peticion = urllib.request.Request(t["url"], headers={"User-Agent": "Mozilla/5.0 (cuentas en limpio)"})
        try:
            with urllib.request.urlopen(peticion, timeout=120) as r:
                cuerpo = r.read()
        except (urllib.error.URLError, TimeoutError) as error:
            # Las opcionales avisan y se sigue con las demás (antes, un fallo de red aquí cortaba todas las de detrás)
            if not t.get("opcional"):
                raise
            print(f"AVISO {t['tabla']}: no se pudo descargar ({error})")
            continue
        huella = hashlib.sha256(cuerpo).hexdigest()
        anterior = next((m for m in reversed(manifiesto) if m["tabla"] == t["tabla"]), None)
        novedad = anterior is None or anterior["sha256"] != huella
        destino = carpeta / f"{t['tabla']}.{t['extension']}" if novedad or not (AQUI / anterior["fichero"]).exists() else AQUI / anterior["fichero"]
        # Si ya cambió antes el mismo día, la copia nueva lleva la huella en el nombre para no pisar la anterior
        if novedad and destino.exists() and hashlib.sha256(destino.read_bytes()).hexdigest() != huella:
            destino = destino.with_name(f"{destino.stem}-{huella[:12]}{destino.suffix}")
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
