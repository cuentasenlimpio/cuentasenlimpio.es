// Cuentas en limpio: «¿Cómo están las cuentas de cada comunidad?». Usa comun.js y ec.js.
"use strict";

const TRIM = ["marzo", "junio", "septiembre", "diciembre"];
const xTrim = (t) => Number(t.slice(0, 4)) + (Number(t.slice(5)) - 1) / 4;
const nombreTrim = (t) => `${TRIM[Number(t.slice(5)) - 1]} de ${t.slice(0, 4)}`;
const estado = { t: null, aapp: null, sel: null };

function linea(id, series, { formato, eje, min = null, alto = 280 }) {
  const caja = document.getElementById(id);
  const xs = series.flatMap((s) => s.x);
  const xmin = Math.floor(Math.min(...xs)), xmax = Math.ceil(Math.max(...xs) + 1e-9);
  if (!caja.cuentasGrafico) caja.cuentasGrafico = EC.crear(caja, alto);
  const g = caja.cuentasGrafico;
  const op = EC.tiempo({ min: xmin, max: xmax, marcasArriba: false, aria: caja.getAttribute("aria-label") });
  op.grid.top = 28;
  op.yAxis = EC.ejeY({ nombre: eje, formato: (v) => formato(v, true), min: min ?? undefined });
  op.yAxis.scale = min === null;
  op.series = series.map((s, k) => EC.linea(`s${k}`, s.x.map((x, i) => [x, s.v[i]]), s.color,
    { connectNulls: false, lineStyle: { color: s.color, width: s.ancho ?? 2 } }));
  if (series.some((s) => s.cero)) {
    op.series.push({ type: "line", data: [], silent: true, markLine: { silent: true, symbol: "none", label: { show: false },
      lineStyle: { color: EC.css("--linea-fuerte"), type: "solid", width: 1 }, data: [{ yAxis: 0 }] } });
  }
  g.setOption(op, { notMerge: true });
  const leer = (pos) => {
    const c = document.getElementById(`${id}-lectura`);
    c.textContent = "";
    const ref = series[0];
    let i = 0;
    ref.x.forEach((x, k) => { if (Math.abs(x - pos) < Math.abs(ref.x[i] - pos)) i = k; });
    const a = document.createElement("strong");
    a.className = "lectura-anio";
    a.textContent = ref.etiquetas[i];
    c.appendChild(a);
    for (const s of series) {
      const j = s.x.indexOf(ref.x[i]);
      if (j < 0 || s.v[j] === null || s.v[j] === undefined) continue;
      const f = document.createElement("span");
      f.className = "lectura-fila";
      const b = document.createElement("b");
      b.textContent = formato(s.v[j]);
      f.append(b, ` ${s.nombre}`);
      c.appendChild(f);
    }
  };
  g.cuentasLeer = leer;
  if (!g.cuentasLectura) {
    g.cuentasLectura = true;
    EC.alPasar(g, (pos) => g.cuentasLeer(pos));
  }
  leer(xmax);
}

const fuente = (id, tablas, tipo, nota) =>
  lineaFuente(document.getElementById(id), { fuentes: estado.aapp.fuentes, tablas, tipo, nota });

