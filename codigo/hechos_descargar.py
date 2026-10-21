"""Hechos de la XV Legislatura: lo que se publicó en el BOE y lo que pasó en el Congreso.

Guarda una copia de cada fuente bajo <datos>/hechos/ (solo pide lo nuevo) y escribe <datos>/hechos/catalogo.json con:
- normas: leyes orgánicas, leyes y reales decretos-leyes estatales (y reales decretos, para la tanda 3), del sumario
  diario del BOE, con su identificador BOE-A, rango, número, fecha y título;
- iniciativas: proyectos y proposiciones de ley del Congreso, y su ficha (B.O.E. y votaciones plenarias);
- convalidaciones de reales decretos-leyes (expedientes 130/) y votaciones enlazadas.

Fuentes: https://www.boe.es/datosabiertos/ y https://www.congreso.es/es/datos-abiertos. Sin dependencias.
"""
import collections
import datetime as dt
import html
import json
import os
import pathlib
import re
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

AQUI = pathlib.Path(os.environ.get("CUENTAS_DATOS") or pathlib.Path(__file__).resolve().parent)
DIR = AQUI / "hechos"
INICIO = dt.date(2023, 8, 17)  # sesión constitutiva de la XV Legislatura
AGENTE = {"User-Agent": "Mozilla/5.0 (cuentas en limpio)"}
CONGRESO = "https://www.congreso.es"


def pedir(url, cabeceras=None, intentos=3):
    for k in range(intentos):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={**AGENTE, **(cabeceras or {})}), timeout=90) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if k == intentos - 1:
                raise
        except (urllib.error.URLError, TimeoutError):
            if k == intentos - 1:
                raise
        time.sleep(2 + 3 * k)


# ---- BOE ----
RANGOS = (("Ley Orgánica", "LO"), ("Real Decreto-ley", "RDL"), ("Real Decreto Legislativo", "RDLEG"), ("Real Decreto", "RD"), ("Ley", "L"))
PATRON = re.compile(r"^(Ley Orgánica|Real Decreto-ley|Real Decreto Legislativo|Real Decreto|Ley) (\d+)/(\d{4}), de (\d+ de \w+)")


def sumario(dia):
    """Sección I del BOE de un día: [{id, departamento, epigrafe, titulo}], o None si no hubo BOE. Con caché."""
    ruta = DIR / "boe" / f"{dia:%Y%m%d}.json"
    reciente = (dt.date.today() - dia).days < 7
    if ruta.exists() and not reciente:
        return json.loads(ruta.read_text())
    cuerpo = pedir(f"https://www.boe.es/datosabiertos/api/boe/sumario/{dia:%Y%m%d}", {"Accept": "application/xml"})
    items = None
    if cuerpo:
        items = []
        raiz = ET.fromstring(cuerpo)
        for seccion in raiz.iter("seccion"):
            if seccion.get("codigo") != "1":
                continue
            for dep in seccion.iter("departamento"):
                for epi in dep.iter("epigrafe"):
                    for item in epi.iter("item"):
                        items.append({"id": item.findtext("identificador"), "departamento": dep.get("nombre"),
                                      "epigrafe": epi.get("nombre"), "titulo": (item.findtext("titulo") or "").strip()})
    ruta.parent.mkdir(parents=True, exist_ok=True)
    ruta.write_text(json.dumps(items, ensure_ascii=False))
    return items


