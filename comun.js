// Cuentas en limpio: piezas comunes a todas las páginas (unidades, formato de números, SVG, acontecimientos).
// Se carga antes que el script propio de cada página.
"use strict";

const SVG = "http://www.w3.org/2000/svg";

const UNIDADES = {
  pib: {
    tipo: "dato",
    corta: "%",
    eje: "% del PIB",
    explica: "Cada cifra como porcentaje del PIB, todo lo que produjo la economía ese año. Es la mejor unidad para comparar años lejanos. Dato publicado por Eurostat.",
    escala: 1,
  },
  corrientes: {
    tipo: "dato",
    corta: "mil M€",
    eje: "miles de millones de euros",
    explica: "Miles de millones de euros de cada año, sin descontar la subida de precios. Hasta 1998, pesetas pasadas a euros al tipo fijo de 166,386. Dato publicado por Eurostat.",
    escala: 1 / 1000,
  },
  constantes: {
    tipo: "lectura",
    corta: "mil M€",
    eje: "miles de millones de euros de {base}",
    explica: "Miles de millones de euros de {base}: descontamos la subida de precios con el deflactor del PIB, para que los años se puedan comparar. Es una lectura: un cálculo nuestro sobre datos de Eurostat.",
    escala: 1 / 1000,
  },
  habitante: {
    tipo: "lectura",
    corta: "€",
    eje: "euros por habitante",
    explica: "Euros por habitante de cada año, sin descontar la subida de precios. Es una media, no lo que paga ni recibe nadie en concreto. Es una lectura: un cálculo nuestro sobre datos de Eurostat.",
    escala: 1,
  },
};

const numero = (v, decimales) =>
  v.toLocaleString("es-ES", { minimumFractionDigits: decimales, maximumFractionDigits: decimales, useGrouping: "always" });

function formatear(v, unidad) {
  if (v === null || v === undefined) return "sin dato";
  const u = UNIDADES[unidad];
  const x = v * u.escala;
  if (unidad === "pib") return `${numero(x, 1)} %`;
  if (unidad === "habitante") return `${numero(Math.round(x), 0)} €`;
  return `${numero(x, 1)} mil millones €`;
}

function texto(u, base) {
  return u.replace("{base}", base);
}

function el(nombre, atributos = {}, padre = null) {
  const e = document.createElementNS(SVG, nombre);
  for (const [k, v] of Object.entries(atributos)) e.setAttribute(k, v);
  if (padre) padre.appendChild(e);
  return e;
}

function pasos(maximo, cuantos = 5) {
  const bruto = maximo / cuantos;
  const magnitud = 10 ** Math.floor(Math.log10(bruto));
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * magnitud).find((p) => p >= bruto);
  const ticks = [];
  for (let t = 0; t <= maximo + paso * 0.001; t += paso) ticks.push(t);
  if (ticks.at(-1) < maximo) ticks.push(ticks.at(-1) + paso);
  return ticks;
}

// Dibuja un gráfico de líneas en `contenedor`. `series`: [{clave, clase, valores}]; `hueco`: claves de las dos
// series entre las que se sombrea el déficit.

// Acontecimientos: una línea fina en su fecha y su número arriba, dentro del gráfico. `posicionX` convierte una
// fecha ISO en la coordenada x de cada gráfico.
// Franja superior: nombres de legislatura (y ≈ 14) y, debajo, los números de los acontecimientos en hasta tres escalones.
const TIRA = 80;

function marcarAcontecimientos(svg, posicionX, _y0, y1, lista = estado.datos.acontecimientos.lista) {
  const y0 = 22;
  const g = el("g", { class: "acontecimiento" }, svg);
  let anterior = -Infinity, nivel = 0;
  lista.forEach((a, k) => {
    const x = posicionX(a.fecha);
    if (x === null) return;
    // Si no cabe junto al anterior (círculos de 16 px), baja un escalón para no montarse.
    nivel = x - anterior < 18 ? nivel + 1 : 0;
    anterior = x;
    const cy = y0 + 9 + nivel * 18;
    el("line", { x1: x, x2: x, y1: cy + 8, y2: y1 }, g);
    el("circle", { cx: x, cy, r: 8 }, g);
    const t = el("text", { x, y: cy + 4, "text-anchor": "middle" }, g);
    t.textContent = k + 1;
  });
}

const fecha = (iso) =>
  new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });

// ---- Piezas de dibujo compartidas por las páginas de gasto e ingresos ----

