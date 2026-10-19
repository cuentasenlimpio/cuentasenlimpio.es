// Cuentas en limpio: gráficos de ingresos, gastos y deuda.
// Sin librerías: SVG a mano. Todo el texto entra con textContent; los números salen de datos/aapp.json.
"use strict";

const FORMULAS = {
  pib: "Dato. Tal cual lo publica Eurostat (unidad PC_GDP).",
  corrientes: "Dato. Tal cual lo publica Eurostat en millones de moneda nacional (unidad MIO_NAC): euros, y hasta 1998 pesetas convertidas al tipo fijo de 166,386 por euro. Aquí se muestra en miles de millones. No usamos la unidad MIO_EUR de Eurostat porque antes de 1999 convierte con el tipo de mercado de cada año (ver «Comprobaciones»).",
  constantes: "Lectura. Valor en euros × deflactor del PIB de {base} ÷ deflactor del PIB del año (tabla nama_10_gdp, índice 2020 = 100, en moneda nacional).",
  habitante: "Lectura. Valor en euros ÷ población media del año (tabla nama_10_pe).",
};

const estado = { datos: null, unidad: "pib", indice: null, indicadorUE: "deuda" };

function dibujar(contenedor, { series, hueco, alto, alPasar, conNombres }) {
  const d = estado.datos;
  const años = d.años;
  const ancho = contenedor.clientWidth;
  const estrecho = ancho < 520;
  const m = { izq: estrecho ? 40 : 48, der: 18, arr: TIRA, aba: 28 };
  const iw = ancho - m.izq - m.der;
  const ih = alto - m.arr - m.aba;
  const u = UNIDADES[estado.unidad];

  const valores = series.flatMap((s) => s.valores).filter((v) => v !== null).map((v) => v * u.escala);
  const ticks = pasos(Math.max(...valores), estrecho ? 4 : 5);
  const ymax = ticks.at(-1);
  const X = (i) => m.izq + (i / (años.length - 1)) * iw;
  const Y = (v) => m.arr + ih - ((v * u.escala) / ymax) * ih;

  contenedor.textContent = "";
  const svg = el("svg", { width: ancho, height: alto, viewBox: `0 0 ${ancho} ${alto}`, "aria-hidden": "true" }, contenedor);

  // Legislaturas: franjas alternas desde cada sesión constitutiva. Un valor anual se sitúa a mitad de su año, así
  // que el 1 de enero de un año cae medio paso antes de su punto.
  const posicion = (iso) => {
    const a = Number(iso.slice(0, 4));
    const dia = (Date.parse(iso) - Date.parse(`${a}-01-01`)) / 864e5;
    return a - años[0] - 0.5 + dia / 365.25;
  };
  const legs = d.legislaturas;
  const franjas = el("g", { class: "franjas" }, svg);
  legs.forEach((l, k) => {
    const desde = Math.max(0, posicion(l.inicio));
    const hasta = Math.min(años.length - 1, k + 1 < legs.length ? posicion(legs[k + 1].inicio) : Infinity);
    if (hasta <= desde) return;
    const x0 = X(desde), x1 = X(hasta);
    el("rect", { x: x0, y: m.arr, width: x1 - x0, height: ih, class: k % 2 ? "franja impar" : "franja par" }, franjas);
    if (conNombres && x1 - x0 >= 22) {
      const t = el("text", { x: (x0 + x1) / 2, y: 14, "text-anchor": "middle", class: "franja-texto" }, franjas);
      t.textContent = l.nombre;
    }
  });

  marcarAcontecimientos(svg, (iso) => {
    const p = posicion(iso);
    return p < 0 || p > años.length - 1 ? null : X(p);
  }, m.arr, m.arr + ih);

  // Rejilla y eje vertical
  const rejilla = el("g", { class: "rejilla" }, svg);
  for (const t of ticks) {
    const y = m.arr + ih - (t / ymax) * ih;
    el("line", { x1: m.izq, x2: ancho - m.der, y1: y, y2: y, class: t === 0 ? "base" : "" }, rejilla);
    const et = el("text", { x: m.izq - 6, y: y + 4, "text-anchor": "end", class: "eje-texto" }, rejilla);
    et.textContent = estado.unidad === "pib" ? numero(t, 0) : numero(t, t < 10 && t % 1 ? 1 : 0);
  }

  // Eje horizontal: años
  const cada = estrecho ? 10 : 5;
  años.forEach((a, i) => {
    if ((a - años[0]) % cada !== 0 && i !== años.length - 1) return;
    if (i === años.length - 1 && (a - años[0]) % cada !== 0 && (a - años[0]) % cada < cada / 2) return;
    const ancla = i === años.length - 1 ? "end" : i === 0 ? "start" : "middle";
    const t = el("text", { x: X(i) + (ancla === "end" ? 6 : ancla === "start" ? -6 : 0), y: alto - 8, "text-anchor": ancla, class: "eje-texto" }, svg);
    t.textContent = a;
  });

  // Hueco entre ingresos y gastos
  if (hueco) {
    const [a, b] = hueco.map((k) => series.find((s) => s.clave === k).valores);
    const ida = a.map((v, i) => `${X(i)},${Y(v)}`);
    const vuelta = b.map((v, i) => `${X(i)},${Y(v)}`).reverse();
    el("polygon", { points: [...ida, ...vuelta].join(" "), class: "hueco" }, svg);
    // Una sola etiqueta, donde el hueco es más ancho
    // La etiqueta ocupa unos 50 px: todos los años que tapa deben tener hueco de sobra.
    const hueco_px = (i) => Math.abs(Y(b[i]) - Y(a[i]));
    const radio = Math.ceil(28 / (iw / (años.length - 1)));
    let mejor = -1;
    a.forEach((v, i) => {
      if (i < radio || i > a.length - 1 - radio) return;
      const holgura = Math.min(...a.slice(i - radio, i + radio + 1).map((_, k) => hueco_px(i - radio + k)));
      if (holgura > 20 && (mejor < 0 || hueco_px(i) > hueco_px(mejor))) mejor = i;
    });
    if (mejor >= 0) {
      const t = el("text", { x: X(mejor), y: (Y(a[mejor]) + Y(b[mejor])) / 2 + 4, "text-anchor": "middle", class: "hueco-texto" }, svg);
      t.textContent = b[mejor] > a[mejor] ? "déficit" : "superávit";
    }
  }

  for (const s of series) {
    const camino = s.valores.map((v, i) => `${i ? "L" : "M"}${X(i)},${Y(v)}`).join("");
    el("path", { d: camino, class: `linea ${s.clase}` }, svg);
  }

  // Cruz: línea vertical y puntos del año elegido
  const cruz = el("g", { class: "cruz" }, svg);
  function marcar(i) {
    cruz.textContent = "";
    el("line", { x1: X(i), x2: X(i), y1: m.arr, y2: m.arr + ih }, cruz);
    for (const s of series) {
      if (s.valores[i] === null) continue;
      el("circle", { cx: X(i), cy: Y(s.valores[i]), r: 4.5, class: `punto ${s.clase}` }, cruz);
    }
    alPasar(i);
  }
  marcar(estado.indice);

  const elegir = (ev) => {
    const r = svg.getBoundingClientRect();
    const x = ev.clientX - r.left;
    const i = Math.max(0, Math.min(años.length - 1, Math.round(((x - m.izq) / iw) * (años.length - 1))));
    if (i !== estado.indice) {
      estado.indice = i;
      redibujarCruces();
    }
  };
  svg.addEventListener("pointermove", elegir);
  svg.addEventListener("pointerdown", elegir);
  contenedor.marcar = marcar;
}

