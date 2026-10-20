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
  corrientes: (v) => `${numero(v, 1)} mil M€`,
  constantes: (v) => `${numero(v, 1)} mil M€`,
  habitante: (v) => `${numero(Math.round(v), 0)} €`,
};


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
    p.appendChild(document.createTextNode(` (${f.fuente === "Eurostat" ? `tabla ${f.dataset}, ` : ""}${cuando}`));
    if (f.copia) {
      p.appendChild(document.createTextNode(", "));
      const c = document.createElement("a");
      c.href = f.copia;
      c.textContent = "fichero descargado";
      p.appendChild(c);
    }
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

// ---- Botones (i): qué implica un valor, con su fuente ----
// En el HTML: <button type="button" class="info" data-info="clave">i</button> dentro de un título. El texto sale de
// datos/explicaciones.json (cada entrada: titulo, texto[], decalaje, fuentes[{texto, url}]). Sin entrada, el botón se quita.
async function montarInfo() {
  const botones = document.querySelectorAll("button.info[data-info]");
  if (!botones.length) return;
  const ex = await fetch("datos/explicaciones.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  botones.forEach((b, k) => {
    const e = ex[b.dataset.info];
    if (!e) return b.remove();
    const panel = document.createElement("aside");
    panel.className = "info-panel";
    panel.id = `info-${b.dataset.info}-${k}`;
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
      panel.appendChild(p);
    }
    b.setAttribute("aria-label", `Qué implica: ${e.titulo || b.dataset.info}`);
    b.setAttribute("aria-expanded", "false");
    b.setAttribute("aria-controls", panel.id);
    b.closest("h1, h2, h3, h4, p, label").after(panel);
    b.addEventListener("click", () => {
      const abierto = b.getAttribute("aria-expanded") === "true";
      b.setAttribute("aria-expanded", String(!abierto));
      panel.hidden = abierto;
    });
  });
}
document.addEventListener("DOMContentLoaded", montarInfo);
