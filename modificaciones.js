// Cuentas en limpio: «¿Cómo cambia el presupuesto durante el año?». Modificaciones de crédito del Estado (IGAE, ejecución mensual).
"use strict";

const mmMod = (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${numero(Math.abs(Math.round(v)), 0)}`;

function tablaMod(t, cabeceras, filas) {
  t.textContent = "";
  const cab = t.createTHead().insertRow();
  for (const c of ["", ...cabeceras]) { const th = document.createElement("th"); th.textContent = c; cab.appendChild(th); }
  const cuerpo = t.createTBody();
  for (const f of filas) {
    const tr = cuerpo.insertRow();
    if (f.clase) tr.className = f.clase;
    const a = tr.insertCell(); a.textContent = f.nombre;
    if (f.detalle) { const d = document.createElement("span"); d.className = "detalle"; d.textContent = f.detalle; a.appendChild(d); }
    for (const v of f.v) { const c = tr.insertCell(); c.className = "cifra"; c.textContent = typeof v === "string" ? v : v === null || v === undefined ? "—" : numero(Math.round(v) || 0, 0); }
  }
}

async function arrancarMod() {
  let d, aapp;
  try {
    [d, aapp] = await Promise.all(["datos/modificaciones.json", "datos/aapp.json"].map((u) => fetch(u).then((r) => r.json())));
  } catch {
    document.getElementById("respuesta").textContent = "No se han podido cargar los datos.";
    return;
  }
  const $ = (id) => document.getElementById(id);
  const t = d.totales, mes = d.mes;
  const fuente = d.tablas.map((x) => [x, `ejecución presupuestaria del Estado hasta ${mes} de ${x.slice(-4)}`]);
  const fuenteActual = [fuente.at(-1)];
  const pct = (a, b) => (b ? (100 * a) / b : 0);
  const anteriores = d.anteriores.filter((x) => x.año !== d.año);

  const r = $("respuesta");
  r.textContent = "";
  const s1 = document.createElement("strong");
  s1.textContent = `Hasta ${mes} de ${d.año}, las modificaciones han sumado ${numero(Math.round(t.modificaciones), 0)} millones de euros al presupuesto del Estado`;
  r.append(s1, `: empezó el año con ${numero(Math.round(t.iniciales), 0)} millones${/el de (\d{4})/.test(d.vigencia || "") ? ` (el presupuesto de ${d.vigencia.match(/el de (\d{4})/)[1]}, prorrogado)` : ""} y lleva ${numero(Math.round(t.definitivos), 0)}, un ${numero(pct(t.modificaciones, t.iniciales), 1)} % más.`
    + (anteriores.length ? ` En los mismos meses de ${anteriores.map((x) => `${x.año}, ${numero(Math.round(x.modificaciones), 0)} millones`).join("; ")}.` : ""));

  const caja = $("cifras");
  caja.textContent = "";
  const T = t.tipos;
  for (const [nombre, valor, explica] of [
    [`Modificaciones hasta ${mes}`, `${numero(pct(t.modificaciones, t.iniciales), 1)} %`, `${numero(Math.round(t.modificaciones), 0)} millones sobre lo aprobado al empezar el año.`],
    ["Movido entre partidas", `${numero(Math.round(T.transf_mas), 0)} M€`, "en transferencias de crédito de unas partidas a otras."],
    ["Por ley o decreto-ley", `${numero(Math.round(T.extraordinarios + T.suplementos), 0)} M€`, "en créditos extraordinarios y suplementos de crédito."],
    ["Ampliaciones", `${numero(Math.round(T.ampliaciones), 0)} M€`, "partidas que la ley deja crecer, como los intereses de la deuda."]]) {
    const dv = document.createElement("div");
    const a = document.createElement("span"); a.className = "nombre"; a.textContent = nombre;
    const b = document.createElement("span"); b.className = "valor"; b.textContent = valor;
    const c = document.createElement("span"); c.className = "explica"; c.textContent = explica;
    dv.append(a, b, c);
    caja.appendChild(dv);
  }
  lineaFuente($("cifras-fuente"), { fuentes: aapp.fuentes, tablas: fuenteActual, tipo: "dato", nota: "Los porcentajes son un cálculo nuestro." });

  const todos = d.anteriores;
  $("g1-explica").textContent = `Modificaciones acumuladas de enero a ${mes} de cada año, en millones de euros: lo que se suma (o se resta) al presupuesto con que empezó el año.`;
  EC.barras($("g1"), { años: todos.map((x) => x.año), formato: (v) => numero(Math.round(v / 1000), 0), formatoLectura: (v) => `${numero(Math.round(v), 0)} M€`, eje: "miles de M€",
    aria: `Modificaciones del presupuesto del Estado de enero a ${mes}, ${todos.map((x) => x.año).join(", ")}`,
    series: [{ nombre: "modificaciones netas", v: todos.map((x) => x.modificaciones), color: "--c-primario" }] });
  lineaFuente($("g1-fuente"), { fuentes: aapp.fuentes, tablas: fuente, tipo: "dato" });
  tablaMod($("tipos"), todos.map((x) => String(x.año)), [
    ...d.tipos.map((tp) => ({ nombre: tp.nombre, detalle: tp.explica, v: todos.map((x) => x.tipos[tp.clave]) })),
    { nombre: "Total", clase: "fila-total", v: todos.map((x) => x.modificaciones) },
    { nombre: "Presupuesto con que empezó el año", detalle: "propio o prorrogado", v: todos.map((x) => x.iniciales) },
  ]);
  lineaFuente($("tipos-fuente"), { fuentes: aapp.fuentes, tablas: fuente, tipo: "dato" });

  $("g2-explica").textContent = `Crédito con que empezó ${d.año} cada ministerio y órgano del Estado, cambio neto hasta ${mes} y transferencias recibidas y cedidas, en millones de euros. Ordenados de más a menos cambio. Los nombres son los abreviados que usa la IGAE.`;
  const secs = [...d.secciones].sort((a, b) => b.modificaciones - a.modificaciones);
  tablaMod($("secciones"), ["Al empezar", "Cambio", "%", "Recibido", "Cedido", "Ahora"], secs.map((s) => ({
    nombre: s.nombre, v: [s.iniciales, mmMod(s.modificaciones), s.iniciales ? `${numero(pct(s.modificaciones, s.iniciales), 1)} %` : "—",
      s.tipos.transf_mas, s.tipos.transf_menos ? mmMod(s.tipos.transf_menos) : "0", s.definitivos],
  })));
  lineaFuente($("g2-fuente"), { fuentes: aapp.fuentes, tablas: fuenteActual, tipo: "dato", nota: "Los porcentajes son un cálculo nuestro." });

  $("g3-explica").textContent = `Crédito con que empezó ${d.año} cada política de gasto, cambio neto hasta ${mes} y crédito actual, en millones de euros. En negrita, las áreas que agrupan varias políticas.`;
  tablaMod($("politicas"), ["Al empezar", "Cambio", "%", "Ahora"], d.politicas.map((p) => ({
    nombre: p.nombre, clase: p.area ? "fila-area" : "", v: [p.iniciales, mmMod(p.modificaciones), p.iniciales ? `${numero(pct(p.modificaciones, p.iniciales), 1)} %` : "—", p.definitivos],
  })));
  lineaFuente($("g3-fuente"), { fuentes: aapp.fuentes, tablas: fuenteActual, tipo: "dato", nota: "Los porcentajes son un cálculo nuestro." });

  pintarComprobaciones($("comprobaciones"), d.comprobaciones);
}
document.addEventListener("DOMContentLoaded", arrancarMod);
