"""Zona de contexto para modelos de lenguaje: web/llms.txt (índice) y web/contexto/*.md (un fichero por tema).

Casi todas las cifras de la web se pintan en el navegador, así que un modelo que descarga el HTML no las ve. Aquí van
escritas, con su año, unidad, fuente y enlace, y con las reglas de uso y de cita. Se genera con los mismos datos que
la web, en cada construcción (construir.py lo llama al final), así que nunca se desfasa respecto a lo publicado.

Uso suelto: python3.12 datos/contexto.py web
"""
import json
import pathlib
import sys
from datetime import date

SITIO = "https://cuentasenlimpio.es"
CITA = f"Cuentas en limpio ({SITIO})"
MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]


def n(v, d=0):
    """Número al estilo español: 1.234,5."""
    if v is None:
        return "—"
    s = f"{v:,.{d}f}"
    return s.replace(",", "§").replace(".", ",").replace("§", ".")


def mes(iso):
    a, m = iso.split("-")[:2]
    return f"{MESES[int(m) - 1]} de {a}"


def hoy_texto():
    h = date.today()
    return f"{h.day} de {MESES[h.month - 1]} de {h.year}"


def tabla(cabecera, filas):
    out = ["| " + " | ".join(cabecera) + " |", "|" + "|".join("---" for _ in cabecera) + "|"]
    out += ["| " + " | ".join(str(c) for c in f) + " |" for f in filas]
    return "\n".join(out)


def cabecera(titulo, pagina, resumen):
    return (f"# {titulo}\n\n"
            f"Parte de la zona de contexto de {CITA}. Índice: {SITIO}/llms.txt. Generado el {hoy_texto()} con los mismos datos "
            f"que la página {SITIO}/{pagina}.\n\n"
            f"**Cómo citar:** «{CITA}», con enlace a {SITIO}/{pagina} y la fecha de consulta, y además la fuente oficial que "
            "figura junto a cada dato.\n\n"
            f"{resumen}\n")


def fuentes_md(lista):
    return "\n## Fuentes\n\n" + "\n".join(f"- {t}: {u}" for t, u in lista) + "\n"


def url_tabla(aapp, clave):
    f = next((x for x in aapp["fuentes"] if x["tabla"] == clave), None)
    return (f"{f['fuente']}, {f['nombre']}", f.get("url_navegador") or f.get("url", "")) if f else (clave, "")


def comprobaciones_md(datos):
    c = datos.get("comprobaciones") or []
    if not c:
        return ""
    return ("\n## Comprobaciones automáticas de esta construcción\n\n"
            + "\n".join(f"- {'Sí' if x['ok'] else 'NO'}: {x['que']} {x.get('resultado', '')}".rstrip() for x in c) + "\n")


# ---------------------------------------------------------------------------------------------------------------------

def cuentas(D):
    a, e = D["aapp"], D["escala"]
    años, s = a["años"], a["series"]
    ult = len(años) - 1
    desde = max(0, ult - 15)
    filas = []
    for i in range(desde, ult + 1):
        prov = any(s[k]["provisional"]["corrientes"][i] for k in ("ingresos", "gastos", "saldo"))
        filas.append([años[i] if not prov else f"{años[i]} (provisional)",
                      n(s["ingresos"]["corrientes"][i]), n(s["gastos"]["corrientes"][i]), n(s["saldo"]["corrientes"][i]),
                      n(s["saldo"]["pib"][i], 1), n(s["deuda"]["corrientes"][i]), n(s["deuda"]["pib"][i], 1),
                      n(s["deuda"]["habitante"][i])])
    cd = a["cambio_deuda"]["pib"]
    filas_cd = [[años[i]] + [n(cd[k][i], 2) if cd[k][i] is not None else "—" for k in cd] for i in range(max(0, ult - 9), ult + 1)]
    ue = a["ue"]["indicadores"]
    comp_ue = tabla(["Indicador (% del PIB)", "España", "Media UE-27"],
                    [[k, n(ue[k]["ES"][-1], 1), n(ue[k]["EU27_2020"][-1], 1)] for k in ("ingresos", "gastos", "saldo", "deuda")])
    deficits = sum(1 for v in s["saldo"]["corrientes"] if v < 0)
    md = cabecera("Cuentas de las administraciones públicas: ingresos, gastos, saldo y deuda", "cuentas.html",
                  "«Administraciones públicas» es el conjunto del Estado, la Seguridad Social, las comunidades autónomas y los "
                  "ayuntamientos (sector S13 de la contabilidad nacional), sumados sin contar lo que se pasan entre ellos. "
                  "Todo en contabilidad nacional (SEC 2010), la definición europea que se usa para las reglas fiscales.")
    md += f"\n## Últimos años\n\nMillones de euros corrientes salvo donde se indica. Saldo negativo = déficit.\n\n"
    md += tabla(["Año", "Ingresos", "Gastos", "Saldo", "Saldo (% PIB)", "Deuda", "Deuda (% PIB)", "Deuda por habitante (€)"], filas)
    md += (f"\n\nEn {años[0]}–{años[ult]} hubo déficit en {deficits} de {len(años)} años. "
           "Los euros por habitante son un cálculo nuestro (dato ÷ población media de Eurostat); el resto, datos oficiales.\n")
    md += ("\n## Por qué cambió la deuda (puntos del PIB)\n\nDescomposición de la variación anual de la deuda en % del PIB: "
           "déficit primario (sin intereses), intereses, efecto del crecimiento del PIB nominal, compra o venta de activos "
           "financieros y otros ajustes. Identidad contable; la suma de componentes da la variación.\n\n")
    ETQ = {"deficit_primario": "Déficit primario", "intereses": "Intereses", "crecimiento": "Efecto del crecimiento del PIB",
           "activos": "Activos financieros", "ajustes": "Otros ajustes", "variacion": "Variación de la deuda/PIB"}
    md += tabla(["Año"] + [ETQ.get(c, c) for c in cd], filas_cd) + "\n"
    md += f"\n## España frente a la Unión Europea ({años[-1]} o último año con dato)\n\n{comp_ue}\n"
    paises = a["ue"]["paises"]
    for ind, titulo, desc in (("deuda", "Deuda", True), ("saldo", "Saldo", False)):
        x = ue[ind]
        orden = sorted([(p_, x[p_][-1]) for p_ in paises if p_ != "EU27_2020" and x.get(p_) and x[p_][-1] is not None],
                       key=lambda z: -z[1] if desc else z[1])
        pos = next(k for k, (p_, _) in enumerate(orden, 1) if p_ == "ES")
        md += (f"\n### {titulo} de los países de la UE, % del PIB ({años[-1]}), de {'más a menos deuda' if desc else 'más déficit a más superávit'}\n\n"
               f"España ocupa el puesto {pos} de {len(orden)}. Ordenación nuestra sobre los datos de Eurostat.\n\n"
               + tabla(["Puesto", "País", "% del PIB"], [[k, paises[p_], n(v, 1)] for k, (p_, v) in enumerate(orden, 1)]) + "\n")
    md += fuentes_md([url_tabla(a, t) for t in ("gov_10a_main", "gov_10dd_edpt1", "gov_10dd_edpt3", "nama_10_gdp", "nama_10_pe")])
    md += comprobaciones_md(a)
    return md


def ingresos(D):
    i, a = D["ingresos"], D["aapp"]
    partes = {p["clave"]: p for p in i["partes"]}
    años = i["años"]
    ult = len(años) - 1
    filas = [[p["nombre"], n(p["corrientes"][ult]), n(p["pib"][ult], 2), n(i["reparto"][ult].get(p["clave"]), 1)] for p in i["partes"]]
    hist = [[años[k]] + [n(i["reparto"][k].get(c), 1) for c in partes] for k in range(max(0, ult - 9), ult + 1)]
    md = cabecera("De dónde sale el dinero: impuestos, cotizaciones y otros ingresos", "ingresos.html",
                  "Ingresos de todas las administraciones públicas, por tipo. «De cada 100 €» es la parte de cada tipo en el total "
                  "de ingresos (cálculo nuestro sobre datos oficiales).")
    md += f"\n## {años[ult]}{' (provisional, IGAE)' if i.get('provisional_igae', [False])[-1] else ''}\n\n"
    md += tabla(["Tipo de ingreso", "Millones de €", "% del PIB", "De cada 100 € de ingresos"], filas)
    md += "\n\n## Evolución: de cada 100 € de ingresos\n\n" + tabla(["Año"] + [partes[c]["nombre"] for c in partes], hist) + "\n"
    md += ("\nNota: «IVA» es el código D211 de la contabilidad nacional, que incluye también el IGIC canario (unos 2.500 "
           "millones en 2025). Presión fiscal (impuestos y cotizaciones en % del PIB): ver el fichero de explicaciones, "
           "entrada «presion_fiscal», y la pregunta «¿Se pagan más impuestos en España que en el resto de Europa?».\n")
    md += fuentes_md([url_tabla(a, t) for t in ("gov_10a_taxag", "gov_10a_main", "igae_a_aapp_imp")])
    md += comprobaciones_md(i)
    return md


