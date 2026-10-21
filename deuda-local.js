// Cuentas en limpio: «¿Cuánto deben los ayuntamientos?». Banco de España (serie), Hacienda (cada ayuntamiento) e INE (población).
"use strict";

const NS_DL = "http://www.w3.org/2000/svg";
function nodoDL(tipo, attrs, padre, texto) {
  const e = document.createElementNS(NS_DL, tipo);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (texto !== undefined) e.textContent = texto;
  if (padre) padre.appendChild(e);
  return e;
}

// Una línea por años, con marcas del eje en cifras redondas y el último valor rotulado.
function lineaDL(caja, años, v, { formato, etiqueta }) {
  const W = 640, H = 250, m = { i: 46, d: 70, a: 14, b: 26 };
  const vals = v.filter((x) => x !== null && x !== undefined);
  const bruto = Math.max(...vals) / 4 || 1;
  const pot = 10 ** Math.floor(Math.log10(bruto));
  const paso = [1, 2, 2.5, 5, 10].map((f) => f * pot).find((x) => x >= bruto);
  const max = Math.ceil(Math.max(...vals) / paso) * paso;
  const x = (k) => m.i + (k * (W - m.i - m.d)) / (años.length - 1);
  const y = (val) => H - m.b - (val * (H - m.a - m.b)) / max;
  const s = nodoDL("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": etiqueta });
  for (let val = 0; val <= max + paso / 2; val += paso) {
    nodoDL("line", { x1: m.i, x2: W - m.d, y1: y(val), y2: y(val), class: "rejilla-ea" }, s);
    nodoDL("text", { x: m.i - 8, y: y(val) + 4, "text-anchor": "end", class: "rotulo-recorrido" }, s, formato(val));
  }
  años.forEach((a, k) => { if (a % 5 === 0 || k === años.length - 1) nodoDL("text", { x: x(k), y: H - 6, "text-anchor": "middle", class: "rotulo-recorrido" }, s, a); });
  const pts = v.map((val, k) => (val === null || val === undefined ? null : [x(k), y(val)])).filter(Boolean);
  nodoDL("polyline", { points: pts.map((p) => p.join(",")).join(" "), class: "linea-recorrido serie-actual" }, s);
  const [lx, ly] = pts.at(-1);
  nodoDL("circle", { cx: lx, cy: ly, r: 5, class: "punto-ea serie-actual" }, s);
  nodoDL("text", { x: lx + 9, y: ly + 4, class: "dato-recorrido" }, s, formato(vals.at(-1)));
  caja.textContent = "";
  caja.appendChild(s);
}

const PROVINCIAS = { "01": "Araba/Álava", "02": "Albacete", "03": "Alicante/Alacant", "04": "Almería", "05": "Ávila", "06": "Badajoz", "07": "Illes Balears",
  "08": "Barcelona", "09": "Burgos", "10": "Cáceres", "11": "Cádiz", "12": "Castellón/Castelló", "13": "Ciudad Real", "14": "Córdoba", "15": "A Coruña",
  "16": "Cuenca", "17": "Girona", "18": "Granada", "19": "Guadalajara", "20": "Gipuzkoa", "21": "Huelva", "22": "Huesca", "23": "Jaén", "24": "León",
  "25": "Lleida", "26": "La Rioja", "27": "Lugo", "28": "Madrid", "29": "Málaga", "30": "Murcia", "31": "Navarra", "32": "Ourense", "33": "Asturias",
  "34": "Palencia", "35": "Las Palmas", "36": "Pontevedra", "37": "Salamanca", "38": "Santa Cruz de Tenerife", "39": "Cantabria", "40": "Segovia",
  "41": "Sevilla", "42": "Soria", "43": "Tarragona", "44": "Teruel", "45": "Toledo", "46": "Valencia/València", "47": "Valladolid", "48": "Bizkaia",
  "49": "Zamora", "50": "Zaragoza", "51": "Ceuta", "52": "Melilla" };

const sinTildes = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

