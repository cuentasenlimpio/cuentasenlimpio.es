// Cuentas en limpio: «¿Qué riesgos tiene el Estado además de su deuda?». Avales del Estado (Banco de España) y
// pasivos contingentes de la Directiva 2011/85 (Eurostat, 2021 en adelante).
"use strict";

const NS_AV = "http://www.w3.org/2000/svg";
function nodoAV(tipo, attrs, padre, texto) {
  const e = document.createElementNS(NS_AV, tipo);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (texto !== undefined) e.textContent = texto;
  if (padre) padre.appendChild(e);
  return e;
}

// Una línea por años, con marcas del eje en cifras redondas y el último valor rotulado.
function lineaAños(caja, años, v, { formato, etiqueta }) {
  const W = 640, H = 250, m = { i: 46, d: 70, a: 14, b: 26 };
  const vals = v.filter((x) => x !== null && x !== undefined);
  const bruto = Math.max(...vals) / 4 || 1;
  const pot = 10 ** Math.floor(Math.log10(bruto));
  const paso = [1, 2, 2.5, 5, 10].map((f) => f * pot).find((x) => x >= bruto);
  const max = Math.ceil(Math.max(...vals) / paso) * paso;
  const x = (k) => m.i + (k * (W - m.i - m.d)) / (años.length - 1);
  const y = (val) => H - m.b - (val * (H - m.a - m.b)) / max;
  const s = nodoAV("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": etiqueta });
  for (let val = 0; val <= max + paso / 2; val += paso) {
    nodoAV("line", { x1: m.i, x2: W - m.d, y1: y(val), y2: y(val), class: "rejilla-ea" }, s);
    nodoAV("text", { x: m.i - 8, y: y(val) + 4, "text-anchor": "end", class: "rotulo-recorrido" }, s, formato(val));
  }
  años.forEach((a, k) => { if (a % 5 === 0 || k === años.length - 1) nodoAV("text", { x: x(k), y: H - 6, "text-anchor": "middle", class: "rotulo-recorrido" }, s, a); });
  const pts = v.map((val, k) => (val === null || val === undefined ? null : [x(k), y(val)])).filter(Boolean);
  nodoAV("polyline", { points: pts.map((p) => p.join(",")).join(" "), class: "linea-recorrido serie-actual" }, s);
  const [lx, ly] = pts.at(-1);
  nodoAV("circle", { cx: lx, cy: ly, r: 5, class: "punto-ea serie-actual" }, s);
  nodoAV("text", { x: lx + 9, y: ly + 4, class: "dato-recorrido" }, s, formato(vals.at(-1)));
  caja.textContent = "";
  caja.appendChild(s);
}

// Tabla con una fila por partida y una columna por año.
function tablaAños(t, cabeceras, filas) {
  t.textContent = "";
  const cab = t.createTHead().insertRow();
  for (const c of ["", ...cabeceras]) { const th = document.createElement("th"); th.textContent = c; cab.appendChild(th); }
  const cuerpo = t.createTBody();
  for (const f of filas) {
    const tr = cuerpo.insertRow();
    if (f.total) tr.className = "fila-total";
    const a = tr.insertCell(); a.textContent = f.nombre;
    if (f.detalle) { const d = document.createElement("span"); d.className = "detalle"; d.textContent = f.detalle; a.appendChild(d); }
    for (const v of f.v) { const c = tr.insertCell(); c.className = "cifra"; c.textContent = v === null || v === undefined ? "—" : numero(Math.round(v), 0); }
  }
}

