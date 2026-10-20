"""Junta las dos pasadas, el arbitraje y la auditoría de la relación hechos–promesas en el resultado que se publica.

- Pares en que las dos pasadas coinciden (misma o contraria): esa clase; «parcial» si cualquiera de las dos lo dijo
  (lo más prudente); el motivo, el de la primera pasada.
- Pares en desacuerdo: la decisión del árbitro.
- Auditoría: una tercera pasada independiente sobre una muestra al azar de pares en que las dos coincidían; mide
  cuántos enlaces publicados sobran y cuántos descartados faltan.

Uso: python3 aplicar_hechos.py <dir A> <dir B> <arbitraje.json> <resumen comparación.json> <auditoría clave> <auditoría respuestas> <salida dir>
"""
import glob
import json
import pathlib
import sys


def leer(d):
    out = {}
    for f in sorted(glob.glob(f"{d}/*.json")):
        for h in json.load(open(f)):
            for r in h["relaciones"]:
                out[(h["hecho"], r["promesa"])] = r
    return out


def main():
    dir_a, dir_b, arb, resumen, aud_clave, aud_resp, salida = sys.argv[1:8]
    a, b = leer(dir_a), leer(dir_b)
    rel = []
    for k in sorted(set(a) & set(b)):
        if a[k]["clase"] == b[k]["clase"]:
            rel.append({"hecho": k[0], "promesa": k[1], "clase": a[k]["clase"],
                        "parcial": bool(a[k].get("parcial") or b[k].get("parcial")), "motivo": a[k]["motivo"], "origen": "acuerdo"})
    arbitraje = json.load(open(arb))
    elige = {"opcion_1": 0, "opcion_2": 0, "ninguna": 0}
    for x in arbitraje:
        elige[x["elige"]] = elige.get(x["elige"], 0) + 1
        if x["clase"] != "no":
            rel.append({"hecho": x["hecho"], "promesa": x["promesa"], "clase": x["clase"], "parcial": bool(x.get("parcial")),
                        "motivo": x["motivo"], "origen": "arbitraje"})
    clave = json.load(open(aud_clave))
    resp = json.load(open(aud_resp))
    enlazados = [r for r in resp if clave[f"{r['hecho']}|{r['promesa']}"] != "no"]
    descartados = [r for r in resp if clave[f"{r['hecho']}|{r['promesa']}"] == "no"]
    sobran = sum(r["clase"] == "no" for r in enlazados)
    faltan = sum(r["clase"] != "no" for r in descartados)
    comp = json.load(open(resumen))
    fiab = {"pares_candidatos": comp["pares"], "acuerdo": comp["acuerdo"], "kappa": comp["kappa"],
            "acuerdo_en_enlazados": comp["acuerdo_en_enlazados"], "desacuerdos": comp["desacuerdos"], "arbitraje": elige,
            "auditoria": {"enlazados_revisados": len(enlazados), "enlazados_que_la_auditoria_no_enlaza": sobran,
                          "descartados_revisados": len(descartados), "descartados_que_la_auditoria_enlaza": faltan},
            "relaciones": len(rel), "misma": sum(r["clase"] == "misma" for r in rel), "contraria": sum(r["clase"] == "contraria" for r in rel)}
    d = pathlib.Path(salida)
    d.mkdir(parents=True, exist_ok=True)
    (d / "relaciones.json").write_text(json.dumps(rel, ensure_ascii=False, indent=1))
    (d / "fiabilidad.json").write_text(json.dumps(fiab, ensure_ascii=False, indent=1))
    print(json.dumps(fiab, ensure_ascii=False))


if __name__ == "__main__":
    main()
