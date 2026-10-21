// Cuentas en limpio: «Las cuentas en cinco minutos». Seis pasos con los mismos datos que el resto de la web.
"use strict";

const milMillones = (m) => (Math.abs(m) >= 1e6
  ? `${numero(Math.round(m / 1e4) / 100, 2)} billones de euros`
  : Math.abs(m) >= 1e5 ? `${numero(Math.round(m / 1000), 0)}.000 millones de euros` : `${numero(Math.round(m / 100) * 100, 0)} millones de euros`);

// Filas «de cada 100 €» con una barra de un solo color, de mayor a menor.
function filasCien(caja, filas, { decimales = 0, maximo } = {}) {
  caja.textContent = "";
  const tabla = document.createElement("table");
  tabla.className = "tabla-sueldo";
  const max = maximo ?? Math.max(...filas.map((f) => f.v));
  for (const f of filas) {
    const tr = tabla.insertRow();
    const a = tr.insertCell();
    a.textContent = f.nombre.charAt(0).toUpperCase() + f.nombre.slice(1);
    const b = document.createElement("span");
    b.className = "barra";
    b.style.width = `${(100 * f.v) / max}%`;
    a.appendChild(b);
    const c = tr.insertCell();
    c.className = "cifra";
    c.textContent = f.cifra ?? `${numero(f.v, decimales)} €`;
  }
  caja.appendChild(tabla);
}

// Línea sencilla en SVG: la deuda en % del PIB, con el primer año, el mínimo y el último rotulados.
function lineaDeuda(caja, años, valores, referencia) {
  const W = 420, H = 200, m = { i: 14, d: 14, a: 20, b: 24 };
  const max = Math.max(...valores, referencia) * 1.08;
  const x = (k) => m.i + (k * (W - m.i - m.d)) / (años.length - 1);
  const y = (v) => H - m.b - (v * (H - m.a - m.b)) / max;
  const k0 = 0, kmin = valores.indexOf(Math.min(...valores)), kn = valores.length - 1;
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `Deuda en porcentaje del PIB: ${numero(valores[k0], 1)} % en ${años[k0]}, mínimo de ${numero(valores[kmin], 1)} % en ${años[kmin]} y ${numero(valores[kn], 1)} % en ${años[kn]}.`);
  const el = (tipo, attrs, texto) => {
    const e = document.createElementNS(ns, tipo);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (texto !== undefined) e.textContent = texto;
    svg.appendChild(e);
    return e;
  };
  el("line", { x1: m.i, x2: W - m.d, y1: y(referencia), y2: y(referencia), class: "ref-recorrido" });
  el("text", { x: W - m.d, y: y(referencia) + 15, "text-anchor": "end", class: "rotulo-recorrido" }, `${referencia} %: referencia de las reglas europeas`);
  el("line", { x1: m.i, x2: W - m.d, y1: H - m.b, y2: H - m.b, class: "eje-recorrido" });
  el("polyline", { points: valores.map((v, k) => `${x(k)},${y(v)}`).join(" "), class: "linea-recorrido" });
  for (const k of [k0, kmin, kn]) {
    el("circle", { cx: x(k), cy: y(valores[k]), r: 4, class: "punto-recorrido" });
    el("text", { x: x(k), y: y(valores[k]) - 10, "text-anchor": k === kn ? "end" : k === k0 ? "start" : "middle", class: "dato-recorrido" }, `${numero(valores[k], 0)} %`);
    el("text", { x: x(k), y: H - 8, "text-anchor": k === kn ? "end" : k === k0 ? "start" : "middle", class: "rotulo-recorrido" }, años[k]);
  }
  caja.textContent = "";
  caja.appendChild(svg);
}

