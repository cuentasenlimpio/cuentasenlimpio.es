// Cuentas en limpio: cifras de las páginas de lectura fácil. Salen de los mismos datos que el resto de la web.
"use strict";

// Cantidades redondeadas para leer: millones de euros a miles de millones, euros a centenas.
const millonesFacil = (m) => {
  const v = Math.round(m / 1000) * 1000;
  return `unos ${v.toLocaleString("es-ES")} millones de euros`;
};
const eurosFacil = (e) => `unos ${(Math.round(e / 100) * 100).toLocaleString("es-ES")} euros`;

// De cada 100 € en números enteros que suman 100 (se reparte el redondeo entre los restos más grandes).
function enteros100(filas) {
  const total = filas.reduce((s, f) => s + f.v, 0);
  const base = filas.map((f) => ({ ...f, n: Math.floor((100 * f.v) / total), resto: ((100 * f.v) / total) % 1 }));
  let falta = 100 - base.reduce((s, f) => s + f.n, 0);
  for (const f of [...base].sort((a, b) => b.resto - a.resto)) if (falta-- > 0) f.n++;
  return base.filter((f) => f.n > 0).sort((a, b) => b.n - a.n);
}

function pintarLista(id, verbo, filas) {
  const ul = document.getElementById(id);
  if (!ul) return;
  for (const f of enteros100(filas)) {
    const li = document.createElement("li");
    const n = document.createElement("strong");
    n.textContent = f.n === 1 ? "1 euro" : `${f.n} euros`;
    const barra = document.createElement("span");
    barra.className = "barra-facil";
    barra.setAttribute("aria-hidden", "true");
    barra.style.width = `${f.n}%`;
    li.append(n, ` ${f.n === 1 ? verbo[0] : verbo[1]} ${f.texto}.`, barra);
    ul.appendChild(li);
  }
}

// Cómo se lee en voz alta un número de millones redondeado a miles: 726.000 → «setecientos veintiséis mil millones».
const LETRAS_UNIDADES = ["", "un", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce", "trece", "catorce", "quince",
  "dieciséis", "diecisiete", "dieciocho", "diecinueve", "veinte", "veintiún", "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis",
  "veintisiete", "veintiocho", "veintinueve"];
const LETRAS_DECENAS = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
const LETRAS_CENTENAS = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];
function hasta999(n) {
  if (n === 100) return "cien";
  const c = Math.floor(n / 100), r = n % 100;
  const resto = r < 30 ? LETRAS_UNIDADES[r] : LETRAS_DECENAS[Math.floor(r / 10)] + (r % 10 ? ` y ${LETRAS_UNIDADES[r % 10]}` : "");
  return [LETRAS_CENTENAS[c], resto].filter(Boolean).join(" ");
}
function millonesEnLetras(m) {
  const v = Math.round(m / 1000) * 1000;
  if (v >= 1e6) {
    const billones = Math.floor(v / 1e6), resto = (v % 1e6) / 1000;
    const b = billones === 1 ? "un billón" : `${hasta999(billones)} billones`;
    return resto ? `${b} ${resto === 1 ? "mil" : `${hasta999(resto)} mil`} millones de euros` : `${b} de euros`;
  }
  const miles = v / 1000;
  return `${miles === 1 ? "mil" : `${hasta999(miles)} mil`} millones de euros`;
}

// «2 veces», «más de 2 veces», «casi 3 veces»: la relación entre dos cantidades, en palabras.
function numVeces(x) {
  const n = Math.round(x), d = x - Math.floor(x);
  if (Math.abs(x - n) < 0.1) return `${n} veces`;
  return d < 0.5 ? `más de ${Math.floor(x)} veces` : `casi ${Math.ceil(x)} veces`;
}
// Cuántos países de la Unión Europea deben más que España, en relación con lo que produce cada uno (último año).
function deudaUE(a) {
  const x = a.ue.indicadores.deuda, es = x.ES?.at(-1);
  const paises = Object.keys(a.ue.paises).filter((p) => p !== "EU27_2020" && p !== "ES" && x[p]?.at(-1) != null);
  if (es == null || !paises.length) return "";
  const mas = paises.filter((p) => x[p].at(-1) > es).length;
  const total = paises.length + 1;
  return `Si se tiene en cuenta lo que produce cada país, solo ${mas} de los ${total} países de la Unión Europea deben más que España.`;
}
function saldoUE(a) {
  const x = a.ue.indicadores.saldo;
  const paises = Object.keys(a.ue.paises).filter((p) => p !== "EU27_2020" && x[p]?.at(-1) != null);
  if (!paises.length) return "";
  const r = paises.filter((p) => x[p].at(-1) < 0).length / paises.length;
  const cuantos = r >= 0.75 ? "casi todos los" : r > 0.5 ? "más de la mitad de los" : "algunos";
  return `En ${a.años.at(-1)}, también faltó dinero en ${cuantos} países de la Unión Europea.`;
}

