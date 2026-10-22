// Cuentas en limpio: piezas comunes a todas las páginas (unidades, formato de números, SVG, acontecimientos).
// Se carga antes que el script propio de cada página.
"use strict";

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
    corta: "mil millones €",
    eje: "miles de millones de euros",
    explica: "Miles de millones de euros de cada año, sin descontar la subida de precios. Hasta 1998, pesetas pasadas a euros al tipo fijo de 166,386. Dato publicado por Eurostat.",
    escala: 1 / 1000,
  },
  constantes: {
    tipo: "lectura",
    corta: "mil millones €",
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

function pasos(maximo, cuantos = 5) {
  const bruto = maximo / cuantos;
  const magnitud = 10 ** Math.floor(Math.log10(bruto));
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * magnitud).find((p) => p >= bruto);
  const ticks = [];
  for (let t = 0; t <= maximo + paso * 0.001; t += paso) ticks.push(t);
  if (ticks.at(-1) < maximo) ticks.push(ticks.at(-1) + paso);
  return ticks;
}

const fecha = (iso) =>
  new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });

// ---- Piezas compartidas por las páginas de gasto, ingresos y presupuesto ----

// Escala y formato de cada unidad en los pequeños múltiplos (los euros se muestran en miles de millones).
const ESCALA = { pib: 1, corrientes: 1 / 1000, constantes: 1 / 1000, habitante: 1 };
const FORMATO = {
  pib: (v) => `${numero(v, 1)} %`,
  corrientes: (v) => `${numero(v, 1)} mil millones €`,
  constantes: (v) => `${numero(v, 1)} mil millones €`,
  habitante: (v) => `${numero(Math.round(v), 0)} €`,
};


// Línea de fuente, en dos capas (desde el 21/10/2026): arriba, quién publica el dato, dicho en llano, con enlace a su
// tabla; plegado, el detalle técnico (código de la tabla, fecha de actualización y copia del fichero descargado).
const QUIEN = {
  Eurostat: "Eurostat, la oficina de estadística de la Unión Europea",
  IGAE: "la Intervención General del Estado (IGAE), que lleva las cuentas del sector público",
  INE: "el Instituto Nacional de Estadística (INE)",
  AIReF: "la AIReF, el organismo independiente que vigila las cuentas públicas",
  OIReScon: "la OIReScon, la oficina independiente que supervisa la contratación pública",
};
// Etiqueta de qué es una cifra: «dato oficial» (publicado tal cual) o «cálculo nuestro» (una lectura sobre datos oficiales).
const ETIQUETA_TIPO = { dato: "dato oficial", lectura: "cálculo nuestro" };
function etiquetaTipo(tipo) {
  const t = document.createElement("span");
  t.className = `etiqueta-tipo ${tipo}`;
  t.textContent = ETIQUETA_TIPO[tipo] || tipo;
  t.title = tipo === "dato" ? "Cifra publicada tal cual por el organismo oficial" : "Cálculo nuestro sobre cifras oficiales; cómo se hace, en «Cómo trabajamos»";
  return t;
}
function lineaFuente(p, { fuentes, tablas, tipo, nota = "", detalleTecnico = "" }) {
  const porTabla = Object.fromEntries(fuentes.map((f) => [f.tabla, f]));
  p.textContent = "Fuente: ";
  const detalle = document.createElement("details");
  detalle.className = "fuente-detalle";
  const resumen = document.createElement("summary");
  resumen.textContent = "Detalle de la fuente";
  const lista = document.createElement("ul");
  detalle.append(resumen, lista);
  const vistas = new Set();
  tablas.forEach(([clave, texto], k) => {
    const f = porTabla[clave];
    if (k) p.appendChild(document.createTextNode("; "));
    p.appendChild(document.createTextNode(`${vistas.has(f.fuente) ? f.fuente : QUIEN[f.fuente] || f.fuente}, `));
    vistas.add(f.fuente);
    const a = document.createElement("a");
    a.href = f.url_navegador;
    a.textContent = texto || f.nombre.charAt(0).toLowerCase() + f.nombre.slice(1);
    p.appendChild(a);
    const li = document.createElement("li");
    const cuando = f.actualizado_fuente ? `actualizada el ${fecha(f.actualizado_fuente)}` : `descargada el ${fecha(f.descargado)}`;
    li.textContent = `${f.fuente}, ${f.nombre}: ${f.fuente === "Eurostat" ? `tabla ${f.dataset}, ` : ""}${cuando}`;
    if (f.copia) {
      li.appendChild(document.createTextNode(" ("));
      const c = document.createElement("a");
      c.href = f.copia;
      c.textContent = "fichero tal como se descargó";
      li.append(c, ")");
    }
    li.appendChild(document.createTextNode("."));
    lista.appendChild(li);
  });
  if (detalleTecnico) {
    const li = document.createElement("li");
    li.textContent = detalleTecnico;
    lista.appendChild(li);
  }
  p.appendChild(document.createTextNode(". "));
  p.appendChild(etiquetaTipo(tipo));
  if (nota) p.appendChild(document.createTextNode(` ${nota}`));
  // Va detrás del párrafo (un <details> no cabe dentro de un <p>); si la página repinta la fuente, sustituye al anterior.
  if (p.nextElementSibling?.classList.contains("fuente-detalle")) p.nextElementSibling.remove();
  p.after(detalle);
  marcarDescuadre(p);
}

