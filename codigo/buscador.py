"""Índice del buscador de la web: web/datos/buscador.json.

Junta en una lista lo que se puede buscar: cada página y cada apartado con título (su enlace con ancla), las palabras
del glosario con su definición, las preguntas y las explicaciones de los botones (i), con la página donde salen. El
buscador (web/buscar.js) compara sin tildes ni mayúsculas. Se rehace en cada construcción (construir.py lo llama al
final), así que siempre recoge lo publicado.

Uso suelto: python3.12 datos/buscador.py web
"""
import html
import json
import pathlib
import re
import sys
from html.parser import HTMLParser

# Páginas que no se indexan: la propia del buscador
FUERA = {"buscar.html"}


class Titulos(HTMLParser):
    """Saca el h1, la primera respuesta y cada h2/h3 con id de una página."""

    def __init__(self):
        super().__init__()
        self.h1 = ""
        self.respuesta = ""
        self.descripcion = ""
        self.apartados = []  # (id, texto)
        self._en = None
        self._id = None
        self._buf = []
        self._en_boton = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "meta" and a.get("name") == "description":
            self.descripcion = a.get("content", "")
        if tag in ("h1", "h2", "h3") and self._en is None:
            self._en, self._id, self._buf = tag, a.get("id"), []
        elif tag == "p" and self._en is None and "respuesta" in (a.get("class") or "") and not self.respuesta:
            self._en, self._id, self._buf = "p", None, []
        if tag == "button":
            self._en_boton = True

    def handle_endtag(self, tag):
        if tag == "button":
            self._en_boton = False
        if tag == self._en:
            texto = re.sub(r"\s+", " ", "".join(self._buf)).strip()
            if tag == "h1" and not self.h1:
                self.h1 = texto
            elif tag == "p":
                self.respuesta = texto
            elif self._id and texto:
                self.apartados.append((self._id, texto))
            self._en = None

    def handle_data(self, data):
        if self._en and not self._en_boton:
            self._buf.append(data)


def construir_buscador(web):
    web = pathlib.Path(web)
    entradas = []
    paginas = {}
    for p in sorted(web.glob("*.html")):
        if p.name in FUERA:
            continue
        t = Titulos()
        t.feed(p.read_text())
        titulo = t.h1 or p.stem
        paginas[p.name] = titulo
        tipo = "Lectura fácil" if p.name.startswith("facil") else "Página"
        entradas.append({"k": tipo, "t": titulo, "d": t.respuesta or t.descripcion, "u": p.name})
        for ancla, texto in t.apartados:
            entradas.append({"k": "Apartado", "t": texto, "d": titulo, "u": f"{p.name}#{ancla}"})
    # Palabras del glosario
    terminos = json.loads((web / "terminos.json").read_text())["terminos"]
    for x in terminos:
        entradas.append({"k": "Palabra", "t": x["formas"][0][0].upper() + x["formas"][0][1:], "d": x["def"],
                         "u": f"glosario.html#{x['glosario']}" if x.get("glosario") else "glosario.html",
                         "x": " ".join(x["formas"][1:])})
    # Preguntas
    pregs = json.loads((web / "preguntas.json").read_text())["preguntas"]
    for q in pregs:
        entradas.append({"k": "Pregunta", "t": q["pregunta"], "d": q["respuesta"], "u": f"preguntas.html#{q['id']}",
                         "x": " ".join(q["datos"])})
    # Explicaciones de los botones (i): la página donde está el botón
    expl = json.loads((web / "datos" / "explicaciones.json").read_text()) if (web / "datos" / "explicaciones.json").exists() else {}
    donde = {}
    for p in web.glob("*.html"):
        for clave in re.findall(r'data-info="([^"]+)"', p.read_text()):
            donde.setdefault(clave, p.name)
    for clave, v in expl.items():
        if isinstance(v, dict) and "texto" in v:
            primero = v["texto"][0] if v["texto"] else ""
            entradas.append({"k": "Explicación", "t": v.get("titulo", clave), "d": primero,
                             "u": donde.get(clave, "aprende.html"), "x": " ".join(v["texto"][1:])})
    for e in entradas:
        for k in ("t", "d", "x"):
            if k in e:
                e[k] = html.unescape(e[k])
        if len(e["d"]) > 260:  # se corta en la última palabra entera
            e["d"] = e["d"][:260].rsplit(" ", 1)[0].rstrip(",;:") + "…"
    (web / "datos").mkdir(parents=True, exist_ok=True)
    (web / "datos" / "buscador.json").write_text(json.dumps({"entradas": entradas}, ensure_ascii=False))
    print(f"buscador: {len(entradas)} entradas")


if __name__ == "__main__":
    construir_buscador(sys.argv[1] if len(sys.argv) > 1 else "web")