const COMPONENTES = [
  { clave: "deficit_primario", clase: "c-primario", nombre: "déficit sin intereses", nombreNegativo: "superávit sin intereses" },
  { clave: "intereses", clase: "c-intereses", nombre: "intereses" },
  { clave: "activos", clase: "c-activos", nombre: "compra neta de activos financieros" },
  { clave: "ajustes", clase: "c-ajustes", nombre: "ajustes y discrepancias" },
  { clave: "crecimiento", clase: "c-crecimiento", nombre: "efecto del crecimiento del PIB", soloPib: true },
];

function conSigno(v, unidad) {
  if (v === null || v === undefined) return "sin dato";
  const texto = unidad === "pib" ? `${numero(Math.abs(v), 2)} puntos` : formatear(Math.abs(v), unidad);
  return `${v < 0 ? "−" : "+"}${texto}`;
}

// Barras apiladas con signo: lo que suma deuda, hacia arriba; lo que la resta, hacia abajo. El punto es la
// variación total del año, que es exactamente la suma de las barras.
function dibujarBarras(contenedor) {
  const d = estado.datos;
  const u = estado.unidad;
  const datos = d.cambio_deuda[u];
  const comps = COMPONENTES.filter((c) => !c.soloPib || u === "pib");
  const años = d.años;
  const ancho = contenedor.clientWidth;
  const estrecho = ancho < 520;
  const alto = estrecho ? 330 : 390;
  const m = { izq: estrecho ? 44 : 52, der: 18, arr: TIRA, aba: 28 };
  const iw = ancho - m.izq - m.der;
  const ih = alto - m.arr - m.aba;
  const esc = u === "pib" ? 1 : UNIDADES[u].escala;

  let maximo = 0, minimo = 0;
  años.forEach((_, i) => {
    let pos = 0, neg = 0;
    for (const c of comps) {
      const v = datos[c.clave][i];
      if (v === null) continue;
      if (v > 0) pos += v * esc; else neg += v * esc;
    }
    maximo = Math.max(maximo, pos, (datos.variacion[i] ?? 0) * esc);
    minimo = Math.min(minimo, neg, (datos.variacion[i] ?? 0) * esc);
  });
  const paso = pasos(Math.max(maximo, -minimo), estrecho ? 3 : 4)[1];
  const ymin = Math.floor(minimo / paso) * paso;
  const ymax = Math.ceil(maximo / paso) * paso;
  const X = (i) => m.izq + ((i + 0.5) / años.length) * iw;
  const Y = (v) => m.arr + ((ymax - v) / (ymax - ymin)) * ih;
  const banda = iw / años.length;
  const grosor = Math.min(24, banda * 0.72);

  contenedor.textContent = "";
  const svg = el("svg", { width: ancho, height: alto, viewBox: `0 0 ${ancho} ${alto}`, "aria-hidden": "true" }, contenedor);

  // Legislaturas, con la misma regla que los otros gráficos pero sobre bandas de año
  const posicion = (iso) => {
    const a = Number(iso.slice(0, 4));
    const dia = (Date.parse(iso) - Date.parse(`${a}-01-01`)) / 864e5;
    return a - años[0] + dia / 365.25;
  };
  const legs = d.legislaturas;
  const franjas = el("g", { class: "franjas" }, svg);
  legs.forEach((l, k) => {
    const desde = Math.max(0, posicion(l.inicio));
    const hasta = Math.min(años.length, k + 1 < legs.length ? posicion(legs[k + 1].inicio) : Infinity);
    if (hasta <= desde) return;
    const x0 = m.izq + (desde / años.length) * iw, x1 = m.izq + (hasta / años.length) * iw;
    el("rect", { x: x0, y: m.arr, width: x1 - x0, height: ih, class: k % 2 ? "franja impar" : "franja par" }, franjas);
    if (x1 - x0 >= 22) {
      const t = el("text", { x: (x0 + x1) / 2, y: 14, "text-anchor": "middle", class: "franja-texto" }, franjas);
      t.textContent = l.nombre;
    }
  });

  const rejilla = el("g", { class: "rejilla" }, svg);
  for (let t = ymin; t <= ymax + paso / 1000; t += paso) {
    el("line", { x1: m.izq, x2: ancho - m.der, y1: Y(t), y2: Y(t), class: Math.abs(t) < paso / 1000 ? "base" : "" }, rejilla);
    const et = el("text", { x: m.izq - 6, y: Y(t) + 4, "text-anchor": "end", class: "eje-texto" }, rejilla);
    const valor = Math.abs(t) < paso / 1000 ? 0 : t;
    et.textContent = (valor > 0 ? "+" : valor < 0 ? "−" : "") + numero(Math.abs(valor), paso < 1 ? 1 : 0);
  }
  const cada = estrecho ? 10 : 5;
  años.forEach((a, i) => {
    if ((a - años[0]) % cada !== 0 && i !== años.length - 1) return;
    if (i === años.length - 1 && (a - años[0]) % cada !== 0 && (a - años[0]) % cada < cada / 2) return;
    const t = el("text", { x: X(i), y: alto - 8, "text-anchor": "middle", class: "eje-texto" }, svg);
    t.textContent = a;
  });

  marcarAcontecimientos(svg, (iso) => {
    const p = posicion(iso);
    return p < 0 || p > años.length ? null : m.izq + (p / años.length) * iw;
  }, m.arr, m.arr + ih);

  const barras = el("g", {}, svg);
  años.forEach((_, i) => {
    const g = el("g", {}, barras);
    let arriba = 0, abajo = 0;
    for (const c of comps) {
      const v = datos[c.clave][i];
      if (v === null || v === 0) continue;
      const alto_px = Math.abs(Y(0) - Y(Math.abs(v) * esc));
      const hueco = alto_px > 3 ? 1 : 0;  // 2 px de superficie entre segmentos: 1 arriba y 1 abajo
      const y = v > 0 ? Y(arriba + v * esc) : Y(abajo);
      el("rect", { x: X(i) - grosor / 2, y: y + hueco, width: grosor, height: Math.max(0.5, alto_px - 2 * hueco), class: c.clase }, g);
      if (v > 0) arriba += v * esc; else abajo += v * esc;
    }
    if (datos.variacion[i] !== null) {
      el("circle", { cx: X(i), cy: Y(datos.variacion[i] * esc), r: Math.min(4.5, grosor / 2.5 + 1), class: "punto-total" }, g);
    }
  });

  const resalte = el("rect", { y: m.arr, height: ih, width: banda, class: "resalte-año" });
  barras.before(resalte);
  function marcar(i) {
    resalte.setAttribute("x", m.izq + i * banda);
    lecturaBarras(i, comps);
  }
  marcar(estado.indice);
  const elegir = (ev) => {
    const r = svg.getBoundingClientRect();
    const i = Math.max(0, Math.min(años.length - 1, Math.floor(((ev.clientX - r.left - m.izq) / iw) * años.length)));
    if (i !== estado.indice) {
      estado.indice = i;
      redibujarCruces();
    }
  };
  svg.addEventListener("pointermove", elegir);
  svg.addEventListener("pointerdown", elegir);
  contenedor.marcar = marcar;
}