NIVELES = {"S1311": "Estado (Administración Central)", "S1312": "Comunidades autónomas", "S1313": "Entidades locales", "S1314": "Seguridad Social"}


def gasto(D):
    g, a = D["gasto"], D["aapp"]
    años = g["años"]
    ult = len(años) - 1
    filas = [[f["codigo"], f["nombre"], n(f["corrientes"][ult]), n(f["pib"][ult], 1), n(g["reparto"][ult][f["codigo"]], 1)]
             for f in g["funciones"]]
    filas.append(["GF0107", "de ellos, intereses de la deuda (dentro de GF01)", "—", "—", n(g["reparto"][ult]["intereses"], 2)])
    quien = g["quien"][ult]
    filas_q = [[f["codigo"], f["nombre"]] + [n(quien[f["codigo"]][nv], 1) for nv in NIVELES] for f in g["funciones"]]
    filas_q.append(["TOTAL", "Todo el gasto (sin transferencias generales entre administraciones, 01.8)"] + [n(quien["TOTAL"][nv], 1) for nv in NIVELES])
    md = cabecera("En qué se gasta: el gasto público por funciones (COFOG)", "gasto.html",
                  "Gasto de todas las administraciones públicas por funciones (clasificación COFOG de Naciones Unidas). Eurostat "
                  f"publica este desglose más tarde que los totales: el último año es {años[ult]}.")
    if g.get("desfase"):
        md += ("\n**Aviso de versiones:** " + "; ".join(f"en {d['año']} las funciones suman {n(abs(d['meur']))} millones de euros "
                                                       f"{'menos' if d['meur'] < 0 else 'más'} ({n(abs(d['pct']), 2)} %)" for d in g["desfase"]["difs"])
               + f" que el gasto total de cuentas.md: Eurostat revisó el gasto total después y el reparto por funciones aún cuadra con su "
                 f"versión del {g['desfase']['version']}. Desaparece cuando Eurostat actualice la tabla COFOG.\n")
    md += f"\n## {años[ult]}\n\nEn la columna «de cada 100 €», servicios generales (GF01) va sin intereses; los intereses aparecen aparte.\n\n"
    md += tabla(["Código", "Función", "Millones de €", "% del PIB", "De cada 100 € de gasto"], filas)
    md += (f"\n\n## Quién gasta cada función ({años[ult]}, % del gasto de esa función)\n\n"
           "Cálculo nuestro: gasto de cada nivel ÷ gasto de todas las administraciones en esa función.\n\n")
    md += tabla(["Código", "Función"] + list(NIVELES.values()), filas_q) + "\n"
    md += f"\nSerie completa por años, funciones y unidades: {SITIO}/datos/gasto.csv\n"
    md += fuentes_md([url_tabla(a, "gov_10a_exp")])
    md += comprobaciones_md(g)
    return md


def presupuesto(D):
    p = D["presupuesto"]
    filas = [[a, p["vigencia"][k]["texto"], n(p["totales"][k]["iniciales"]), n(p["totales"][k]["definitivos"]),
              n(p["totales"][k]["obligaciones"]), "avance" if p["avance"][k] else "liquidación"] for k, a in enumerate(p["años"])]
    ult = len(p["años"]) - 1
    pol = sorted([x for x in p["politicas"][ult] if not x.get("es_area")], key=lambda x: -(x["obligaciones"] or 0))[:20]
    filas_p = [[x["codigo"], x["nombre"], n(x["iniciales"]), n(x["definitivos"]), n(x["obligaciones"]),
                n(100 * x["obligaciones"] / x["definitivos"], 0) + " %" if x["definitivos"] else "—"] for x in pol]
    md = cabecera("El presupuesto del Estado: lo aprobado y lo gastado", "presupuesto.html",
                  "Solo el Estado (no comunidades, ayuntamientos ni Seguridad Social) y en criterio presupuestario, no de contabilidad "
                  "nacional: estas cifras no se pueden sumar ni comparar directamente con las de cuentas.md. Créditos iniciales = lo "
                  "aprobado; definitivos = tras las modificaciones del año; obligaciones reconocidas = lo gastado.")
    md += "\n## Totales (millones de euros)\n\n" + tabla(["Año", "Presupuesto vigente", "Iniciales", "Definitivos", "Obligaciones", "Fuente"], filas)
    md += f"\n\n## Las 20 políticas de gasto con más gasto en {p['años'][ult]} (millones de euros)\n\n"
    md += tabla(["Código", "Política", "Iniciales", "Definitivos", "Obligaciones", "Ejecutado sobre definitivos"], filas_p)
    md += f"\n\nTodas las políticas y años: {SITIO}/datos/presupuesto.csv\n"
    md += fuentes_md([("IGAE, liquidación del presupuesto del Estado y avance de ejecución", "https://www.igae.pap.hacienda.gob.es/")])
    md += comprobaciones_md(p)
    return md


def economia(D):
    e, a = D["economia"], D["aapp"]
    ep, pe = e["epa"], e["pensiones"]
    filas = [
        ["Afiliados a la Seguridad Social (media, sin estacionalidad)", n(e["afiliacion"]["desest"][-1]), mes(e["afiliacion"]["ultimo"])],
        ["Paro registrado (SEPE)", n(e["paro_registrado"]["total"][-1]), mes(e["paro_registrado"]["ultimo"])],
        ["Tasa de paro (EPA, %)", n(ep["tasa_paro"][-1], 2), ep["trimestres"][-1]],
        ["Ocupados (EPA, miles)", n(ep["ocupados"][-1], 1), ep["trimestres"][-1]],
        ["IPC general, variación anual (%)", n(e["ipc"]["general"][-1], 1), mes(e["ipc"]["meses"][-1])],
        ["IPC subyacente, variación anual (%)", n(e["ipc"]["subyacente"][-1], 1), mes(e["ipc"]["meses"][-1])],
        ["PIB real, variación interanual (%)", n(e["pib"]["interanual"][-1], 2), e["pib"]["trimestres"][-1]],
        ["Pensiones contributivas en vigor", n(pe["numero"][-1]), mes(pe["meses"][-1])],
        ["Nómina mensual de pensiones contributivas (millones de €)", n(pe["nomina"][-1] / 1e6), mes(pe["meses"][-1])],
        ["Pensión contributiva media (€/mes)", n(pe["media"][-1], 2), mes(pe["meses"][-1])],
        ["Afiliados por pensión", n(pe["afiliados_por_pension_meses"][-1], 2), mes(pe["meses"][-1])],
        ["Rentabilidad del bono a 10 años (%)", n(e["bono"]["espana"][-1], 3), mes(e["bono"]["meses"][-1])],
        ["Prima de riesgo frente a Alemania (puntos básicos)", n(e["bono"]["prima_pb"][-1]), mes(e["bono"]["meses"][-1])],
        ["Tipo de interés medio de la deuda del Estado en circulación (%)", n(e["tesoro"]["total"][-1], 3), mes(e["tesoro"]["meses"][-1])],
        ["Vida media de la deuda del Estado (años)", n(e["tesoro"]["vida_media"]["años"], 2), mes(e["tesoro"]["vida_media"]["mes"])],
        ["Mayores de 64 por cada 100 personas de 16 a 64 (dependencia)", n(e["dependencia"]["mayores"][-1], 1), e["dependencia"]["años"][-1]],
    ]
    pr = e["dependencia"]["proyeccion"]
    md = cabecera("Economía: empleo, paro, precios, pensiones, deuda en el mercado y población", "economia.html",
                  "Últimos datos de cada serie. Cada una tiene su calendario: por eso las fechas no coinciden.")
    md += "\n" + tabla(["Indicador", "Último valor", "Periodo"], filas)
    md += (f"\n\nProyección del INE de la dependencia de mayores: {n(pr['mayores'][-1], 1)} en {pr['años'][-1]} "
           f"(serie año a año en {SITIO}/economia.html).\n")
    md += ("\nCuál usar para el paro: la EPA (encuesta del INE, trimestral) es la cifra internacional; el paro registrado (SEPE) "
           "cuenta a quien se apunta en las oficinas de empleo; la afiliación cuenta empleos dados de alta en la Seguridad Social. "
           "Miden cosas distintas y no deben mezclarse.\n")
    md += fuentes_md([url_tabla(a, t) for t in ("ss_afiliados_desest", "sepe_paro", "ine_epa387796", "ine_ipc290750", "ss_pensiones_avance",
                                                 "bce_bono_10", "tesoro_tipo_medio", "tesoro_vida_media", "ine_prop7465") if url_tabla(a, t)[1]])
    md += comprobaciones_md(e)
    return md