def normas_estatales(hasta):
    normas, dia = {}, INICIO
    while dia <= hasta:
        for it in sumario(dia) or []:
            m = PATRON.match(it["titulo"])
            if not m:
                continue
            rango = dict(RANGOS)[m.group(1)]
            # Las leyes autonómicas también salen en la Sección I: las estatales las firma la Jefatura del Estado
            # (leyes y decretos-leyes) o un ministerio (reales decretos).
            if rango in ("L", "LO", "RDL") and it["departamento"] != "JEFATURA DEL ESTADO":
                continue
            if rango in ("RD", "RDLEG") and "COMUNIDAD" in (it["departamento"] or "").upper():
                continue
            if it["titulo"].lower().startswith(("corrección", "correccion")):
                continue
            clave = f"{rango} {int(m.group(2))}/{m.group(3)}"
            normas.setdefault(clave, {"clave": clave, "rango": rango, "numero": int(m.group(2)), "año": int(m.group(3)),
                                      "id": it["id"], "titulo": it["titulo"], "departamento": it["departamento"],
                                      "epigrafe": it["epigrafe"], "publicada": dia.isoformat(),
                                      "url": f"https://www.boe.es/diario_boe/txt.php?id={it['id']}"})
        dia += dt.timedelta(days=1)
    return normas


def detalle_boe(norma):
    """Materias y el comienzo del preámbulo de una norma (para relacionarla con promesas). Con caché."""
    ruta = DIR / "boe_doc" / f"{norma['id']}.json"
    if ruta.exists():
        return json.loads(ruta.read_text())
    cuerpo = pedir(f"https://www.boe.es/diario_boe/xml.php?id={norma['id']}")
    salida = {"materias": [], "inicio": "", "fecha_disposicion": None}
    if cuerpo:
        raiz = ET.fromstring(cuerpo)
        salida["materias"] = [m.text.strip() for m in raiz.iter("materia") if m.text]
        salida["fecha_disposicion"] = raiz.findtext(".//fecha_disposicion")
        texto = " ".join(" ".join(p.itertext()) for p in raiz.iter("p"))
        salida["inicio"] = re.sub(r"\s+", " ", texto)[:2500]
    ruta.parent.mkdir(parents=True, exist_ok=True)
    ruta.write_text(json.dumps(salida, ensure_ascii=False))
    return salida


# ---- Congreso ----
def ficheros_iniciativas():
    """Los ficheros abiertos cambian de nombre en cada actualización: se leen los enlaces de la portada."""
    portada = pedir(f"{CONGRESO}/es/opendata/iniciativas").decode("utf-8", errors="replace")
    enlaces = {}
    for href in re.findall(r'href="([^"]+?__\d+\.json)"', portada):
        nombre = href.rsplit("/", 1)[-1].split("__")[0]
        enlaces[nombre] = href if href.startswith("http") else CONGRESO + href
    return enlaces