function lecturaBarras(i, comps) {
  const d = estado.datos;
  const u = estado.unidad;
  const datos = d.cambio_deuda[u];
  const c = document.getElementById("g3-lectura");
  c.textContent = "";
  const año = document.createElement("strong");
  año.className = "lectura-anio";
  año.textContent = d.años[i];
  c.appendChild(año);
  if (datos.variacion[i] === null) {
    c.appendChild(document.createTextNode(" Sin dato en % del PIB: falta el PIB del año anterior."));
    return;
  }
  const total = document.createElement("span");
  total.className = "lectura-fila";
  const pt = document.createElement("span");
  pt.className = "clave-punto";
  total.appendChild(pt);
  const tv = document.createElement("b");
  tv.textContent = conSigno(datos.variacion[i], u);
  total.appendChild(tv);
  total.appendChild(document.createTextNode(u === "pib" ? " variación de la deuda sobre el PIB" : " variación de la deuda"));
  c.appendChild(total);
  for (const comp of comps) {
    const v = datos[comp.clave][i];
    const fila = document.createElement("span");
    fila.className = "lectura-fila";
    const clave = document.createElement("span");
    clave.className = `clave-barra ${comp.clase}`;
    fila.appendChild(clave);
    const b = document.createElement("b");
    b.textContent = conSigno(v, u);
    fila.appendChild(b);
    fila.appendChild(document.createTextNode(` ${v < 0 && comp.nombreNegativo ? comp.nombreNegativo : comp.nombre}`));
    c.appendChild(fila);
  }
}