// Escala y formato de cada unidad en los pequeños múltiplos (los euros se muestran en miles de millones).
const ESCALA = { pib: 1, corrientes: 1 / 1000, constantes: 1 / 1000, habitante: 1 };
const FORMATO = {
  pib: (v) => `${numero(v, 1)} %`,
  corrientes: (v) => `${numero(v, 1)} mil M€`,
  constantes: (v) => `${numero(v, 1)} mil M€`,
  habitante: (v) => `${numero(Math.round(v), 0)} €`,
};


// Barras horizontales ordenadas de mayor a menor, con el valor al final de cada barra. `filas`: [{nombre, valor}].
function dibujarBarrasH(contenedor, filas, { formato, sufijo = "" }) {
  const ancho = contenedor.clientWidth;
  const estrecho = ancho < 520;
  const fila = estrecho ? 40 : 30;
  const m = { izq: estrecho ? 8 : 300, der: 64, arr: 6, aba: 6 };
  const orden = [...filas].sort((a, b) => b.valor - a.valor);
  // Para lectores de pantalla: el gráfico es una imagen, así que su nombre lleva todas las partidas con su valor.
  const base = contenedor.dataset.etiqueta || (contenedor.dataset.etiqueta = contenedor.getAttribute("aria-label") || "");
  contenedor.setAttribute("aria-label", `${base}: ${orden.map((f) => `${f.nombre}, ${formato(f.valor)}${sufijo}`).join("; ")}.`);
  const alto = m.arr + m.aba + orden.length * fila;
  const maximo = Math.max(...orden.map((f) => f.valor), 0);
  const iw = ancho - m.izq - m.der;
  contenedor.textContent = "";
  const svg = el("svg", { width: ancho, height: alto, viewBox: `0 0 ${ancho} ${alto}`, "aria-hidden": "true" }, contenedor);
  orden.forEach((f, k) => {
    const y = m.arr + k * fila;
    const nombre = el("text", { x: estrecho ? 0 : m.izq - 10, y: estrecho ? y + 12 : y + fila / 2 + 4,
      "text-anchor": estrecho ? "start" : "end", class: "barra-nombre" }, svg);
    nombre.textContent = f.nombre;
    const yb = estrecho ? y + 18 : y + fila / 2 - 7;
    const x0 = estrecho ? 0 : m.izq;
    const ancho_b = Math.max(0, (Math.max(f.valor, 0) / (maximo || 1)) * (estrecho ? ancho - m.der : iw));
    el("rect", { x: x0, y: yb, width: ancho_b, height: 14, rx: 3, class: "barra-h" }, svg);
    const v = el("text", { x: x0 + ancho_b + 6, y: yb + 11, class: "barra-valor" }, svg);
    v.textContent = `${formato(f.valor)}${sufijo}`;
  });
}

// Pequeños múltiplos: un gráfico de línea por panel, todos con la misma escala vertical para poder compararlos.
// Marca el año elegido con un punto y escribe su valor.
function dibujarMultiples(contenedor, paneles, años, indice, { formato, unidadEje }) {
  contenedor.textContent = "";
  const valores = paneles.flatMap((p) => p.valores).filter((v) => v !== null);
  const ticks = pasos(Math.max(...valores, 0), 2);
  const ymax = ticks.at(-1);
  for (const p of paneles) {
    const caja = document.createElement("figure");
    caja.className = "multiple";
    const titulo = document.createElement("figcaption");
    const nombre = document.createElement("span");
    nombre.textContent = p.nombre;
    const valor = document.createElement("b");
    const v = p.valores[indice];
    valor.textContent = v === null || v === undefined ? "sin dato" : formato(v);
    titulo.appendChild(nombre);
    titulo.appendChild(valor);
    caja.appendChild(titulo);
    contenedor.appendChild(caja);
    const ancho = caja.clientWidth || 200, alto = 96;
    const m = { izq: 30, der: 8, arr: 6, aba: 16 };
    const iw = ancho - m.izq - m.der, ih = alto - m.arr - m.aba;
    const X = (i) => m.izq + (i / (años.length - 1)) * iw;
    const Y = (val) => m.arr + ih - (val / ymax) * ih;
    const svg = el("svg", { width: ancho, height: alto, viewBox: `0 0 ${ancho} ${alto}`, "aria-hidden": "true" }, caja);
    for (const t of ticks) {
      el("line", { x1: m.izq, x2: ancho - m.der, y1: Y(t), y2: Y(t), class: t === 0 ? "rejilla-base" : "rejilla-linea" }, svg);
      const et = el("text", { x: m.izq - 4, y: Y(t) + 3, "text-anchor": "end", class: "eje-texto eje-pequeno" }, svg);
      et.textContent = numero(t, ymax < 10 ? 1 : 0);
    }
    for (const [i, a] of [[0, años[0]], [años.length - 1, años.at(-1)]]) {
      const t = el("text", { x: X(i), y: alto - 3, "text-anchor": i ? "end" : "start", class: "eje-texto eje-pequeno" }, svg);
      t.textContent = a;
    }
    let camino = "";
    p.valores.forEach((val, i) => {
      if (val === null) return;
      camino += `${camino ? "L" : "M"}${X(i)},${Y(val)}`;
    });
    el("path", { d: camino, class: "linea linea-multiple" }, svg);
    if (v !== null && v !== undefined) el("circle", { cx: X(indice), cy: Y(v), r: 3.5, class: "punto-multiple" }, svg);
  }
  const nota = document.createElement("p");
  nota.className = "nota-multiples";
  nota.textContent = `Todos los paneles usan la misma escala (${unidadEje}) para que se puedan comparar entre sí.`;
  contenedor.appendChild(nota);
}

