// Cuentas en limpio: «¿Cuánto contratan las administraciones?». Infocifras de la OIReScon (un PDF por trimestre,
// extraído con herramientas/extraer_infocifras.py y comprobado contra sus propios totales).
"use strict";

const mm = (v) => `${numero(Math.round(v), 0)} M€`;

async function arrancarCont() {
  let d, aapp;
  try {
    [d, aapp] = await Promise.all(["datos/contratacion.json", "datos/aapp.json"].map((u) => fetch(u).then((r) => r.json())));
  } catch {
    document.getElementById("respuesta").textContent = "No se han podido cargar los datos.";
    return;
  }
  const $ = (id) => document.getElementById(id);
  const ed = d.edicion;
  const fuente = [[d.tabla, `Infocifras del ${ed.trimestre}.º trimestre de ${ed.año}`]];
  const notaEd = () => {
    const a = document.createElement("a");
    a.href = ed.url;
    a.textContent = `edición del ${ed.trimestre}.º trimestre de ${ed.año} (PDF)`;
    return a;
  };
  const n = d.trimestres.length - 1;
  const ult = d.anual.at(-1);

  const r = $("respuesta");
  r.textContent = "";
  const s1 = document.createElement("strong");
  s1.textContent = `En ${ult.año}, las administraciones adjudicaron contratos por ${numero(Math.round(ult.adjudicado), 0)} millones de euros, sin impuestos`;
  r.append(s1, `, y sacaron a concurso ${numero(Math.round(ult.licitado), 0)} millones. En el último año (los cuatro trimestres hasta el ${d.trimestres[n].replace("T", ".º trimestre de")}) se adjudicaron ${numero(Math.round(d.ultimos4.adjudicado), 0)} millones.`);

  const caja = $("cifras");
  caja.textContent = "";
  const lic = d.licitadores.at(-1);
  for (const [nombre, valor, explica] of [
    [`Adjudicado, ${ult.año}`, mm(ult.adjudicado), "contratos firmados, sin impuestos."],
    [`Licitado, ${ult.año}`, mm(ult.licitado), "presupuesto de lo que salió a concurso."],
    ["Último trimestre", mm(d.adjudicado[n]), `adjudicado en el ${d.trimestres[n]}.`],
    ["Empresas por contrato", numero(lic.v, 2), `ofertas de media en el ${lic.trimestre}.`]]) {
    const dv = document.createElement("div");
    const x = document.createElement("span"); x.className = "nombre"; x.textContent = nombre;
    const y = document.createElement("span"); y.className = "valor"; y.textContent = valor;
    const z = document.createElement("span"); z.className = "explica"; z.textContent = explica;
    dv.append(x, y, z);
    caja.appendChild(dv);
  }
  lineaFuente($("cifras-fuente"), { fuentes: aapp.fuentes, tablas: fuente, tipo: "dato", nota: "Las sumas por año son un cálculo nuestro." });
  $("cifras-fuente").append(" Cifras de la ", notaEd(), ".");

  const x = d.trimestres.map((_, i) => i);
  EC.lineas($("g1"), { x, etiquetas: d.trimestres, etiquetaEje: (k) => (d.trimestres[k] || "").startsWith("1T") ? d.trimestres[k].slice(3) : "", slider: false,
    formato: (v) => `${numero(Math.round(v / 1000), 0)} mil`, formatoLectura: mm, eje: "M€", min: 0,
    aria: `Importe licitado y adjudicado por trimestre, ${d.trimestres[0]}–${d.trimestres[n]}`,
    series: [{ nombre: "licitado", v: d.licitado, color: "--tinta" }, { nombre: "adjudicado", v: d.adjudicado, color: "--c-primario" }] });
  lineaFuente($("g1-fuente"), { fuentes: aapp.fuentes, tablas: fuente, tipo: "dato" });

  const t = $("anual");
  t.textContent = "";
  const cab = t.createTHead().insertRow();
  for (const c of ["", ...d.anual.map((a) => String(a.año))]) { const th = document.createElement("th"); th.textContent = c; cab.appendChild(th); }
  const cu = t.createTBody();
  for (const [nombre, k] of [["Licitado", "licitado"], ["Adjudicado", "adjudicado"]]) {
    const tr = cu.insertRow();
    tr.insertCell().textContent = nombre;
    for (const a of d.anual) { const c = tr.insertCell(); c.className = "cifra"; c.textContent = numero(Math.round(a[k]), 0); }
  }
  lineaFuente($("g2-fuente"), { fuentes: aapp.fuentes, tablas: fuente, tipo: "lectura", nota: "Suma de los cuatro trimestres de cada año: un cálculo nuestro." });

  const L = d.licitadores;
  EC.lineas($("g3"), { x: L.map((_, i) => i), etiquetas: L.map((l) => l.trimestre), etiquetaEje: (k) => (L[k]?.trimestre || "").startsWith("1T") ? L[k].trimestre.slice(3) : "", slider: false,
    formato: (v) => numero(v, 1), formatoLectura: (v) => `${numero(v, 2)} empresas`, eje: "empresas", min: 0,
    aria: `Número medio de empresas que presentan oferta por contrato, ${L[0].trimestre}–${L.at(-1).trimestre}`,
    series: [{ nombre: "por contrato", v: L.map((l) => l.v), color: "--c-primario" }] });
  lineaFuente($("g3-fuente"), { fuentes: aapp.fuentes, tablas: [[d.tabla, "Infocifras, una edición por trimestre"]], tipo: "dato", nota: "Cada punto sale de la edición de su trimestre." });

  // Revisiones: primera cifra publicada de lo adjudicado frente a la de la última edición
  const R = d.revisiones;
  const mayor = R.reduce((m, x) => (Math.abs(x.pct) > Math.abs(m.pct) ? x : m), R[0]);
  $("g4-explica").textContent = `No. Cada edición recalcula los trimestres anteriores con lo que se ha ido publicando después en las plataformas. Importe adjudicado de cada trimestre, en millones de euros, según la edición más antigua cuya tabla se puede leer (las de antes de 2025 no traen el adjudicado o lo traen como imagen) y según la última; el mayor cambio es el del ${mayor.trimestre} (${mayor.pct > 0 ? "+" : "−"}${numero(Math.abs(mayor.pct), 1)} %).`;
  const t4 = $("revisiones");
  t4.textContent = "";
  const cab4 = t4.createTHead().insertRow();
  for (const c of ["Trimestre", "Cifra entonces", "Edición", "Cifra hoy", "Cambio"]) { const th = document.createElement("th"); th.textContent = c; cab4.appendChild(th); }
  const cu4 = t4.createTBody();
  for (const x of R) {
    const tr = cu4.insertRow();
    tr.insertCell().textContent = x.trimestre;
    for (const v of [numero(Math.round(x.primera), 0), x.edicion, numero(Math.round(x.ultima), 0), `${x.pct > 0 ? "+" : x.pct < 0 ? "−" : ""}${numero(Math.abs(x.pct), 1)} %`]) {
      const c = tr.insertCell(); c.className = "cifra"; c.textContent = v;
    }
  }
  lineaFuente($("g4-fuente"), { fuentes: aapp.fuentes, tablas: [[d.tabla, "Infocifras, ediciones con tablas legibles"]], tipo: "lectura", nota: "El porcentaje de cambio es un cálculo nuestro. Algunas ediciones traen las tablas como imagen y no entran en esta comparación." });

  pintarComprobaciones($("comprobaciones"), d.comprobaciones);
}
document.addEventListener("DOMContentLoaded", arrancarCont);