function pintarLeyendaBarras() {
  const u = estado.unidad;
  const ul = document.getElementById("g3-leyenda");
  ul.textContent = "";
  for (const comp of COMPONENTES.filter((c) => !c.soloPib || u === "pib")) {
    const li = document.createElement("li");
    const k = document.createElement("span");
    k.className = `clave-barra ${comp.clase}`;
    li.appendChild(k);
    li.appendChild(document.createTextNode(comp.nombre.charAt(0).toUpperCase() + comp.nombre.slice(1)));
    ul.appendChild(li);
  }
  const li = document.createElement("li");
  const k = document.createElement("span");
  k.className = "clave-punto";
  li.appendChild(k);
  li.appendChild(document.createTextNode("Variación total (suma de las barras)"));
  ul.appendChild(li);
}

const INDICADORES_UE = {
  ingresos: "ingresos", gastos: "gastos", saldo: "saldo (negativo = déficit)", deuda: "deuda",
};

// España frente a la UE: un punto por país en el año elegido, ordenados de mayor a menor.
function dibujarUE(contenedor) {
  const d = estado.datos;
  const i = estado.indice;
  const ind = estado.indicadorUE;
  const valores = d.ue.indicadores[ind];
  const paises = Object.keys(d.ue.paises).filter((p) => p !== "EU27_2020" && valores[p][i] !== null);
  paises.sort((a, b) => valores[b][i] - valores[a][i]);
  const media = valores.EU27_2020[i];

  const ancho = contenedor.clientWidth;
  const estrecho = ancho < 520;
  const fila = 19;
  const m = { izq: estrecho ? 92 : 112, der: 56, arr: 26, aba: 24 };
  const alto = m.arr + m.aba + Math.max(1, paises.length) * fila;
  const iw = ancho - m.izq - m.der;
  contenedor.textContent = "";
  const svg = el("svg", { width: ancho, height: alto, viewBox: `0 0 ${ancho} ${alto}`, "aria-hidden": "true" }, contenedor);
  if (!paises.length) {
    const t = el("text", { x: m.izq, y: m.arr + 12, class: "eje-texto" }, svg);
    t.textContent = `Eurostat no tiene este dato para ${d.años[i]}.`;
    lecturaUE(null, media, paises);
    return;
  }
  const lista = paises.map((p) => valores[p][i]).concat(media === null ? [] : [media], [0]);
  const lo = Math.min(...lista), hi = Math.max(...lista);
  const paso = pasos(Math.max(Math.abs(lo), Math.abs(hi)), estrecho ? 3 : 5)[1];
  const xmin = Math.floor(lo / paso) * paso, xmax = Math.ceil(hi / paso) * paso;
  const X = (v) => m.izq + ((v - xmin) / (xmax - xmin)) * iw;
  const Y = (k) => m.arr + k * fila + fila / 2;

  const rejilla = el("g", { class: "rejilla" }, svg);
  for (let t = xmin; t <= xmax + paso / 1000; t += paso) {
    el("line", { x1: X(t), x2: X(t), y1: m.arr, y2: alto - m.aba, class: Math.abs(t) < paso / 1000 ? "base" : "" }, rejilla);
    const et = el("text", { x: X(t), y: alto - 6, "text-anchor": "middle", class: "eje-texto" }, rejilla);
    et.textContent = `${t < 0 ? "−" : ""}${numero(Math.abs(t), 0)} %`;
  }
  if (media !== null) {
    el("line", { x1: X(media), x2: X(media), y1: m.arr - 4, y2: alto - m.aba, class: "media-ue" }, svg);
    const t = el("text", { x: X(media), y: m.arr - 10, "text-anchor": "middle", class: "media-ue-texto" }, svg);
    t.textContent = `UE-27: ${media < 0 ? "−" : ""}${numero(Math.abs(media), 1)} %`;
  }
  const filas = paises.map((p, k) => {
    const g = el("g", { class: "pais-fila" }, svg);
    const espana = p === "ES";
    const n = el("text", { x: m.izq - 8, y: Y(k) + 4, "text-anchor": "end", class: `pais-texto${espana ? " espana" : ""}` }, g);
    n.textContent = d.ue.paises[p];
    el("circle", { cx: X(valores[p][i]), cy: Y(k), r: espana ? 6 : 4.5, class: `pais-punto${espana ? " espana" : ""}` }, g);
    if (espana) {
      const v = el("text", { x: X(valores[p][i]) + 10, y: Y(k) + 4, class: "pais-texto espana" }, g);
      v.textContent = `${valores[p][i] < 0 ? "−" : ""}${numero(Math.abs(valores[p][i]), 1)} %`;
    }
    el("rect", { x: 0, y: Y(k) - fila / 2, width: ancho, height: fila, fill: "transparent" }, g);
    g.addEventListener("pointerenter", () => {
      filas.forEach((f) => f.classList.remove("activa"));
      g.classList.add("activa");
      lecturaUE(p, media, paises);
    });
    return g;
  });
  svg.addEventListener("pointerleave", () => {
    filas.forEach((f) => f.classList.remove("activa"));
    lecturaUE(null, media, paises);
  });
  lecturaUE(null, media, paises);
}

