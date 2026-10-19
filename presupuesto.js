// Cuentas en limpio: página «¿Se gastó lo que se aprobó?». Usa comun.js.
"use strict";

const SERIES = [
  { clave: "iniciales", clase: "p-aprobado", nombre: "aprobado" },
  { clave: "definitivos", clase: "p-definitivo", nombre: "autorizado al final" },
  { clave: "obligaciones", clase: "p-gastado", nombre: "gastado" },
];
const milM = (v) => `${numero(v / 1000, 1)} mil M€`;
const marcaVigencia = (v) => (v.tipo === "prorrogado" ? "*" : v.tipo === "mitad" ? "†" : v.tipo === "sin_confirmar" ? "?" : "");
// Año con avance (ejecución a 31 de diciembre) en lugar de liquidación definitiva
const marcaAño = (d, i) => `${marcaVigencia(d.vigencia[i])}${d.avance[i] ? "a" : ""}`;
const fuenteAño = (d, i) => (d.avance[i] ? [`ejec_dic_${d.años[i]}`, `ejecución del presupuesto del Estado a 31 de diciembre de ${d.años[i]} (avance)`]
  : [`liq_estado_${d.años[i]}`, `liquidación del presupuesto del Estado de ${d.años[i]}`]);

// Columnas agrupadas: tres por año, desde cero. El año elegido se resalta y se lee arriba.
function dibujarTotales(contenedor, d, sel, alCambiar) {
  const ancho = contenedor.clientWidth;
  const estrecho = ancho < 520;
  const alto = estrecho ? 240 : 300;
  const m = { izq: estrecho ? 40 : 48, der: 8, arr: 12, aba: 30 };
  const iw = ancho - m.izq - m.der, ih = alto - m.arr - m.aba;
  const n = d.años.length;
  const banda = iw / n;
  const grosor = Math.min(18, (banda - 6) / 3);
  const maximo = Math.max(...d.totales.flatMap((t) => SERIES.map((s) => t[s.clave] / 1000)));
  const ticks = pasos(maximo, 4);
  const ymax = ticks.at(-1);
  const Y = (v) => m.arr + ih - (v / ymax) * ih;
  contenedor.textContent = "";
  const svg = el("svg", { width: ancho, height: alto, viewBox: `0 0 ${ancho} ${alto}`, "aria-hidden": "true" }, contenedor);
  const resalte = el("rect", { y: m.arr, height: ih, width: banda, class: "resalte-año" }, svg);
  const rejilla = el("g", { class: "rejilla" }, svg);
  for (const t of ticks) {
    el("line", { x1: m.izq, x2: ancho - m.der, y1: Y(t), y2: Y(t), class: t === 0 ? "base" : "" }, rejilla);
    const et = el("text", { x: m.izq - 6, y: Y(t) + 4, "text-anchor": "end", class: "eje-texto" }, rejilla);
    et.textContent = numero(t, 0);
  }
  d.años.forEach((a, i) => {
    const x0 = m.izq + i * banda + (banda - 3 * grosor - 4) / 2;
    SERIES.forEach((s, k) => {
      const v = d.totales[i][s.clave] / 1000;
      el("rect", { x: x0 + k * (grosor + 2), y: Y(v), width: grosor, height: Y(0) - Y(v), class: s.clase }, svg);
    });
    // Todos los años, también en móvil (con dos cifras): las marcas de prórroga no pueden quedar ocultas.
    const t = el("text", { x: m.izq + i * banda + banda / 2, y: alto - 10, "text-anchor": "middle", class: "eje-texto" }, svg);
    t.textContent = `${estrecho ? String(a).slice(2) : a}${marcaAño(d, i)}`;
  });
  const marcar = (i) => {
    resalte.setAttribute("x", m.izq + i * banda);
    const c = document.getElementById("t-lectura");
    c.textContent = "";
    const año = document.createElement("strong");
    año.className = "lectura-anio";
    año.textContent = `${d.años[i]}${marcaAño(d, i)}${d.avance[i] ? " · avance" : ""}`;
    c.appendChild(año);
    for (const s of SERIES) {
      const f = document.createElement("span");
      f.className = "lectura-fila";
      const k = document.createElement("span");
      k.className = `clave-barra ${s.clase}`;
      f.appendChild(k);
      const b = document.createElement("b");
      b.textContent = milM(d.totales[i][s.clave]);
      f.appendChild(b);
      f.appendChild(document.createTextNode(` ${s.nombre}`));
      c.appendChild(f);
    }
  };
  marcar(sel.indice);
  const elegir = (ev) => {
    const r = svg.getBoundingClientRect();
    const i = Math.max(0, Math.min(n - 1, Math.floor((ev.clientX - r.left - m.izq) / banda)));
    if (i !== sel.indice) {
      sel.indice = i;
      document.getElementById("selector-año").value = d.años[i];
      alCambiar(sel);
    }
  };
  svg.addEventListener("pointermove", elegir);
  svg.addEventListener("pointerdown", elegir);
}

