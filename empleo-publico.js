// Cuentas en limpio: «¿Cuánta gente trabaja en lo público?». EPA (INE) y remuneración de asalariados (Eurostat).
"use strict";

const NS_EP = "http://www.w3.org/2000/svg";
function nodoEP(tipo, attrs, padre, texto) {
  const e = document.createElementNS(NS_EP, tipo);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (texto !== undefined) e.textContent = texto;
  if (padre) padre.appendChild(e);
  return e;
}

// Líneas sobre periodos (años o trimestres «AAAATn»), con el rótulo de cada serie al final, separados si se pisan.
function lineasEP(caja, periodos, series, { formato, etiqueta, rotuloX, desdeCero = true }) {
  const W = 640, H = 250, m = { i: 46, d: 150, a: 14, b: 26 };
  const todos = series.flatMap((s) => s.v.filter((x) => x !== null && x !== undefined));
  // Marcas del eje en cifras redondas (1, 2 o 5 por una potencia de 10)
  const bruto = (Math.max(...todos) - Math.min(...todos, desdeCero ? 0 : Infinity)) / 4 || 1;
  const pot = 10 ** Math.floor(Math.log10(bruto));
  const paso = [1, 2, 2.5, 5, 10].map((f) => f * pot).find((x) => x >= bruto);
  const min = desdeCero ? 0 : Math.floor(Math.min(...todos) / paso) * paso;
  const max = Math.ceil(Math.max(...todos) / paso) * paso;
  const x = (k) => m.i + (k * (W - m.i - m.d)) / (periodos.length - 1);
  const y = (v) => H - m.b - ((v - min) * (H - m.a - m.b)) / (max - min);
  const s = nodoEP("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": etiqueta });
  for (let v = min; v <= max + paso / 2; v += paso) {
    nodoEP("line", { x1: m.i, x2: W - m.d, y1: y(v), y2: y(v), class: "rejilla-ea" }, s);
    nodoEP("text", { x: m.i - 8, y: y(v) + 4, "text-anchor": "end", class: "rotulo-recorrido" }, s, formato(v));
  }
  periodos.forEach((p, k) => { const r = rotuloX(p, k); if (r) nodoEP("text", { x: x(k), y: H - 6, "text-anchor": "middle", class: "rotulo-recorrido" }, s, r); });
  const rotulos = [];
  for (const z of series) {
    const pts = z.v.map((v, k) => (v === null || v === undefined ? null : [x(k), y(v)])).filter(Boolean);
    if (!pts.length) continue;
    nodoEP("polyline", { points: pts.map((p) => p.join(",")).join(" "), class: `linea-recorrido ${z.clase}` }, s);
    const [lx, ly] = pts.at(-1);
    nodoEP("circle", { cx: lx, cy: ly, r: 5, class: `punto-ea ${z.clase}` }, s);
    rotulos.push({ x: lx + 9, y: ly + 4, texto: z.nombre ? `${formato(z.v.at(-1))} ${z.nombre}` : formato(z.v.at(-1)) });
  }
  rotulos.sort((a, b) => a.y - b.y);
  for (let k = 1; k < rotulos.length; k++) rotulos[k].y = Math.max(rotulos[k].y, rotulos[k - 1].y + 15);
  for (const r of rotulos) nodoEP("text", { x: r.x, y: r.y, class: "dato-recorrido" }, s, r.texto);
  caja.textContent = "";
  caja.appendChild(s);
}

// Tabla con barra bajo cada nombre; `resaltar` marca una fila (España en la comparación europea).
function tablaBarras(t, filas, { formato, resaltar = () => false }) {
  t.textContent = "";
  const max = Math.max(...filas.map((f) => f.v));
  for (const f of filas) {
    const tr = t.insertRow();
    if (resaltar(f)) tr.className = "fila-es";
    const a = tr.insertCell();
    a.textContent = f.nombre;
    if (f.detalle) { const d = document.createElement("span"); d.className = "detalle"; d.textContent = f.detalle; a.appendChild(d); }
    const b = document.createElement("span"); b.className = "barra"; b.style.width = `${Math.max(1, (100 * f.v) / max)}%`;
    a.appendChild(b);
    const c = tr.insertCell(); c.className = "cifra"; c.textContent = formato(f.v);
  }
}

const trimestreLegible = (t) => `${["primer", "segundo", "tercer", "cuarto"][Number(t.slice(-1)) - 1]} trimestre de ${t.slice(0, 4)}`;
const miles = (v) => `${numero(Math.round(v), 0)} mil`;

