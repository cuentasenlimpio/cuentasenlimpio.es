// Cuentas en limpio: «¿Cuánto aporta España a la Unión Europea y cuánto recibe?». Comisión Europea, contrastada con la IGAE.
"use strict";

async function arrancarUE() {
  let d, aapp;
  try {
    [d, aapp] = await Promise.all(["datos/union_europea.json", "datos/aapp.json"].map((u) => fetch(u).then((r) => r.json())));
  } catch {
    document.getElementById("respuesta").textContent = "No se han podido cargar los datos.";
    return;
  }
  const $ = (id) => document.getElementById(id);
  const s = d.serie, u = s.at(-1);
  const fuente = [[d.tabla, "gasto y recursos propios del presupuesto de la UE por Estado miembro"]];
  const dif = u.gasto - u.aportacion;
  const m = (v) => `${numero(Math.round(v), 0)} millones de euros`;

  const r = $("respuesta");
  r.textContent = "";
  const s1 = document.createElement("strong");
  s1.textContent = `En ${u.año}, el presupuesto de la UE gastó en España ${m(u.gasto)} y España aportó ${m(u.aportacion)}`;
  r.append(s1, `: ${dif >= 0 ? "llegaron" : "salieron"} ${m(Math.abs(dif))} más de los que ${dif >= 0 ? "salieron" : "llegaron"} (cálculo nuestro).`
    + (u.ngeu ? ` Aparte, por NextGenerationEU llegaron ${m(u.ngeu)}.` : ""));

  const caja = $("cifras");
  caja.textContent = "";
  for (const [nombre, v, explica] of [
    [`Gasto de la UE en España, ${u.año}`, u.gasto, "agricultura, cohesión, investigación y demás políticas comunes."],
    [`Aportación de España, ${u.año}`, u.aportacion, "recursos basados en el IVA, la renta nacional y el plástico, con sus ajustes."],
    [`NextGenerationEU, ${u.año}`, u.ngeu, "aparte: subvenciones y préstamos financiados con deuda de la UE."],
    [`Aranceles recaudados, ${u.año}`, u.aranceles, "son de la UE; España los cobra en sus aduanas."]]) {
    if (v === null || v === undefined) continue;
    const dv = document.createElement("div");
    const a = document.createElement("span"); a.className = "nombre"; a.textContent = nombre;
    const b = document.createElement("span"); b.className = "valor"; b.textContent = `${numero(Math.round(v), 0)} M€`;
    const c = document.createElement("span"); c.className = "explica"; c.textContent = explica;
    dv.append(a, b, c);
    caja.appendChild(dv);
  }
  lineaFuente($("cifras-fuente"), { fuentes: aapp.fuentes, tablas: fuente, tipo: "dato", nota: "La diferencia entre gasto y aportación es un cálculo nuestro." });

  const años = s.map((x) => x.año);
  EC.lineas($("g1"), { x: años, etiquetas: años.map(String), formato: (v) => numero(Math.round(v / 1000), 0) + " mil", formatoLectura: (v) => `${numero(Math.round(v), 0)} M€`,
    eje: "M€", min: 0, aria: `Gasto de la UE en España y aportación de España, ${años[0]}–${años.at(-1)}`,
    series: [{ nombre: "gasto de la UE en España", v: s.map((x) => x.gasto), color: "--c-primario" },
      { nombre: "aportación de España", v: s.map((x) => x.aportacion), color: "--tinta" },
      { nombre: "diferencia (cálculo nuestro)", v: s.map((x) => x.gasto - x.aportacion), soloLectura: true, formato: (v) => `${v >= 0 ? "+" : "−"}${numero(Math.abs(Math.round(v)), 0)} M€` },
      { nombre: "NextGenerationEU (aparte)", v: s.map((x) => x.ngeu), soloLectura: true, formato: (v) => `${numero(Math.round(v), 0)} M€` }] });
  lineaFuente($("g1-fuente"), { fuentes: aapp.fuentes, tablas: fuente, tipo: "dato" });

  pintarComprobaciones($("comprobaciones"), d.comprobaciones);
}
document.addEventListener("DOMContentLoaded", arrancarUE);