function pintar(d, aapp, sel) {
  const i = sel.indice;
  const año = d.años[i];
  for (const s of document.querySelectorAll(".año-elegido")) s.textContent = año;
  document.getElementById("vigencia").textContent = d.vigencia[i].texto + "." +
    (d.avance[i] ? " Avance: ejecución a 31 de diciembre, a falta de la liquidación definitiva." : "");

  dibujarTotales(document.getElementById("totales"), d, sel, (s) => pintar(d, aapp, s));
  const ft = document.getElementById("totales-fuente");
  lineaFuente(ft, { fuentes: aapp.fuentes, tablas: [fuenteAño(d, i)], tipo: "dato",
    nota: `Un fichero por año (${d.años[0]}–${d.años.at(-1)}): la liquidación definitiva o, si aún no se ha publicado, el avance a 31 de diciembre; el enlace es el del año elegido. Incluye las operaciones financieras, como devolver la deuda que vence. Euros de cada año, sin descontar la inflación.` });

  const politicas = d.politicas[i].filter((p) => !p.es_area && p.definitivos > 0 && p.obligaciones !== null);
  dibujarBarrasH(document.getElementById("ejecucion"),
    politicas.map((p) => ({ nombre: p.nombre, valor: (100 * p.obligaciones) / p.definitivos })), { formato: (v) => numero(v, 0), sufijo: " %" });
  lineaFuente(document.getElementById("ejecucion-fuente"), { fuentes: aapp.fuentes,
    tablas: [fuenteAño(d, i)], tipo: "lectura",
    nota: `Obligaciones reconocidas ÷ créditos definitivos × 100 (hoja ${d.avance[i] ? "GTOS 008" : "LIQ 007"}).` });

  const tabla = document.getElementById("detalle");
  tabla.textContent = "";
  const thead = document.createElement("thead");
  const cab = document.createElement("tr");
  for (const t of ["Política de gasto", "Aprobado", "Modificaciones", "Autorizado al final", "Gastado", "% gastado"]) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = t;
    cab.appendChild(th);
  }
  thead.appendChild(cab);
  tabla.appendChild(thead);
  const tbody = document.createElement("tbody");
  for (const p of d.politicas[i]) {
    if (!p.es_area && d.politicas[i].filter((q) => !q.es_area && q.area === p.area).length === 1) continue;
    const tr = document.createElement("tr");
    if (p.es_area) tr.className = "fila-area";
    const celdas = [p.nombre, p.iniciales, p.definitivos - p.iniciales, p.definitivos, p.obligaciones,
      p.obligaciones === null || !p.definitivos ? null : (100 * p.obligaciones) / p.definitivos];
    celdas.forEach((v, k) => {
      const td = document.createElement("td");
      if (k === 0) td.textContent = v;
      else if (v === null) td.textContent = "—";
      else if (k === 5) td.textContent = `${numero(v, 0)} %`;
      else {
        const r = Math.round(v);
        td.textContent = `${k === 2 && r > 0 ? "+" : k === 2 && r < 0 ? "−" : ""}${numero(Math.abs(r), 0)}`;
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }
  const t = d.totales[i];
  const tr = document.createElement("tr");
  tr.className = "fila-total";
  for (const v of ["Total", numero(Math.round(t.iniciales), 0), `${t.definitivos >= t.iniciales ? "+" : "−"}${numero(Math.abs(Math.round(t.definitivos - t.iniciales)), 0)}`,
    numero(Math.round(t.definitivos), 0), numero(Math.round(t.obligaciones), 0), `${numero((100 * t.obligaciones) / t.definitivos, 0)} %`]) {
    const td = document.createElement("td");
    td.textContent = v;
    tr.appendChild(td);
  }
  tbody.appendChild(tr);
  tabla.appendChild(tbody);
  lineaFuente(document.getElementById("detalle-fuente"), { fuentes: aapp.fuentes,
    tablas: [fuenteAño(d, i)], tipo: "dato",
    nota: (d.avance[i] ? "Créditos iniciales, definitivos y obligaciones reconocidas de la hoja GTOS 008 del avance;" : "Créditos iniciales y definitivos de la hoja LIQ 004, obligaciones reconocidas de la LIQ 007;") + " la columna de modificaciones y el porcentaje son restas y divisiones nuestras. Las áreas que tienen una sola política se muestran solo como área." });
}

async function arrancar() {
  const [d, aapp] = await Promise.all([fetch("datos/presupuesto.json").then((r) => r.json()), fetch("datos/aapp.json").then((r) => r.json())]);
  const sel = montarSelectores({ años: d.años, alCambiar: (s) => pintar(d, aapp, s) });
  pintar(d, aapp, sel);
  pintarComprobaciones(document.getElementById("comprobaciones"), d.comprobaciones);
  const ultimoLiquidado = d.años.filter((_, k) => !d.avance[k]).at(-1);
  pintarUltimoAño(d.años, d.avance.at(-1)
    ? `${d.años.at(-1)} es un avance: la IGAE aún no ha publicado su liquidación definitiva, así que mostramos su ejecución a 31 de diciembre. En ${ultimoLiquidado}, ese avance coincidió al euro con la liquidación (ver «Comprobaciones»). Cuando se publique, la sustituirá sola.`
    : `La IGAE publica la liquidación de cada año cuando cierra las cuentas, y la de ${d.años.at(-1) + 1} todavía no está. Revisamos su página cada día: cuando aparezca, entrará sola.`);
  document.getElementById("totales").addEventListener("keydown", (ev) => {
    if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
    ev.preventDefault();
    sel.indice = Math.max(0, Math.min(d.años.length - 1, sel.indice + (ev.key === "ArrowLeft" ? -1 : 1)));
    document.getElementById("selector-año").value = d.años[sel.indice];
    pintar(d, aapp, sel);
  });
  let espera = null;
  window.addEventListener("resize", () => {
    clearTimeout(espera);
    espera = setTimeout(() => pintar(d, aapp, sel), 150);
  });
}

arrancar();