def territorio(D):
    t = D["territorio"]
    filas = []
    for c in t["ccaa"]:
        de, du, fi = c["deficit"], c["deuda"], c.get("financiacion") or {}
        filas.append([c["nombre"], c["regimen"], f"{n(de['meur'][-1])} ({de['años'][-1]})", n(de["pib"][-1], 2),
                      f"{n(du['meur'][-1])} ({du['trimestres'][-1]})", n(du["pib"][-1], 1), n(du["estado_meur"][-1]),
                      f"{n(fi['por_hab_ajustado'][-1])} ({fi['años'][-1]})" if fi.get("por_hab_ajustado") else "— (régimen foral)"])
    md = cabecera("Comunidades autónomas: saldo, deuda y financiación", "territorio.html",
                  "Saldo y deuda de cada comunidad (contabilidad nacional, IGAE y Banco de España) y financiación del sistema común por "
                  "habitante ajustado (Ministerio de Hacienda). País Vasco y Navarra tienen régimen foral: recaudan sus impuestos y pagan "
                  "un cupo o aportación al Estado, así que no están en el sistema común de financiación. Saldo positivo = superávit.")
    md += "\n" + tabla(["Comunidad", "Régimen", "Saldo (M€, año)", "Saldo (% de su PIB)", "Deuda (M€, trimestre)", "Deuda (% de su PIB)",
                        "De ella, debida al Estado (M€)", "Financiación por habitante ajustado (€, año)"], filas)
    md += ("\n\nLa deuda «debida al Estado» son los préstamos de los mecanismos de financiación (FLA, Fondo de Facilidad Financiera y "
           "otros) desde 2012. Por qué unas comunidades deben más que otras: los datos no lo dicen por sí solos; la deuda acumula "
           "muchos años de diferencias entre gasto, ingresos y financiación recibida.\n")
    md += fuentes_md([("IGAE, cuentas de las comunidades autónomas", "https://www.igae.pap.hacienda.gob.es/"),
                      ("Banco de España, deuda de las comunidades autónomas (cuadros 13.6 a 13.10 del Boletín Estadístico)", "https://www.bde.es/webbe/es/estadisticas/"),
                      ("Ministerio de Hacienda, liquidación del sistema de financiación", "https://www.hacienda.gob.es/")])
    md += comprobaciones_md(t)
    return md


def desigualdad(D):
    d = D["desigualdad"]
    nombres = {"gini": "Gini de la renta disponible (0 = todos igual, 100 = uno lo tiene todo)",
               "gini_sin_transferencias": "Gini antes de pensiones y demás transferencias",
               "gini_solo_pensiones": "Gini contando solo las pensiones",
               "pobreza": "Riesgo de pobreza (% bajo el 60 % de la mediana)",
               "pobreza_sin_transferencias": "Riesgo de pobreza antes de transferencias",
               "pobreza_solo_pensiones": "Riesgo de pobreza contando solo pensiones",
               "s80s20": "Renta del 20 % más rico ÷ 20 % más pobre",
               "arope": "Riesgo de pobreza o exclusión social (AROPE, %)",
               "carencia": "Carencia material y social severa (%)",
               "umbral": "Umbral de pobreza, una persona (€/año)"}
    filas = [[nombres[k], d[k]["años"][-1], n(d[k]["es"][-1], 1 if k != "umbral" else 0), n(d[k]["ue"][-1], 1) if d[k]["ue"][-1] is not None else "—"]
             for k in nombres if k in d]
    r = d["riqueza"]
    md = cabecera("Desigualdad: renta, pobreza y riqueza", "desigualdad.html",
                  "Encuesta de Condiciones de Vida (INE/Eurostat): el año de la encuesta mide la renta del año anterior. «Antes de "
                  "transferencias» es lo que habría sin pensiones ni ayudas, a igualdad de todo lo demás: es una referencia contable, "
                  "no lo que pasaría si se quitaran.")
    md += "\n" + tabla(["Indicador", "Año de la encuesta", "España", "Media UE"], filas)
    md += (f"\n\nRiqueza (cuentas distributivas del BCE, experimentales), {r['trimestres'][-1]}: Gini de la riqueza neta {n(r['gini'][-1], 1)}; "
           f"el 10 % más rico tiene el {n(r['top10'][-1], 1)} % y la mitad con menos, el {n(r['bottom50'][-1], 1)} %.\n")
    md += (f"\nEn {d['reduccion_pobreza']['año']}, las ayudas distintas de las pensiones bajaron el riesgo de pobreza del "
           f"{n(d['pobreza_solo_pensiones']['es'][-1], 1)} % (contando solo pensiones) al {n(d['pobreza']['es'][-1], 1)} %: "
           f"un {n(d['reduccion_pobreza']['pct'], 1)} % menos.\n")
    md += fuentes_md([("Eurostat, ilc_di12, ilc_li02 y relacionadas (encuesta de condiciones de vida)", "https://ec.europa.eu/eurostat/databrowser/view/ilc_di12/default/table?lang=es"),
                      ("BCE, cuentas distributivas de la riqueza (DWA)", "https://data.ecb.europa.eu/data/datasets/DWA")])
    md += comprobaciones_md(d)
    return md


def mecanismos(D):
    a, e, eco, g, i = D["aapp"], D["escala"], D["economia"], D["gasto"], D["ingresos"]
    años, s = a["años"], a["series"]
    ult = len(años) - 1
    año = años[ult]
    k = e["años"].index(año)
    pib = e["pib_meur"][k]
    pob = e["poblacion"][k]
    deuda = s["deuda"]["corrientes"][ult]
    deuda_prev = s["deuda"]["corrientes"][ult - 1]
    intereses = a["cambio_deuda"]["pib"]["intereses"][ult] * pib / 100
    vida = eco["tesoro"]["vida_media"]["años"]
    tipo = eco["tesoro"]["total"][-1]
    pib_prev = e["pib_meur"][k - 1]
    g_nom = 100 * (pib / pib_prev - 1)
    r_impl = 100 * intereses / deuda_prev
    nomina_anual = eco["pensiones"]["nomina_anual"][-1] if eco["pensiones"].get("nomina_anual") else None
    año_nom = eco["pensiones"]["años"][-1] if eco["pensiones"].get("años") else None
    reparto = i["reparto"][-1]
    ing = s["ingresos"]["corrientes"][ult]
    sub = lambda frac: deuda * frac / 100
    md = cabecera("Mecanismos y órdenes de magnitud para razonar escenarios", "cuentas.html",
                  f"Valores de partida y reglas aritméticas para estimar el efecto de un cambio («¿qué pasaría si…?»), las mismas de las calculadoras de {SITIO}/escenarios.html. Todo lo de este "
                  "fichero que no es un dato copiado es una aproximación nuestra, con sus supuestos a la vista. No son previsiones: "
                  "una estimación seria debe decir siempre sus supuestos y que la realidad cambia más cosas a la vez.")
    md += "\n## Valores de partida\n\n" + tabla(["Magnitud", "Valor", "Fuente"], [
        [f"PIB nominal {año}", f"{n(pib)} millones de €", "Eurostat, nama_10_gdp"],
        [f"Población media {año}", n(pob), "Eurostat, nama_10_pe"],
        ["1 punto del PIB", f"{n(pib / 100)} millones de € ({n(pib / 100 * 1e6 / pob)} € por habitante)", "cálculo nuestro"],
        [f"Deuda de las administraciones, final de {año}", f"{n(deuda)} millones de € ({n(s['deuda']['pib'][ult], 1)} % del PIB)", "Eurostat, gov_10dd_edpt1"],
        [f"Intereses pagados {año}", f"{n(intereses)} millones de € ({n(a['cambio_deuda']['pib']['intereses'][ult], 2)} % del PIB)", "Eurostat"],
        [f"Saldo {año}", f"{n(s['saldo']['corrientes'][ult])} millones de € ({n(s['saldo']['pib'][ult], 1)} % del PIB)", "Eurostat, gov_10a_main"],
        [f"Ingresos totales {año}", f"{n(ing)} millones de €", "Eurostat, gov_10a_main"],
        ["Tipo medio de la deuda del Estado en circulación", f"{n(tipo, 3)} % ({mes(eco['tesoro']['meses'][-1])})", "Tesoro Público"],
        ["Vida media de la deuda del Estado", f"{n(vida, 2)} años ({mes(eco['tesoro']['vida_media']['mes'])})", "Tesoro Público"],
        [f"Interés implícito {año} (intereses ÷ deuda del año anterior)", f"{n(r_impl, 2)} %", "cálculo nuestro"],
        [f"Crecimiento del PIB nominal {año}", f"{n(g_nom, 1)} %", "cálculo nuestro sobre Eurostat"],
    ] + ([[f"Nómina mensual de pensiones contributivas (diciembre de {año_nom})", f"{n(nomina_anual / 1e6)} millones de €; con 14 pagas, unos {n(nomina_anual * 14 / 1e6)} millones al año", "Seguridad Social; el ×14 es cálculo nuestro"]] if nomina_anual else []))
    md += "\n\n## Reglas aproximadas\n\n"
    extra = deuda / 100  # 1 punto sobre toda la deuda
    anual = lambda años_: extra * min(años_, vida) / vida
    acumulado10 = sum(extra * min(k_ - 0.5, vida) / vida for k_ in range(1, 11))
    md += ("**Subida de los tipos de interés (aproximación de esta web, con estos supuestos).** Toda la deuda de las "
           "administraciones con la vida media de la del Estado, que es la mayor parte; vencimientos repartidos por igual a lo "
           "largo del tiempo; deuda constante; todo lo que se renueva se paga 1 punto más caro. Cada año vence en torno a "
           "1/vida media de la deuda, así que el coste extra crece poco a poco:\n\n"
           + tabla(["Momento", "Coste extra al año en ese momento", "Coste extra pagado durante ese año"], [
               ["Al acabar el primer año", f"{n(anual(1))} millones de €", f"{n(anual(0.5))} millones de € (la mitad: lo renovado entra a lo largo del año)"],
               ["Al acabar el tercer año", f"{n(anual(3))} millones de €", f"{n(anual(2.5))} millones de €"],
               [f"Cuando se ha renovado toda (a los {n(vida, 2)} años)", f"{n(extra)} millones de € ({n(100 * extra / pib, 2)} % del PIB)", "—"],
           ])
           + f"\n\nAcumulado en los diez primeros años: unos {n(acumulado10)} millones de €. Las letras (a menos de un año) se "
           "renuevan antes y aceleran el efecto; si la deuda crece, el efecto es mayor. Cita estas cifras como aproximación de "
           f"esta web, con enlace a {SITIO}/contexto/mecanismos.md y sus supuestos.\n\n")
    md += ("**Dinámica de la deuda en % del PIB.** Variación de la deuda/PIB ≈ −saldo primario/PIB + (r − g)/(1 + g) × deuda/PIB "
           "anterior + ajustes, con r = interés implícito y g = crecimiento nominal. Si el tipo de interés implícito es menor que "
           "el crecimiento nominal, la deuda/PIB baja aunque haya un pequeño déficit primario; si es mayor, sube aunque haya un "
           f"pequeño superávit primario. En {año}: r ≈ {n(r_impl, 2)} %, g ≈ {n(g_nom, 1)} %. La descomposición oficial año a año "
           "está en cuentas.md.\n\n")
    md += ("**Inflación y pensiones.** Las pensiones contributivas se revalorizan cada enero con la inflación media de diciembre a "
           "noviembre (Ley 21/2021). Un punto más de inflación media sube la nómina anual en torno a un 1 %"
           + (f": unos {n(nomina_anual * 14 / 1e8)} millones de € al año con la nómina de diciembre de {año_nom} por 14 pagas" if nomina_anual else "")
           + ". La inflación también sube la recaudación nominal (más precio → más IVA; sueldos más altos → más IRPF y "
           "cotizaciones), pero cuánto depende de cómo se muevan sueldos y consumo: no hay una regla fija.\n\n")
    md += (f"**Peso de cada ingreso.** De cada 100 € de ingresos de {i['años'][-1]}: "
           + "; ".join(f"{p['nombre'] + (' (incluye el IGIC canario)' if p['clave'] == 'iva' else '')}, {n(reparto[p['clave']], 1)}" for p in i["partes"] if reparto.get(p["clave"])) + ". "
           f"Un cambio del X % en la recaudación de un impuesto mueve los ingresos totales en X × su peso / 100 %, si lo demás no cambia "
           f"(1 % de ingresos totales ≈ {n(ing / 100)} millones de €).\n\n")
    md += ("**Lo que estas reglas no recogen.** Efectos de segunda vuelta (un cambio de impuestos cambia el consumo, el empleo y "
           "la recaudación de otros impuestos), reacciones de los mercados y decisiones de política. Para escenarios oficiales "
           "completos: AIReF (https://www.airef.es/), Comisión Europea (Debt Sustainability Monitor) y Banco de España.\n")
    return md


