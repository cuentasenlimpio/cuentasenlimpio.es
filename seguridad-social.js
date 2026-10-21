// Cuentas en limpio: «¿Cómo se pagan las pensiones?». La Seguridad Social (S1314) en contabilidad nacional, de Eurostat.
"use strict";

const NS = "http://www.w3.org/2000/svg";
function nodoSS(tipo, attrs, padre, texto) {
  const e = document.createElementNS(NS, tipo);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (texto !== undefined) e.textContent = texto;
  if (padre) padre.appendChild(e);
  return e;
}

// Líneas por años, con el último valor de cada serie rotulado y la línea del cero si hace falta.
function lineasAños(caja, años, series, { formato, etiqueta }) {
  const W = 640, H = 250, m = { i: 46, d: 64, a: 14, b: 26 };
  const todos = series.flatMap((s) => s.v.filter((x) => x !== null));
  let min = Math.min(...todos, 0), max = Math.max(...todos);
  const margen = (max - min) * 0.08 || 1;
  min -= min < 0 ? margen : 0; max += margen;
  const x = (k) => m.i + (k * (W - m.i - m.d)) / (años.length - 1);
  const y = (v) => H - m.b - ((v - min) * (H - m.a - m.b)) / (max - min);
  const s = nodoSS("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": etiqueta });
  for (let k = 0; k <= 4; k++) {
    const v = min + ((max - min) * k) / 4;
    nodoSS("line", { x1: m.i, x2: W - m.d, y1: y(v), y2: y(v), class: "rejilla-ea" }, s);
    nodoSS("text", { x: m.i - 8, y: y(v) + 4, "text-anchor": "end", class: "rotulo-recorrido" }, s, formato(v));
  }
  if (min < 0) nodoSS("line", { x1: m.i, x2: W - m.d, y1: y(0), y2: y(0), class: "eje-recorrido" }, s);
  años.forEach((a, k) => { if (a % 5 === 0 || k === años.length - 1) nodoSS("text", { x: x(k), y: H - 6, "text-anchor": "middle", class: "rotulo-recorrido" }, s, a); });
  for (const z of series) {
    const pts = z.v.map((v, k) => (v === null ? null : [x(k), y(v)])).filter(Boolean);
    nodoSS("polyline", { points: pts.map((p) => p.join(",")).join(" "), class: `linea-recorrido ${z.clase}` }, s);
    const [lx, ly] = pts.at(-1);
    nodoSS("circle", { cx: lx, cy: ly, r: 5, class: `punto-ea ${z.clase}` }, s);
    nodoSS("text", { x: lx + 9, y: ly + 4, class: "dato-recorrido" }, s, formato(z.v.at(-1)));
  }
  caja.textContent = "";
  caja.appendChild(s);
}

async function arrancarSS() {
  let d, aapp;
  try {
    [d, aapp] = await Promise.all(["datos/seguridad_social.json", "datos/aapp.json"].map((u) => fetch(u).then((r) => r.json())));
  } catch {
    document.getElementById("respuesta").textContent = "No se han podido cargar los datos.";
    return;
  }
  const $ = (id) => document.getElementById(id);
  const p = d.partidas, años = d.años, i = años.length - 1, año = años[i];
  const m = (k) => p[k].meur[i], pib = (k) => p[k].pib[i];
  const de100 = (a, b) => Math.round((100 * a) / b);
  const r = $("respuesta");
  r.textContent = `En ${año}, la Seguridad Social ingresó ${eurosMillones(m("ingresos"))}. `;
  const s1 = document.createElement("strong");
  s1.textContent = `De cada 100 €, ${de100(m("cotizaciones"), m("ingresos"))} fueron cotizaciones y ${de100(m("transferencias") + m("transferencias_capital"), m("ingresos"))} llegaron de otras administraciones, sobre todo del Estado`;
  r.append(s1, `. Gastó ${eurosMillones(m("gastos"))}, casi todo (${de100(m("prestaciones"), m("gastos"))} de cada 100 €) en prestaciones: pensiones, paro, bajas y permisos. ${m("saldo") < 0 ? "Faltaron" : "Sobraron"} ${eurosMillones(Math.abs(m("saldo")))}, el ${numero(Math.abs(pib("saldo")), 1)} % del PIB.`);

  const caja = $("cifras");
  caja.textContent = "";
  for (const [nombre, k, explica] of [["Cotizaciones", "cotizaciones", "lo que pagan empresas y trabajadores por cada sueldo"],
    ["Transferencias de otras administraciones", "transferencias", "sobre todo del Estado, con dinero de los impuestos"],
    ["Prestaciones", "prestaciones", "pensiones contributivas, paro, bajas y permisos"],
    [m("saldo") < 0 ? "Faltó (déficit)" : "Sobró (superávit)", "saldo", "después de las transferencias"]]) {
    const dv = document.createElement("div");
    dv.innerHTML = "";
    const a = document.createElement("span"); a.className = "nombre"; a.textContent = `${nombre}, ${año}`;
    const b = document.createElement("span"); b.className = "valor"; b.textContent = `${numero(Math.abs(pib(k)), 1)} %`;
    const c = document.createElement("span"); c.className = "explica"; c.textContent = `del PIB: ${numero(Math.round(Math.abs(m(k))), 0)} millones de euros; ${explica}.`;
    dv.append(a, b, c);
    caja.appendChild(dv);
  }
  const tablas = [["gov_10a_main", "cuentas de los fondos de la Seguridad Social (sector S1314)"]];
  lineaFuente($("cifras-fuente"), { fuentes: aapp.fuentes, tablas, tipo: "dato" });

  const f1 = (v) => `${numero(v, 1)} %`;
  lineasAños($("g1"), años, [
    { v: p.prestaciones.pib, clase: "serie-anterior" },
    { v: p.cotizaciones.pib, clase: "serie-actual" },
  ], { formato: f1, etiqueta: `Prestaciones y cotizaciones de la Seguridad Social en % del PIB, ${años[0]}–${año}` });
  lineaFuente($("g1-fuente"), { fuentes: aapp.fuentes, tablas, tipo: "dato" });
  lineasAños($("g2"), años, [
    { v: p.saldo_sin_transferencias.pib, clase: "serie-anterior" },
    { v: p.saldo.pib, clase: "serie-actual" },
  ], { formato: f1, etiqueta: `Saldo de la Seguridad Social en % del PIB, publicado y sin transferencias, ${años[0]}–${año}` });
  lineaFuente($("g2-fuente"), { fuentes: aapp.fuentes, tablas, tipo: "lectura", nota: "El saldo sin transferencias es el publicado menos las transferencias corrientes y de capital recibidas." });

  const fr = d.fondo_reserva;
  if (fr) {
    const q = $("fondo-reserva");
    q.textContent = `El Fondo de Reserva, la «hucha de las pensiones», tenía ${numero(fr.meur, 0)} millones de euros al acabar ${fr.año}: algo menos de lo que cuesta un mes de pensiones contributivas. `;
    const a = document.createElement("a"); a.href = fr.url; a.textContent = `Fuente: ${fr.fuente}`;
    q.appendChild(a);
  }
}
const eurosMillones = (v) => `unos ${numero(Math.round(v / 100) * 100, 0)} millones de euros`;
document.addEventListener("DOMContentLoaded", arrancarSS);
