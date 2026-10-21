"""Compara las dos pasadas independientes de metas medibles (INSTRUCCIONES_DATOS.md) y escribe los desacuerdos.

Se mide el acuerdo y la kappa de Cohen sobre «meta sí / no» en todas las promesas candidatas. Los desacuerdos se
escriben con las dos decisiones como «opcion_1» y «opcion_2», en orden aleatorio (semilla fija), para el arbitraje a
ciegas; «_orden» guarda qué pasada es cada opción y el árbitro no lo mira.

Uso: python3 comparar_datos.py <carpeta de paquetes> <dir A> <dir B> <desacuerdos.json> <resumen.json>
"""
import glob
import json
import random
import sys


def leer(d):
    return {x["promesa"]: x for f in sorted(glob.glob(f"{d}/*.json")) for x in json.load(open(f))}


def main():
    paquetes, dir_a, dir_b, salida, resumen = sys.argv[1:6]
    cand = {x["promesa"]: x for f in sorted(glob.glob(f"{paquetes}/*.json")) for x in json.load(open(f))}
    a, b = leer(dir_a), leer(dir_b)
    faltan = [k for k in cand if k not in a or k not in b]
    if faltan:
        sys.exit(f"Faltan {len(faltan)} promesas en alguna pasada, por ejemplo {faltan[:3]}")
    n = len(cand)
    sa = {k: bool(a[k]["meta"]) for k in cand}
    sb = {k: bool(b[k]["meta"]) for k in cand}
    acuerdo = sum(sa[k] == sb[k] for k in cand) / n
    pa, pb = sum(sa.values()) / n, sum(sb.values()) / n
    azar = pa * pb + (1 - pa) * (1 - pb)
    kappa = (acuerdo - azar) / (1 - azar) if azar < 1 else 1.0
    alguna = [k for k in cand if sa[k] or sb[k]]
    rnd = random.Random(7)
    des = []
    for k in cand:
        if sa[k] != sb[k]:
            orden = ["A", "B"] if rnd.random() < 0.5 else ["B", "A"]
            ops = {"A": a[k], "B": b[k]}
            des.append({**cand[k], "opcion_1": {c: ops[orden[0]].get(c) for c in ("meta", "metas", "motivo")},
                        "opcion_2": {c: ops[orden[1]].get(c) for c in ("meta", "metas", "motivo")}, "_orden": orden})
    json.dump(des, open(salida, "w"), ensure_ascii=False, indent=1)
    res = {"promesas": n, "acuerdo": round(100 * acuerdo, 1), "kappa": round(kappa, 3),
           "acuerdo_en_metas": round(100 * sum(sa[k] == sb[k] for k in alguna) / max(1, len(alguna)), 1),
           "metas_a": sum(sa.values()), "metas_b": sum(sb.values()), "desacuerdos": len(des)}
    json.dump(res, open(resumen, "w"), ensure_ascii=False)
    print(json.dumps(res, ensure_ascii=False))


if __name__ == "__main__":
    main()