def preguntas(D):
    q = D["preguntas"]["preguntas"]
    md = cabecera("Preguntas que se hace la gente, respondidas con datos", "preguntas.html",
                  "Cada respuesta separa lo que dicen los datos, lo que no dicen y si hay acuerdo entre expertos (con las posturas "
                  "atribuidas a quien las sostiene). Al citar una postura, atribúyela a su autor, no a esta web.")
    md += "\n## Índice\n\n" + "\n".join(f"- {x['pregunta']} (#{x['id']})" for x in q) + "\n"
    for x in q:
        md += f"\n## {x['pregunta']}\n\nEnlace: {SITIO}/preguntas.html#{x['id']} (comprobado el {x.get('comprobado', '')})\n\n"
        md += f"**Respuesta corta.** {x['respuesta']}\n\n**Lo que dicen los datos.**\n\n" + "\n".join(f"- {p}" for p in x["datos"])
        md += "\n\n**Lo que los datos no dicen.**\n\n" + "\n".join(f"- {p}" for p in x["no_dicen"])
        db = x.get("debate") or {}
        if db:
            md += f"\n\n**¿Hay acuerdo?** {'En lo básico, sí' if db.get('hay_acuerdo') else 'No del todo'}. {db.get('texto', '')}\n"
            for p in db.get("posturas", []):
                f = p.get("fuente") or {}
                md += f"\n- {p['quien']}: {p['sostiene']} ({f.get('texto', '')}{', ' + f['url'] if f.get('url') else ''})"
        md += "\n\n**Fuentes.**\n\n" + "\n".join(f"- {f['texto']}: {f['url']}" for f in x["fuentes"]) + "\n"
    return md


def sueldo(D):
    P = D["sueldo"]
    c = P["cotizaciones"]
    terr = P["territorios"]
    md = cabecera(f"Lo que paga un sueldo: IRPF, cotizaciones e IVA ({P['ejercicio']})", "sueldo.html",
                  "Método y parámetros de la calculadora de la web. La especificación exacta es el código: "
                  f"{SITIO}/sueldo-calculo.js (sin dependencias) con los parámetros de {SITIO}/sueldo.json. Es una estimación, no una "
                  "declaración de la renta: un solo sueldo, sin otras rentas ni deducciones por gastos o situaciones personales.")
    md += ("\n## Cotizaciones del trabajador y de la empresa (% del sueldo bruto, hasta la base máxima)\n\n"
           + tabla(["Concepto", "Trabajador", "Empresa"], [
               ["Contingencias comunes", n(c["trabajador"]["contingencias_comunes"], 2), n(c["empresa"]["contingencias_comunes"], 2)],
               ["Mecanismo de Equidad Intergeneracional", n(c["trabajador"]["mei"], 2), n(c["empresa"]["mei"], 2)],
               ["Desempleo (indefinido / temporal)", f"{n(c['trabajador']['desempleo']['indefinido'], 2)} / {n(c['trabajador']['desempleo']['temporal'], 2)}",
                f"{n(c['empresa']['desempleo']['indefinido'], 2)} / {n(c['empresa']['desempleo']['temporal'], 2)}"],
               ["Formación profesional", n(c["trabajador"]["formacion"], 2), n(c["empresa"]["formacion"], 2)],
               ["FOGASA", "—", n(c["empresa"]["fogasa"], 2)],
               ["Accidentes de trabajo (supuesto: oficina)", "—", n(c["empresa"]["accidentes"], 2)]]))
    md += (f"\n\nBase máxima: {n(c['base_max_mensual'], 2)} € al mes; por encima, cotización de solidaridad por tramos. Salario mínimo "
           f"{P['ejercicio']}: {n(P['smi'])} € al año.\n")
    md += ("\n## IRPF\n\n- Régimen común (15 comunidades, Ceuta y Melilla): rendimiento neto = bruto − cotizaciones; menos 2.000 € de "
           "gastos y la reducción por rendimientos del trabajo (art. 20 LIRPF); cuota = escala(base) − escala(mínimo personal y "
           "familiar), por separado con la escala estatal y la autonómica; deducción para sueldos bajos (disposición adicional 61.ª) "
           "sobre la cuota total; Ceuta y Melilla, deducción del 60 %.\n- País Vasco (Álava, Bizkaia, Gipuzkoa): bonificación de "
           "los rendimientos del trabajo, escala foral y minoración de cuota.\n- Navarra: escala foral, deducción por mínimo "
           "personal y deducción por trabajo en cuota.\n\n")
    md += tabla(["Territorio", "Régimen", "Primer tramo", "Tipo máximo", "Norma"],
                [[t, {"comun": "común", "vasco": "foral (País Vasco)", "navarra": "foral (Navarra)"}[v["regimen"]], f"{n(v['escala'][0][1], 2)} %", f"{n(v['escala'][-1][1], 2)} %", v["norma"][:140]] for t, v in sorted(terr.items())])
    md += ("\n\nEn régimen común, la tabla muestra solo la escala autonómica; se suma a la estatal (9,5 % a 24,5 %).\n"
           "\n## IVA estimado\n\nSe supone que la persona gasta como la media de los hogares con su misma renta equivalente "
           "(Encuesta de Presupuestos Familiares 2025 del INE, escala OCDE modificada), sin alquiler imputado, con los tipos de IVA "
           "de 2026. Curva (renta equivalente media del decil → IVA como % de la renta neta):\n\n")
    md += tabla(["Renta equivalente (€/año)", "IVA / renta neta", "Gasto / renta neta"],
                [[n(r), n(100 * iv, 1) + " %", n(100 * gs, 1) + " %"] for r, iv, gs in P["iva"]["puntos"]])
    pts = P["iva"]["puntos"]

    def iva_de(neto, uc=1.0):
        req = neto / uc
        if req <= pts[0][0]:
            iv, gs = pts[0][1], pts[0][2]
        elif req >= pts[-1][0]:
            iv, gs = pts[-1][1], pts[-1][2]
        else:
            j = next(k_ for k_, p_ in enumerate(pts) if p_[0] >= req)
            f_ = (req - pts[j - 1][0]) / (pts[j][0] - pts[j - 1][0])
            iv = pts[j - 1][1] + f_ * (pts[j][1] - pts[j - 1][1])
            gs = pts[j - 1][2] + f_ * (pts[j][2] - pts[j - 1][2])
        return neto * (iv / gs if gs > 1 else iv), iv / gs if gs > 1 else iv
    e12, p12 = iva_de(18000)
    e14, p14 = iva_de(21000)
    md += ("\n\nCómo se aplica (igual que la calculadora):\n\n"
           "- La renta es el sueldo **neto anual** (después de IRPF y cotizaciones). Un sueldo «de X € netos al mes» hay que "
           "pasarlo a año: ×12 o ×14 según las pagas.\n"
           "- Renta equivalente = renta neta anual ÷ unidades de consumo. Unidades de consumo = 1 + 0,3 por cada hijo menor de 14 "
           "años (la mitad de 0,3 si se comparte con otro progenitor). Un segundo adulto no se suma: el cálculo es para la renta de "
           "una persona.\n"
           "- El porcentaje se interpola en línea recta entre los puntos de la tabla; por debajo del primero y por encima del "
           "último se usa el del extremo. Si en ese punto el gasto supera la renta, se limita el gasto a la renta.\n"
           "- En Canarias (hay IGIC, no IVA), Ceuta y Melilla (IPSI) no se calcula.\n\n"
           f"Ejemplo resuelto: persona sola con 1.500 € netos al mes. Con 12 pagas (18.000 € al año): IVA ≈ {n(100 * p12, 1)} % → "
           f"unos {n(round(e12, -1))} € al año. Con 14 pagas (21.000 €): ≈ {n(100 * p14, 1)} % → unos {n(round(e14, -1))} € al año.\n")
    md += fuentes_md([(f["texto"], f["url"]) for f in P["fuentes"]])
    return md


