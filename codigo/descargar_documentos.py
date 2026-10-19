#!/usr/bin/env python3
"""Documentos de promesas (programas y acuerdos de la XV Legislatura): descarga y comprobación.

Cada documento de datos/promesas/documentos.json se descarga de su captura en el Internet Archive (la versión «cruda»,
sin la barra del archivo) y se comprueba que su huella sha256 es la anotada al verificarlo. Si coincide, se guarda en
<CUENTAS_DATOS>/promesas/; si no, el script falla y dice cuál: el documento ya no es el que se verificó.

Los que ya están guardados con la huella buena no se vuelven a descargar.

Uso:  python3 datos/descargar_documentos.py
"""
import hashlib
import json
import os
import pathlib
import sys
import time
import urllib.request

CODIGO = pathlib.Path(__file__).resolve().parent
AQUI = pathlib.Path(os.environ.get("CUENTAS_DATOS") or CODIGO)
DESTINO = AQUI / "promesas"
CATALOGO = CODIGO / "promesas" / "documentos.json"


def bajar(url):
    peticion = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (cuentas en limpio)"})
    with urllib.request.urlopen(peticion, timeout=180) as r:
        return r.read()


def main():
    catalogo = json.loads(CATALOGO.read_text())
    DESTINO.mkdir(parents=True, exist_ok=True)
    fallos = []
    for d in catalogo["documentos"]:
        fichero = DESTINO / d["fichero"]
        if fichero.exists() and hashlib.sha256(fichero.read_bytes()).hexdigest() == d["sha256"]:
            print(f"{d['id']:28} ya guardado")
            continue
        try:
            cuerpo = bajar(d["archivo_crudo"])
        except Exception as e:  # noqa: BLE001 — se informa y se sigue con los demás
            fallos.append(f"{d['id']}: no se pudo descargar ({e})")
            continue
        huella = hashlib.sha256(cuerpo).hexdigest()
        if huella != d["sha256"]:
            fallos.append(f"{d['id']}: la huella no coincide ({huella[:12]} en lugar de {d['sha256'][:12]})")
            continue
        fichero.write_bytes(cuerpo)
        print(f"{d['id']:28} descargado y comprobado ({len(cuerpo):,} B)")
        time.sleep(1)
    if fallos:
        print("\n".join(fallos), file=sys.stderr)
        sys.exit(1)
    print(f"{len(catalogo['documentos'])} documentos, todos con la huella verificada")


if __name__ == "__main__":
    main()