def ficha(expediente):
    """Ficha HTML de una iniciativa: bloque B.O.E. y enlaces a sus votaciones plenarias. Con caché."""
    ruta = DIR / "fichas" / f"{expediente.replace('/', '_')}.json"
    if ruta.exists():
        guardada = json.loads(ruta.read_text())
        # Una ficha vacía (aún sin BOE ni votaciones, o que todavía no existe) se vuelve a pedir pasada una semana.
        vacia = not (guardada["normas"] or guardada["votaciones"] or guardada.get("textos"))
        if "textos" in guardada and (not vacia or time.time() - ruta.stat().st_mtime < 7 * 86400):
            return guardada
    url = (f"{CONGRESO}/es/busqueda-de-iniciativas?p_p_id=iniciativas&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view"
           f"&_iniciativas_mode=mostrarDetalle&_iniciativas_legislatura=XV&_iniciativas_id={expediente}")
    cuerpo = pedir(url)
    texto = cuerpo.decode("utf-8", errors="replace") if cuerpo else ""
    # A veces el Congreso devuelve la página sin la ficha (por ir deprisa): se reintenta una vez tras una pausa.
    if "busqueda-de-iniciativas" in url and "Tramitación seguida" not in texto and "B.O.E." not in texto and "Votaciones" not in texto:
        time.sleep(8)
        cuerpo = pedir(url)
        texto = cuerpo.decode("utf-8", errors="replace") if cuerpo else ""
    plano = html.unescape(re.sub(r"<[^>]+>", " ", texto))
    plano = re.sub(r"\s+", " ", plano)
    # La ficha no tiene un título marcado: se toma el de la norma del bloque B.O.E., si lo hay.
    tras_boe = plano[plano.find("B.O.E."):] if "B.O.E." in plano else ""
    titulo = re.search(r"((?:Ley Orgánica|Real Decreto-ley|Real Decreto|Ley) \d+/\d{4}, de [^.]+\.)", tras_boe)
    boe = re.findall(r"BOE Núm: ?(\d+) de (\d{2}/\d{2}/\d{4})", plano)
    if not titulo:
        # Sin bloque B.O.E. (por ejemplo, un decreto-ley aún sin convalidar): el título que precede al expediente.
        titulo = re.search(r"((?:Ley Orgánica|Real Decreto-ley|Real Decreto|Ley) \d+/\d{4}, de [^.]+\.) \(" + re.escape(expediente) + r"\)", plano)
    # Del Congreso no sale ningún real decreto: los que aparecen son menciones dentro del título de otra norma.
    normas = sorted(set(f"{dict(RANGOS)[r]} {int(n)}/{a}" for r, n, a in
                        re.findall(r"(Ley Orgánica|Real Decreto-ley|Real Decreto|Ley) (\d+)/(\d{4})", tras_boe[:600] or (titulo.group(1) if titulo else ""))
                        if r != "Real Decreto"))
    votaciones = sorted(set(re.findall(r"href=['\"](https?://[^'\"]*?/opendata/votaciones/Leg15/Sesion\d+/\d{8}/Votacion\d+/VOT_\d+\.json)['\"]", texto)))
    # Publicaciones en el Boletín de las Cortes, en orden: la primera es el texto presentado (con su exposición de motivos).
    textos = list(dict.fromkeys(re.findall(r"_publicaciones_id_texto=\((BOCG-15-[A-D]-[\w-]+?)\.CODI\.\)", texto)))
    salida = {"expediente": expediente, "url": url,
              "titulo": titulo.group(1).strip() if titulo else "",
              "boe": [{"numero": int(n), "fecha": f} for n, f in boe], "normas": normas, "votaciones": votaciones, "textos": textos}
    ruta.parent.mkdir(parents=True, exist_ok=True)
    ruta.write_text(json.dumps(salida, ensure_ascii=False))
    time.sleep(1.5)
    return salida


def texto_presentado(codigo, expediente):
    """Texto presentado de una iniciativa (Boletín de las Cortes, texto íntegro en HTML), desde su número de expediente
    (título y texto, con la exposición de motivos si la tiene). Vacío si esa publicación no es de la iniciativa: la
    ficha enlaza también publicaciones de otras. Con caché."""
    ruta = DIR / "bocg" / f"{codigo}.json"
    if ruta.exists():
        guardado = json.loads(ruta.read_text())
        if guardado.get("expediente") == expediente:
            return guardado["texto"]
    url = (f"{CONGRESO}/es/busqueda-de-publicaciones?p_p_id=publicaciones&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view"
           f"&_publicaciones_mode=mostrarTextoIntegro&_publicaciones_legislatura=XV&_publicaciones_id_texto=({codigo}.CODI.)")
    cuerpo = pedir(url)
    plano = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", cuerpo.decode("utf-8", errors="replace") if cuerpo else "")))
    i = plano.find(expediente)
    salida = plano[i:i + 8000] if i >= 0 else ""
    ruta.parent.mkdir(parents=True, exist_ok=True)
    ruta.write_text(json.dumps({"url": url, "expediente": expediente, "texto": salida}, ensure_ascii=False))
    time.sleep(1.5)
    return salida