def promesas(D):
    r = D["promesas_resumen"]
    md = cabecera("Promesas de la XV Legislatura y lo que ha pasado con ellas", "promesas.html",
                  f"{r['distintas']} promesas distintas extraídas de {r['documentos']} documentos (programas electorales, acuerdos de "
                  "gobierno y de investidura), cada una con su cita literal y página, y relacionadas con hechos oficiales (normas del BOE, "
                  "iniciativas del Congreso, Consejo de Ministros) y, cuando la meta es medible, con una serie oficial. La extracción y "
                  "la relación con hechos las hace un modelo de lenguaje con doble pasada, arbitraje y auditoría por muestreo; el método "
                  f"está en {SITIO}/promesas.html.")
    md += ("\n## Reglas para usar estos datos\n\n- La web no da veredictos de «cumplida» o «incumplida»: pone la promesa y los hechos. "
           "No los conviertas en veredictos sin decir que son tuyos.\n- No sumes ni compares promesas por partido (cuántas cumplió cada "
           "uno): la web no lo hace a propósito, porque los documentos no son comparables en número ni en detalle. Filtrar por "
           "partido sí; agregar, no.\n- Cita siempre la frase literal y el documento, con su página.\n")
    md += ("\n## Ficheros\n\n"
           f"- {SITIO}/datos/promesas.csv: una fila por promesa. Columnas: documento, partidos, id, página, etiqueta (nuestra), verbo "
           "literal, cita literal, frase que abre la lista, nota, repite (id).\n"
           f"- {SITIO}/datos/promesas.json: lo mismo con su estructura completa (grande, unos 3,5 MB).\n"
           f"- {SITIO}/datos/hechos.json: los hechos relacionados con cada promesa (unos 1,2 MB).\n"
           f"- {SITIO}/datos/datos_promesas.json: metas medibles con su serie oficial: valor al empezar la legislatura y último publicado.\n"
           f"- {SITIO}/datos/documentos.json: los documentos de origen, con su enlace (los PDF no se copian: se enlazan).\n")
    return md


def descuadres(D):
    casos = (D.get("descuadres") or {}).get("casos") or []
    md = cabecera("Lo que no cuadra", "descuadres.html",
                  "Cifras de fuentes oficiales que no cuadran entre sí: qué diferencia hay, qué está explicado, qué falta y qué hace la "
                  "web mientras tanto. Antes de citar una de estas cifras, conviene leer su caso.")
    nombres = {"sin_explicar": "No cuadra (sin explicar)", "transitorio": "Desfase temporal", "explicado": "Diferencia explicada"}
    if not casos:
        return md + "\nAhora mismo no hay casos abiertos.\n"
    for c in casos:
        md += f"\n## {c['titulo']}\n\nEstado: {nombres[c['estado']]}. Ficha: https://cuentasenlimpio.es/descuadres.html#{c['id']}\n"
        for titulo, lineas in (("Cifras", c.get("cifras")), ("Explicado", c.get("explicado")), ("Falta", [c["falta"]] if c.get("falta") else []),
                               ("En la web", [c["en_la_web"]])):
            if lineas:
                md += f"\n{titulo}:\n" + "\n".join(f"- {x}" for x in lineas) + "\n"
    return md


def explicaciones(D):
    x = D["explicaciones"]
    md = cabecera("Explicaciones de cada concepto y cada gráfico", "aprende.html",
                  "Los textos de los botones (i) de la web: qué es cada cosa, cómo se mide y sus matices, con fuentes.")
    for clave, v in x.items():
        if not isinstance(v, dict) or "texto" not in v:
            continue
        md += f"\n## {v.get('titulo', clave)} (`{clave}`)\n\n" + "\n\n".join(v["texto"]) + "\n"
        if v.get("fuentes"):
            md += "\nFuentes: " + "; ".join(f"{f['texto']} ({f['url']})" for f in v["fuentes"]) + "\n"
    return md


def glosario(D):
    t = D["terminos"]["terminos"]
    md = cabecera("Glosario", "glosario.html", "Definiciones en lenguaje llano de las palabras técnicas que usa la web.")
    md += "\n" + "\n".join(f"- **{x['formas'][0]}**{' (' + ', '.join(x['formas'][1:]) + ')' if len(x['formas']) > 1 else ''}: {x['def']}" for x in t) + "\n"
    return md


def este_ano(D):
    e = D.get("este_ano") or {}
    md = cabecera("Cómo va este año, mes a mes", "este-ano.html",
                  "Datos provisionales y acumulados desde enero del año en curso, frente a los mismos meses del año anterior. "
                  "Solo son comparables mes con mes: cada mes trae pagos e ingresos que no se repiten igual.")
    d = e.get("deficit")
    if d:
        a, p = d["actual"], d["anterior"]
        md += (f"\n## Saldo acumulado ({d['ambito']}), enero–{d['mes_nombre']}\n\n"
               + tabla(["Concepto", f"{d['año']} (M€)", f"{d['año'] - 1} (M€)"],
                       [[k, n(a[k]), n(p[k])] for k in ("ingresos", "gastos", "intereses", "saldo")]
                       + [["saldo (% del PIB)", n(a["saldo_pib"], 2), n(p["saldo_pib"], 2)]])
               + f"\n\nFuente: IGAE, contabilidad nacional mensual (actualizada el {d['actualizado']}). Faltan los ayuntamientos.\n")
    r = e.get("recaudacion")
    if r:
        md += (f"\n## Recaudación tributaria acumulada, enero–{r['mes_nombre']} de {r['año']}\n\n{r['ambito']}.\n\n"
               + tabla(["Impuesto", f"{r['año']} (M€)", f"{r['año'] - 1} (M€)"],
                       [[i["nombre"], n(i["actual"]), n(i["anterior"])] for i in r["impuestos"]]
                       + [["Total", n(r["total"]["actual"]), n(r["total"]["anterior"])]])
               + "\n\nFuente: Agencia Tributaria, informe mensual de recaudación tributaria. No coincide con los impuestos en contabilidad nacional de cuentas.md e ingresos.md (otro criterio y otro ámbito).\n")
    return md