// Lo que no cuadra (datos/descuadres.json): junto a la fuente de cada gráfico o tabla afectados, un aviso que explica el
// caso al pasar por encima y lleva a su ficha en descuadres.html.
let promesaDescuadres = null;
const ETIQUETA_DESCUADRE = { sin_explicar: "No cuadra", transitorio: "Desfase temporal", explicado: "Diferencia explicada" };
function leerDescuadres() {
  promesaDescuadres ||= fetch("datos/descuadres.json").then((r) => (r.ok ? r.json() : { casos: [] })).catch(() => ({ casos: [] }));
  return promesaDescuadres;
}
async function marcarDescuadre(p) {
  if (!p.id) return;
  const pagina = location.pathname.split("/").pop() || "index.html";
  const { casos } = await leerDescuadres();
  for (const c of casos) {
    if (!c.marcas?.some((m) => m.pagina === pagina && m.id === p.id) || p.querySelector(`[data-descuadre="${c.id}"]`)) continue;
    const a = document.createElement("a");
    a.className = `aviso-descuadre ${c.estado}`;
    a.href = `descuadres.html#${c.id}`;
    a.dataset.descuadre = c.id;
    a.title = c.resumen;
    a.setAttribute("aria-label", `${ETIQUETA_DESCUADRE[c.estado]}: ${c.resumen} Ver el caso.`);
    a.textContent = `${c.estado === "explicado" ? "ⓘ" : "⚠"} ${ETIQUETA_DESCUADRE[c.estado]}`;
    p.append(" ", a);
  }
}

function pintarComprobaciones(ul, lista) {
  ul.textContent = "";
  // Una frase que diga qué es esto, antes de la lista (solo la primera vez).
  if (!ul.previousElementSibling?.classList.contains("comprobaciones-intro")) {
    const intro = document.createElement("p");
    intro.className = "comprobaciones-intro";
    intro.textContent = "Cada día, antes de publicar, el programa comprueba que las cifras cuadran entre sí y con otras fuentes oficiales. Una marca ✓ quiere decir que cuadran; un «!», que hay una diferencia, y se explica cuál.";
    ul.before(intro);
  }
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
  b.textContent = `Último año disponible: ${años.at(-1)}.`;
  p.appendChild(b);
  // El porqué (quién publica qué y cuándo) interesa a pocos: va plegado.
  const det = document.createElement("details");
  det.className = "fuente-detalle";
  const s = document.createElement("summary");
  s.textContent = "¿Por qué no hay un año más reciente?";
  const t = document.createElement("p");
  t.textContent = motivo;
  det.append(s, t);
  p.appendChild(det);
}