function pintarFicha() {
  const { t } = estado;
  const c = t.ccaa.find((x) => x.id === estado.sel);
  const T = t.total;
  const c1 = EC.css("--serie-gastos"), c2 = EC.css("--linea-fuerte"), c3 = EC.css("--tinta");
  const pct = (d) => (v) => `${numero(v, d)} %`;
  document.getElementById("ficha-t").textContent = c.nombre;

  // Cifras clave
  const n = c.deficit.años.length - 1, q = c.deuda.trimestres.length - 1;
  const def = c.deficit.pib[n], deu = c.deuda.pib[q], meur = c.deuda.meur[q], est = c.deuda.estado_meur[q];
  const cifras = document.getElementById("cifras");
  cifras.textContent = "";
  const tarjeta = (nombre, valor, explica) => {
    const d = document.createElement("div");
    d.className = "tarjeta-cifra";
    const a = document.createElement("span"); a.className = "nombre"; a.textContent = nombre;
    const b = document.createElement("span"); b.className = "valor"; b.textContent = valor;
    const e = document.createElement("span"); e.className = "explica"; e.textContent = explica;
    d.append(a, b, e);
    cifras.appendChild(d);
  };
  tarjeta(def < 0 ? `Déficit ${c.deficit.años[n]}` : `Superávit ${c.deficit.años[n]}`, `${numero(Math.abs(def), 2)} %`,
    `de su PIB: ${numero(Math.abs(c.deficit.meur[n]), 0)} millones de euros. Provisional.`);
  const hab = c.poblacion ? (meur * 1e6) / c.poblacion.valor : null;
  tarjeta(`Deuda, ${nombreTrim(c.deuda.trimestres[q])}`, `${numero(deu, 1)} %`,
    `de su PIB: ${numero(meur, 0)} millones de euros${hab ? `, unos ${numero(Math.round(hab / 10) * 10, 0)} € por habitante` : ""}.`);
  tarjeta("Deuda con el Estado", est ? `${numero((100 * est) / meur, 0)} %` : "0 %",
    est ? `de su deuda (${numero(est, 0)} millones): préstamos de los mecanismos de financiación del Estado.` : "No ha usado los mecanismos de financiación del Estado, o ya no les debe.");
  if (c.financiacion) {
    const f = c.financiacion, k = f.años.length - 1, media = T.financiacion.por_hab_ajustado[T.financiacion.años.indexOf(f.años[k])];
    tarjeta(`Financiación ${f.años[k]}`, `${numero(Math.round(f.por_hab_ajustado[k]), 0)} €`,
      `por habitante ajustado, en financiación homogénea. Media del régimen común: ${numero(Math.round(media), 0)} €.`);
  } else {
    tarjeta("Financiación", "Régimen foral", "Recauda sus propios impuestos y paga al Estado un cupo o aportación: no entra en el sistema común.");
  }
  fuente("cifras-fuente", [[`igae_ccaa_${c.deficit.años[n]}`, "déficit por comunidad"], ["bde_be1310", "deuda en % del PIB"], ["bde_be1309", "deuda en euros"],
    ["bde_be1306", "préstamos del Estado"], ...(c.financiacion ? [[`hacienda_liquidacion_${c.financiacion.años.at(-1)}`, "liquidación del sistema"]] : [])],
    "dato", `Los euros por habitante son una lectura nuestra con la población del INE a ${c.poblacion ? fecha(c.poblacion.fecha) : "su último dato"}.`);

  // Déficit
  linea("g-def", [
    { nombre: c.nombre, x: c.deficit.años, v: c.deficit.pib, etiquetas: c.deficit.años.map(String), color: c1, ancho: 2.5, cero: true },
    { nombre: "conjunto de las comunidades", x: T.deficit.años, v: T.deficit.pib, etiquetas: T.deficit.años.map(String), color: c2, ancho: 1.5 },
  ], { formato: pct(2), eje: "% del PIB" });
  fuente("g-def-fuente", [[`igae_ccaa_${c.deficit.años[n]}`, "operaciones no financieras por comunidad"]], "dato",
    "Un fichero por año; el último, provisional. En contabilidad nacional, que es la que cuenta para las reglas.");

  // Deuda en % del PIB y con el Estado
  const xq = c.deuda.trimestres.map(xTrim), et = c.deuda.trimestres.map(nombreTrim);
  linea("g-deu", [
    { nombre: c.nombre, x: xq, v: c.deuda.pib, etiquetas: et, color: c1, ancho: 2.5 },
    { nombre: "conjunto de las comunidades", x: T.deuda.trimestres.map(xTrim), v: T.deuda.pib, etiquetas: T.deuda.trimestres.map(nombreTrim), color: c2, ancho: 1.5 },
  ], { formato: pct(1), eje: "% del PIB", min: 0 });
  fuente("g-deu-fuente", [["bde_be1310", "deuda según el Procedimiento de Déficit Excesivo, % del PIB regional"]], "dato");
  linea("g-est", [
    { nombre: "deuda total", x: xq, v: c.deuda.meur, etiquetas: et, color: c1, ancho: 2.5 },
    { nombre: "de ella, con el Estado", x: xq, v: c.deuda.estado_meur, etiquetas: et, color: c3 },
  ], { formato: (v) => `${numero(v, 0)} M€`, eje: "millones de €", min: 0 });
  fuente("g-est-fuente", [["bde_be1309", "deuda en miles de euros"], ["bde_be1306", "préstamos del fondo de financiación"]], "dato",
    "Los préstamos del Estado empiezan en 2012, con el primer mecanismo extraordinario de liquidez.");

  // Gasto por funciones
  if (c.gasto) {
    dibujarBarrasH(document.getElementById("g-gas"), c.gasto.divisiones.filter((d) => d.meur > 0)
      .map((d) => ({ nombre: d.nombre, valor: (100 * d.meur) / c.gasto.total })), { formato: (v) => numero(v, 1), sufijo: " €" });
    document.getElementById("g-gas-lectura").textContent = `${c.gasto.año}, provisional · ${numero(c.gasto.total, 0)} millones de euros en total`;
    fuente("g-gas-fuente", [[`igae_cofog_ccaa_${c.gasto.año}`, "gasto por funciones de cada comunidad"]], "lectura",
      "Cada función ÷ gasto total × 100. Sanidad y educación son competencias de las comunidades, por eso pesan tanto.");
  }

  // Financiación
  const fin = document.getElementById("g-fin").closest("section");
  fin.hidden = !c.financiacion;
  if (c.financiacion) {
    linea("g-fin", [
      { nombre: c.nombre, x: c.financiacion.años, v: c.financiacion.por_hab_ajustado, etiquetas: c.financiacion.años.map(String), color: c1, ancho: 2.5 },
      { nombre: "media del régimen común", x: T.financiacion.años, v: T.financiacion.por_hab_ajustado, etiquetas: T.financiacion.años.map(String), color: c2, ancho: 1.5 },
    ], { formato: (v) => `${numero(Math.round(v), 0)} €`, eje: "€", min: 0, alto: 240 });
    fuente("g-fin-fuente", [[`hacienda_liquidacion_${c.financiacion.años.at(-1)}`, "cuadros de la liquidación, cuadro 2.2.3"]], "dato",
      "Financiación homogénea (sin las competencias que solo tienen algunas comunidades) por habitante ajustado. Cada año se publica dos años después.");
  }
}

