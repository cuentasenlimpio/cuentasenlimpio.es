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

// Columnas agrupadas: tres por año, desde cero. Cada año ocupa su banda, centrada en el año; el elegido se resalta y
// se lee arriba. Al pasar el ratón o el dedo se elige el año.
function dibujarTotales(contenedor, d, sel, alCambiar) {
  const estrecho = contenedor.clientWidth < 520;
  const alto = estrecho ? 260 : 320;
  if (!contenedor.cuentasGrafico) {
    contenedor.cuentasGrafico = EC.crear(contenedor, alto);
    EC.alPasar(contenedor.cuentasGrafico, (x) => {
      const i = Math.max(0, Math.min(d.años.length - 1, Math.round(x) - d.años[0]));
      if (i === sel.indice) return;
      sel.indice = i;
      document.getElementById("selector-año").value = d.años[i];
      alCambiar(sel);
    });
  }
  const g = contenedor.cuentasGrafico;
  if (contenedor.style.height !== `${alto}px`) {
    contenedor.style.height = `${alto}px`;
    g.resize();
  }
  const maximo = Math.max(...d.totales.flatMap((t) => SERIES.map((s) => t[s.clave] / 1000)));
  const ticks = pasos(maximo, 4);
  const colores = SERIES.map((s) => EC.css(`--${s.clase}`));
  const opciones = EC.tiempo({
    min: d.años[0] - 0.5, max: d.años.at(-1) + 0.5, slider: false, marcasArriba: false, zoom: false,
    aria: `${contenedor.getAttribute("aria-label")} En miles de millones de euros.`,
  });
  // Todos los años, también en móvil (con dos cifras): las marcas de prórroga no pueden quedar ocultas.
  opciones.xAxis.axisLabel = {
    ...opciones.xAxis.axisLabel, hideOverlap: false, customValues: d.años,
    formatter: (v) => {
      const i = d.años.indexOf(v);
      return i < 0 ? "" : `${estrecho ? String(v).slice(2) : v}${marcaAño(d, i)}`;
    },
  };
  // El año elegido va como banda resaltada, no como línea.
  opciones.xAxis.axisPointer = { show: true, type: "shadow", snap: false, status: "show", value: d.años[sel.indice], label: { show: false }, shadowStyle: { color: EC.css("--hueco") } };
  opciones.yAxis = EC.ejeY({ formato: (v) => numero(v, 0), min: 0, max: ticks.at(-1) });
  opciones.yAxis.interval = ticks[1];
  opciones.yAxis.name = null;
  opciones.series = [{
    id: "columnas", type: "custom", silent: true, clip: true,
    data: d.años.map((a, i) => [a, i]), encode: { x: 0 },
    renderItem: (_p, api) => {
      const i = api.value(1);
      const banda = api.size([1, 0])[0];
      const grosor = Math.min(18, (banda - 6) / 3);
      const centro = api.coord([api.value(0), 0])[0];
      const x0 = centro - (3 * grosor + 4) / 2;
      return {
        type: "group",
        children: SERIES.map((s, k) => {
          const v = d.totales[i][s.clave] / 1000;
          const [, y] = api.coord([0, v]);
          const [, y0] = api.coord([0, 0]);
          return { type: "rect", shape: { x: x0 + k * (grosor + 2), y, width: grosor, height: y0 - y }, style: { fill: colores[k] } };
        }),
      };
    },
  }];
  g.setOption(opciones, { notMerge: true });

  const c = document.getElementById("t-lectura");
  const i = sel.indice;
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

// Respuesta corta: cuánto se gastó de lo autorizado el último año liquidado y cuántos años hubo prórroga.
function pintarRespuesta(d) {
  const k = d.años.findLastIndex((_, j) => !d.avance[j]);
  const t = d.totales[k];
  const p = document.getElementById("respuesta");
  p.textContent = `En ${d.años[k]}, el Estado gastó `;
  const b = document.createElement("strong");
  b.textContent = `${numero(Math.round((100 * t.obligaciones) / t.definitivos), 0)} de cada 100 €`;
  const prorroga = d.vigencia.filter((v) => v.tipo === "prorrogado" || v.tipo === "mitad").length;
  p.append(b, ` que tenía autorizados al final del año. En ${numero(prorroga, 0)} de los ${numero(d.años.length, 0)} años desde ${d.años[0]}, el presupuesto estuvo prorrogado todo el año o parte de él.`);
  // A escala de persona: lo gastado por el Estado (millones de euros) entre la población media del año.
  porHabitante({ millones: t.obligaciones, año: d.años[k] }).then((h) => {
    if (!h) return;
    const q = document.createElement("span");
    q.className = "respuesta-persona";
    q.textContent = ` Lo gastado ese año, ${numero(Math.round(t.obligaciones / 1000), 0)} mil millones de euros, son ${eurosHablados(h.anual)} por habitante. Es solo el presupuesto del Estado.`;
    p.appendChild(q);
  });
}

async function arrancar() {
  const [d, aapp] = await Promise.all([fetch("datos/presupuesto.json").then((r) => r.json()), fetch("datos/aapp.json").then((r) => r.json())]);
  const sel = montarSelectores({ años: d.años, alCambiar: (s) => pintar(d, aapp, s) });
  pintar(d, aapp, sel);
  pintarRespuesta(d);
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
