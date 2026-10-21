// Cuentas en limpio: «¿La recaudación sube por la economía o por los impuestos?». Informe Anual de Recaudación
// Tributaria de la Agencia Tributaria (cuadros 1.3, 1.5 y 1.6), comprobado con la serie mensual.
"use strict";

const mm = (v) => `${numero(Math.round(v), 0)} M€`;
const conSigno = (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${numero(Math.abs(Math.round(v)), 0)}`;
// Nombres cortos de las partidas del cuadro 1.5
const NOMBRE_NORMA = (e) => e.replace(/^I\.?E\.\s*(sobre los\s*)?/, "Impuesto especial: ").replace("Impuesto sobre la Renta de las Personas Físicas", "IRPF")
  .replace("Impuesto sobre el Valor Añadido", "IVA").replace("Impuesto sobre Sociedades", "Impuesto sobre Sociedades");

async function arrancarRec() {
  let d, aapp;
  try {
    [d, aapp] = await Promise.all(["datos/recaudacion.json", "datos/aapp.json"].map((u) => fetch(u).then((r) => r.json())));
  } catch {
    document.getElementById("respuesta").textContent = "No se han podido cargar los datos.";
    return;
  }
  const $ = (id) => document.getElementById(id);
  const n = d.años.length - 1, a = d.años[n];
  const total = d.total[n], cambio = d.variacion[n], norma = d.normativo[n];
  const pct = (100 * cambio) / d.total[n - 1];
  const fTotal = [[d.tablas.total, "Informe Anual de Recaudación Tributaria (cuadro 1.6)"]];
  const fNorma = [[d.tablas.normativo, "impacto de los cambios normativos y de gestión (cuadro 1.5)"]];
  const fBases = [[d.tablas.bases, "bases imponibles y tipos efectivos (cuadro 1.3)"]];

  const r = $("respuesta");
  r.textContent = "";
  const s1 = document.createElement("strong");
  s1.textContent = `En ${a}, la Agencia Tributaria ingresó ${numero(Math.round(total), 0)} millones de euros en impuestos, ${numero(Math.abs(Math.round(cambio)), 0)} millones ${cambio >= 0 ? "más" : "menos"} que en ${a - 1}`;
  r.append(s1, ` (${cambio >= 0 ? "+" : "−"}${numero(Math.abs(pct), 1)} %). Según su propia estimación, ${numero(Math.abs(Math.round(norma)), 0)} millones de ese cambio ${norma >= 0 ? "vinieron de" : "se perdieron por"} cambios en las normas y en la gestión de los impuestos; el resto, sobre todo, de cómo evolucionaron las rentas, los beneficios y el consumo sobre los que se pagan.`);

  const caja = $("cifras");
  caja.textContent = "";
  const nb = d.bases.años.length - 1;
  for (const [nombre, valor, explica] of [
    [`Recaudación, ${a}`, mm(total), "impuestos que cobra la Agencia Tributaria, ya restadas las devoluciones."],
    [`Cambio frente a ${a - 1}`, `${conSigno(cambio)} M€`, `${cambio >= 0 ? "+" : "−"}${numero(Math.abs(pct), 1)} %.`],
    ["Por cambios en las normas", `${conSigno(norma)} M€`, "estimación de la Agencia Tributaria."],
    [`Tipo efectivo, ${d.bases.años[nb]}`, `${numero(d.tipos.total[nb], 1)} %`, `de las rentas y el gasto sujetos a impuestos${d.provisionales.includes(d.bases.años[nb]) ? " (provisional)" : ""}.`]]) {
    const dv = document.createElement("div");
    const x = document.createElement("span"); x.className = "nombre"; x.textContent = nombre;
    const y = document.createElement("span"); y.className = "valor"; y.textContent = valor;
    const z = document.createElement("span"); z.className = "explica"; z.textContent = explica;
    dv.append(x, y, z);
    caja.appendChild(dv);
  }
  lineaFuente($("cifras-fuente"), { fuentes: aapp.fuentes, tablas: [...fTotal, ...fNorma, ...fBases], tipo: "dato", nota: "El porcentaje de cambio es un cálculo nuestro." });

  const años1 = d.años.slice(1);
  EC.barras($("g1"), { años: años1, min: null, formato: (v) => numero(Math.round(v / 1000), 0) + " mil", formatoLectura: (v) => `${conSigno(v)} M€`, eje: "M€",
    aria: `Cambio anual de la recaudación y parte por cambios normativos, ${años1[0]}–${a}`,
    series: [{ nombre: "cambio total", v: d.variacion.slice(1), color: "--tinta" }, { nombre: "por cambios en las normas y la gestión", v: d.normativo.slice(1), color: "--c-primario" }] });
  lineaFuente($("g1-fuente"), { fuentes: aapp.fuentes, tablas: [...fTotal, ...fNorma], tipo: "dato", nota: "El cambio total es la resta de cada año menos el anterior: un cálculo nuestro." });

  const B = d.bases;
  const prov = d.provisionales.filter((x) => B.años.includes(x));
  $("g2-explica").textContent = `Tipo efectivo: impuesto que corresponde a cada año dividido entre su base (las rentas, los beneficios o el gasto sobre los que se paga), en porcentaje.${prov.length ? ` ${prov.join(" y ")}: datos provisionales.` : ""}`;
  EC.lineas($("g2"), { x: B.años, etiquetas: B.años.map(String), formato: (v) => `${numero(v, 0)} %`, formatoLectura: (v) => `${numero(v, 1)} %`, eje: "%", min: 0,
    aria: `Tipos efectivos de los principales impuestos, ${B.años[0]}–${B.años.at(-1)}`,
    series: [{ nombre: "total", v: d.tipos.total, color: "--tinta" }, { nombre: "IVA sobre el gasto", v: d.tipos.iva, color: "--c-primario" },
      { nombre: "IRPF sobre las rentas de los hogares", v: d.tipos.irpf, color: "--linea-fuerte", discontinua: true },
      { nombre: "Sociedades sobre su base", v: d.tipos.sociedades, soloLectura: true, formato: (v) => `${numero(v, 1)} %` }] });
  lineaFuente($("g2-fuente"), { fuentes: aapp.fuentes, tablas: fBases, tipo: "dato" });

  // Cambios normativos por impuesto: el último año y los dos anteriores, partidas que no son cero
  const ult = [n - 2, n - 1, n];
  $("g3-explica").textContent = `Impacto de los cambios normativos y de gestión en la recaudación de ${d.años[n - 2]} a ${a}, por impuesto, en millones de euros (en positivo, lo que añadieron; en negativo, lo que restaron).`;
  const t = $("normas");
  t.textContent = "";
  const cab = t.createTHead().insertRow();
  for (const c of ["", ...ult.map((i) => String(d.años[i]))]) { const th = document.createElement("th"); th.textContent = c; cab.appendChild(th); }
  const cuerpo = t.createTBody();
  const filas = Object.entries(d.normativo_por_impuesto).filter(([, v]) => ult.some((i) => v[i])).sort((x, y) => Math.abs(y[1][n] || 0) - Math.abs(x[1][n] || 0));
  for (const [e, v] of filas) {
    const tr = cuerpo.insertRow();
    tr.insertCell().textContent = NOMBRE_NORMA(e);
    for (const i of ult) { const c = tr.insertCell(); c.className = "cifra"; c.textContent = v[i] ? conSigno(v[i]) : "—"; }
  }
  const tr = cuerpo.insertRow(); tr.className = "fila-total";
  tr.insertCell().textContent = "Total";
  for (const i of ult) { const c = tr.insertCell(); c.className = "cifra"; c.textContent = conSigno(d.normativo[i]); }
  lineaFuente($("g3-fuente"), { fuentes: aapp.fuentes, tablas: fNorma, tipo: "dato", nota: "El detalle de cada medida está en el fichero «Resumen normativo» de la Agencia Tributaria." });

  const elegidos = [2007, 2013, 2019, a - 2, a - 1, a].filter((x, k, l) => d.años.includes(x) && l.indexOf(x) === k);
  const t4 = $("impuestos");
  t4.textContent = "";
  const cab4 = t4.createTHead().insertRow();
  for (const c of ["", ...elegidos.map(String)]) { const th = document.createElement("th"); th.textContent = c; cab4.appendChild(th); }
  const c4 = t4.createTBody();
  for (const [nombre, v, tot] of [["IRPF", d.impuestos.irpf], ["IVA", d.impuestos.iva], ["Impuesto sobre Sociedades", d.impuestos.sociedades],
    ["Impuestos especiales", d.impuestos.especiales], ["Total, con el resto de impuestos y tasas", d.total, true]]) {
    const fila = c4.insertRow();
    if (tot) fila.className = "fila-total";
    fila.insertCell().textContent = nombre;
    for (const x of elegidos) { const c = fila.insertCell(); c.className = "cifra"; c.textContent = numero(Math.round(v[d.años.indexOf(x)]), 0); }
  }
  lineaFuente($("g4-fuente"), { fuentes: aapp.fuentes, tablas: fTotal, tipo: "dato" });

  pintarComprobaciones($("comprobaciones"), d.comprobaciones);
}
document.addEventListener("DOMContentLoaded", arrancarRec);