def seguridad_social(D):
    s = D.get("seguridad_social") or {}
    if not s:
        return cabecera("La Seguridad Social por dentro", "seguridad-social.html", "Sin datos en esta construcción.")
    p, años = s["partidas"], s["años"]
    md = cabecera("La Seguridad Social por dentro: cotizaciones, transferencias y prestaciones", "seguridad-social.html",
                  "Subsector «fondos de la Seguridad Social» (S1314) de la contabilidad nacional: incluye el sistema de la Seguridad Social "
                  "(pensiones contributivas, bajas, permisos) y el Servicio Público de Empleo Estatal (paro). No incluye las pensiones de "
                  "los funcionarios del Estado (clases pasivas). Hasta principios de los 2000 incluía también la sanidad (INSALUD): los "
                  "primeros años no son comparables sin más.")
    filas = [[a] + [n(p[k]["pib"][i], 1) for k in ("cotizaciones", "transferencias", "ingresos", "prestaciones", "gastos", "saldo", "saldo_sin_transferencias")]
             for i, a in enumerate(años) if a >= años[-1] - 15]
    md += "\n## % del PIB\n\n" + tabla(["Año", "Cotizaciones", "Transferencias recibidas", "Ingresos", "Prestaciones", "Gastos", "Saldo", "Saldo sin transferencias (cálculo nuestro)"], filas)
    md += (f"\n\nEn millones de euros, {años[-1]}: cotizaciones {n(p['cotizaciones']['meur'][-1])}, transferencias {n(p['transferencias']['meur'][-1])}, "
           f"prestaciones {n(p['prestaciones']['meur'][-1])}, saldo {n(p['saldo']['meur'][-1])}.\n")
    md += ("\nEl saldo sin transferencias no es «lo que les falta a las pensiones»: parte de esas transferencias paga gastos que la ley atribuye "
           "al Estado (por ejemplo, los complementos a mínimos). Desde 2017 el Estado también presta dinero a la Seguridad Social; los préstamos "
           "no son ingresos.\n")
    ea = s.get("este_ano")
    if ea:
        md += (f"\n## En lo que va de año: enero a {ea['mes']} de {ea['año']} frente a los mismos meses de {ea['año'] - 1} (contabilidad presupuestaria, millones de euros)\n\n"
               + tabla(["Partida", str(ea["año"]), str(ea["año"] - 1), "Variación %"], [[f["nombre"], n(f["actual"]), n(f["anterior"]), n(f["publicado"], 1)] for f in ea["filas"]])
               + (f"\n\nPréstamo del Estado previsto en el presupuesto de {ea['año']}: {n(ea['prestamo_previsto'])} M€ (no es un ingreso).\n" if ea.get("prestamo_previsto") else "\n"))
    fr = s.get("fondo_reserva")
    if fr:
        md += f"\nFondo de Reserva a final de {fr['año']}: {n(fr['meur'])} millones de euros ({fr['fuente']}, {fr['url']}).\n"
    md += fuentes_md([url_tabla(D["aapp"], "gov_10a_main")] + ([url_tabla(D["aapp"], "ss_ejecucion_mensual")] if ea else []))
    return md


def empleo_publico(D):
    s = D.get("empleo_publico") or {}
    if not s.get("epa"):
        return cabecera("El empleo público", "empleo-publico.html", "Sin datos en esta construcción.")
    e, r = s["epa"], s["remuneracion"]
    md = cabecera("El empleo público: cuánta gente trabaja en lo público y cuánto se paga", "empleo-publico.html",
                  "Personas: asalariados del sector público según la Encuesta de Población Activa (INE), incluidas las empresas públicas; es una "
                  "encuesta, con error de muestreo, y no coincide con el registro oficial de personal (BEPSAP). Sueldos: remuneración de asalariados "
                  "(D.1) de las administraciones públicas en contabilidad nacional (Eurostat), con las cotizaciones a cargo del empleador. En 2002 "
                  "el INSALUD pasó a las comunidades: la Seguridad Social casi no tiene personal en la serie de la EPA.")
    filas = [[t, n(e["total"][i], 1)] + [n(a["v"][i], 1) for a in e["admin"]] + [n(e["pct_asalariados"][i], 1), n(e["pct_temporal"][i], 1)]
             for i, t in enumerate(e["trimestres"]) if t.endswith(e["trimestres"][-1][-2:])]
    md += ("\n## Asalariados del sector público (EPA, miles; mismo trimestre de cada año)\n\n"
           + tabla(["Trimestre", "Total"] + [a["nombre"] for a in e["admin"]] + ["% de los asalariados", "% temporales"], filas))
    if s.get("ccaa"):
        c = s["ccaa"]
        md += (f"\n\n## Asalariados públicos por cada 100 asalariados, por comunidad ({c['periodo']})\n\n"
               + tabla(["Comunidad", "%"], [[f["nombre"], n(f["pct"], 1)] for f in sorted(c["filas"], key=lambda f: -f["pct"])] + [["España", n(c["total"], 1)]]))
    filas = [[a, n(r["total"]["meur"][i]), n(r["total"]["pib"][i], 1), n(r["pct_gasto"][i], 1)] + [n(r[k]["meur"][i]) for k in ("estado", "comunidades", "local", "seguridad_social")]
             for i, a in enumerate(r["años"]) if a >= r["años"][-1] - 15]
    md += ("\n\n## Remuneración de asalariados de las administraciones (D.1)\n\n"
           + tabla(["Año", "Total (M€)", "% del PIB", "% del gasto total (cálculo nuestro)", "Estado (M€)", "Comunidades (M€)", "Locales (M€)", "Seguridad Social (M€)"], filas))
    if s.get("ue"):
        md += (f"\n\n## Remuneración de asalariados públicos en % del PIB, UE ({s['ue']['año']})\n\n"
               + tabla(["País", "% del PIB"], [[p_["nombre"], n(p_["v"], 1)] for p_ in s["ue"]["paises"]])
               + "\n\nOjo al comparar: depende de cuánto presta la administración con personal propio y cuánto contrata fuera.\n")
    md += fuentes_md([url_tabla(D["aapp"], k) for k in ("ine_epa416131", "ine_epa_t65327", "gov_10a_main", "ue_gov_10a_main")])
    return md


def fondos_europeos(D):
    s = D.get("fondos_europeos") or {}
    if not s:
        return cabecera("Los fondos europeos de recuperación", "fondos-europeos.html", "Sin datos en esta construcción.")
    md = cabecera("Los fondos europeos de recuperación (Mecanismo de Recuperación y Resiliencia)", "fondos-europeos.html",
                  "Contabilidad nacional (Eurostat, gov_rrf_fa y gov_rrf_use). «Usado» es gasto ya registrado en las cuentas de las "
                  "administraciones: no coincide con lo comprometido, lo adjudicado ni lo pagado por la Comisión según su propio calendario. "
                  "Las subvenciones recibidas y aún no usadas quedan como pendiente y no mejoran el déficit hasta que se gastan. "
                  "Los préstamos hay que devolverlos.")
    u = s["usado"]
    filas = [[a, n(s["recibido"]["subvenciones"][i]), n(s["recibido"]["prestamos"][i]), n(u["total"][i]), n(u["inversion"][i]),
              n(u["transferencias_capital"][i]), n(u["corriente"][i])] for i, a in enumerate(s["años"])]
    md += "\n## Millones de euros\n\n" + tabla(["Año", "Subvenciones recibidas", "Préstamos recibidos", "Subvenciones usadas", "de ellas: inversión directa",
                                               "ayudas a la inversión", "gasto corriente"], filas)
    ac = s["acumulado"]
    md += (f"\n\nAcumulado {s['años'][0]}–{s['años'][-1]} (cálculo nuestro): subvenciones recibidas {n(ac['subvenciones_recibidas'])} M€, usadas "
           f"{n(ac['subvenciones_usadas'])} M€, pendientes {n(ac.get('pendiente'))} M€; préstamos recibidos {n(ac['prestamos_recibidos'])} M€.\n")
    md += fuentes_md([url_tabla(D["aapp"], k) for k in ("gov_rrf_fa", "gov_rrf_use")])
    return md


def avales(D):
    s = D.get("avales") or {}
    if not s.get("avales"):
        return cabecera("Avales y otros riesgos", "avales.html", "Sin datos en esta construcción.")
    av, u = s["avales"], s["avales"]["ultimo"]
    md = cabecera("Avales del Estado y otros pasivos contingentes", "avales.html",
                  "Avales: saldo vivo de los avales concedidos por el Estado (Banco de España, Boletín Estadístico, cuadros 12.8 y 12.c; datos del "
                  "Tesoro). Un aval no es deuda: solo cuesta si se ejecuta. Las garantías de Eurostat (gov_cl_guar) dan otra cifra por otras "
                  "reglas (sin avales a unidades de las AAPP ni a la FEEF, con la garantía al ICO); cuadran con el Banco de España hasta 2020, "
                  "pero desde 2021 queda una diferencia sin explicar, así que no se comparan. Otros pasivos contingentes (Eurostat, Directiva "
                  "2011/85) solo desde 2021: los años anteriores vienen de ediciones con otros criterios (hasta 2020 incluían Bankia).")
    md += (f"\n## Avales del Estado a final de año\n\n"
           + tabla(["Año", "Millones de euros", "% del PIB"], [[a, n(av["meur"][i]), n(av["pib"][i], 1)] for i, a in enumerate(av["años"])]))
    md += (f"\n\nÚltimo dato ({u['mes']} de {u['año']}): {n(u['meur'])} M€; programas de la UE {n(u['partes']['ue'])}, líneas COVID del ICO "
           f"{n(u['partes']['covid'])}, otras administraciones {n(u['partes']['otras_aapp'])}, entidades de crédito {n(u['partes']['credito'])}.\n")
    ds = av["desglose"]
    md += ("\n## Avales por destino (millones de euros, diciembre)\n\n"
           + tabla(["Año", "Entidades de crédito", "Programas UE", "Otras AAPP", "COVID (ICO)", "Otros (cálculo nuestro)"],
                   [[a, n(ds["credito"][i]), n(ds["ue"][i]), n(ds["otras_aapp"][i]), n(ds["covid"][i]), n(ds["resto"][i])] for i, a in enumerate(ds["años"])]))
    if s.get("morosos"):
        a_ = s["morosos"]["años"]
        def de(b, k):
            return [n(b[k][b["años"].index(a)]) if a in b["años"] else "—" for a in a_]
        filas = [["Préstamos impagados de las AAPP (incluye la Sareb)"] + de(s["morosos"], "S13"),
                 ["Asociaciones público-privadas fuera del balance"] + de(s["ppp"], "S13"),
                 ["Pasivos de empresas públicas fuera de las AAPP (sin consolidar)"] + de(s["empresas"], "total"),
                 ["  de ellas, no financieras con pérdidas"] + de(s["empresas"], "con_perdidas")]
        md += "\n\n## Otros pasivos contingentes (millones de euros)\n\n" + tabla(["Partida"] + [str(a) for a in a_], filas) + "\n"
    md += fuentes_md([url_tabla(D["aapp"], k) for k in ("bde_be12c", "bde_be1208", "gov_cl_npl", "gov_cl_ppp", "gov_cl_liab")])
    return md