function lecturaUE(pais, media, paises) {
  const d = estado.datos;
  const i = estado.indice;
  const valores = d.ue.indicadores[estado.indicadorUE];
  const c = document.getElementById("g4-lectura");
  c.textContent = "";
  const año = document.createElement("strong");
  año.className = "lectura-anio";
  año.textContent = d.años[i];
  c.appendChild(año);
  const filas = [["ES", true]];
  if (pais && pais !== "ES") filas.push([pais, false]);
  for (const [p, esp] of filas) {
    if (valores[p][i] === null) continue;
    const s = document.createElement("span");
    s.className = "lectura-fila";
    const b = document.createElement("b");
    b.textContent = `${valores[p][i] < 0 ? "−" : ""}${numero(Math.abs(valores[p][i]), 1)} %`;
    s.appendChild(b);
    s.appendChild(document.createTextNode(` ${d.ue.paises[p]}${esp ? ` (puesto ${paises.indexOf(p) + 1} de ${paises.length}, de mayor a menor)` : ""}`));
    c.appendChild(s);
  }
  const s = document.createElement("span");
  s.className = "lectura-fila";
  const b = document.createElement("b");
  b.textContent = media === null ? "sin dato" : `${media < 0 ? "−" : ""}${numero(Math.abs(media), 1)} %`;
  s.appendChild(b);
  s.appendChild(document.createTextNode(" media de la UE-27"));
  c.appendChild(s);
  c.appendChild(document.createTextNode(` · ${INDICADORES_UE[estado.indicadorUE]}, en % del PIB`));
}

function pintarAcontecimientos() {
  const a = estado.datos.acontecimientos;
  const c = document.getElementById("acontecimientos");
  c.textContent = "";
  const titulo = document.createElement("p");
  const b = document.createElement("strong");
  b.textContent = "Acontecimientos marcados en los gráficos. ";
  titulo.appendChild(b);
  titulo.appendChild(document.createTextNode(`Criterio: ${a.criterio}`));
  c.appendChild(titulo);
  const ol = document.createElement("ol");
  for (const e of a.lista) {
    const li = document.createElement("li");
    const f = document.createElement("strong");
    f.textContent = `${fecha(e.fecha)}. ${e.corto}. `;
    li.appendChild(f);
    li.appendChild(document.createTextNode(`${e.texto} Fuente: `));
    const enlace = document.createElement("a");
    enlace.href = e.url;
    enlace.textContent = e.fuente;
    li.appendChild(enlace);
    li.appendChild(document.createTextNode("."));
    ol.appendChild(li);
  }
  c.appendChild(ol);
}

function redibujarCruces() {
  dibujarUE(document.getElementById("g4"));
  for (const id of ["g1", "g2", "g3"]) {
    const c = document.getElementById(id);
    if (c.marcar) c.marcar(estado.indice);
  }
}