def votacion(url):
    """Una votación del Pleno: totales y voto de cada diputado. Con caché."""
    m = re.search(r"Sesion(\d+)/(\d{8})/Votacion(\d+)", url)
    ruta = DIR / "votaciones" / f"{m.group(2)}_{m.group(1)}_{m.group(3)}.json"
    if ruta.exists():
        return json.loads(ruta.read_text())
    cuerpo = pedir(url)
    datos = json.loads(cuerpo.decode("utf-8-sig")) if cuerpo else None
    ruta.parent.mkdir(parents=True, exist_ok=True)
    ruta.write_text(json.dumps({"url": url, "datos": datos}, ensure_ascii=False))
    return {"url": url, "datos": datos}


def votaciones_del_dia(dia):
    """Página de votaciones de un día: [{expediente, punto, votaciones: [{si, no, abstenciones, json, pdf}]}]. Recoge
    también las votaciones sin fichero JSON (por llamamiento o por asentimiento), que las fichas no siempre enlazan."""
    ruta = DIR / "dias" / f"{dia}.json"
    if ruta.exists():
        return json.loads(ruta.read_text())
    url = (f"{CONGRESO}/es/opendata/votaciones?p_p_id=votaciones&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view"
           f"&targetLegislatura=XV&targetDate={dia[6:8]}/{dia[4:6]}/{dia[:4]}")
    t = pedir(url).decode("utf-8", errors="replace")
    anclas = list(re.finditer(r"_iniciativas_id=(\d{3}/\d{6})\"[^>]*class=\"n_exp\"", t))
    salida = []
    for k, m in enumerate(anclas):
        antes = t[anclas[k - 1].end() if k else 0:m.start()]
        despues = t[m.end():anclas[k + 1].start() if k + 1 < len(anclas) else len(t)]
        plano = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "|", antes)))
        puntos = re.findall(r"\b[IVXL]+\.\s*[|\s]*([^|]{4,120}?)\s*\|", plano)
        votos = []
        partes = re.split(r'class="result_vot"', despues)
        for k_, b in enumerate(partes[1:], 1):
            # Texto que precede al resultado: dice qué se votó (por ejemplo, «Votación de conjunto… (Pública por llamamiento)»).
            previo = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", partes[k_ - 1]))).strip()[-400:]
            n = lambda e: int(re.search(e + r":\s*(\d+)", b).group(1)) if re.search(e + r":\s*(\d+)", b) else None
            j = re.search(r"[\"'](/webpublica/opendata/votaciones/[^\"']+?\.json)[\"']", b)
            pdf = re.search(r'href="([^"]+\.PDF[^"]*)"', b)
            asent = "asentimiento" in b.lower()
            votos.append({"si": n("Si"), "no": n("No"), "abstenciones": n("Abstenciones"), "asentimiento": asent, "texto": previo,
                          "json": CONGRESO + j.group(1) if j else None, "pdf": pdf.group(1) if pdf else None})
        salida.append({"expediente": m.group(1), "punto": puntos[-1].strip() if puntos else "", "votaciones": votos})
    ruta.parent.mkdir(parents=True, exist_ok=True)
    ruta.write_text(json.dumps(salida, ensure_ascii=False))
    time.sleep(1)
    return salida


# ---- La Moncloa: referencias del Consejo de Ministros (sin datos abiertos: índice por formulario y HTML) ----
MONCLOA = "https://www.lamoncloa.gob.es"
TIPOS_CM = ("ANTEPROYECTO DE LEY ORGÁNICA", "ANTEPROYECTO DE LEY", "PROYECTO DE LEY ORGÁNICA", "PROYECTO DE LEY",
            "REAL DECRETO-LEY", "REAL DECRETO LEGISLATIVO", "REAL DECRETO", "ACUERDO", "INFORME")


