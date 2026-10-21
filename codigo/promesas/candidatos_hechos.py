"""Candidatos para relacionar hechos con promesas, por coincidencia de palabras (TF-IDF, sin dependencias).

Es solo un filtro para no comparar 5.000 promesas con cada hecho: decide quién se mira, no quién se enlaza. Por
cada hecho se toman las K promesas más parecidas y, por cada promesa, los 2 hechos más parecidos; la unión pasa a la
clasificación (INSTRUCCIONES_HECHOS.md).

Los hechos salen de datos/hechos/para_promesas.json (lo escribe construir.py): normas (LO, L, RDL), iniciativas del
Congreso que no llegaron a ley (INI) y anteproyectos o proyectos del Consejo de Ministros sin expediente (CM).

Uso: python3 candidatos_hechos.py <para_promesas.json> <promesas.json> <salida.json> [tipos=LO,L,RDL] [K=40]
"""
import collections
import json
import math
import re
import sys
import unicodedata

VACIAS = set("""a al algo algunas algunos ante antes como con contra cual cuando de del desde donde durante e el ella
ellas ellos en entre era es esa esas ese eso esos esta estas este esto estos fue ha han hasta hay la las le les lo los
mas me mientras muy ni no nos o os otra otras otro otros para pero poco por porque que quien se sea segun ser si sin
sobre su sus tambien tan tanto te tiene todo todos tras tu un una uno unos y ya asi cada dicho dichas misma mismo
nuevo nueva nuevos nuevas real decreto ley leyes organica articulo articulos disposicion disposiciones medida medidas
mediante presente asimismo cuya cuyo modo forma tanto parte partes efectos materia caso casos traves
""".split())


def palabras(texto):
    t = unicodedata.normalize("NFKD", (texto or "").lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    return [w[:7] for w in re.findall(r"[a-z]{3,}", t) if w not in VACIAS]


def vector(ws, idf):
    c = collections.Counter(ws)
    v = {w: (1 + math.log(n)) * idf.get(w, 0.0) for w, n in c.items()}
    norma = math.sqrt(sum(x * x for x in v.values())) or 1.0
    return {w: x / norma for w, x in v.items()}


def main():
    hechos, promesas, salida = sys.argv[1:4]
    rangos = set((sys.argv[4] if len(sys.argv) > 4 else "LO,L,RDL").split(","))
    k = int(sys.argv[5]) if len(sys.argv) > 5 else 40
    pr = json.load(open(promesas))
    idioma = {d["id"]: d["idioma"] for d in pr["documentos"]}
    hs = [n for n in json.load(open(hechos)) if n["tipo"] in rangos]
    # Una promesa por frase distinta: las repeticiones dentro de un documento no se miran dos veces.
    ps = [p for p in pr["promesas"] if not p.get("r")]
    textos_p = [palabras(p["e"] + " " + (p["c"] if idioma.get(p["d"]) == "es" else "")) for p in ps]
    textos_n = [palabras(" ".join([n["titulo"], " ".join(n.get("materias", [])), n.get("inicio", "")[:1500]])) for n in hs]
    df = collections.Counter(w for t in textos_p + textos_n for w in set(t))
    total = len(textos_p) + len(textos_n)
    idf = {w: math.log(total / c) for w, c in df.items()}
    vp = [vector(t, idf) for t in textos_p]
    vn = [vector(t, idf) for t in textos_n]
    # Índice invertido para no hacer todos los productos.
    inv = collections.defaultdict(list)
    for i, v in enumerate(vp):
        for w, x in v.items():
            inv[w].append((i, x))
    puntos = []
    for j, v in enumerate(vn):
        acc = collections.defaultdict(float)
        for w, x in v.items():
            for i, y in inv.get(w, ()):
                acc[i] += x * y
        puntos.append(acc)
    pares = set()
    for j, acc in enumerate(puntos):
        for i, _ in sorted(acc.items(), key=lambda t: -t[1])[:k]:
            pares.add((j, i))
    mejor_por_promesa = collections.defaultdict(list)
    for j, acc in enumerate(puntos):
        for i, s in acc.items():
            mejor_por_promesa[i].append((s, j))
    for i, lista in mejor_por_promesa.items():
        for s, j in sorted(lista, reverse=True)[:2]:
            if s > 0.12:
                pares.add((j, i))
    salida_ = collections.defaultdict(list)
    for j, i in sorted(pares):
        p = ps[i]
        salida_[hs[j]["clave"]].append({"promesa": f"{p['d']}:{p['id']}", "documento": p["d"], "etiqueta": p["e"], "cita": p["c"],
                                            "parecido": round(puntos[j].get(i, 0.0), 3)})
    paquetes = [{"hecho": n["clave"], "tipo": n["tipo"], "titulo": n["titulo"], "fecha": n["fecha"], "referencia": n["referencia"]}
                | ({"autor": n["autor"]} if n.get("autor") else {})
                | {"materias": n.get("materias", []), "inicio": n.get("inicio", "")[:4000],
                 "candidatas": sorted(salida_[n["clave"]], key=lambda c: -c["parecido"])} for n in hs]
    json.dump(paquetes, open(salida, "w"), ensure_ascii=False, indent=1)
    print(f"{len(hs)} hechos, {len(ps)} promesas, {sum(len(p['candidatas']) for p in paquetes)} pares candidatos")


if __name__ == "__main__":
    main()