// ---- Botones (i): qué implica un valor, con su fuente ----
// En el HTML: <button type="button" class="info" data-info="clave">i</button> dentro de un título. El texto sale de
// datos/explicaciones.json (cada entrada: titulo, texto[], decalaje, fuentes[{texto, url}]). Sin entrada, el botón se quita.
// Se puede volver a llamar cuando una página pinta botones nuevos: los ya montados se saltan.
let explicaciones = null;
async function montarInfo() {
  const botones = [...document.querySelectorAll("button.info[data-info]")].filter((b) => !b.dataset.montado);
  if (!botones.length) return;
  for (const b of botones) b.dataset.montado = "1";
  explicaciones ??= fetch("datos/explicaciones.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  const ex = await explicaciones;
  botones.forEach((b, k) => {
    const e = ex[b.dataset.info];
    if (!e) return b.remove();
    const panel = document.createElement("aside");
    panel.className = "info-panel";
    panel.id = `info-${b.dataset.info}-${document.querySelectorAll(".info-panel").length}-${k}`;
    panel.hidden = true;
    const t = document.createElement("p");
    t.className = "rotulo";
    t.textContent = e.titulo || "Qué implica";
    panel.appendChild(t);
    for (const parrafo of e.texto) {
      const p = document.createElement("p");
      p.textContent = parrafo;
      panel.appendChild(p);
    }
    if (e.decalaje) {
      const p = document.createElement("p");
      const s = document.createElement("strong");
      s.textContent = "Cuánto tarda en notarse. ";
      p.append(s, e.decalaje);
      panel.appendChild(p);
    }
    if (e.fuentes?.length) {
      // Las fuentes, plegadas: están para quien quiera comprobar, y abiertas cortaban la lectura.
      const det = document.createElement("details");
      det.className = "info-fuentes-plegadas";
      const sm = document.createElement("summary");
      sm.textContent = e.fuentes.length > 1 ? `De dónde sale (${e.fuentes.length} fuentes)` : "De dónde sale";
      det.appendChild(sm);
      const p = document.createElement("p");
      p.className = "info-fuentes";
      p.append("Fuente: ");
      e.fuentes.forEach((f, j) => {
        if (j) p.append("; ");
        const a = document.createElement("a");
        a.href = f.url;
        a.textContent = f.texto;
        p.appendChild(a);
      });
      p.append(".");
      det.appendChild(p);
      panel.appendChild(det);
    }
    b.setAttribute("aria-label", `Qué implica: ${e.titulo || b.dataset.info}`);
    b.setAttribute("aria-expanded", "false");
    b.setAttribute("aria-controls", panel.id);
    // En los pequeños múltiplos, el panel va detrás de su figura y ocupa toda la fila.
    (b.closest("figure.multiple") || b.closest("h1, h2, h3, h4, p, label")).after(panel);
    b.addEventListener("click", () => {
      const abierto = b.getAttribute("aria-expanded") === "true";
      b.setAttribute("aria-expanded", String(!abierto));
      panel.hidden = abierto;
    });
  });
}
document.addEventListener("DOMContentLoaded", montarInfo);

// ---- Palabras técnicas que se explican al pulsarlas (desde el 21/10/2026) ----
// La primera vez que una palabra de terminos.json aparece en el texto de la página, se convierte en un botón; al
// pulsarlo, una ficha con su explicación en una frase y el enlace al glosario. No se marcan títulos, enlaces,
// controles, tablas, citas literales ni fuentes. El contenido que las páginas pintan después también se revisa.
const NO_MARCAR = "a, button, select, option, label, h1, h2, h3, summary, dt, script, style, svg, canvas, table, blockquote, code, "
  + ".grafico, .selector, .filtros, .fuente-grafico, .termino-ficha, .promesa-etiqueta, .promesa-etiquetas, .ficha-datos, .lista-fuentes, li > strong:first-child, .hecho, .hechos, .lectura-año, .fuente-detalle, .antetitulo, .portada-reparto, .cifras-clave .nombre, [data-sin-terminos]";
async function montarTerminos() {
  if (/glosario\.html$/.test(location.pathname)) return;
  const main = document.querySelector("main");
  if (!main) return;
  let datos;
  try { datos = await fetch("terminos.json").then((r) => r.json()); } catch { return; }
  const porForma = new Map();
  for (const t of datos.terminos) for (const f of t.formas) porForma.set(f.toLowerCase(), t);
  const formas = [...porForma.keys()].sort((a, b) => b.length - a.length)
    .map((f) => f.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&"));
  const patron = new RegExp(`(?<![\\p{L}\\p{N}])(${formas.join("|")})(?![\\p{L}\\p{N}])`, "giu");
  const marcados = new Set();

  const ficha = document.createElement("div");
  ficha.className = "termino-ficha";
  ficha.id = "termino-ficha";
  ficha.setAttribute("role", "dialog");
  ficha.hidden = true;
  document.body.appendChild(ficha);
  let abierto = null;
  const cerrar = () => {
    if (!abierto) return;
    abierto.setAttribute("aria-expanded", "false");
    ficha.hidden = true;
    abierto = null;
  };
  const abrir = (b, t) => {
    if (abierto === b) return cerrar();
    cerrar();
    ficha.textContent = "";
    const titulo = document.createElement("p");
    titulo.className = "termino-titulo";
    titulo.id = "termino-ficha-titulo";
    titulo.textContent = b.textContent;
    const def = document.createElement("p");
    def.textContent = t.def;
    ficha.append(titulo, def);
    if (t.glosario) {
      const p = document.createElement("p");
      const a = document.createElement("a");
      a.href = `glosario.html#${t.glosario}`;
      a.textContent = "Más en el glosario";
      p.appendChild(a);
      ficha.appendChild(p);
    }
    ficha.setAttribute("aria-labelledby", titulo.id);
    ficha.hidden = false;
    const r = b.getBoundingClientRect();
    const ancho = Math.min(352, document.documentElement.clientWidth - 32);
    ficha.style.width = `${ancho}px`;
    ficha.style.left = `${Math.max(16, Math.min(r.left + scrollX, scrollX + document.documentElement.clientWidth - ancho - 16))}px`;
    ficha.style.top = `${r.bottom + scrollY + 6}px`;
    b.setAttribute("aria-expanded", "true");
    abierto = b;
  };
  document.addEventListener("click", (ev) => {
    if (abierto && !ficha.contains(ev.target) && ev.target !== abierto) cerrar();
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && abierto) { const b = abierto; cerrar(); b.focus(); }
  });

  function marcar() {
    // Lo que una página vuelve a pintar pierde su marca: cuenta como marcado solo lo que sigue en la página.
    marcados.clear();
    for (const b of main.querySelectorAll("button.termino")) marcados.add(b.dataset.termino);
    const recorrido = document.createTreeWalker(main, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.nodeValue.trim() && !n.parentElement.closest(NO_MARCAR) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    const nodos = [];
    while (recorrido.nextNode()) nodos.push(recorrido.currentNode);
    for (let nodo of nodos) {
      patron.lastIndex = 0;
      let m;
      while ((m = patron.exec(nodo.nodeValue))) {
        const t = porForma.get(m[1].toLowerCase());
        if (marcados.has(t.id)) continue;
        marcados.add(t.id);
        const resto = nodo.splitText(m.index);
        nodo = resto.splitText(m[1].length);
        const b = document.createElement("button");
        b.type = "button";
        b.className = "termino";
        b.dataset.termino = t.id;
        b.textContent = resto.nodeValue;
        b.setAttribute("aria-expanded", "false");
        b.setAttribute("aria-controls", "termino-ficha");
        b.addEventListener("click", (ev) => { ev.stopPropagation(); abrir(b, t); });
        resto.replaceWith(b);
        patron.lastIndex = 0;
      }
    }
  }
  marcar();
  let espera = null;
  new MutationObserver((cambios) => {
    if (cambios.every((c) => [...c.addedNodes].every((n) => n.nodeType === 1 && n.classList?.contains("termino")) || c.target === ficha)) return;
    clearTimeout(espera);
    espera = setTimeout(marcar, 300);
  }).observe(main, { childList: true, subtree: true, characterData: true });
}
document.addEventListener("DOMContentLoaded", montarTerminos);

// ---- Escala de persona (desde el 21/10/2026) ----
// Pasa una cifra a euros por habitante, con la población media del año (datos/escala.json, de Eurostat). Es una
// lectura: aritmética sobre datos publicados. Devuelve null si falta el año.
let escala = null;
async function porHabitante({ millones, pctPib, año }) {
  escala ??= fetch("datos/escala.json").then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const e = await escala;
  const i = e ? e.años.indexOf(año) : -1;
  if (i < 0) return null;
  const euros = millones !== undefined ? millones : (pctPib / 100) * e.pib_meur[i];
  const anual = (euros * 1e6) / e.poblacion[i];
  return { anual, mensual: anual / 12 };
}
// «unos 15.500 € por habitante»: a la centena desde mil euros y a la decena por debajo, para que cifras cercanas
// (ingresos y gastos de un mismo año) no salgan iguales y su diferencia cuadre a la vista.
function redondeoHablado(v) {
  const paso = Math.abs(v) >= 1000 ? 100 : Math.abs(v) >= 100 ? 10 : 1;
  return Math.round(v / paso) * paso;
}
const lista = (p) => (p.length > 1 ? `${p.slice(0, -1).join(", ")} y ${p.at(-1)}` : p[0]);
const eurosHablados = (v) => `unos ${numero(redondeoHablado(v), 0)} €`;
function textoPorHabitante(h) {
  if (!h) return "";
  return `unos ${numero(redondeoHablado(h.anual), 0)} € por habitante al año (unos ${numero(redondeoHablado(h.mensual), 0)} € al mes)`;
}

// ---- Controles plegados (desde el 21/10/2026) ----
// El periodo y las capas de contexto ocupaban la primera pantalla del móvil antes de llegar al dato. Van en un
// desplegable con un rótulo que dice qué hay dentro: cerrado en pantallas estrechas y abierto en las anchas.
function plegarControles() {
  const ancho = matchMedia("(min-width: 900px)").matches;
  const PLEGABLES = [["periodo", "Cambiar el periodo de los gráficos"], ["capas", "Añadir contexto: Gobiernos, legislaturas y crisis"]];
  for (const [id, rotulo] of PLEGABLES) {
    const el = document.getElementById(id);
    if (!el || el.closest("details")) continue;
    const d = document.createElement("details");
    d.className = "plegable-controles";
    d.open = ancho && id === "periodo";  // el contexto (Gobiernos, crisis) se añade a propósito
    const s = document.createElement("summary");
    s.textContent = rotulo;
    el.before(d);
    d.append(s, el);
    // Su nota y su ayuda, si van justo detrás, entran con él.
    // Su nota, si va justo detrás, entra con él; la ayuda de cómo leer los gráficos se queda a la vista.
    for (let sig = d.nextElementSibling; sig && sig.id === "nota-capas"; sig = d.nextElementSibling) d.appendChild(sig);
  }
}
document.addEventListener("DOMContentLoaded", plegarControles);

// ---- Nombres llanos de las funciones de gasto (COFOG) ----
// El nombre oficial dice poco a quien no lo conoce («protección social», «asuntos económicos»): en las frases se usa
// lo que hay dentro, con el nombre oficial entre paréntesis la primera vez.
const NOMBRE_LLANO = {
  GF01: "funcionamiento de las administraciones e intereses (servicios generales)",
  GF02: "defensa",
  GF03: "policía, justicia y prisiones (orden público y seguridad)",
  GF04: "transporte, energía, agricultura y ayudas a empresas (asuntos económicos)",
  GF05: "medio ambiente",
  GF06: "vivienda y servicios de los pueblos y ciudades",
  GF07: "sanidad",
  GF08: "deporte, cultura y religión (ocio, cultura y religión)",
  GF09: "educación",
  GF10: "pensiones, paro y otras ayudas (protección social)",
};
const nombreLlano = (codigo, nombre) => NOMBRE_LLANO[codigo] || nombre.toLowerCase();

// Tablas en el móvil: cada celda lleva el nombre de su columna (data-etiqueta) para poder pintarse como ficha, y si una
// tabla ancha no cabe, se avisa de que se puede deslizar.
function prepararTablas(raiz = document) {
  for (const tabla of raiz.querySelectorAll(".tabla table, table.tabla-fichas")) {
    const cab = [...tabla.querySelectorAll("thead th")].map((th) => th.textContent.trim());
    if (cab.length) for (const tr of tabla.querySelectorAll("tbody tr")) [...tr.children].forEach((td, k) => { if (cab[k]) td.dataset.etiqueta = cab[k]; });
    const caja = tabla.closest(".tabla");
    if (!caja) continue;
    const sobra = caja.scrollWidth > caja.clientWidth + 4 && !tabla.classList.contains("tabla-fichas");
    let aviso = caja.previousElementSibling?.classList.contains("desliza") ? caja.previousElementSibling : null;
    if (sobra && !aviso) {
      aviso = document.createElement("p");
      aviso.className = "desliza";
      aviso.textContent = "La tabla sigue a la derecha: se puede deslizar →";
      caja.before(aviso);
    } else if (!sobra && aviso) aviso.remove();
  }
}
// Si no llegan los datos, que se diga en vez de dejar la página a medias.
function avisoSinDatos() {
  if (document.querySelector(".aviso-error")) return;
  const p = document.createElement("p");
  p.className = "aviso-error";
  p.setAttribute("role", "alert");
  p.textContent = "No se han podido cargar los datos de esta página. Al recargarla suele resolverse; si no, los datos están en revisión.";
  document.querySelector("main")?.prepend(p);
}
window.addEventListener("unhandledrejection", avisoSinDatos);
document.addEventListener("DOMContentLoaded", () => {
  setTimeout(prepararTablas, 1500);
  new ResizeObserver(() => prepararTablas()).observe(document.body);
});

// Pie: cuándo se revisaron las fuentes por última vez y cuál fue el último dato nuevo; en metodología, la tabla de
// fechas de cada fuente. Lo escribe la construcción diaria (datos/actualidad.json) y el servidor (datos/estado.json).
function fechaHora(iso) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })} a las ${d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`;
}
async function pintarActualidad() {
  const pie = document.getElementById("pie-actualidad");
  const tabla = document.getElementById("tabla-fechas");
  if (!pie && !tabla) return;
  const leer = (u) => fetch(u, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [estado, act] = await Promise.all([leer("datos/estado.json"), leer("datos/actualidad.json")]);
  if (pie && (estado?.revisado || act?.ultimo_cambio)) {
    pie.textContent = "";
    if (estado?.revisado) pie.append(`Fuentes revisadas por última vez el ${fechaHora(estado.revisado)}. `);
    const u = act?.ultimo_cambio;
    if (u?.cambio) pie.append(`Último dato nuevo: ${u.fuente}, «${u.nombre}», llegado el ${fecha(u.cambio)}.`);
  }
  if (tabla && act?.fuentes) {
    const cuerpo = tabla.querySelector("tbody");
    cuerpo.textContent = "";
    for (const f of act.fuentes) {
      const tr = cuerpo.insertRow();
      const a = tr.insertCell();
      a.textContent = f.fuente;
      const b = tr.insertCell();
      if (f.url) { const l = document.createElement("a"); l.href = f.url; l.textContent = f.nombre; b.appendChild(l); } else b.textContent = f.nombre;
      tr.insertCell().textContent = f.cambio ? fecha(f.cambio) : "—";
      tr.insertCell().textContent = f.descargado ? fecha(f.descargado) : "—";
    }
    prepararTablas(tabla.parentElement);
  }
}
document.addEventListener("DOMContentLoaded", pintarActualidad);

// Anchos de barras escritos en el HTML (la CSP no deja usar style="…" en el HTML; desde JavaScript, sí)
document.addEventListener("DOMContentLoaded", () => {
  for (const e of document.querySelectorAll("[data-ancho]")) e.style.width = `${e.dataset.ancho}%`;
});
