// Cuentas en limpio: «¿Cuánto tardan las administraciones en pagar a sus proveedores?». Hacienda, series del PMP (RD 1040/2017).
"use strict";

const NS_PP = "http://www.w3.org/2000/svg";
function nodoPP(tipo, attrs, padre, texto) {
  const e = document.createElementNS(NS_PP, tipo);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (texto !== undefined) e.textContent = texto;
  if (padre) padre.appendChild(e);
  return e;
}
const NOMBRES_CCAA_PP = { "01": "Andalucía", "02": "Aragón", "03": "Asturias", "04": "Illes Balears", "05": "Canarias", "06": "Cantabria",
  "07": "Castilla y León", "08": "Castilla-La Mancha", "09": "Cataluña", "10": "Extremadura", "11": "Galicia", "12": "Comunidad de Madrid",
  "13": "Región de Murcia", "14": "Navarra", "15": "País Vasco", "16": "La Rioja", "17": "Comunitat Valenciana" };
const MESES_PP = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const mesLargo = (p) => `${MESES_PP[Number(p.slice(5, 7)) - 1]} de ${p.slice(0, 4)}`;
const mesCorto = (p) => `${MESES_PP[Number(p.slice(5, 7)) - 1].slice(0, 3)}. ${p.slice(0, 4)}`;

// Líneas por meses con la referencia de los 30 días; rótulos al final, separados si se pisan.
function lineasPP(caja, periodos, series, etiqueta) {
  const W = 640, H = 260, m = { i: 40, d: 130, a: 14, b: 26 };
  const todos = series.flatMap((s) => s.v.filter((x) => x !== null));
  const max = Math.ceil(Math.max(...todos, 30) / 10) * 10;
  const x = (k) => m.i + (k * (W - m.i - m.d)) / (periodos.length - 1);
  const y = (v) => H - m.b - (v * (H - m.a - m.b)) / max;
  const s = nodoPP("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": etiqueta });
  for (let v = 0; v <= max; v += 10) {
    nodoPP("line", { x1: m.i, x2: W - m.d, y1: y(v), y2: y(v), class: "rejilla-ea" }, s);
    nodoPP("text", { x: m.i - 8, y: y(v) + 4, "text-anchor": "end", class: "rotulo-recorrido" }, s, v);
  }
  nodoPP("line", { x1: m.i, x2: W - m.d, y1: y(30), y2: y(30), class: "referencia-pp" }, s);
  periodos.forEach((p, k) => { if (p.endsWith("-01") && Number(p.slice(0, 4)) % 2 === 0) nodoPP("text", { x: x(k), y: H - 6, "text-anchor": "middle", class: "rotulo-recorrido" }, s, p.slice(0, 4)); });
  const rotulos = [];
  for (const z of series) {
    const pts = z.v.map((v, k) => (v === null ? null : [x(k), y(v)])).filter(Boolean);
    nodoPP("polyline", { points: pts.map((p) => p.join(",")).join(" "), class: `linea-recorrido ${z.clase}` }, s);
    const [lx, ly] = pts.at(-1);
    nodoPP("circle", { cx: lx, cy: ly, r: 4, class: `punto-ea ${z.clase}` }, s);
    rotulos.push({ x: lx + 8, y: ly + 4, texto: `${numero(Math.round(z.v.filter((v) => v !== null).at(-1)), 0)} ${z.nombre}` });
  }
  rotulos.sort((a, b) => a.y - b.y);
  for (let k = 1; k < rotulos.length; k++) rotulos[k].y = Math.max(rotulos[k].y, rotulos[k - 1].y + 15);
  for (const r of rotulos) nodoPP("text", { x: r.x, y: r.y, class: "dato-recorrido" }, s, r.texto);
  caja.textContent = "";
  caja.appendChild(s);
}

function tablaPP(t, filas, cabeceras) {
  t.textContent = "";
  const cab = t.createTHead().insertRow();
  for (const c of ["", ...cabeceras]) { const th = document.createElement("th"); th.textContent = c; cab.appendChild(th); }
  const cuerpo = t.createTBody();
  for (const f of filas) {
    const tr = cuerpo.insertRow();
    tr.dataset.buscar = f.buscar || "";
    const a = tr.insertCell(); a.textContent = f.nombre;
    for (const v of f.v) {
      const c = tr.insertCell(); c.className = "cifra";
      c.textContent = v === null || v === undefined ? "—" : numero(v, 1);
      if (v > 30) c.classList.add("por-encima");
    }
  }
}
const sinTildesPP = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