async function arrancarRecorrido() {
  let a, e, g, ing;
  try {
    [a, e, g, ing] = await Promise.all(["aapp", "escala", "gasto", "ingresos"].map((n) => fetch(`datos/${n}.json`).then((r) => r.json())));
  } catch {
    for (const p of document.querySelectorAll(".paso-recorrido .respuesta")) p.textContent = "No se han podido cargar los datos.";
    return;
  }
  const $ = (id) => document.getElementById(id);
  const i = a.años.length - 1, año = a.años[i], s = a.series;
  const k = e.años.indexOf(año);
  const F = a.fuentes;

  // 1. De dónde sale
  const ri = ing.reparto.at(-1);
  const entra = [
    { nombre: "cotizaciones a la Seguridad Social", v: ri.cotizaciones },
    { nombre: "impuestos sobre la renta de los hogares (sobre todo el IRPF)", v: ri.renta },
    { nombre: "IVA", v: ri.iva },
    { nombre: "otros ingresos: ventas, rentas, dinero de la Unión Europea…", v: ri.otros_ingresos },
    { nombre: "impuestos sobre los beneficios de las empresas", v: ri.sociedades },
    { nombre: "impuestos especiales: carburantes, tabaco, alcohol, electricidad…", v: ri.productos },
    { nombre: "otros impuestos", v: ri.produccion + ri.otros_corrientes + ri.capital + (ri.no_cobrado || 0) },
  ].sort((x, y) => y.v - x.v);
  $("entra-frase").textContent = `En ${año}, las administraciones ingresaron unos ${milMillones(s.ingresos.corrientes[i])}: `
    + `${eurosHablados(s.ingresos.habitante[i])} por habitante. De cada 100 €, ${numero(entra[0].v, 0)} fueron ${entra[0].nombre}; `
    + `${numero(entra[1].v, 0)}, ${entra[1].nombre}; y ${numero(entra[2].v, 0)}, ${entra[2].nombre}.`;
  filasCien($("entra-visual"), entra);
  lineaFuente($("entra-fuente"), {
    fuentes: F, tablas: [["gov_10a_taxag", "impuestos y cotizaciones sociales"], ["gov_10a_main", "ingresos totales"]], tipo: "lectura",
    nota: `De cada 100 € de ingresos de ${ing.años.at(-1)}${ing.provisional_igae?.at(-1) ? ", con el dato provisional de la IGAE" : ""}.`,
  });

  // 2. A qué se dedica
  const añoG = g.años.at(-1), rg = g.reparto.at(-1);
  const va = g.funciones.map((f) => ({
    nombre: f.codigo === "GF01" ? "funcionamiento de las administraciones, sin intereses" : nombreLlano(f.codigo, f.nombre),
    v: rg[f.codigo],
  }));
  va.push({ nombre: "intereses de la deuda", v: rg.intereses });
  va.sort((x, y) => y.v - x.v);
  $("va-frase").textContent = `En ${año} salieron unos ${milMillones(s.gastos.corrientes[i])}: ${eurosHablados(s.gastos.habitante[i])} por habitante. `
    + `En ${añoG}, el último año con el reparto publicado, de cada 100 € fueron ${numero(va[0].v, 0)} a ${va[0].nombre}, `
    + `${numero(va[1].v, 0)} a ${va[1].nombre} y ${numero(va[2].v, 0)} a ${va[2].nombre}.`;
  filasCien($("va-visual"), va);
  lineaFuente($("va-fuente"), {
    fuentes: F, tablas: [["gov_10a_exp", "gasto de las administraciones públicas por funciones"]], tipo: "dato",
    nota: `De cada 100 € de gasto de ${añoG}. Los intereses y el resto de servicios generales los separamos nosotros, con una resta.`,
  });

  // 3. Si llega
  const saldo = s.saldo.corrientes[i];
  const deficits = s.saldo.corrientes.filter((x) => x < 0).length;
  $("falta-frase").textContent = saldo < 0
    ? `No. En ${año} salieron unos ${milMillones(s.gastos.corrientes[i])} y entraron ${milMillones(s.ingresos.corrientes[i])}. `
      + `Faltaron unos ${milMillones(-saldo)} (el déficit): ${eurosHablados(-s.saldo.habitante[i])} por habitante, que se pidieron prestados. `
      + `Ha faltado dinero en ${deficits} de los últimos ${a.años.length} años.`
    : `Sí. En ${año} entraron unos ${milMillones(s.ingresos.corrientes[i])} y salieron ${milMillones(s.gastos.corrientes[i])}: sobraron ${milMillones(saldo)}.`;
  const maxIG = Math.max(s.ingresos.corrientes[i], s.gastos.corrientes[i]);
  filasCien($("falta-visual"), [
    { nombre: "Lo que entró", v: s.ingresos.corrientes[i], cifra: milMillones(s.ingresos.corrientes[i]) },
    { nombre: "Lo que salió", v: s.gastos.corrientes[i], cifra: milMillones(s.gastos.corrientes[i]) },
    { nombre: saldo < 0 ? "Lo que faltó" : "Lo que sobró", v: Math.abs(saldo), cifra: milMillones(Math.abs(saldo)) },
  ], { maximo: maxIG });
  lineaFuente($("falta-fuente"), { fuentes: F, tablas: [["gov_10a_main", "ingresos, gastos y saldo de las administraciones"]], tipo: "dato" });

  // 4. Cuánto se debe
  const pib = s.deuda.pib, k07 = a.años.indexOf(2007);
  $("debe-frase").textContent = `Al acabar ${año}, las administraciones debían unos ${milMillones(s.deuda.corrientes[i])}: ${eurosHablados(s.deuda.habitante[i])} por habitante, `
    + `aunque nadie la debe a título personal. Es el ${numero(pib[i], 1)} % del producto interior bruto (PIB): ${pib[i] >= 100 ? "algo más de" : "algo menos de"} lo que produce el país en un año. `
    + (k07 >= 0 ? `En 2007 era el ${numero(pib[k07], 0)} %.` : "");
  lineaDeuda($("debe-visual"), a.años, pib, 60);
  lineaFuente($("debe-fuente"), {
    fuentes: F, tablas: [["gov_10dd_edpt1", "deuda de las administraciones"], ["nama_10_gdp", "PIB"]], tipo: "dato",
    nota: "Deuda en porcentaje del PIB de cada año.",
  });

  // 5. Cuánto cuesta deberla
  const intereses = (a.cambio_deuda.pib.intereses[i] * e.pib_meur[k]) / 100;
  const comparadas = [
    { nombre: "sanidad", v: rg.GF07 }, { nombre: "educación", v: rg.GF09 }, { nombre: "intereses de la deuda", v: rg.intereses },
    { nombre: "policía, justicia y prisiones", v: rg.GF03 }, { nombre: "defensa", v: rg.GF02 },
  ].sort((x, y) => y.v - x.v);
  const masQue = comparadas.filter((c) => c.v < rg.intereses).map((c) => c.nombre);
  const menosQue = comparadas.filter((c) => c.v > rg.intereses).map((c) => c.nombre);
  $("cuesta-frase").textContent = `En ${año}, los intereses de la deuda costaron unos ${milMillones(intereses)}: ${eurosHablados((intereses * 1e6) / e.poblacion[k])} por habitante. `
    + `En ${añoG} fueron ${numero(rg.intereses, 1)} de cada 100 € de gasto`
    + (masQue.length ? `: más que a ${lista(masQue.map((x, j) => (j ? `a ${x}` : x)))}` : "") + (menosQue.length ? `${masQue.length ? ", y" : ":"} menos que a ${lista(menosQue.map((x, j) => (j ? `a ${x}` : x)))}.` : ".");
  filasCien($("cuesta-visual"), comparadas, { decimales: 1 });
  lineaFuente($("cuesta-fuente"), {
    fuentes: F, tablas: [["gov_10a_main", "intereses pagados"], ["gov_10a_exp", "gasto por funciones"]], tipo: "lectura",
    nota: `Los euros de ${año} son los intereses pagados en porcentaje del PIB por el PIB; el «de cada 100 €» es de ${añoG}.`,
  });

  // 6. Quién gasta
  const NIVEL = { S1311: "el Estado", S1312: "las comunidades autónomas", S1313: "los ayuntamientos, diputaciones y cabildos", S1314: "la Seguridad Social" };
  const q = g.quien.at(-1).TOTAL;
  const quien = g.niveles.map((n) => ({ nombre: NIVEL[n.codigo] || n.nombre, v: q[n.codigo] })).sort((x, y) => y.v - x.v);
  $("decide-frase").textContent = `De cada 100 € de gasto de ${añoG}: ${quien.map((x, j) => (j ? `${j === quien.length - 1 ? "y " : ""}${x.nombre}, ${numero(x.v, 0)}` : `${x.nombre} gastó ${numero(x.v, 0)}`)).join("; ")}. `
    + "La Seguridad Social paga sobre todo pensiones; las comunidades, sobre todo sanidad y educación; el Estado, entre otras cosas, toda la defensa.";
  filasCien($("decide-visual"), quien);
  lineaFuente($("decide-fuente"), {
    fuentes: F, tablas: [["gov_10a_exp", "gasto por funciones de cada nivel de administración"]], tipo: "lectura",
    nota: "Gasto de cada nivel ÷ gasto de todas las administraciones, sin el dinero que se pasan unas a otras de forma general (grupo 01.8); por eso la suma puede no dar 100 exactos.",
  });
}

document.addEventListener("DOMContentLoaded", arrancarRecorrido);
