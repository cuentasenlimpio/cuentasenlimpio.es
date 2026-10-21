// Cuentas en limpio: «¿Cuánto se deja de recaudar por deducciones y exenciones?». Memorias de Beneficios Fiscales (SEPG).
"use strict";

const NOMBRES_BF = { irpf: "IRPF", irnr: "Renta de no residentes", sociedades: "Impuesto sobre Sociedades", patrimonio: "Patrimonio", sucesiones: "Sucesiones",
  iva: "IVA", gases: "Gases fluorados", primas: "Primas de seguros", especiales: "Impuestos especiales", tasas: "Tasas" };

async function arrancarBF() {
  let d, aapp;
  try {
    [d, aapp] = await Promise.all(["datos/beneficios_fiscales.json", "datos/aapp.json"].map((u) => fetch(u).then((r) => r.json())));
  } catch {
    document.getElementById("respuesta").textContent = "No se han podido cargar los datos.";
    return;
  }
  const $ = (id) => document.getElementById(id);
  const u = d.ultima, p = u.partidas;
  const fuente = [[d.tabla, `Memoria de Beneficios Fiscales de ${u.año}`]];
  const nota = `Las memorias de ${d.memorias[0].año} a ${d.memorias.at(-1).año} se leen de sus PDF (no se republican: se enlazan en «Detalle de la fuente» y en la zona de contexto).`;

  const r = $("respuesta");
  r.textContent = "";
  const s1 = document.createElement("strong");
  s1.textContent = `Para ${u.año}, se estimó que se dejarían de ingresar ${numero(Math.round(p.total), 0)} millones de euros por beneficios fiscales`;
  r.append(s1, `: ${numero(Math.round((100 * p.iva) / p.total), 0)} de cada 100 € en el IVA (${numero(Math.round(p.iva), 0)} millones), por los tipos reducidos y las exenciones. Es la última memoria: desde 2024 los presupuestos están prorrogados.`);

  const caja = $("cifras");
  caja.textContent = "";
  for (const [nombre, v, explica] of [[`Total, ${u.año}`, p.total, "estimación previa de lo que no se ingresa."], ["IVA", p.iva, "tipos reducidos del 4 % y del 10 % y exenciones."],
    ["IRPF", p.irpf, "deducciones, reducciones y exenciones."], ["Impuesto sobre Sociedades", p.sociedades, "deducciones, bonificaciones y regímenes especiales."]]) {
    if (v === undefined) continue;
    const dv = document.createElement("div");
    const a = document.createElement("span"); a.className = "nombre"; a.textContent = nombre;
    const b = document.createElement("span"); b.className = "valor"; b.textContent = `${numero(Math.round(v), 0)} M€`;
    const c = document.createElement("span"); c.className = "explica"; c.textContent = explica;
    dv.append(a, b, c);
    caja.appendChild(dv);
  }
  lineaFuente($("cifras-fuente"), { fuentes: aapp.fuentes, tablas: fuente, tipo: "dato", nota: `Página ${u.paginas.total} de la memoria.` });

  EC.lineas($("g1"), { x: d.años, etiquetas: d.años.map(String), formato: (v) => `${numero(Math.round(v / 1000), 0)} mil`, formatoLectura: (v) => `${numero(Math.round(v), 0)} M€`,
    eje: "M€", min: 0, aria: `Beneficios fiscales estimados, ${d.años[0]}–${d.años.at(-1)}`,
    series: [{ nombre: "total", v: d.serie.total, color: "--tinta" }, { nombre: "IVA", v: d.serie.iva, color: "--c-primario" },
      { nombre: "IRPF", v: d.serie.irpf, color: "--linea-fuerte", discontinua: true },
      { nombre: "Sociedades", v: d.serie.sociedades, soloLectura: true, formato: (v) => `${numero(Math.round(v), 0)} M€` }] });
  lineaFuente($("g1-fuente"), { fuentes: aapp.fuentes, tablas: fuente, tipo: "dato", nota });

  $("g2-explica").textContent = `Beneficios fiscales estimados para ${u.año} por impuesto, en millones de euros.`;
  const t = $("impuestos");
  t.textContent = "";
  const filas = Object.keys(NOMBRES_BF).filter((k) => p[k] !== undefined).map((k) => ({ k, v: p[k] })).sort((a, b) => b.v - a.v);
  const max = Math.max(...filas.map((f) => f.v));
  for (const f of filas) {
    const tr = t.insertRow();
    const a = tr.insertCell(); a.textContent = NOMBRES_BF[f.k];
    const det = (u.detalle[f.k] || []).map((x) => `${x.nombre.charAt(0).toLowerCase() + x.nombre.slice(1)}: ${numero(Math.round(x.importe), 0)}`).join(" · ");
    if (det) { const s = document.createElement("span"); s.className = "detalle"; s.textContent = det; a.appendChild(s); }
    const b = document.createElement("span"); b.className = "barra"; b.style.width = `${Math.max(1, (100 * f.v) / max)}%`; a.appendChild(b);
    const c = tr.insertCell(); c.className = "cifra"; c.textContent = `${numero(Math.round(f.v), 0)} M€`;
  }
  const tr = t.insertRow(); tr.className = "fila-total";
  tr.insertCell().textContent = "Total";
  const c = tr.insertCell(); c.className = "cifra"; c.textContent = `${numero(Math.round(p.total), 0)} M€`;
  lineaFuente($("g2-fuente"), { fuentes: aapp.fuentes, tablas: fuente, tipo: "dato", nota: `Páginas ${u.paginas.irpf}–${u.paginas.total} de la memoria.` });

  pintarComprobaciones($("comprobaciones"), d.comprobaciones);
}
document.addEventListener("DOMContentLoaded", arrancarBF);