function lectura(contenedor, i, filas) {
  const d = estado.datos;
  contenedor.textContent = "";
  const año = document.createElement("strong");
  año.className = "lectura-anio";
  año.textContent = d.años[i];
  contenedor.appendChild(año);
  let provisional = false;
  for (const f of filas) {
    const span = document.createElement("span");
    span.className = "lectura-fila";
    if (f.clase) {
      const clave = document.createElement("span");
      clave.className = `clave-linea ${f.clase}`;
      span.appendChild(clave);
    }
    const v = document.createElement("b");
    v.textContent = f.valor;
    span.appendChild(v);
    span.appendChild(document.createTextNode(` ${f.nombre}`));
    contenedor.appendChild(span);
    provisional ||= f.provisional;
  }
  const año_ = d.años[i];
  const legs = d.legislaturas.filter((l, k) => {
    const fin = k + 1 < d.legislaturas.length ? d.legislaturas[k + 1].inicio : "9999-12-31";
    return l.inicio <= `${año_}-12-31` && fin > `${año_}-01-01`;
  });
  const leg = document.createElement("span");
  leg.className = "lectura-legislatura";
  const nombres = legs.map((l) => l.nombre);
  leg.textContent = nombres.length === 1 ? `${nombres[0]} Legislatura` :
    `${nombres.slice(0, -1).join(", ")} y ${nombres.at(-1)} Legislaturas`;
  contenedor.appendChild(leg);
  if (provisional) {
    const p = document.createElement("span");
    p.className = "lectura-provisional";
    p.textContent = "provisional";
    contenedor.appendChild(p);
  }
}

function pintar() {
  const d = estado.datos;
  const u = estado.unidad;
  const s = d.series;
  const ancho = document.querySelector("main").clientWidth;

  dibujar(document.getElementById("g1"), {
    series: [
      { clave: "gastos", clase: "gastos", valores: s.gastos[u] },
      { clave: "ingresos", clase: "ingresos", valores: s.ingresos[u] },
    ],
    hueco: ["ingresos", "gastos"],
    conNombres: true,
    alto: ancho < 520 ? 320 : 380,
    alPasar: (i) => {
      const saldo = s.saldo[u][i];
      lectura(document.getElementById("g1-lectura"), i, [
        { clase: "ingresos", nombre: "ingresos", valor: formatear(s.ingresos[u][i], u), provisional: s.ingresos.provisional[u][i] },
        { clase: "gastos", nombre: "gastos", valor: formatear(s.gastos[u][i], u), provisional: s.gastos.provisional[u][i] },
        {
          clase: null,
          nombre: saldo < 0 ? "de déficit" : "de superávit",
          valor: formatear(Math.abs(saldo), u),
          provisional: s.saldo.provisional[u][i],
        },
      ]);
    },
  });

  dibujar(document.getElementById("g2"), {
    series: [{ clave: "deuda", clase: "deuda", valores: s.deuda[u] }],
    hueco: null,
    conNombres: true,
    alto: ancho < 520 ? 260 : 300,
    alPasar: (i) => {
      lectura(document.getElementById("g2-lectura"), i, [
        { clase: "deuda", nombre: "de deuda", valor: formatear(s.deuda[u][i], u), provisional: s.deuda.provisional[u][i] },
      ]);
    },
  });

  const un = UNIDADES[u];
  const explicada = document.getElementById("unidad-explicada");
  explicada.textContent = "";
  const etiqueta = document.createElement("span");
  etiqueta.className = `etiqueta-tipo ${un.tipo}`;
  etiqueta.textContent = un.tipo;
  explicada.appendChild(etiqueta);
  explicada.appendChild(document.createTextNode(" " + texto(un.explica, d.año_base_constantes)));

  pintarLeyendaBarras();
  dibujarBarras(document.getElementById("g3"));
  dibujarUE(document.getElementById("g4"));
  pintarFuenteUE();
  pintarFuente("g1-fuente", "gov_10a_main");
  pintarFuente("g2-fuente", "gov_10dd_edpt1");
  pintarFuente("g3-fuente", "gov_10dd_edpt3",
    [["gov_10dd_edpt1", u === "pib" ? "intereses y PIB de la misma notificación" : "intereses de la misma notificación"]],
    u === "pib"
      ? "Cada parte se divide entre el PIB del año; el efecto del crecimiento sale de la identidad exacta: variación del porcentaje = variación de la deuda ÷ PIB − porcentaje del año anterior × crecimiento ÷ (1 + crecimiento)."
      : "El déficit sin intereses es una resta: déficit − intereses.");
  pintarTabla();
}

