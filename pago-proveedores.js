// Cuentas en limpio: «¿Cuánto tardan las administraciones en pagar a sus proveedores?». Hacienda, series del PMP (RD 1040/2017).
"use strict";

const NOMBRES_CCAA_PP = { "01": "Andalucía", "02": "Aragón", "03": "Asturias", "04": "Illes Balears", "05": "Canarias", "06": "Cantabria",
  "07": "Castilla y León", "08": "Castilla-La Mancha", "09": "Cataluña", "10": "Extremadura", "11": "Galicia", "12": "Comunidad de Madrid",
  "13": "Región de Murcia", "14": "Navarra", "15": "País Vasco", "16": "La Rioja", "17": "Comunitat Valenciana" };
const MESES_PP = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const mesLargo = (p) => `${MESES_PP[Number(p.slice(5, 7)) - 1]} de ${p.slice(0, 4)}`;
const mesCorto = (p) => `${MESES_PP[Number(p.slice(5, 7)) - 1].slice(0, 3)}. ${p.slice(0, 4)}`;

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
  EC.lineas($("g1"), { x: periodos.map((p) => Number(p.slice(0, 4)) + (Number(p.slice(5, 7)) - 1) / 12), etiquetas: periodos.map(mesLargo),
    formato: (v) => numero(Math.round(v), 0), formatoLectura: (v) => `${numero(v, 1)} días`, eje: "días", min: 0,
    referencias: [{ y: 30, color: "#b3261e", nombre: "30 días: máximo legal" }],
    aria: `Periodo medio de pago a proveedores en días, de ${mesLargo(periodos[0])} a ${mesLargo(periodos.at(-1))}`,
    series: [{ nombre: "Administración central", v: alinear(sub.central), color: "--c-primario" },
      { nombre: "comunidades autónomas", v: alinear(sub.regional), color: "--tinta" },
      { nombre: "grandes ayuntamientos y diputaciones", v: alinear(sub.local), color: "--linea-fuerte", discontinua: true }] });
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