def indice_moncloa(año, mes):
    """Referencias publicadas en un mes: [(url, título)]. Con caché (los dos últimos meses se vuelven a pedir)."""
    ruta = DIR / "moncloa_indice" / f"{año}{mes:02d}.json"
    hoy = dt.date.today()
    if ruta.exists() and (hoy.year * 12 + hoy.month) - (año * 12 + mes) > 1:
        return json.loads(ruta.read_text())
    base = f"{MONCLOA}/consejodeministros/referencias/Paginas/index.aspx"
    portada = pedir(base).decode("utf-8", errors="replace")
    form = {html.unescape(m.group(1)): html.unescape(m.group(2))
            for m in re.finditer(r'<input type="hidden" name="([^"]+)" id="[^"]*" value="([^"]*)"', portada)}
    pre = "ctl00$PlaceHolderMain$DisplayMode$sumarioPaginado$SummarySearchByDate$EditModePanel$"
    form.update({pre + "ddlMonth": str(mes), pre + "ddlYear": str(año), pre + "btnSearch": "Buscar"})
    import urllib.parse

    def enviar(form):
        peticion = urllib.request.Request(base, data=urllib.parse.urlencode(form).encode(),
                                          headers={**AGENTE, "Content-Type": "application/x-www-form-urlencoded"})
        with urllib.request.urlopen(peticion, timeout=90) as r:
            return r.read().decode("utf-8", errors="replace")

    h = enviar(form)
    items = re.findall(r'<a href="(/consejodeministros/referencias/Paginas/\d{4}/[^"]+\.aspx)"[^>]*title="([^"]*)"', h)
    # El índice da cinco referencias por página: los meses con un Consejo extraordinario tienen una segunda.
    pagina = 1
    while re.search(rf'name="([^"]+\$pager\$btnPage{pagina + 1})"', h) and pagina < 5:
        pagina += 1
        boton = re.search(rf'name="([^"]+\$pager\$btnPage{pagina})"', h).group(1)
        estado = {html.unescape(m.group(1)): html.unescape(m.group(2))
                  for m in re.finditer(r'<input type="hidden" name="([^"]+)" id="[^"]*" value="([^"]*)"', h)}
        for sel in re.finditer(r'<select name="([^"]+)"[^>]*>(.*?)</select>', h, re.S):
            elegido = re.search(r'<option selected="selected" value="([^"]*)"', sel.group(2))
            if elegido:
                estado[html.unescape(sel.group(1))] = elegido.group(1)
        estado[html.unescape(boton)] = str(pagina)
        time.sleep(1)
        h = enviar(estado)
        items += re.findall(r'<a href="(/consejodeministros/referencias/Paginas/\d{4}/[^"]+\.aspx)"[^>]*title="([^"]*)"', h)
    ruta.parent.mkdir(parents=True, exist_ok=True)
    ruta.write_text(json.dumps(items, ensure_ascii=False))
    time.sleep(1)
    return items


def referencia_moncloa(ruta_url, titulo):
    """Puntos del sumario de una referencia: [{fecha, ministerio, tipo, texto, url}]. Con caché."""
    m = re.match(r"(\d{1,2})/(\d{2})/(\d{4})", titulo)
    fecha = f"{m.group(3)}-{m.group(2)}-{int(m.group(1)):02d}" if m else None
    ruta = DIR / "moncloa" / (re.sub(r"[^\w.-]", "_", ruta_url.rsplit("/", 1)[-1]) + ".json")
    if ruta.exists():
        return json.loads(ruta.read_text())
    url = MONCLOA + ruta_url.replace(" ", "%20")
    cuerpo = pedir(url)
    t = cuerpo.decode("utf-8", errors="replace") if cuerpo else ""
    # El sumario va de «SUMARIO» al primer <h2> que no abre una lista de puntos (algunos ministerios van en <h2>);
    # algunas referencias no lo tienen y se toma lo anterior a la ampliación.
    i = t.find(">SUMARIO<")
    if i >= 0:
        fin = next((m.start() for m in re.finditer(r"<h2[^>]*>.*?</h2>\s*(<div[^>]*>\s*<ul|<ul)?", t[i + 10:], re.S) if not m.group(1)), None)
        seg = t[i:i + 10 + fin if fin is not None else None]
    else:
        k = t.find("AMPLIACIÓN DE CONTENIDOS")
        seg = t[:k if k > 0 else None]
    puntos, ministerio = [], None
    for trozo in re.finditer(r"<h[234][^>]*>(.*?)</h[234]>|<li[^>]*>(.*?)</li>", seg, re.S):
        if trozo.group(1) is not None:
            ministerio = html.unescape(re.sub(r"<[^>]+>", "", trozo.group(1))).strip()
            continue
        texto = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", trozo.group(2)))).strip()
        tipo = next((tp for tp in TIPOS_CM if re.search(r"(^|\. )" + tp + r"\b", texto[:400])), None)
        if tipo:
            puntos.append({"fecha": fecha, "ministerio": ministerio, "tipo": tipo, "texto": texto, "url": url})
    ruta.parent.mkdir(parents=True, exist_ok=True)
    ruta.write_text(json.dumps(puntos, ensure_ascii=False))
    time.sleep(1)
    return puntos


