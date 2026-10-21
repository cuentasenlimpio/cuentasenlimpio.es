"""Promesas que pueden fijar una meta medible (paso «Dato»), en paquetes para la clasificación (INSTRUCCIONES_DATOS.md).

Es solo un filtro: pasan las promesas con alguna cifra o con palabras como «duplicar» o «la mitad», sin contar los
números de leyes y artículos. Decide qué se mira, no qué es una meta. Las repeticiones dentro de un documento no se
miran dos veces.

Uso: python3 candidatas_datos.py <promesas.json> <carpeta de salida> [tamaño del paquete=60]
"""
import json
import pathlib
import re
import sys

CIFRA = re.compile(r"(?<![/\w])\d[\d.,]*(?!/\d)|\b(duplic|triplic|cuadruplic|dupli|tripli|mitad|meitat|metade|doble|cero|zero)",
                   re.I)
LEY = re.compile(r"\b(ley|llei|lei|real decreto|reial decret|artículo|article|artigo|art\.)\s*(orgánica\s*|orgànica\s*)?\d+(/\d+)?",
                 re.I)


def main():
    promesas, salida = sys.argv[1], pathlib.Path(sys.argv[2])
    tam = int(sys.argv[3]) if len(sys.argv) > 3 else 60
    pr = json.load(open(promesas))
    nombre = {d["id"]: d.get("titulo", d["id"]) for d in pr["documentos"]}
    ps = [{"promesa": f"{p['d']}:{p['id']}", "documento": nombre[p["d"]], "etiqueta": p["e"], "cita": p["c"],
           "contexto": p.get("x", "")}
          for p in pr["promesas"] if not p.get("r") and CIFRA.search(LEY.sub("", p["c"]))]
    salida.mkdir(parents=True, exist_ok=True)
    for i in range(0, len(ps), tam):
        (salida / f"d_{i // tam + 1:02d}.json").write_text(json.dumps(ps[i:i + tam], ensure_ascii=False, indent=1))
    print(f"{len(ps)} promesas candidatas en {-(-len(ps) // tam)} paquetes")


if __name__ == "__main__":
    main()