def deuda_local(D):
    s = D.get("deuda_local") or {}
    if not s.get("serie"):
        return cabecera("La deuda de los ayuntamientos", "deuda-local.html", "Sin datos en esta construcción.")
    se, mu = s["serie"], s.get("municipios") or {}
    md = cabecera("La deuda de las entidades locales (ayuntamientos, diputaciones, cabildos)", "deuda-local.html",
                  "Deuda PDE (la misma definición que la de todas las administraciones) de las corporaciones locales: serie del Banco de "
                  "España (Boletín Estadístico, cuadros 14.6 y 14.8). Cada ayuntamiento: deuda viva de Hacienda, conciliada con el Banco de "
                  "España el día en que se publica; el Banco de España revisa después la serie y la suma de Hacienda puede quedar algo por "
                  "debajo o por encima. Población: cifras oficiales del padrón (INE). No incluye las empresas municipales de mercado.")
    md += "\n## Deuda de las entidades locales a final de año\n\n" + tabla(["Año", "Millones de euros", "% del PIB"],
                                                                         [[a, n(se["meur"][i]), n(se["pib"][i], 1)] for i, a in enumerate(se["años"])])
    rp = se["reparto"]
    md += (f"\n\n## Por tipo de entidad ({rp['año']}, millones de euros)\n\n"
           + tabla(["Tipo", "Millones de euros"], [["Ayuntamientos capitales de provincia", n(rp["capitales"], 1)], ["Resto de ayuntamientos (con mancomunidades y entidades menores)", n(rp["no_capitales"], 1)],
                                                    ["Diputaciones forales", n(rp["diputaciones_forales"], 1)], ["Diputaciones de régimen común", n(rp["diputaciones_comun"], 1)],
                                                    ["Consejos y cabildos insulares", n(rp["consejos_cabildos"], 1)], ["Ceuta y Melilla", n(rp["ciudades_autonomas"], 1)]]))
    if mu:
        md += (f"\n\n## Ayuntamientos ({mu['año']})\n\n{n(mu['n'])} ayuntamientos; {n(mu['sin_deuda'])} sin deuda a 31 de diciembre. Deuda de todos "
               f"(Hacienda): {n(mu['total'], 1)} M€, de ellos {n(mu['conciliacion'], 1)} M€ sin repartir («diferencias de conciliación con el Banco de España»). "
               f"La deuda de cada municipio, con su población, está en https://cuentasenlimpio.es/datos/municipios.json "
               f"([código INE, nombre, provincia, deuda en miles de euros, habitantes]).\n\n"
               + tabla(["Ciudad de más de 300.000 habitantes", "Millones de euros", "€ por habitante (cálculo nuestro)"],
                       [[c["nombre"], n(c["meur"], 1), n(c["habitante"])] for c in mu["ciudades"]]))
    md += "\n" + fuentes_md([url_tabla(D["aapp"], k) for k in ("bde_be1408", "bde_be1406", "hacienda_deuda_viva_aytos", "ine_padron_municipios")])
    return md


def pago_proveedores(D):
    s = D.get("pmp") or {}
    if not s.get("subsectores"):
        return cabecera("El pago a proveedores", "pago-proveedores.html", "Sin datos en esta construcción.")
    md = cabecera("El periodo medio de pago a proveedores de las administraciones", "pago-proveedores.html",
                  "Días que tardan de media en pagar las facturas comerciales desde que se aprueban, contando las pendientes (Ministerio de "
                  "Hacienda, método del RD 1040/2017, desde abril de 2018). Máximo legal: 30 días. Los importes del fichero van en euros "
                  "aunque su cabecera diga miles. La media de doce meses es un cálculo nuestro, ponderada por lo pagado y lo pendiente. "
                  "Los meses en que el fichero no casa consigo mismo no entran en las medias (ver descuadres.md).")
    filas = []
    for x in s["subsectores"]:
        k = max(i for i, v in enumerate(x["v"]) if v is not None)
        filas.append([x["nombre"], x["periodos"][k], n(x["v"][k], 1), n(x["pendiente_meur"])])
    md += "\n## Por subsector (último mes)\n\n" + tabla(["Subsector", "Mes", "Días", "Facturas pendientes (M€)"], filas)
    md += (f"\n\n## Comunidades autónomas ({s['ccaa']['periodo']})\n\n"
           + tabla(["Comunidad", "Días en el mes", "Media 12 meses"], [[f["nombre"], n(f["ultimo"], 1), n(f["media12"], 1)] for f in sorted(s["ccaa"]["filas"], key=lambda f: f["nombre"])]))
    md += (f"\n\n## Grandes ayuntamientos y diputaciones ({s['locales']['periodo']})\n\n"
           + tabla(["Entidad", "Días en el mes", "Media 12 meses"], [[f["nombre"], n(f["ultimo"], 1), n(f["media12"], 1)] for f in sorted(s["locales"]["filas"], key=lambda f: f["nombre"])]))
    md += "\n" + fuentes_md([url_tabla(D["aapp"], "hacienda_pmp_series")])
    return md


def modificaciones(D):
    s = D.get("modificaciones") or {}
    if not s:
        return cabecera("Cambios del presupuesto durante el año", "modificaciones.html", "Sin datos en esta construcción.")
    t = s["totales"]
    md = cabecera("Cómo cambia el presupuesto del Estado durante el año (modificaciones de crédito)", "modificaciones.html",
                  f"Modificaciones de crédito del Estado acumuladas de enero a {s['mes']} (IGAE, ejecución presupuestaria mensual; "
                  "contabilidad presupuestaria, no nacional). Un crédito es un permiso para gastar, no un gasto. Las transferencias "
                  "dicen de qué ministerio sale el dinero y a cuál llega, no a qué gasto concreto va. Sin valoración.")
    md += (f"\n## {s['año']}, hasta {s['mes']}\n\nPresupuesto al empezar el año: {n(t['iniciales'])} M€; modificaciones: {n(t['modificaciones'])} M€; "
           f"crédito actual: {n(t['definitivos'])} M€.\n\n## Por tipo, mismos meses de cada año (M€)\n\n"
           + tabla(["Tipo"] + [str(x["año"]) for x in s["anteriores"]],
                   [[tp["nombre"]] + [n(x["tipos"][tp["clave"]]) for x in s["anteriores"]] for tp in s["tipos"]]
                   + [["Total"] + [n(x["modificaciones"]) for x in s["anteriores"]], ["Presupuesto al empezar"] + [n(x["iniciales"]) for x in s["anteriores"]]]))
    md += ("\n\n## Por ministerio (sección), M€\n\n"
           + tabla(["Sección (nombre abreviado de la IGAE)", "Al empezar", "Cambio", "Transferencias recibidas", "Transferencias cedidas", "Ahora"],
                   [[x["nombre"], n(x["iniciales"]), n(x["modificaciones"]), n(x["tipos"]["transf_mas"]), n(x["tipos"]["transf_menos"]), n(x["definitivos"])]
                    for x in sorted(s["secciones"], key=lambda x: -x["modificaciones"])]))
    md += ("\n\n## Por política de gasto, M€ (las áreas en mayúsculas)\n\n"
           + tabla(["Política", "Al empezar", "Cambio", "Ahora"], [[x["nombre"], n(x["iniciales"]), n(x["modificaciones"]), n(x["definitivos"])] for x in s["politicas"]]))
    md += "\n" + fuentes_md([url_tabla(D["aapp"], k) for k in s["tablas"]])
    return md