async function arrancarAV() {
  let d, aapp;
  try {
    [d, aapp] = await Promise.all(["datos/avales.json", "datos/aapp.json"].map((u) => fetch(u).then((r) => r.json())));
  } catch {
    document.getElementById("respuesta").textContent = "No se han podido cargar los datos.";
    return;
  }
  const $ = (id) => document.getElementById(id);
  const av = d.avales, u = av.ultimo, n = av.años.length - 1;
  const tablasBdE = [["bde_be12c", "avales concedidos por el Estado, por destino (cuadro 12.c)"], ["bde_be1208", "avales prestados en % del PIB (cuadro 12.8)"]];

  const r = $("respuesta");
  r.textContent = "";
  const s1 = document.createElement("strong");
  s1.textContent = `En ${u.mes} de ${u.año}, el Estado tenía avalados ${numero(u.meur, 0)} millones de euros`;
  r.append(s1, `: si quienes recibieron esos préstamos dejaran de pagarlos, pagaría el Estado. A final de ${av.años[n]} era el ${numero(av.pib[n], 1)} % del PIB; en ${av.años[av.pib.indexOf(Math.max(...av.pib.filter((x) => x !== null)))]}, el año más alto, el ${numero(Math.max(...av.pib.filter((x) => x !== null)), 1)} %.`);

  const caja = $("cifras");
  caja.textContent = "";
  for (const [nombre, v, explica] of [
    [`Avales del Estado, ${u.mes} de ${u.año}`, u.meur, "en total; en millones de euros."],
    ["A programas de la Unión Europea", u.partes.ue, "los rescates de la zona euro, el SURE, el Fondo de Garantía Paneuropeo y Ucrania."],
    ["Líneas COVID del ICO", u.partes.covid, "préstamos a autónomos y empresas avalados durante la pandemia."],
    ["A otras administraciones", u.partes.otras_aapp, "avales a entidades que forman parte de las propias administraciones."]]) {
    const dv = document.createElement("div");
    const a = document.createElement("span"); a.className = "nombre"; a.textContent = nombre;
    const b = document.createElement("span"); b.className = "valor"; b.textContent = `${numero(v, 0)} M€`;
    const c = document.createElement("span"); c.className = "explica"; c.textContent = explica;
    dv.append(a, b, c);
    caja.appendChild(dv);
  }
  lineaFuente($("cifras-fuente"), { fuentes: aapp.fuentes, tablas: [tablasBdE[0]], tipo: "dato" });

  lineaAños($("g1"), av.años, av.pib, { formato: (v) => `${numero(v, 0)} %`,
    etiqueta: `Avales del Estado vivos a final de año en % del PIB, ${av.años[0]}–${av.años[n]}: ${av.años.map((a, k) => `${a}, ${numero(av.pib[k] ?? 0, 1)} %`).join("; ")}` });
  lineaFuente($("g1-fuente"), { fuentes: aapp.fuentes, tablas: [tablasBdE[1]], tipo: "dato" });

  // Desglose: unos años que cuentan la historia (crisis financiera, antes y durante la pandemia) y el último dato
  const ds = av.desglose;
  const elegidos = [2012, 2019, 2021, ds.años.at(-1)].filter((a, k, l) => ds.años.includes(a) && l.indexOf(a) === k);
  const col = (clave) => [...elegidos.map((a) => ds[clave][ds.años.indexOf(a)]), u.partes[clave] ?? null];
  const restoUltimo = u.meur - ["otras_aapp", "ue", "credito", "covid"].reduce((s, k) => s + (u.partes[k] || 0), 0);
  $("g2-explica").textContent = `Avales del Estado vivos según a quién se dieron, en millones de euros: a final de algunos años y el último mes publicado (${u.mes} de ${u.año}).`;
  tablaAños($("desglose"), [...elegidos.map(String), `${u.mes.slice(0, 3)}. ${u.año}`], [
    { nombre: "Entidades de crédito", detalle: "sobre todo, avales a la deuda que emitieron los bancos en la crisis financiera", v: col("credito") },
    { nombre: "Programas de la Unión Europea", v: col("ue") },
    { nombre: "Otras administraciones", v: col("otras_aapp") },
    { nombre: "Pandemia (líneas del ICO)", v: col("covid") },
    { nombre: "Otros", v: [...elegidos.map((a) => ds.resto[ds.años.indexOf(a)]), restoUltimo] },
    { nombre: "Total", total: true, v: [...elegidos.map((a) => av.meur[av.años.indexOf(a)]), u.meur] },
  ]);
  lineaFuente($("g2-fuente"), { fuentes: aapp.fuentes, tablas: [tablasBdE[0]], tipo: "dato", nota: "«Otros» es el total menos las cuatro partidas: un cálculo nuestro." });

  const años = d.morosos.años;
  const de = (bloque, k) => años.map((a) => bloque[k][bloque.años.indexOf(a)] ?? null);
  tablaAños($("otros"), años.map(String), [
    { nombre: "Préstamos impagados", detalle: "dinero que prestaron las administraciones y lleva más de 90 días sin devolverse", v: de(d.morosos, "S13") },
    { nombre: "Asociaciones público-privadas", detalle: "obras pagadas por empresas que las administraciones irán pagando a plazos, fuera de su deuda", v: de(d.ppp, "S13") },
    { nombre: "Lo que deben las empresas públicas", detalle: "todos sus pasivos; empresas controladas por las administraciones que no cuentan como administración", v: de(d.empresas, "total") },
    { nombre: "De ellas, empresas no financieras con pérdidas", v: de(d.empresas, "con_perdidas") },
  ]);
  lineaFuente($("g3-fuente"), { fuentes: aapp.fuentes, tablas: [[d.morosos.tabla, "préstamos impagados"], [d.ppp.tabla, "asociaciones público-privadas"], [d.empresas.tabla, "pasivos de empresas públicas (sin consolidar)"]], tipo: "dato" });
}
document.addEventListener("DOMContentLoaded", arrancarAV);
