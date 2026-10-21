// Cuentas en limpio: «¿Qué ha pasado con los fondos europeos de recuperación?». Eurostat, gov_rrf_fa y gov_rrf_use.
"use strict";

const NS_FE = "http://www.w3.org/2000/svg";
function nodoFE(tipo, attrs, padre, texto) {
  const e = document.createElementNS(NS_FE, tipo);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (texto !== undefined) e.textContent = texto;
  if (padre) padre.appendChild(e);
  return e;
}

// Barras agrupadas por año: recibido y usado, con el valor encima de cada barra.
function barrasAños(caja, años, series, etiqueta) {
  const W = 640, H = 260, m = { i: 12, d: 12, a: 22, b: 26 };
  const max = Math.max(...series.flatMap((s) => s.v.map((v) => v || 0))) * 1.08 || 1;
  const hueco = (W - m.i - m.d) / años.length, ancho = Math.min(34, (hueco - 18) / series.length);
  const y = (v) => H - m.b - (Math.max(v, 0) * (H - m.a - m.b)) / max;
  const s = nodoFE("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": etiqueta });
  nodoFE("line", { x1: m.i, x2: W - m.d, y1: y(0), y2: y(0), class: "eje-recorrido" }, s);
  años.forEach((a, k) => {
    const centro = m.i + hueco * (k + 0.5);
    nodoFE("text", { x: centro, y: H - 6, "text-anchor": "middle", class: "rotulo-recorrido" }, s, a);
    series.forEach((z, j) => {
      const v = z.v[k];
      if (v === null || v === undefined) return;
      const x0 = centro - (ancho * series.length + 4 * (series.length - 1)) / 2 + j * (ancho + 4);
      nodoFE("rect", { x: x0, y: y(v), width: ancho, height: Math.max(1, y(0) - y(v)), rx: 4, class: z.clase }, s);
      nodoFE("text", { x: x0 + ancho / 2, y: y(v) - 5, "text-anchor": "middle", class: "rotulo-recorrido" }, s, numero(Math.round(v / 100) / 10, 1));
    });
  });
  caja.textContent = "";
  caja.appendChild(s);
}

async function arrancarFE() {
  let d, aapp;
  try {
    [d, aapp] = await Promise.all(["datos/fondos_europeos.json", "datos/aapp.json"].map((u) => fetch(u).then((r) => r.json())));
  } catch {
    document.getElementById("respuesta").textContent = "No se han podido cargar los datos.";
    return;
  }
  const $ = (id) => document.getElementById(id);
  const ac = d.acumulado, años = d.años, ultimo = años.at(-1);
  const milm = (v) => `${numero(Math.round(v / 100) / 10, 1)} mil millones de euros`;
  const tablas = [["gov_rrf_fa", "fondos del Mecanismo de Recuperación recibidos"], ["gov_rrf_use", "usos de los fondos del Mecanismo de Recuperación"]];

  const r = $("respuesta");
  r.textContent = "";
  const s1 = document.createElement("strong");
  s1.textContent = `Hasta ${ultimo}, España recibió ${milm(ac.subvenciones_recibidas)} en subvenciones del fondo europeo de recuperación y había usado ${milm(ac.subvenciones_usadas)}`;
  r.append(s1, `: ${Math.round((100 * ac.subvenciones_usadas) / ac.subvenciones_recibidas)} de cada 100 € recibidos. Además, recibió ${milm(ac.prestamos_recibidos)} en préstamos, que hay que devolver.`);

  const caja = $("cifras");
  caja.textContent = "";
  for (const [nombre, v, explica] of [
    [`Subvenciones recibidas, 2020–${ultimo}`, ac.subvenciones_recibidas, "no se devuelven."],
    [`Subvenciones usadas, 2020–${ultimo}`, ac.subvenciones_usadas, "ya convertidas en gasto de las administraciones."],
    [`Pendiente de usar, final de ${ultimo}`, ac.pendiente ?? ac.subvenciones_recibidas - ac.subvenciones_usadas, "recibido y aún no gastado."],
    [`Préstamos recibidos, 2020–${ultimo}`, ac.prestamos_recibidos, "deuda con la Unión Europea, que hay que devolver."]]) {
    const dv = document.createElement("div");
    const a = document.createElement("span"); a.className = "nombre"; a.textContent = nombre;
    const b = document.createElement("span"); b.className = "valor"; b.textContent = `${numero(Math.round(v), 0)} M€`;
    const c = document.createElement("span"); c.className = "explica"; c.textContent = explica;
    dv.append(a, b, c);
    caja.appendChild(dv);
  }
  lineaFuente($("cifras-fuente"), { fuentes: aapp.fuentes, tablas, tipo: "dato", nota: "Las sumas desde 2020 son un cálculo nuestro." });

  barrasAños($("g1"), años, [
    { v: d.recibido.subvenciones, clase: "barra-escenario" },
    { v: d.usado.total, clase: "barra-escenario barra-elegida" },
  ], `Subvenciones del Mecanismo de Recuperación recibidas y usadas cada año, en miles de millones de euros: ${años.map((a, k) => `${a}, recibido ${numero(Math.round(d.recibido.subvenciones[k] || 0), 0)} y usado ${numero(Math.round(d.usado.total[k] || 0), 0)} millones`).join("; ")}`);
  lineaFuente($("g1-fuente"), { fuentes: aapp.fuentes, tablas, tipo: "dato", nota: "Cifras sobre las barras en miles de millones de euros." });

  const suma = (k) => d.usado[k].reduce((a, v) => a + (v || 0), 0);
  $("g2-explica").textContent = `Subvenciones usadas de 2020 a ${ultimo}, por tipo de gasto, en millones de euros.`;
  const t = $("usos");
  t.textContent = "";
  const filas = [["Inversión directa de las administraciones", "inversion", "obras, equipos, programas informáticos…"],
    ["Ayudas a la inversión de otros", "transferencias_capital", "dinero que se pasa a empresas, hogares u otras entidades para que inviertan"],
    ["Gasto corriente", "corriente", "personal, compras y ayudas que no son inversión"],
    ["Otros gastos de capital", "otro_capital", ""], ["Otros", "otros", ""]].map(([n, k, det]) => ({ nombre: n, v: suma(k), detalle: det }))
    .filter((f) => f.v > 0).sort((a, b) => b.v - a.v);
  const max = Math.max(...filas.map((f) => f.v));
  for (const f of filas) {
    const tr = t.insertRow();
    const a = tr.insertCell(); a.textContent = f.nombre;
    if (f.detalle) { const s = document.createElement("span"); s.className = "detalle"; s.textContent = f.detalle; a.appendChild(s); }
    const b = document.createElement("span"); b.className = "barra"; b.style.width = `${(100 * f.v) / max}%`; a.appendChild(b);
    const c = tr.insertCell(); c.className = "cifra"; c.textContent = `${numero(Math.round(f.v), 0)} M€`;
  }
  const tr = t.insertRow(); tr.className = "fila-total";
  tr.insertCell().textContent = "Total usado";
  const c = tr.insertCell(); c.className = "cifra"; c.textContent = `${numero(Math.round(suma("total")), 0)} M€`;
  lineaFuente($("g2-fuente"), { fuentes: aapp.fuentes, tablas: [tablas[1]], tipo: "dato", nota: "Las sumas desde 2020 son un cálculo nuestro." });
}
document.addEventListener("DOMContentLoaded", arrancarFE);