async function arrancarEP() {
  let d, aapp;
  try {
    [d, aapp] = await Promise.all(["datos/empleo_publico.json", "datos/aapp.json"].map((u) => fetch(u).then((r) => r.json())));
  } catch {
    document.getElementById("respuesta").textContent = "No se han podido cargar los datos.";
    return;
  }
  const $ = (id) => document.getElementById(id);
  const e = d.epa, rem = d.remuneracion;
  const i = e.trimestres.length - 1, t = e.trimestres[i];
  const ia = e.trimestres.indexOf(`${Number(t.slice(0, 4)) - 1}${t.slice(4)}`);
  const admin = Object.fromEntries(e.admin.map((a) => [a.clave, a]));
  const de100 = (a, b) => Math.round((100 * a) / b);
  const ri = rem.años.length - 1, rAño = rem.años[ri];

  const r = $("respuesta");
  r.textContent = "";
  const s1 = document.createElement("strong");
  s1.textContent = `En el ${trimestreLegible(t)}, unos ${numero(Math.round(e.total[i] / 10) / 100, 2)} millones de asalariados trabajaban para el sector público: ${numero(e.pct_asalariados[i], 0)} de cada 100 de los que trabajan por cuenta ajena`;
  r.append(s1, `. ${de100(admin.comunidades.v[i], e.total[i])} de cada 100 lo hacían para una comunidad autónoma. En ${rAño}, las administraciones pagaron ${numero(Math.round(rem.total.meur[ri] / 1000), 0)} mil millones de euros en sueldos y cotizaciones de su personal: el ${numero(rem.total.pib[ri], 1)} % del PIB y ${numero(Math.round(rem.pct_gasto[ri]), 0)} de cada 100 € de todo el gasto público.`);

  const caja = $("cifras");
  caja.textContent = "";
  const cifra = (nombre, valor, explica) => {
    const dv = document.createElement("div");
    const a = document.createElement("span"); a.className = "nombre"; a.textContent = nombre;
    const b = document.createElement("span"); b.className = "valor"; b.textContent = valor;
    const c = document.createElement("span"); c.className = "explica"; c.textContent = explica;
    dv.append(a, b, c);
    caja.appendChild(dv);
  };
  const variacionAnual = ia >= 0 ? e.total[i] - e.total[ia] : null;
  cifra(`Asalariados públicos, ${t.replace("T", " T")}`, miles(e.total[i]),
    variacionAnual === null ? "personas, según la EPA." : `personas; ${variacionAnual >= 0 ? "+" : "−"}${miles(Math.abs(variacionAnual))} en un año, según la EPA.`);
  cifra("De cada 100 asalariados", `${numero(e.pct_asalariados[i], 1)}`, "trabajan para el sector público.");
  cifra("Con contrato temporal", `${numero(e.pct_temporal[i], 1)} %`, "de los asalariados públicos.");
  cifra(`Sueldos públicos, ${rAño}`, `${numero(rem.total.pib[ri], 1)} %`, `del PIB: ${numero(Math.round(rem.total.meur[ri]), 0)} millones de euros, con las cotizaciones que paga la administración.`);
  lineaFuente($("cifras-fuente"), { fuentes: aapp.fuentes, tablas: [["ine_epa416131", "EPA: asalariados del sector público"], ["ine_epa450290", "EPA: % de asalariados públicos"], ["ine_epa416424", "EPA: % de temporales"], ["gov_10a_main", "remuneración de asalariados de las administraciones (D.1)"]], tipo: "dato" });

  const rotuloT = (p, k) => (p.endsWith("T1") && Number(p.slice(0, 4)) % 4 === 2 ? p.slice(0, 4) : "");
  lineasEP($("g1"), e.trimestres, [
    { v: admin.comunidades.v, clase: "serie-actual", nombre: "comunidades" },
    { v: admin.local.v, clase: "serie-anterior", nombre: "locales" },
    { v: admin.central.v, clase: "serie-antigua", nombre: "central" },
  ], { formato: (v) => numero(Math.round(v), 0), rotuloX: rotuloT, etiqueta: `Asalariados del sector público por administración, en miles, ${e.trimestres[0]}–${t}` });
  lineaFuente($("g1-fuente"), { fuentes: aapp.fuentes, tablas: [["ine_epa416134", "EPA: asalariados públicos en las comunidades autónomas"], ["ine_epa416135", "en la Administración local"], ["ine_epa416132", "en la Administración central"]], tipo: "dato" });
  $("reparto-t").textContent = `Todos los tipos de administración en el ${trimestreLegible(t)}, en miles de personas. Fuente: INE, Encuesta de Población Activa (tabla 65193).`;
  tablaBarras($("reparto"), e.admin.filter((a) => a.v[i] !== null).map((a) => ({ nombre: a.nombre, v: a.v[i] })).sort((a, b) => b.v - a.v), { formato: miles });

  lineasEP($("g2"), e.trimestres, [
    { v: e.pct_asalariados, clase: "serie-actual" },
    { v: e.pct_temporal, clase: "serie-anterior" },
  ], { formato: (v) => `${numero(v, 0)} %`, rotuloX: rotuloT, etiqueta: `Asalariados públicos en % del total y temporales en % de los públicos, ${e.trimestres[0]}–${t}` });
  lineaFuente($("g2-fuente"), { fuentes: aapp.fuentes, tablas: [["ine_epa450290", "EPA: % de asalariados públicos"], ["ine_epa416424", "EPA: % de temporales en el sector público"]], tipo: "dato" });

  if (d.ccaa) {
    $("g3-explica").textContent = `De cada 100 asalariados de cada comunidad autónoma, cuántos trabajan para el sector público, en el ${trimestreLegible(d.ccaa.periodo)}. En el conjunto de España: ${numero(d.ccaa.total, 1)}.`;
    tablaBarras($("ccaa"), [...d.ccaa.filas].sort((a, b) => b.pct - a.pct).map((c) => ({ nombre: c.nombre, v: c.pct })), { formato: (v) => numero(v, 1) });
    lineaFuente($("g3-fuente"), { fuentes: aapp.fuentes, tablas: [[d.ccaa.tabla, "EPA: asalariados por sector y comunidad autónoma"]], tipo: "dato", nota: "En Ceuta, Melilla y las comunidades pequeñas el error de muestreo de la EPA es grande." });
  }

  lineasEP($("g4"), rem.años, [{ v: rem.total.pib, clase: "serie-actual" }],
    { formato: (v) => `${numero(v, 1)} %`, rotuloX: (a, k) => (a % 5 === 0 || k === rem.años.length - 1 ? a : ""), desdeCero: false,
      etiqueta: `Remuneración de asalariados de las administraciones públicas en % del PIB, ${rem.años[0]}–${rAño}` });
  lineaFuente($("g4-fuente"), { fuentes: aapp.fuentes, tablas: [["gov_10a_main", "remuneración de asalariados de las administraciones (D.1, sector S13)"]], tipo: "dato" });
  tablaBarras($("subsectores"), [["Comunidades autónomas", "comunidades"], ["Estado y sus organismos", "estado"], ["Ayuntamientos, diputaciones y cabildos", "local"], ["Seguridad Social", "seguridad_social"]]
    .map(([n, k]) => ({ nombre: n, v: rem[k].meur[ri], detalle: `${numero(rem[k].pib[ri], 1)} % del PIB` })), { formato: (v) => `${numero(Math.round(v), 0)} M€` });
  lineaFuente($("subsectores-fuente"), { fuentes: aapp.fuentes, tablas: [["gov_10a_main", `remuneración de asalariados por subsector en ${rAño} (S1311, S1312, S1313 y S1314)`]], tipo: "dato" });

  if (d.ue) {
    const pos = d.ue.paises.filter((p) => p.geo !== "EU27_2020").findIndex((p) => p.geo === "ES") + 1;
    const media = d.ue.paises.find((p) => p.geo === "EU27_2020");
    $("g5-explica").textContent = `Remuneración de los asalariados de las administraciones públicas en porcentaje del PIB de cada país, en ${d.ue.año}. España ocupa el puesto ${pos} de 27${media ? `; la media de la UE es el ${numero(media.v, 1)} %` : ""}.`;
    tablaBarras($("ue"), d.ue.paises.map((p) => ({ nombre: p.nombre, v: p.v })), { formato: (v) => `${numero(v, 1)} %`, resaltar: (f) => f.nombre === "España" || f.nombre === "UE-27" });
    lineaFuente($("g5-fuente"), { fuentes: aapp.fuentes, tablas: [["ue_gov_10a_main", "remuneración de asalariados de las administraciones en % del PIB (UE-27)"]], tipo: "dato" });
  }
}
document.addEventListener("DOMContentLoaded", arrancarEP);