// Línea de fuente: «Fuente: <institución>, <tabla enlazada> (tabla X, actualizada el …), …. <dato|lectura> nota».
function lineaFuente(p, { fuentes, tablas, tipo, nota = "" }) {
  const porTabla = Object.fromEntries(fuentes.map((f) => [f.tabla, f]));
  p.textContent = "Fuente: ";
  tablas.forEach(([clave, texto], k) => {
    const f = porTabla[clave];
    if (k) p.appendChild(document.createTextNode("; "));
    p.appendChild(document.createTextNode(`${f.fuente}, `));
    const a = document.createElement("a");
    a.href = f.url_navegador;
    a.textContent = texto || f.nombre.charAt(0).toLowerCase() + f.nombre.slice(1);
    p.appendChild(a);
    const cuando = f.actualizado_fuente ? `actualizada el ${fecha(f.actualizado_fuente)}` : `descargada el ${fecha(f.descargado)}`;
    p.appendChild(document.createTextNode(` (tabla ${f.dataset}, ${cuando}, `));
    const c = document.createElement("a");
    c.href = f.copia;
    c.textContent = "fichero descargado";
    p.appendChild(c);
    p.appendChild(document.createTextNode(")"));
  });
  p.appendChild(document.createTextNode(". "));
  const t = document.createElement("span");
  t.className = `etiqueta-tipo ${tipo}`;
  t.textContent = tipo;
  p.appendChild(t);
  if (nota) p.appendChild(document.createTextNode(` ${nota}`));
}

function pintarComprobaciones(ul, lista) {
  ul.textContent = "";
  for (const c of lista) {
    const li = document.createElement("li");
    li.className = c.ok ? "ok" : "aviso";
    const marca = document.createElement("span");
    marca.className = "marca";
    marca.textContent = c.ok ? "✓" : "!";
    marca.setAttribute("aria-label", c.ok ? "cuadra" : "aviso");
    li.appendChild(marca);
    const q = document.createElement("strong");
    q.textContent = `${c.que} `;
    li.appendChild(q);
    li.appendChild(document.createTextNode(c.resultado + "." + (c.nota ? ` ${c.nota}` : "")));
    ul.appendChild(li);
  }
}

// Selector de año (desplegable) y de unidad (botones) para las páginas sin gráfico de línea principal.
function montarSelectores({ años, alCambiar, unidadInicial = "pib" }) {
  const sel = document.getElementById("selector-año");
  for (const a of [...años].reverse()) {
    const o = document.createElement("option");
    o.value = a;
    o.textContent = a;
    sel.appendChild(o);
  }
  const estadoSel = { indice: años.length - 1, unidad: unidadInicial };
  sel.addEventListener("change", () => {
    estadoSel.indice = años.indexOf(Number(sel.value));
    alCambiar(estadoSel);
  });
  for (const b of document.querySelectorAll("[data-unidad]")) {
    b.addEventListener("click", () => {
      estadoSel.unidad = b.dataset.unidad;
      for (const o of document.querySelectorAll("[data-unidad]")) o.setAttribute("aria-pressed", String(o === b));
      alCambiar(estadoSel);
    });
  }
  return estadoSel;
}

// Nota del último año disponible y por qué no hay uno más reciente. `motivo` es el texto propio de cada página.
function pintarUltimoAño(años, motivo) {
  const p = document.getElementById("ultimo-año");
  if (!p) return;
  p.textContent = "";
  const b = document.createElement("strong");
  b.textContent = `Último año disponible: ${años.at(-1)}. `;
  p.appendChild(b);
  p.appendChild(document.createTextNode(motivo));
}