async function arrancarPP() {
  let d, aapp;
  try {
    [d, aapp] = await Promise.all(["datos/pmp.json", "datos/aapp.json"].map((u) => fetch(u).then((r) => r.json())));
  } catch {
    document.getElementById("respuesta").textContent = "No se han podido cargar los datos.";
    return;
  }
  const $ = (id) => document.getElementById(id);
  const fuente = [[d.tabla, "periodo medio de pago a proveedores, series mensuales"]];
  const sub = Object.fromEntries(d.subsectores.map((s) => [s.clave.startsWith("ADMINISTRACIÓN CENTRAL") ? "central" : s.clave.startsWith("FONDOS") ? "ss" : s.clave.startsWith("ADMINISTRACIÓN REGIONAL") ? "regional" : "local", s]));
  const ultimo = (s) => { const k = s.v.map((v) => v !== null).lastIndexOf(true); return { v: s.v[k], p: s.periodos[k] }; };
  const c = ultimo(sub.central), rg = ultimo(sub.regional), lo = ultimo(sub.local), ss = ultimo(sub.ss);

  const r = $("respuesta");
  r.textContent = "";
  const s1 = document.createElement("strong");
  s1.textContent = `En ${mesLargo(c.p)}, la Administración central tardaba de media ${numero(Math.round(c.v), 0)} días en pagar a sus proveedores`;
  r.append(s1, `; las comunidades autónomas, ${numero(Math.round(rg.v), 0)} días, y los grandes ayuntamientos y las diputaciones, ${numero(Math.round(lo.v), 0)} (en ${mesLargo(rg.p)}). La ley fija un máximo de 30 días.`);

  const caja = $("cifras");
  caja.textContent = "";
  for (const [nombre, u, s, explica] of [["Administración central", c, sub.central, "el Estado y sus organismos"], ["Seguridad Social", ss, sub.ss, "sus entidades y el servicio de empleo"],
    ["Comunidades autónomas", rg, sub.regional, "todas juntas"], ["Grandes ayuntamientos y diputaciones", lo, sub.local, "los del modelo de cesión de tributos"]]) {
    const dv = document.createElement("div");
    const a = document.createElement("span"); a.className = "nombre"; a.textContent = `${nombre}, ${mesCorto(u.p)}`;
    const b = document.createElement("span"); b.className = "valor"; b.textContent = `${numero(u.v, 1)} días`;
    const e = document.createElement("span"); e.className = "explica"; e.textContent = `${explica}; facturas pendientes de pago: ${numero(s.pendiente_meur, 0)} millones de euros.`;
    dv.append(a, b, e);
    caja.appendChild(dv);
  }
  lineaFuente($("cifras-fuente"), { fuentes: aapp.fuentes, tablas: fuente, tipo: "dato", nota: "Los importes del fichero van en euros aunque la cabecera diga miles: lo explica la comprobación del final." });

  const periodos = sub.central.periodos;
  const alinear = (s) => periodos.map((p) => { const k = s.periodos.indexOf(p); return k < 0 ? null : s.v[k]; });
  lineasPP($("g1"), periodos, [
    { v: alinear(sub.central), clase: "serie-actual", nombre: "central" },
    { v: alinear(sub.regional), clase: "serie-anterior", nombre: "comunidades" },
    { v: alinear(sub.local), clase: "serie-antigua", nombre: "ayuntamientos" },
  ], `Periodo medio de pago a proveedores en días, de ${mesLargo(periodos[0])} a ${mesLargo(periodos.at(-1))}`);
  lineaFuente($("g1-fuente"), { fuentes: aapp.fuentes, tablas: fuente, tipo: "dato" });

  $("g2-explica").textContent = `Periodo medio de pago de cada comunidad en ${mesLargo(d.ccaa.periodo)} y media de los doce meses hasta entonces, en días. En negrita, por encima de 30 días.`;
  tablaPP($("ccaa"), d.ccaa.filas.map((f) => ({ nombre: NOMBRES_CCAA_PP[f.codigo.slice(7, 9)] || f.nombre, v: [f.ultimo, f.media12] }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")), [mesCorto(d.ccaa.periodo), "Media 12 meses"]);
  lineaFuente($("g2-fuente"), { fuentes: aapp.fuentes, tablas: fuente, tipo: "dato", nota: "La media de doce meses es un cálculo nuestro, ponderada por lo pagado y lo pendiente de cada mes." });

  $("g3-explica").textContent = `Periodo medio de pago en ${mesLargo(d.locales.periodo)} y media de los doce meses hasta entonces, en días, de las ${d.locales.filas.length} entidades que publica Hacienda: capitales de provincia, municipios de más de 75.000 habitantes y diputaciones, consejos y cabildos.`;
  const filasLoc = d.locales.filas.map((f) => ({ nombre: f.nombre, buscar: sinTildesPP(f.nombre), v: [f.ultimo, f.media12] })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  tablaPP($("locales"), filasLoc, [mesCorto(d.locales.periodo), "Media 12 meses"]);
  $("filtro-locales").addEventListener("input", (e) => {
    const q = sinTildesPP(e.target.value.trim());
    for (const tr of $("locales").tBodies[0].rows) tr.hidden = q.length > 0 && !tr.dataset.buscar.includes(q);
  });
  lineaFuente($("g3-fuente"), { fuentes: aapp.fuentes, tablas: fuente, tipo: "dato", nota: "La media de doce meses es un cálculo nuestro, ponderada por lo pagado y lo pendiente de cada mes." });

  pintarComprobaciones($("comprobaciones"), d.comprobaciones);
}
document.addEventListener("DOMContentLoaded", arrancarPP);