def ampliacion_moncloa(url):
    """Texto llano de la «ampliación de contenidos» de una referencia (lo que explica cada punto del sumario). Con caché."""
    ruta = DIR / "moncloa_ampliacion" / (re.sub(r"[^\w.-]", "_", url.rsplit("/", 1)[-1]) + ".txt")
    if ruta.exists():
        return ruta.read_text()
    cuerpo = pedir(url)
    t = cuerpo.decode("utf-8", errors="replace") if cuerpo else ""
    m = re.search(r"AMPLIACI(?:Ó|&Oacute;|&#211;)N DE CONTENIDOS", t)
    i = m.start() if m else -1
    # Una línea por bloque: los títulos de cada apartado (en mayúsculas) quedan en su propia línea.
    t = re.sub(r"</?(h[1-6]|p|li|div|br)[^>]*>", "\n", t[i:] if i >= 0 else "")
    plano = html.unescape(re.sub(r"<[^>]+>", " ", t))
    plano = "\n".join(re.sub(r"\s+", " ", x).strip() for x in plano.split("\n"))
    plano = re.sub(r"\n{2,}", "\n", plano)
    ruta.parent.mkdir(parents=True, exist_ok=True)
    ruta.write_text(plano)
    time.sleep(1)
    return plano


def consejo_de_ministros(hasta):
    puntos = []
    a, m = 2023, 8
    while (a, m) <= (hasta.year, hasta.month):
        for url, titulo in indice_moncloa(a, m):
            nuevos = referencia_moncloa(url, titulo)
            # Para los anteproyectos y proyectos, la ampliación que los explica (su sumario es solo el título).
            if any("PROYECTO" in p["tipo"] for p in nuevos):
                ampliacion_moncloa(nuevos[0]["url"])
            puntos.extend(nuevos)
        a, m = (a + 1, 1) if m == 12 else (a, m + 1)
    return puntos