function pintarTodas() {
  const { t } = estado;
  const q = t.total.deuda.trimestres;
  const xq = q.map(xTrim);
  dibujarMultiples(document.getElementById("m-deu"),
    t.ccaa.map((c) => ({ nombre: c.nombre, valores: q.map((x) => c.deuda.pib[c.deuda.trimestres.indexOf(x)] ?? null) })),
    xq, xq.length - 1, { formato: (v) => `${numero(v, 1)} %`, unidadEje: "% del PIB de cada comunidad" });
  fuente("m-deu-fuente", [["bde_be1310", "deuda según el Procedimiento de Déficit Excesivo, % del PIB regional"]], "dato");
  const a = t.total.deficit.años;
  dibujarMultiples(document.getElementById("m-def"),
    t.ccaa.map((c) => ({ nombre: c.nombre, valores: a.map((x) => c.deficit.pib[c.deficit.años.indexOf(x)] ?? null) })),
    a, a.length - 1, { formato: (v) => `${numero(v, 2)} %`, unidadEje: "% del PIB de cada comunidad" });
  fuente("m-def-fuente", [[`igae_ccaa_${a.at(-1)}`, "operaciones no financieras por comunidad"]], "dato", "Un fichero de la IGAE por año.");
}

async function arrancar() {
  const [t, aapp] = await Promise.all([fetch("datos/territorio.json").then((r) => r.json()), fetch("datos/aapp.json").then((r) => r.json())]);
  Object.assign(estado, { t, aapp, sel: t.ccaa[0].id });
  const T = t.total, q = T.deuda.trimestres.length - 1, n = T.deficit.años.length - 1;
  const p = document.getElementById("respuesta");
  const est = T.deuda.estado_meur[q];
  p.textContent = `En ${T.deficit.años[n]} (provisional), el conjunto de las comunidades tuvo un ${T.deficit.meur[n] < 0 ? "déficit" : "superávit"} de ${numero(Math.abs(T.deficit.meur[n]), 0)} millones de euros. A final de ${nombreTrim(T.deuda.trimestres[q])} debían `;
  const b = document.createElement("strong");
  b.textContent = `${numero(T.deuda.meur[q], 0)} millones (el ${numero(T.deuda.pib[q], 1)} % del PIB)`;
  p.append(b, `, y ${numero(est, 0)} millones de esa deuda, el ${numero((100 * est) / T.deuda.meur[q], 0)} %, se la debían al propio Estado.`);
  const sel = document.getElementById("selector-ccaa");
  for (const c of t.ccaa) {
    const o = document.createElement("option");
    o.value = c.id;
    o.textContent = c.nombre;
    sel.appendChild(o);
  }
  sel.addEventListener("change", () => { estado.sel = sel.value; pintarFicha(); });
  pintarFicha();
  pintarTodas();
  pintarComprobaciones(document.getElementById("comprobaciones"), t.comprobaciones);
  montarInfo();
}

arrancar();