// Línea de fuente bajo cada gráfico: la tabla de Eurostat de la que sale y, si la unidad es una lectura, las tablas
// que intervienen en el cálculo. Cambia con la unidad.
function pintarFuente(id, tabla, otras = [], nota = "") {
  const d = estado.datos;
  const u = estado.unidad;
  const porTabla = Object.fromEntries(d.fuentes.map((f) => [f.tabla, f]));
  const p = document.getElementById(id);
  p.textContent = "Fuente: Eurostat, ";
  const enlace = (f, texto) => {
    const a = document.createElement("a");
    a.href = f.url_navegador;
    a.textContent = texto;
    return a;
  };
  const f = porTabla[tabla];
  p.appendChild(enlace(f, `${f.nombre.charAt(0).toLowerCase()}${f.nombre.slice(1)}`));
  p.appendChild(document.createTextNode(` (tabla ${tabla}, actualizada el ${fecha(f.actualizado_fuente)})`));
  for (const [t, texto] of otras) {
    const g = porTabla[t];
    p.appendChild(document.createTextNode(", "));
    p.appendChild(enlace(g, texto));
    p.appendChild(document.createTextNode(` (tabla ${t}, actualizada el ${fecha(g.actualizado_fuente)})`));
  }
  const extra = { constantes: ["nama_10_gdp", "deflactor del PIB"], habitante: ["nama_10_pe", "población media"] }[u];
  if (extra) {
    p.appendChild(document.createTextNode(" y "));
    const g = porTabla[extra[0]];
    p.appendChild(enlace(g, extra[1]));
    p.appendChild(document.createTextNode(` (tabla ${extra[0]}, actualizada el ${fecha(g.actualizado_fuente)}). `));
  } else {
    p.appendChild(document.createTextNode(". "));
  }
  const tipoTexto = nota && u === "pib" ? "lectura" : UNIDADES[u].tipo;
  const tipo = document.createElement("span");
  tipo.className = `etiqueta-tipo ${tipoTexto}`;
  tipo.textContent = tipoTexto;
  p.appendChild(tipo);
  p.appendChild(document.createTextNode(nota ? ` ${nota} ` : " "));
  const copia = document.createElement("a");
  copia.href = f.copia;
  copia.textContent = "Fichero descargado";
  p.appendChild(copia);
  p.appendChild(document.createTextNode(". Legislaturas: "));
  const c = porTabla.legislaturas;
  const congreso = document.createElement("a");
  congreso.href = c.url_navegador;
  congreso.textContent = "Congreso de los Diputados, sesiones constitutivas";
  p.appendChild(congreso);
  p.appendChild(document.createTextNode(` (descargada el ${fecha(c.descargado)}). Acontecimientos numerados: documento oficial de cada uno en la lista bajo el primer gráfico.`));
}

function pintarFuenteUE() {
  const d = estado.datos;
  const porTabla = Object.fromEntries(d.fuentes.map((f) => [f.tabla, f]));
  const f = porTabla[estado.indicadorUE === "deuda" ? "ue_gov_10dd_edpt1" : "ue_gov_10a_main"];
  const p = document.getElementById("g4-fuente");
  p.textContent = "Fuente: Eurostat, ";
  const a = document.createElement("a");
  a.href = f.url_navegador;
  a.textContent = f.nombre.charAt(0).toLowerCase() + f.nombre.slice(1);
  p.appendChild(a);
  p.appendChild(document.createTextNode(` (tabla ${f.dataset}, actualizada el ${fecha(f.actualizado_fuente)}), en % del PIB. `));
  const tipo = document.createElement("span");
  tipo.className = "etiqueta-tipo dato";
  tipo.textContent = "dato";
  p.appendChild(tipo);
  p.appendChild(document.createTextNode(" La media es la de la UE-27 tal como la calcula Eurostat. "));
  const c = document.createElement("a");
  c.href = f.copia;
  c.textContent = "Fichero descargado";
  p.appendChild(c);
  p.appendChild(document.createTextNode("."));
}

