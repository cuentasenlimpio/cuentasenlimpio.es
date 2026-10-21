// Cuentas en limpio: «¿Qué hacen las cuentas sobre la desigualdad?». Usa comun.js y ec.js.
"use strict";

const estado = { aapp: null };
const encuesta = (a) => `encuesta ${a} (renta de ${a - 1})`;
const TRIM = ["marzo", "junio", "septiembre", "diciembre"];
const nombreTrim = (t) => `${TRIM[Number(t.slice(5)) - 1]} de ${t.slice(0, 4)}`;

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
    { connectNulls: false, lineStyle: { color: s.color, width: s.ancho ?? 2, type: s.discontinua ? [5, 4] : "solid" } }));
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
  lineaFuente(document.getElementById(`${id}-fuente`), { fuentes: estado.aapp.fuentes, tablas, tipo, nota });

function pon(id, partes) {
  const p = document.getElementById(id);
  p.textContent = "";
  for (const t of partes) {
    if (Array.isArray(t)) {
      const b = document.createElement("strong");
      b.textContent = t[0];
      p.appendChild(b);
    } else p.append(t);
  }
}

function pintar(d) {
  const c1 = EC.css("--serie-gastos"), c2 = EC.css("--serie-ingresos"), c3 = EC.css("--tinta"), suave = EC.css("--linea-fuerte");
  const serie = (b, clave, nombre, color, extra = {}) => ({ nombre, x: b.años, v: b[clave], etiquetas: b.años.map(encuesta), color, ...extra });
  const ult = (b, k = "es") => b[k].at(-1);
  const pct = (dec) => (v) => `${numero(v, dec)} %`;
  const n1 = (v) => numero(v, 1);

  // 1. Desigualdad de renta
  const g = d.gini, a = g.años.at(-1);
  pon("respuesta", [`El índice de Gini mide la desigualdad de la renta: 0 si todos tuvieran lo mismo y 100 si una sola persona lo tuviera todo. En la ${encuesta(a)}, el de España era `, [n1(ult(g))], ` (media de la UE: ${n1(ult(g, "ue"))}), y el 20 % de la población con más renta tenía `,
    [`${numero(ult(d.s80s20), 2)} veces`], " la del 20 % con menos. Sin pensiones ni prestaciones, el Gini sería ",
    [n1(ult(d.gini_sin_transferencias))], "."]);
  linea("g-gini", [serie(g, "es", "España", c1, { ancho: 2.5 }), serie(g, "ue", "UE", suave)], { formato: n1, eje: "índice (0-100)" });
  fuente("g-gini", [["ilc_di12", "Gini de la renta disponible"], ["ine_ecv7186", "Gini (INE, 2008-2013)"]], "dato",
    "Eurostat solo lo da desde 2014; antes, el del INE, que coincide en todos los años comunes.");
  linea("g-s80", [serie(d.s80s20, "es", "España", c1, { ancho: 2.5 }), serie(d.s80s20, "ue", "UE", suave)], { formato: (v) => numero(v, 2), eje: "veces" });
  fuente("g-s80", [["ilc_di11", "ratio S80/S20"]], "dato", "Renta disponible equivalente.");

  // 2. Escalones
  const r = d.reduccion_pobreza;
  pon("r-transf", [`Las pensiones bajan el Gini de ${n1(ult(d.gini_sin_transferencias))} a ${n1(ult(d.gini_solo_pensiones))}, y el resto de prestaciones, a ${n1(ult(g))}. `,
    `Las prestaciones distintas de las pensiones hacen que haya menos personas en riesgo de pobreza: de ${n1(ult(d.pobreza_solo_pensiones))} de cada 100 a `, [`${n1(ult(d.pobreza))} de cada 100`],
    `, en la ${encuesta(r.año)}.`]);
  linea("g-escalones", [
    serie(d.gini_sin_transferencias, "es", "sin ninguna transferencia", suave),
    serie(d.gini_solo_pensiones, "es", "con pensiones, sin el resto", c2),
    serie(g, "es", "con todas (renta disponible)", c1, { ancho: 2.5 }),
  ], { formato: n1, eje: "índice (0-100)" });
  fuente("g-escalones", [["ilc_di12b", "Gini sin transferencias"], ["ilc_di12c", "Gini con pensiones como renta"], ["ilc_di12", "Gini de la renta disponible"]], "dato",
    "En las tres, la renta ya es después de impuestos: solo cambian las transferencias.");
  linea("g-pob-esc", [
    serie(d.pobreza_sin_transferencias, "es", "sin ninguna transferencia", suave),
    serie(d.pobreza_solo_pensiones, "es", "con pensiones, sin el resto", c2),
    serie(d.pobreza, "es", "con todas", c1, { ancho: 2.5 }),
  ], { formato: pct(1), eje: "% de la población", min: 0 });
  fuente("g-pob-esc", [["ilc_li09", "pobreza sin transferencias"], ["ilc_li10", "pobreza con pensiones como renta"], ["ilc_li02", "riesgo de pobreza"]], "dato",
    "Umbral: 60 % de la mediana de la renta disponible equivalente, el mismo en los tres casos.");
  const o = d.ocde;
  if (o) {
    const et = o.años_renta.map((x) => `renta de ${x}`);
    linea("g-ocde", [
      { nombre: "renta de mercado", x: o.años_renta, v: o.mercado, etiquetas: et, color: suave },
      { nombre: "bruta (con transferencias)", x: o.años_renta, v: o.bruta, etiquetas: et, color: c2 },
      { nombre: "disponible (después de impuestos y cotizaciones)", x: o.años_renta, v: o.disponible, etiquetas: et, color: c1, ancho: 2.5 },
    ], { formato: (v) => numero(v, 3), eje: "índice (0-1)" });
    fuente("g-ocde", [["ocde_idd", "Income Distribution Database"]], "dato",
      "Escala de equivalencia de la OCDE (raíz cuadrada del tamaño del hogar). El orden importa: primero se suman las transferencias y después se restan los impuestos.");
  }

  // 3. Pobreza y carencias
  pon("r-pobreza", [`En la ${encuesta(a)}, el `, [`${n1(ult(d.pobreza))} %`], ` de la población estaba en riesgo de pobreza (UE: ${n1(ult(d.pobreza, "ue"))} %). `,
    `Es tener una renta por debajo de ${numero(ult(d.umbral), 0)} € al año si se vive solo, o de ${numero(Math.round(ult(d.umbral) * 2.1), 0)} € para dos adultos con dos hijos menores de 14 (el umbral se multiplica por 2,1: el primer adulto cuenta 1, el segundo 0,5 y cada niño 0,3). El ${n1(ult(d.carencia))} % sufría carencia material y social severa, y el ${n1(ult(d.arope))} % cumplía al menos uno de los tres criterios de pobreza o exclusión (AROPE).`]);
  linea("g-pob", [
    serie(d.pobreza, "es", "riesgo de pobreza", c1, { ancho: 2.5 }),
    serie(d.arope, "es", "pobreza o exclusión (AROPE)", c3),
    serie(d.carencia, "es", "carencia material y social severa", c2),
  ], { formato: pct(1), eje: "% de la población", min: 0 });
  fuente("g-pob", [["ilc_li02", "riesgo de pobreza"], ["ilc_peps01n", "AROPE"], ["ilc_mdsd11", "carencia material y social severa"], ["ilc_li01", "umbral"]], "dato",
    "AROPE y carencia, con la definición europea para 2030, desde 2015.");

  // 4. Riqueza
  const q = d.riqueza;
  if (q) {
    const xs = q.trimestres.map((t) => Number(t.slice(0, 4)) + (Number(t.slice(5)) - 1) / 4), et = q.trimestres.map(nombreTrim);
    pon("r-riqueza", [`A ${nombreTrim(q.trimestres.at(-1))}, el 10 % de los hogares con más riqueza tenía el `, [`${n1(q.top10.at(-1))} %`],
      ` de toda la riqueza neta, y el 50 % con menos, el ${n1(q.bottom50.at(-1))} %. El Gini de la riqueza (${n1(q.gini.at(-1))}) es mucho mayor que el de la renta, aunque las dos cifras salen de fuentes y métodos distintos.`]);
    linea("g-riq", [
      { nombre: "el 10 % con más riqueza", x: xs, v: q.top10, etiquetas: et, color: c1, ancho: 2.5 },
      { nombre: "el 50 % con menos riqueza", x: xs, v: q.bottom50, etiquetas: et, color: c2 },
    ], { formato: pct(1), eje: "% de la riqueza neta", min: 0 });
    fuente("g-riq", [["bce_dwa_top10", "cuentas distributivas de la riqueza"], ["bce_dwa_bottom50", "cuentas distributivas de la riqueza"], ["bce_dwa_gini", "Gini de la riqueza"]],
      "dato", "Estadística experimental: combina las cuentas nacionales con la Encuesta Financiera de las Familias del Banco de España.");
  }
}

async function arrancar() {
  const [d, aapp] = await Promise.all([fetch("datos/desigualdad.json").then((r) => r.json()), fetch("datos/aapp.json").then((r) => r.json())]);
  estado.aapp = aapp;
  pintar(d);
  pintarComprobaciones(document.getElementById("comprobaciones"), d.comprobaciones);
  montarInfo();
}

arrancar();

// El gráfico de la OCDE va plegado: al abrirlo, los gráficos recalculan su tamaño.
document.getElementById("ocde-plegable")?.addEventListener("toggle", () => window.dispatchEvent(new Event("resize")));