def main():
    hoy = dt.date.today()
    DIR.mkdir(parents=True, exist_ok=True)
    normas = normas_estatales(hoy)
    for n in normas.values():
        n.update(detalle_boe(n))
    print(f"BOE: {sum(n['rango'] == 'LO' for n in normas.values())} LO, {sum(n['rango'] == 'L' for n in normas.values())} leyes, "
          f"{sum(n['rango'] == 'RDL' for n in normas.values())} RDL, {sum(n['rango'] == 'RD' for n in normas.values())} RD")

    # Diputados (activos y de baja) con la formación con la que se presentaron: para desglosar el Grupo Mixto.
    portada = pedir(f"{CONGRESO}/es/opendata/diputados").decode("utf-8", errors="replace")
    for nombre, destino in (("DiputadosActivos", "diputados_activos.json"), ("DiputadosDeBaja", "diputados_baja.json")):
        m = re.search(rf'href="([^"]*/{nombre}__\d+\.json)"', portada)
        if m:
            (DIR / destino).write_bytes(pedir(CONGRESO + m.group(1) if m.group(1).startswith("/") else m.group(1)).decode("utf-8-sig").encode())
    enlaces = ficheros_iniciativas()
    iniciativas = []
    for nombre in ("ProyectosDeLey", "ProposicionesDeLey"):
        filas = json.loads(pedir(enlaces[nombre]).decode("utf-8-sig"))
        (DIR / f"{nombre}.json").write_text(json.dumps(filas, ensure_ascii=False))
        for f in filas:
            exp = f["NUMEXPEDIENTE"].rsplit("/", 1)[0] if f["NUMEXPEDIENTE"].count("/") > 1 else f["NUMEXPEDIENTE"]
            iniciativas.append({"expediente": exp, "tipo": f.get("TIPO"), "objeto": f.get("OBJETO"), "autor": f.get("AUTOR"),
                                "presentada": f.get("FECHAPRESENTACION"), "resultado": f.get("RESULTADOTRAMITACION"),
                                "situacion": f.get("SITUACIONACTUAL")})
    # Fichas: de las iniciativas con resultado (aprobadas, rechazadas…), para saber su BOE y sus votaciones.
    # Fichas de todas (también las que no llegaron a ley): su BOE, sus votaciones y su texto presentado.
    for i in iniciativas:
        i["ficha"] = ficha(i["expediente"])
        if not i["ficha"]["normas"]:
            # La primera publicación de la ficha que es de esta iniciativa (la ficha enlaza también otras).
            i["texto"] = next((t for c in i["ficha"]["textos"][:4] if (t := texto_presentado(c, i["expediente"]))), "")
    # Convalidaciones de decretos-leyes: expedientes 130/ (no están en los ficheros abiertos). Se recorren hasta que falten.
    convalidaciones, n, vacias = [], 1, 0
    while vacias < 3:  # se para tras tres expedientes seguidos sin nada (un fallo suelto no corta la lista)
        f = ficha(f"130/{n:06d}")
        if not f["titulo"] and not f["votaciones"] and not f["normas"]:
            vacias += 1
        else:
            vacias = 0
            convalidaciones.append(f)
        n += 1
    print(f"Congreso: {len(iniciativas)} iniciativas, {sum(bool(i['ficha']['textos']) for i in iniciativas)} con texto en el Boletín, {len(convalidaciones)} convalidaciones")
    # Votaciones de cada día de Pleno (para las que las fichas no enlazan).
    portada_v = pedir(f"{CONGRESO}/es/opendata/votaciones").decode("utf-8", errors="replace")
    dias = re.findall(r"\d{8}", (re.search(r"var diasVotaciones = \[([^\]]*)\]", portada_v) or [None, ""])[1])
    por_dia = {d: votaciones_del_dia(d) for d in dias}
    print(f"Días de Pleno con votaciones: {len(dias)}")
    urls = {v for i in iniciativas if "ficha" in i for v in i["ficha"]["votaciones"]} | {v for c in convalidaciones for v in c["votaciones"]}
    # Todas las iniciativas, también las que no llegaron a ley (tomas en consideración, enmiendas a la totalidad…).
    nuestros = {i["expediente"] for i in iniciativas} | {c["expediente"] for c in convalidaciones}
    urls |= {v["json"] for puntos in por_dia.values() for pt in puntos if pt["expediente"] in nuestros for v in pt["votaciones"] if v["json"]}
    votos = {u: votacion(u) for u in sorted(urls)}
    print(f"Votaciones: {len(votos)}")
    cm = consejo_de_ministros(hoy)
    print(f"Consejo de Ministros: {len(cm)} puntos; {dict(collections.Counter(p['tipo'] for p in cm))}")
    (DIR / "catalogo.json").write_text(json.dumps({
        "consejo": cm,
        "generado": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "normas": sorted(normas.values(), key=lambda x: (x["publicada"], x["clave"])),
        "iniciativas": iniciativas, "convalidaciones": convalidaciones, "dias": por_dia,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