async function arrancarFacil() {
  const huecos = document.querySelectorAll("[data-f]");
  const listas = document.querySelector(".lista-facil");
  if (!huecos.length && !listas) return;
  let a, e, g, ing;
  try {
    [a, e, g, ing] = await Promise.all(["aapp", "escala", "gasto", "ingresos"].map((n) => fetch(`datos/${n}.json`).then((r) => r.json())));
  } catch {
    for (const h of huecos) h.textContent = "(no se ha podido cargar el dato)";
    return;
  }
  const i = a.años.length - 1, año = a.años[i];
  const s = a.series;
  const hab = (k) => s[k].habitante[i];
  const k = e.años.indexOf(año);
  const intereses = (a.cambio_deuda.pib.intereses[i] * e.pib_meur[k]) / 100;
  const saldo = s.saldo.corrientes[i];
  const deficits = s.saldo.corrientes.filter((x) => x < 0).length;
  const ultSuperavit = a.años.filter((_, j) => s.saldo.corrientes[j] >= 0).at(-1);
  const añoGasto = g.años.at(-1);
  const D = {
    año,
    ingresos_total: millonesFacil(s.ingresos.corrientes[i]), ingresos_persona: eurosFacil(hab("ingresos")),
    gastos_total: millonesFacil(s.gastos.corrientes[i]), gastos_persona: eurosFacil(hab("gastos")),
    año_gasto: añoGasto,
    aviso_año_gasto: añoGasto < año ? `Esta lista es de ${añoGasto}, porque estos datos llegan un año más tarde.` : "",
    saldo_1: saldo < 0 ? `En ${año}, las administraciones gastaron más dinero del que les entró.` : `En ${año}, a las administraciones les entró más dinero del que gastaron.`,
    saldo_2: saldo < 0 ? `Faltaron ${millonesFacil(-saldo)}.` : `Sobraron ${millonesFacil(saldo)}.`,
    saldo_3: `Por persona, son ${eurosFacil(Math.abs(hab("saldo")))}.`,
    historia_1: `En los últimos ${a.años.length} años, faltó dinero ${deficits} veces.`,
    historia_2: ultSuperavit ? `El último año en que sobró dinero fue ${ultSuperavit}.` : "",
    deuda_total: millonesFacil(s.deuda.corrientes[i]), deuda_persona: eurosFacil(hab("deuda")),
    intereses_total: millonesFacil(intereses), intereses_persona: eurosFacil((intereses * 1e6) / e.poblacion[k]),
    intereses_y_deficit: Math.abs(intereses + saldo) < 0.1 * intereses && saldo < 0 ? `Es casi lo mismo que el dinero que faltó en ${año}.` : "",
    deuda_veces: `La deuda es ${numVeces(s.deuda.corrientes[i] / s.ingresos.corrientes[i])} todo el dinero que entra en un año.`,
    deuda_europa: deudaUE(a),
    europa_saldo: saldoUE(a),
    ingresos_letras: `Se lee así: ${millonesEnLetras(s.ingresos.corrientes[i])}.`,
    deuda_letras: `Se lee así: ${millonesEnLetras(s.deuda.corrientes[i])}.`,
  };
  for (const h of huecos) {
    const v = D[h.dataset.f];
    h.textContent = v ?? "";
    if (v === "" && h.parentElement.textContent.trim() === "") h.parentElement.remove();
  }

  const ri = ing.reparto.at(-1);
  pintarLista("lista-ingresos", ["es", "son"], [
    { v: ri.cotizaciones, texto: "cotizaciones a la Seguridad Social" },
    { v: ri.renta, texto: "impuestos sobre lo que ganan las personas" },
    { v: ri.iva, texto: "IVA" },
    { v: ri.sociedades, texto: "impuestos sobre lo que ganan las empresas" },
    { v: ri.productos, texto: "otros impuestos que van en el precio de algunas cosas, como la gasolina o el tabaco" },
    { v: ri.produccion + ri.otros_corrientes + ri.capital, texto: "otros impuestos, por ejemplo sobre las herencias" },
    { v: ri.otros_ingresos, texto: "otros ingresos, por ejemplo dinero de la Unión Europea" },
  ]);
  const rg = g.reparto.at(-1);
  pintarLista("lista-gastos", ["es para", "son para"], [
    { v: rg.GF10, texto: "pensiones, ayudas a personas sin trabajo y otras ayudas" },
    { v: rg.GF07, texto: "hospitales y centros de salud" },
    { v: rg.GF04, texto: "carreteras, trenes y ayudas a empresas y al campo" },
    { v: rg.GF09, texto: "colegios, institutos y universidades" },
    { v: rg.GF01, texto: "el funcionamiento de las oficinas públicas: sueldos, edificios y otros gastos" },
    { v: rg.intereses, texto: "pagar los intereses de lo que se debe" },
    { v: rg.GF03, texto: "policía, jueces y cárceles" },
    { v: rg.GF08, texto: "deporte y cultura" },
    { v: rg.GF05, texto: "cuidar el medio ambiente" },
    { v: rg.GF02, texto: "el ejército" },
    { v: rg.GF06, texto: "viviendas, agua y farolas de las calles" },
  ]);
}
document.addEventListener("DOMContentLoaded", arrancarFacil);