FICHEROS = [
    ("cuentas", cuentas, "Ingresos, gastos, saldo (déficit) y deuda de todas las administraciones; por qué cambia la deuda; España frente a la UE."),
    ("este-ano", este_ano, "El año en curso, mes a mes: déficit acumulado y recaudación frente a los mismos meses del año anterior."),
    ("seguridad-social", seguridad_social, "La Seguridad Social por dentro desde 1995: cotizaciones, transferencias del Estado, prestaciones y saldo."),
    ("empleo-publico", empleo_publico, "Empleo público: asalariados del sector público por administración (EPA) y lo que se paga en sueldos públicos, con la comparación europea."),
    ("descuadres", descuadres, "Lo que no cuadra: cifras oficiales que no coinciden entre fuentes, con lo explicado y lo pendiente. Leer antes de citar las cifras afectadas."),
    ("modificaciones", modificaciones, "Cómo cambia el presupuesto del Estado durante el año: modificaciones de crédito por tipo, ministerio y política, frente a los mismos meses de años anteriores."),
    ("pago-proveedores", pago_proveedores, "Periodo medio de pago a proveedores desde 2018: subsectores, comunidades autónomas y grandes ayuntamientos y diputaciones."),
    ("deuda-local", deuda_local, "Deuda de ayuntamientos, diputaciones y cabildos desde 1995, por tipo de entidad, grandes ciudades y enlace a la deuda de cada municipio."),
    ("avales", avales, "Avales del Estado desde 1995 por destino y otros pasivos contingentes (préstamos impagados, asociaciones público-privadas, empresas públicas)."),
    ("fondos-europeos", fondos_europeos, "Los fondos europeos de recuperación: subvenciones y préstamos recibidos y en qué se han usado, según la contabilidad nacional."),
    ("ingresos", ingresos, "De dónde sale el dinero: impuestos, cotizaciones y otros ingresos, por tipo y año."),
    ("gasto", gasto, "En qué se gasta (funciones COFOG) y qué nivel de administración gasta cada cosa."),
    ("presupuesto", presupuesto, "El presupuesto del Estado: aprobado, modificado y gastado, por política de gasto."),
    ("economia", economia, "Empleo, paro, inflación, PIB, pensiones, bono a 10 años, prima de riesgo, tipo medio y vida media de la deuda, envejecimiento."),
    ("territorio", territorio, "Comunidades autónomas: saldo, deuda (y la debida al Estado) y financiación por habitante."),
    ("desigualdad", desigualdad, "Gini, pobreza, efecto de pensiones y transferencias, riqueza."),
    ("mecanismos", mecanismos, "Valores de partida y reglas aritméticas para razonar escenarios («¿qué pasaría si…?»): tipos de interés, dinámica de la deuda, inflación y pensiones, peso de cada impuesto."),
    ("preguntas", preguntas, "Ocho preguntas frecuentes (pensiones, empleados públicos, a quién se debe, quién paga la deuda, intereses, reglas europeas, presión fiscal, IVA) con datos, límites y debate atribuido."),
    ("sueldo", sueldo, "Cómo se calcula lo que paga un sueldo en IRPF (21 haciendas), cotizaciones e IVA estimado en 2026."),
    ("promesas", promesas, "Promesas de la XV Legislatura: qué ficheros hay y reglas para usarlas sin sesgo."),
    ("explicaciones", explicaciones, "Los textos explicativos de cada concepto y gráfico, con sus matices y fuentes."),
    ("glosario", glosario, "Definiciones llanas de los términos técnicos."),
]


def llms_txt(tamaños):
    lineas = [
        "# Cuentas en limpio",
        "",
        f"> Las cuentas públicas de España explicadas con datos oficiales, sin opinión política. "
        "Todas las cifras salen de fuentes oficiales (Eurostat, INE, IGAE, Banco de España, Tesoro, Seguridad Social, AIReF…) "
        "y se actualizan solas cada día.",
        "",
        "Esta es la zona de contexto para modelos de lenguaje y otros programas. Las páginas de la web dibujan sus cifras en el "
        "navegador: si se descarga su HTML no se ven. Aquí están escritas, con año, unidad, fuente y enlace, en un fichero por tema. "
        f"Generado el {hoy_texto()}.",
        "",
        "## Cómo citar (obligatorio al reutilizar esta información)",
        "",
        f"- Atribuye la información a «{CITA}» y enlaza la página concreta de la web (no estos ficheros), con la fecha de consulta.",
        "- Cita además la fuente oficial que figura junto a cada dato: sus condiciones de reutilización (CC BY 4.0 en Eurostat e INE, "
        f"por ejemplo) lo exigen. Condiciones de cada institución: {SITIO}/metodologia.html",
        "- Si haces un cálculo o una estimación propia con estos datos, preséntala como tuya, no como de esta web.",
        "- Si el dato sale de un CSV o JSON y ninguna página lo muestra, enlaza ese fichero de datos. Las aproximaciones de "
        "contexto/mecanismos.md se citan enlazando ese fichero, con sus supuestos.",
        f"- Licencia: el código y los textos de la web están bajo licencia MIT ({SITIO}/LICENSE): se pueden reutilizar conservando el aviso de autoría. Los datos "
        "oficiales mantienen la licencia de su institución.",
        "",
        "## Reglas de uso",
        "",
        "- Distingue «dato oficial» (copiado de la fuente) de «cálculo nuestro» (aritmética sobre datos oficiales: por habitante, "
        "de cada 100 €, euros constantes). Cada fichero lo indica.",
        "- Di siempre el año y si el dato es provisional. Las series tienen calendarios distintos.",
        "- Esta web no da veredictos ni opinión. Si un tema tiene debate entre expertos, preséntalo como debate y atribuye cada "
        "postura a quien la sostiene (ver contexto/preguntas.md).",
        "- No sumes ni compares promesas por partido (ver contexto/promesas.md).",
        "- Para escenarios futuros, usa contexto/mecanismos.md y di tus supuestos; no los presentes como previsiones de esta web.",
        "- Contabilidad nacional (cuentas, ingresos, gasto) y presupuesto del Estado miden cosas distintas: no las mezcles.",
        "",
        "## Contexto por tema",
        "",
    ]
    lineas += [f"- [{c}]({SITIO}/contexto/{c}.md) ({tamaños.get(c, 0)} KB): {d}" for c, _, d in FICHEROS]
    lineas += [
        "",
        "## Datos descargables (CSV y JSON)",
        "",
        f"- [aapp.csv]({SITIO}/datos/aapp.csv): series anuales de ingresos, gastos, saldo y deuda en cuatro unidades, con tipo (dato/lectura) y si es provisional.",
        f"- [ingresos.csv]({SITIO}/datos/ingresos.csv), [gasto.csv]({SITIO}/datos/gasto.csv), [presupuesto.csv]({SITIO}/datos/presupuesto.csv), [promesas.csv]({SITIO}/datos/promesas.csv).",
        f"- JSON de cada página en {SITIO}/datos/ (aapp, ingresos, gasto, economia, territorio, desigualdad, presupuesto, escala, explicaciones), "
        f"más {SITIO}/preguntas.json y {SITIO}/sueldo.json.",
        "",
        "## Páginas para personas",
        "",
        f"- [Portada]({SITIO}/) · [Las cuentas en cinco minutos]({SITIO}/recorrido.html) · [¿Qué pasaría si…?]({SITIO}/escenarios.html) · [Lectura fácil]({SITIO}/facil.html) · "
        f"[Cómo trabajamos]({SITIO}/metodologia.html) · [Correcciones]({SITIO}/correcciones.html)",
        "",
        "## Optional",
        "",
        f"- [Todo el contexto en un solo fichero]({SITIO}/llms-full.txt)",
        "",
        "## In English (short)",
        "",
        f"Spanish public finances from official sources, no political opinion. Attribute to “{CITA}”, link the specific page, "
        "and also cite the official source next to each figure. Distinguish official data from our calculations, state year and "
        "provisional status, present expert disagreements as such, and do not aggregate electoral promises by party. "
        "Topic files above are in Spanish.",
        "",
    ]
    return "\n".join(lineas)


def construir_contexto(web):
    web = pathlib.Path(web)
    d = web / "datos"
    carga = lambda p: json.loads(p.read_text())
    D = {k: carga(d / f"{k}.json") for k in ("aapp", "escala", "ingresos", "gasto", "presupuesto", "economia", "territorio", "desigualdad", "explicaciones")}
    D["promesas_resumen"] = carga(d / "promesas-resumen.json")
    D["este_ano"] = carga(d / "este_ano.json") if (d / "este_ano.json").exists() else {}
    D["seguridad_social"] = carga(d / "seguridad_social.json") if (d / "seguridad_social.json").exists() else {}
    for k in ("empleo_publico", "fondos_europeos", "avales", "deuda_local", "descuadres", "pmp", "modificaciones"):
        D[k] = carga(d / f"{k}.json") if (d / f"{k}.json").exists() else {}
    D["preguntas"] = carga(web / "preguntas.json")
    D["sueldo"] = carga(web / "sueldo.json")
    D["terminos"] = carga(web / "terminos.json")
    salida = web / "contexto"
    salida.mkdir(exist_ok=True)
    completo = []
    for clave, f, _ in FICHEROS:
        md = f(D)
        (salida / f"{clave}.md").write_text(md)
        completo.append(md)
    indice = llms_txt({c: max(1, round(len(md.encode()) / 1024)) for (c, _, _), md in zip(FICHEROS, completo)})
    (web / "llms.txt").write_text(indice)
    (web / "llms-full.txt").write_text(indice + "\n\n---\n\n" + "\n\n---\n\n".join(completo))
    print(f"contexto: llms.txt, llms-full.txt y {len(FICHEROS)} ficheros en web/contexto "
          f"({sum(len(x) for x in completo) // 1024} KB)")


if __name__ == "__main__":
    construir_contexto(sys.argv[1] if len(sys.argv) > 1 else pathlib.Path(__file__).resolve().parents[1] / "web")
