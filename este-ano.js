// Cuentas en limpio: «¿Cómo va este año?». Datos en datos/este_ano.json (los rehace la construcción diaria).
"use strict";

const NS_SVG = "http://www.w3.org/2000/svg";
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const mm = (v) => `${numero(Math.round(v), 0)} M€`;
const mmHablado = (v) => `unos ${numero(Math.round(Math.abs(v) / 100) * 100, 0)} millones de euros`;
const variacion = (a, b) => (b ? (100 * (a - b)) / Math.abs(b) : null);
const conSignoPct = (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${numero(Math.abs(v), 1)} %`;

function svg(tipo, attrs, padre, texto) {
  const e = document.createElementNS(NS_SVG, tipo);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (texto !== undefined) e.textContent = texto;
  if (padre) padre.appendChild(e);
  return e;
}

// Líneas por meses (enero a diciembre), una por serie, con el último valor de cada una rotulado.
function lineasMeses(caja, series, { formato, cero = false }) {
  const W = 640, H = 240, m = { i: 54, d: 70, a: 16, b: 26 };
  const todos = series.flatMap((s) => s.v.filter((x) => x !== null && x !== undefined));
  let min = Math.min(...todos, cero ? 0 : Infinity), max = Math.max(...todos, cero ? 0 : -Infinity);
  const margen = (max - min) * 0.08 || 1;
  min -= margen; max += margen;
  const x = (k) => m.i + (k * (W - m.i - m.d)) / 11;
  const y = (v) => H - m.b - ((v - min) * (H - m.a - m.b)) / (max - min);
  const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" });
  s.setAttribute("aria-label", series.map((z) => `${z.nombre}: ${z.v.map((v, k) => (v === null ? "" : `${MESES_CORTOS[k]} ${formato(v)}`)).filter(Boolean).join(", ")}`).join(". "));
  // Rejilla: cuatro marcas en el eje vertical
  for (let k = 0; k <= 3; k++) {
    const v = min + ((max - min) * k) / 3;
    svg("line", { x1: m.i, x2: W - m.d, y1: y(v), y2: y(v), class: "rejilla-ea" }, s);
    svg("text", { x: m.i - 8, y: y(v) + 4, "text-anchor": "end", class: "rotulo-recorrido" }, s, formato(v));
  }
  if (cero && min < 0 && max > 0) svg("line", { x1: m.i, x2: W - m.d, y1: y(0), y2: y(0), class: "eje-recorrido" }, s);
  MESES_CORTOS.forEach((mes, k) => { if (k % 2 === 0 || k === 11) svg("text", { x: x(k), y: H - 6, "text-anchor": "middle", class: "rotulo-recorrido" }, s, mes); });
  for (const z of series) {
    const pts = z.v.map((v, k) => (v === null || v === undefined ? null : [x(k), y(v)])).filter(Boolean);
    if (!pts.length) continue;
    svg("polyline", { points: pts.map((p) => p.join(",")).join(" "), class: `linea-recorrido ${z.clase || ""}` }, s);
    const [lx, ly] = pts.at(-1);
    svg("circle", { cx: lx, cy: ly, r: 5, class: `punto-ea ${z.clase || ""}` }, s);
    svg("text", { x: lx + 9, y: ly + 4, class: "dato-recorrido" }, s, z.etiqueta);
  }
  caja.textContent = "";
  caja.appendChild(s);
}

function cifra(caja, nombre, valor, explica, clase = "") {
  const d = document.createElement("div");
  if (clase) d.className = clase;
  const n = document.createElement("span"); n.className = "nombre"; n.textContent = nombre;
  const v = document.createElement("span"); v.className = "valor"; v.textContent = valor;
  const e = document.createElement("span"); e.className = "explica"; e.textContent = explica;
  d.append(n, v, e);
  caja.appendChild(d);
}

async function arrancarEsteAno() {
  let d, aapp;
  try {
    [d, aapp] = await Promise.all(["datos/este_ano.json", "datos/aapp.json"].map((u) => fetch(u).then((r) => r.json())));
  } catch {
    document.getElementById("respuesta").textContent = "No se han podido cargar los datos del año.";
    return;
  }
  const $ = (id) => document.getElementById(id);
  const frase = $("respuesta");
  frase.textContent = "";

  // Déficit acumulado
  const def = d.deficit;
  if (def) {
    const a = def.actual, p = def.anterior;
    const falta = a.saldo < 0;
    const s1 = document.createElement("strong");
    s1.textContent = `Hasta ${def.mes_nombre} de ${def.año}, ${falta ? "faltaron" : "sobraron"} ${mmHablado(a.saldo)}`;
    frase.append(s1, ` en el Estado, las comunidades y la Seguridad Social; en los mismos meses de ${def.año - 1}, ${p.saldo < 0 ? "faltaron" : "sobraron"} ${mmHablado(p.saldo)}. `);
    $("d-ambito").textContent = `Acumulado de enero a ${def.mes_nombre}, en millones de euros. ${def.ambito}. Datos provisionales de la IGAE, actualizados el ${def.actualizado}.`;
    const caja = $("d-cifras");
    caja.textContent = "";
    cifra(caja, `${falta ? "Faltó" : "Sobró"} (enero–${def.mes_nombre} ${def.año})`, mm(Math.abs(a.saldo)),
      `El ${numero(Math.abs(a.saldo_pib), 1)} % del PIB. Un año antes: ${mm(Math.abs(p.saldo))} (${numero(Math.abs(p.saldo_pib), 1)} %).`, "caja-destacada");
    cifra(caja, "Ingresos", mm(a.ingresos), `${conSignoPct(variacion(a.ingresos, p.ingresos))} frente a los mismos meses de ${def.año - 1}.`);
    cifra(caja, "Gastos", mm(a.gastos), `${conSignoPct(variacion(a.gastos, p.gastos))} frente a los mismos meses de ${def.año - 1}.`);
    cifra(caja, "De ellos, intereses", mm(a.intereses), `${conSignoPct(variacion(a.intereses, p.intereses))} frente a los mismos meses de ${def.año - 1}.`);
    $("d-pie").textContent = `Saldo acumulado desde enero, mes a mes, en millones de euros (negativo: falta dinero)`;
    lineasMeses($("d-grafico"), [
      { nombre: String(def.año - 1), v: def.serie_anterior, clase: "serie-anterior", etiqueta: String(def.año - 1) },
      { nombre: String(def.año), v: def.serie_actual, clase: "serie-actual", etiqueta: String(def.año) },
    ], { formato: (v) => numero(Math.round(v / 1000), 0) + " mil", cero: true });
    lineaFuente($("d-fuente"), {
      fuentes: aapp.fuentes, tablas: [[def.tabla, "operaciones no financieras mensuales de las administraciones (contabilidad nacional)"]], tipo: "dato",
      nota: "Los porcentajes de variación son un cálculo nuestro.",
    });
  }

  // Recaudación
  const rec = d.recaudacion;
  if (rec) {
    const v = variacion(rec.total.actual, rec.total.anterior);
    const s2 = document.createElement("strong");
    s2.textContent = `Hacienda ha recaudado ${mmHablado(rec.total.actual)} en impuestos hasta ${rec.mes_nombre}`;
    frase.append(s2, `, un ${numero(Math.abs(v), 1)} % ${v >= 0 ? "más" : "menos"} que en los mismos meses de ${rec.año - 1}.`);
    $("r-ambito").textContent = `Acumulado de enero a ${rec.mes_nombre} de ${rec.año}, frente a los mismos meses de ${rec.año - 1}. ${rec.ambito}.`;
    const t = $("r-tabla");
    t.textContent = "";
    const max = Math.max(...rec.impuestos.map((i) => i.actual));
    const fila = (nombre, act, ant, total) => {
      const tr = t.insertRow();
      if (total) tr.className = "fila-total";
      const a = tr.insertCell();
      a.textContent = nombre;
      const det = document.createElement("span");
      det.className = "detalle";
      det.textContent = `${conSignoPct(variacion(act, ant))} frente a ${rec.año - 1} (${numero(Math.round(ant), 0)} millones)`;
      a.appendChild(det);
      if (!total) { const b = document.createElement("span"); b.className = "barra"; b.style.width = `${(100 * act) / max}%`; a.appendChild(b); }
      const c = tr.insertCell();
      c.className = "cifra";
      c.textContent = `${numero(Math.round(act), 0)} M€`;
    };
    for (const i of rec.impuestos) fila(i.nombre, i.actual, i.anterior, false);
    fila("Total de ingresos tributarios", rec.total.actual, rec.total.anterior, true);
    const años = Object.keys(rec.series).sort();
    $("r-pie").textContent = "Recaudación acumulada desde enero, mes a mes, en millones de euros";
    lineasMeses($("r-grafico"), años.map((a, k) => ({
      nombre: a, v: rec.series[a], etiqueta: a,
      clase: k === años.length - 1 ? "serie-actual" : k === años.length - 2 ? "serie-anterior" : "serie-antigua",
    })), { formato: (v) => numero(Math.round(v / 1000), 0) + " mil" });
    lineaFuente($("r-fuente"), {
      fuentes: aapp.fuentes, tablas: [[rec.tabla, "informe mensual de recaudación tributaria"]], tipo: "dato",
      nota: "Las sumas desde enero y los porcentajes de variación son un cálculo nuestro.",
    });
  }
}
document.addEventListener("DOMContentLoaded", arrancarEsteAno);