function pintarTabla() {
  const d = estado.datos;
  const u = estado.unidad;
  const s = d.series;
  const tabla = document.getElementById("tabla");
  const thead = tabla.querySelector("thead");
  const tbody = tabla.querySelector("tbody");
  thead.textContent = "";
  tbody.textContent = "";
  const cab = document.createElement("tr");
  for (const t of ["Año", "Ingresos", "Gastos", "Saldo", "Deuda"]) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = t;
    cab.appendChild(th);
  }
  thead.appendChild(cab);
  const leyenda = document.createElement("caption");
  leyenda.textContent = `En ${texto(UNIDADES[u].eje, d.año_base_constantes)}. Saldo negativo = déficit. «p» = provisional.`;
  tabla.querySelector("caption")?.remove();
  tabla.prepend(leyenda);
  [...d.años.keys()].reverse().forEach((i) => {
    const tr = document.createElement("tr");
    const celdas = [
      [String(d.años[i]), false],
      ...["ingresos", "gastos", "saldo", "deuda"].map((k) => [formatear(s[k][u][i], u), s[k].provisional[u][i]]),
    ];
    for (const [t, p] of celdas) {
      const td = document.createElement("td");
      td.textContent = t;
      if (p) {
        const sup = document.createElement("sup");
        sup.textContent = " p";
        td.appendChild(sup);
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  });
}

function pintarFicha() {
  const d = estado.datos;
  const unidades = document.getElementById("ficha-unidades");
  const lista = document.createElement("ul");
  lista.className = "lista-fuentes";
  for (const [clave, nombre] of [["pib", "% del PIB"], ["corrientes", "Euros"], ["constantes", "Euros sin inflación"], ["habitante", "Por habitante"]]) {
    const li = document.createElement("li");
    const b = document.createElement("strong");
    b.textContent = `${nombre}: `;
    li.appendChild(b);
    li.appendChild(document.createTextNode(texto(FORMULAS[clave], d.año_base_constantes)));
    lista.appendChild(li);
  }
  unidades.appendChild(lista);

  const fuentes = document.getElementById("ficha-fuentes");
  const deEstaPagina = ["gov_10a_main", "gov_10dd_edpt1", "gov_10dd_edpt3", "ue_gov_10a_main", "ue_gov_10dd_edpt1", "nama_10_gdp", "nama_10_pe", "ert_h_eur_a", "legislaturas", "bde_be1106", "igae_cap_serie", "ine_pib", "ine_poblacion"];
  for (const f of d.fuentes.filter((x) => deEstaPagina.includes(x.tabla))) {
    const li = document.createElement("li");
    const nombre = document.createElement("strong");
    nombre.textContent = f.nombre;
    li.appendChild(nombre);
    const codigo = document.createElement("code");
    codigo.textContent = ` ${f.tabla}`;
    li.appendChild(codigo);
    li.appendChild(document.createElement("br"));
    const eurostat = f.fuente === "Eurostat";
    li.appendChild(document.createTextNode(eurostat
      ? `Actualizada por Eurostat el ${fecha(f.actualizado_fuente)}; descargada el ${fecha(f.descargado)}. `
      : `${f.fuente}. Descargado el ${fecha(f.descargado)}. ${f.uso} `));
    const enlaces = eurostat
      ? [["Ver en Eurostat", f.url_navegador], ["consulta exacta", f.url_api], ["fichero descargado", f.copia]]
      : [["Ver en la fuente", f.url_navegador], ["fichero descargado", f.copia]];
    for (const [t, href] of enlaces) {
      const a = document.createElement("a");
      a.href = href;
      a.textContent = t;
      li.appendChild(a);
      li.appendChild(document.createTextNode(" · "));
    }
    const huella = document.createElement("span");
    huella.className = "huella";
    huella.title = `SHA-256 completo: ${f.sha256}`;
    huella.textContent = `huella ${f.sha256.slice(0, 12)}`;
    li.appendChild(huella);
    fuentes.appendChild(li);
  }

  const comprobaciones = document.getElementById("ficha-comprobaciones");
  for (const c of d.comprobaciones) {
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
    li.appendChild(document.createTextNode(c.resultado + "."));
    if (c.nota) {
      li.appendChild(document.createTextNode(" " + c.nota));
    }
    comprobaciones.appendChild(li);
  }

  const pie = document.getElementById("pie-generado");
  pie.textContent = `Datos descargados de Eurostat el ${fecha(d.fuentes[0].descargado)}`;
  // La revisión diaria del servidor apunta aquí cuándo comprobó las fuentes por última vez (aunque nada cambiara).
  fetch("datos/estado.json", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((e) => {
      if (e && e.revisado) pie.textContent += ` · fuentes revisadas por última vez el ${fecha(e.revisado)}`;
    })
    .catch(() => {});
}

function teclado(ev) {
  const n = estado.datos.años.length;
  if (ev.key === "ArrowLeft") estado.indice = Math.max(0, estado.indice - 1);
  else if (ev.key === "ArrowRight") estado.indice = Math.min(n - 1, estado.indice + 1);
  else if (ev.key === "Home") estado.indice = 0;
  else if (ev.key === "End") estado.indice = n - 1;
  else return;
  ev.preventDefault();
  redibujarCruces();
}

async function arrancar() {
  const r = await fetch("datos/aapp.json");
  estado.datos = await r.json();
  estado.indice = estado.datos.años.length - 1;

  for (const b of document.querySelectorAll("[data-unidad]")) {
    b.addEventListener("click", () => {
      estado.unidad = b.dataset.unidad;
      for (const o of document.querySelectorAll("[data-unidad]")) o.setAttribute("aria-pressed", String(o === b));
      pintar();
    });
  }
  for (const id of ["g1", "g2", "g3", "g4"]) document.getElementById(id).addEventListener("keydown", teclado);
  for (const b of document.querySelectorAll("[data-ue]")) {
    b.addEventListener("click", () => {
      estado.indicadorUE = b.dataset.ue;
      for (const o of document.querySelectorAll("[data-ue]")) o.setAttribute("aria-pressed", String(o === b));
      dibujarUE(document.getElementById("g4"));
      pintarFuenteUE();
    });
  }

  pintar();
  pintarFicha();
  pintarAcontecimientos();
  let pendiente = null;
  window.addEventListener("resize", () => {
    clearTimeout(pendiente);
    pendiente = setTimeout(pintar, 120);
  });
}

arrancar();