async function arrancarDL() {
  let d, aapp;
  try {
    [d, aapp] = await Promise.all(["datos/deuda_local.json", "datos/aapp.json"].map((u) => fetch(u).then((r) => r.json())));
  } catch {
    document.getElementById("respuesta").textContent = "No se han podido cargar los datos.";
    return;
  }
  const $ = (id) => document.getElementById(id);
  const s = d.serie, mu = d.municipios, n = s.años.length - 1;
  const pibMax = Math.max(...s.pib.filter((x) => x !== null));
  const añoMax = s.años[s.pib.indexOf(pibMax)];
  const tablasBdE = [["bde_be1408", "deuda PDE de las corporaciones locales (cuadro 14.8)"], ["bde_be1406", "deuda por tipo de entidad y de las grandes ciudades (cuadro 14.6)"]];
  const fuenteMun = [[mu.tabla, `deuda viva de cada ayuntamiento a 31 de diciembre de ${mu.año}`], [mu.tabla_poblacion, `población de cada municipio a 1 de enero de ${mu.año_poblacion}`]];
  const mediaHab = (1e6 * (mu.total - mu.conciliacion)) / mu.poblacion;

  const r = $("respuesta");
  r.textContent = "";
  const s1 = document.createElement("strong");
  s1.textContent = `A final de ${s.años[n]}, ayuntamientos, diputaciones y cabildos debían ${numero(s.meur[n], 0)} millones de euros, el ${numero(s.pib[n], 1)} % del PIB`;
  r.append(s1, `; en ${añoMax}, el año más alto, llegó al ${numero(pibMax, 1)} %. De los ${numero(mu.n, 0)} ayuntamientos, ${numero(mu.sin_deuda, 0)} no debían nada a final de ${mu.año}.`);

  const caja = $("cifras");
  caja.textContent = "";
  const rp = s.reparto;
  for (const [nombre, valor, explica] of [
    [`Entidades locales, ${s.años[n]}`, `${numero(s.meur[n], 0)} M€`, `el ${numero(s.pib[n], 1)} % del PIB.`],
    ["Ayuntamientos", `${numero(Math.round(rp.capitales + rp.no_capitales), 0)} M€`, `de ellos, ${numero(Math.round(rp.capitales), 0)} millones los de las capitales de provincia.`],
    [`Por habitante, ${mu.año}`, `${numero(Math.round(mediaHab), 0)} €`, "deuda media de los ayuntamientos por cada vecino empadronado."],
    ["Sin deuda", numero(mu.sin_deuda, 0), `de ${numero(mu.n, 0)} ayuntamientos no debían nada a final de ${mu.año}.`]]) {
    const dv = document.createElement("div");
    const a = document.createElement("span"); a.className = "nombre"; a.textContent = nombre;
    const b = document.createElement("span"); b.className = "valor"; b.textContent = valor;
    const c = document.createElement("span"); c.className = "explica"; c.textContent = explica;
    dv.append(a, b, c);
    caja.appendChild(dv);
  }
  lineaFuente($("cifras-fuente"), { fuentes: aapp.fuentes, tablas: [tablasBdE[0], tablasBdE[1], ...fuenteMun], tipo: "dato",
    nota: "La deuda por habitante es un cálculo nuestro: la deuda de todos los ayuntamientos entre su población." });

  // Buscador de municipio
  $("buscar-explica").textContent = `La deuda de cada ayuntamiento a 31 de diciembre de ${mu.año}, en total y por habitante (población a 1 de enero de ${mu.año_poblacion}). La media de todos los ayuntamientos es de ${numero(Math.round(mediaHab), 0)} € por habitante.`;
  lineaFuente($("buscar-fuente"), { fuentes: aapp.fuentes, tablas: fuenteMun, tipo: "dato", nota: "La deuda por habitante es un cálculo nuestro." });
  let municipios = null;
  const caja2 = $("resultados-municipio"), campo = $("municipio");
  const pintar = () => {
    const q = sinTildes(campo.value.trim());
    caja2.textContent = "";
    if (q.length < 2 || !municipios) return;
    const encontrados = municipios.m.filter((x) => sinTildes(x[1]).includes(q))
      .sort((a, b) => (sinTildes(a[1]).startsWith(q) ? 0 : 1) - (sinTildes(b[1]).startsWith(q) ? 0 : 1) || b[4] - a[4]).slice(0, 12);
    if (!encontrados.length) { caja2.textContent = "No hay ningún municipio con ese nombre."; return; }
    const ul = document.createElement("ul"); ul.className = "lista-municipios";
    for (const [cod, nombre, , deudaMiles, pob] of encontrados) {
      const li = document.createElement("li");
      const t = document.createElement("strong"); t.textContent = `${nombre} `;
      const p = document.createElement("span"); p.className = "detalle";
      p.textContent = `${PROVINCIAS[cod.slice(0, 2)] || ""} · ${numero(pob, 0)} habitantes`;
      const v = document.createElement("span"); v.className = "cifra-municipio";
      const cuanto = deudaMiles >= 1000 ? `${numero(Math.round(deudaMiles / 100) / 10, 1)} millones de euros` : `${numero(Math.max(1, Math.round(deudaMiles)), 0)} mil euros`;
      v.textContent = deudaMiles === 0 ? "No debía nada." : `Debía ${cuanto}: ${numero(Math.round((deudaMiles * 1000) / pob), 0)} € por habitante.`;
      li.append(t, v, p);
      ul.appendChild(li);
    }
    caja2.appendChild(ul);
  };
  campo.addEventListener("focus", async () => {
    if (!municipios) { municipios = await fetch("datos/municipios.json").then((x) => x.json()); pintar(); }
  }, { once: true });
  campo.addEventListener("input", async () => {
    if (!municipios) municipios = await fetch("datos/municipios.json").then((x) => x.json());
    pintar();
  });

  lineaDL($("g1"), s.años, s.pib, { formato: (v) => `${numero(v, 1)} %`,
    etiqueta: `Deuda de las entidades locales en % del PIB, ${s.años[0]}–${s.años[n]}: ${s.años.map((a, k) => `${a}, ${numero(s.pib[k] ?? 0, 1)} %`).join("; ")}` });
  lineaFuente($("g1-fuente"), { fuentes: aapp.fuentes, tablas: [tablasBdE[0]], tipo: "dato" });

  $("g2-explica").textContent = `Deuda de las entidades locales por tipo a final de ${rp.año}, en millones de euros.`;
  const t = $("reparto");
  t.textContent = "";
  const filas = [["Ayuntamientos de capitales de provincia", rp.capitales], ["Los demás ayuntamientos", rp.no_capitales, "con las mancomunidades y entidades locales menores"],
    ["Diputaciones forales", rp.diputaciones_forales, "Álava, Bizkaia y Gipuzkoa"], ["Diputaciones de régimen común", rp.diputaciones_comun],
    ["Consejos y cabildos insulares", rp.consejos_cabildos], ["Ceuta y Melilla", rp.ciudades_autonomas]];
  const max = Math.max(...filas.map((f) => f[1]));
  for (const [nombre, v, det] of filas) {
    const tr = t.insertRow();
    const a = tr.insertCell(); a.textContent = nombre;
    if (det) { const sp = document.createElement("span"); sp.className = "detalle"; sp.textContent = det; a.appendChild(sp); }
    const b = document.createElement("span"); b.className = "barra"; b.style.width = `${Math.max(1, (100 * v) / max)}%`; a.appendChild(b);
    const c = tr.insertCell(); c.className = "cifra"; c.textContent = `${numero(Math.round(v), 0)} M€`;
  }
  const tr = t.insertRow(); tr.className = "fila-total";
  tr.insertCell().textContent = "Total";
  const c = tr.insertCell(); c.className = "cifra"; c.textContent = `${numero(s.meur[n], 0)} M€`;
  lineaFuente($("g2-fuente"), { fuentes: aapp.fuentes, tablas: [tablasBdE[1]], tipo: "dato" });

  $("g3-explica").textContent = `Deuda de cada ayuntamiento a final de ${mu.año}, en millones de euros y en euros por habitante, por orden alfabético.`;
  const tc = $("ciudades");
  tc.textContent = "";
  const cab = tc.createTHead().insertRow();
  for (const h of ["", "Millones de €", "€ por habitante"]) { const th = document.createElement("th"); th.textContent = h; cab.appendChild(th); }
  const cuerpo = tc.createTBody();
  for (const x of mu.ciudades) {
    const f = cuerpo.insertRow();
    f.insertCell().textContent = x.nombre;
    const a = f.insertCell(); a.className = "cifra"; a.textContent = numero(x.meur, 1);
    const b = f.insertCell(); b.className = "cifra"; b.textContent = x.habitante === null ? "—" : numero(x.habitante, 0);
  }
  lineaFuente($("g3-fuente"), { fuentes: aapp.fuentes, tablas: [tablasBdE[1], fuenteMun[1]], tipo: "dato", nota: "Los euros por habitante son un cálculo nuestro." });

  pintarComprobaciones($("comprobaciones"), d.comprobaciones);
}
document.addEventListener("DOMContentLoaded", arrancarDL);
