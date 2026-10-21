"""Cuándo llegó cada dato: web/datos/actualidad.json, para el pie de todas las páginas y la tabla de fechas de metodología.

Del manifiesto de descargas (una entrada por descarga, con la huella del fichero) sale, para cada fuente, la última vez
que se descargó y la última vez que su contenido cambió de verdad. La fecha de la última revisión diaria (aunque nada
cambie) la apunta el servidor aparte, en datos/estado.json.

Uso suelto: python3.12 datos/actualidad.py datos/manifiesto.json web
"""
import json
import pathlib
import sys


def construir_actualidad(manifiesto, web):
    entradas = json.loads(pathlib.Path(manifiesto).read_text())
    web = pathlib.Path(web)
    navegador = {}
    aapp = web / "datos" / "aapp.json"
    if aapp.exists():
        navegador = {f["tabla"]: f.get("url_navegador") for f in json.loads(aapp.read_text()).get("fuentes", [])}
    por_tabla = {}
    for e in entradas:  # en orden de descarga
        t = por_tabla.setdefault(e["tabla"], {"tabla": e["tabla"], "fuente": e["fuente"], "nombre": e["nombre"], "huella": None,
                                               "cambio": None, "descargado": None, "actualizado_fuente": None, "n": 0, "cambios": 0})
        t["n"] += 1
        if e["sha256"] != t["huella"]:
            t["cambios"] += 1
            t["cambio"] = e["descargado"]
            t["huella"] = e["sha256"]
        t["descargado"] = e["descargado"]
        t["nombre"] = e["nombre"]
        if e.get("actualizado_fuente"):
            t["actualizado_fuente"] = e["actualizado_fuente"]
    fuentes = []
    for t in por_tabla.values():
        t.pop("huella")
        # Ficheros cuya huella cambia en cada descarga (llevan la hora dentro, como los del FMI): su «cambio» no dice nada.
        if t.pop("n") >= 3 and t.pop("cambios") >= 0.9 * len([e for e in entradas if e["tabla"] == t["tabla"]]):
            t["cambio"] = None
        t.pop("cambios", None)
        t["url"] = navegador.get(t["tabla"])
        fuentes.append(t)
    fuentes.sort(key=lambda t: t["cambio"] or "", reverse=True)
    ultimo = fuentes[0] if fuentes else None
    salida = {
        "construido": max((t["descargado"] for t in fuentes if t["descargado"]), default=None),
        "ultimo_cambio": {k: ultimo[k] for k in ("fuente", "nombre", "cambio", "url")} if ultimo else None,
        "fuentes": fuentes,
    }
    (web / "datos").mkdir(parents=True, exist_ok=True)
    (web / "datos" / "actualidad.json").write_text(json.dumps(salida, ensure_ascii=False))
    print(f"actualidad: {len(fuentes)} fuentes; último cambio: {ultimo['fuente']}, {ultimo['nombre']} ({ultimo['cambio']})" if ultimo else "actualidad: sin fuentes")


if __name__ == "__main__":
    construir_actualidad(sys.argv[1], sys.argv[2])
