"""Compara las dos pasadas independientes que relacionan hechos con promesas y prepara el arbitraje ciego.

Cada par candidato (hecho, promesa) tiene una clase en cada pasada: misma, contraria o no (los pares que una pasada no
devuelve son «no»). Se mide el acuerdo y la kappa de Cohen sobre todos los pares; los desacuerdos se escriben con las
dos decisiones como «opción 1» y «opción 2» en orden aleatorio, para que el árbitro no sepa qué pasada dijo qué.

Uso: python3 comparar_hechos.py <candidatos.json> <dir pasada A> <dir pasada B> <salida desacuerdos.json> <salida resumen.json>
"""
import collections
import glob
import json
import random
import sys


def leer(directorio):
    out = {}
    for f in sorted(glob.glob(f"{directorio}/*.json")):
        for h in json.load(open(f)):
            for r in h["relaciones"]:
                out[(h["hecho"], r["promesa"])] = r
    return out


def main():
    candidatos, dir_a, dir_b, sal_des, sal_res = sys.argv[1:6]
    cand = json.load(open(candidatos))
    a, b = leer(dir_a), leer(dir_b)
    pares = [(h["hecho"], c["promesa"]) for h in cand for c in h["candidatas"]]
    fuera = [k for k in set(a) | set(b) if k not in set(pares)]
    clase = lambda d, k: d[k]["clase"] if k in d else "no"
    acuerdo = sum(clase(a, k) == clase(b, k) for k in pares)
    n = len(pares)
    pa = collections.Counter(clase(a, k) for k in pares)
    pb = collections.Counter(clase(b, k) for k in pares)
    pe = sum((pa[c] / n) * (pb[c] / n) for c in ("misma", "contraria", "no"))
    po = acuerdo / n
    kappa = (po - pe) / (1 - pe) if pe < 1 else 1.0
    # Acuerdo solo sobre los pares que alguna pasada enlazó (el «no» común infla el acuerdo bruto).
    enlazados = [k for k in pares if clase(a, k) != "no" or clase(b, k) != "no"]
    acuerdo_enl = sum(clase(a, k) == clase(b, k) for k in enlazados)
    rnd = random.Random(20261020)
    por_hecho = {h["hecho"]: h for h in cand}
    des = []
    for k in pares:
        if clase(a, k) == clase(b, k):
            continue
        opciones = [a.get(k, {"clase": "no"}), b.get(k, {"clase": "no"})]
        orden = [0, 1]
        rnd.shuffle(orden)
        h = por_hecho[k[0]]
        c = next(x for x in h["candidatas"] if x["promesa"] == k[1])
        des.append({"hecho": k[0], "titulo": h["titulo"], "id_boe": h["id_boe"], "inicio": h["inicio"][:1500],
                    "promesa": k[1], "documento": c["documento"], "etiqueta": c["etiqueta"], "cita": c["cita"],
                    "opcion_1": {x: opciones[orden[0]].get(x) for x in ("clase", "parcial", "motivo")},
                    "opcion_2": {x: opciones[orden[1]].get(x) for x in ("clase", "parcial", "motivo")},
                    "_orden": orden})
    json.dump(des, open(sal_des, "w"), ensure_ascii=False, indent=1)
    resumen = {"pares": n, "acuerdo": round(100 * po, 1), "kappa": round(kappa, 3),
               "pares_enlazados_por_alguna": len(enlazados), "acuerdo_en_enlazados": round(100 * acuerdo_enl / max(1, len(enlazados)), 1),
               "desacuerdos": len(des), "clases_a": dict(pa), "clases_b": dict(pb), "fuera_de_candidatos": len(fuera)}
    json.dump(resumen, open(sal_res, "w"), ensure_ascii=False, indent=1)
    print(json.dumps(resumen, ensure_ascii=False))


if __name__ == "__main__":
    main()
