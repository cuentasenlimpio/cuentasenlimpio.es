// Cuentas en limpio: «La economía detrás de las cuentas». Usa comun.js y ec.js.
"use strict";

const capas = { gobiernos: false, legislaturas: false, acontecimientos: false };
const MES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const TRIM = ["1.er", "2.º", "3.er", "4.º"];

// Periodo («AAAA-MM», «AAAATn» o año) → posición en el eje (el periodo empieza en su fracción del año) y texto.
function x(p) {
  const s = String(p);
  if (s.includes("-")) return Number(s.slice(0, 4)) + (Number(s.slice(5, 7)) - 1) / 12;
  if (s.includes("T")) return Number(s.slice(0, 4)) + (Number(s.slice(5)) - 1) / 4;
  return Number(s);
}
function nombrePeriodo(p) {
  const s = String(p);
  if (s.includes("-")) return `${MES[Number(s.slice(5, 7)) - 1]} de ${s.slice(0, 4)}`;
  if (s.includes("T")) return `${TRIM[Number(s.slice(5)) - 1]} trimestre de ${s.slice(0, 4)}`;
  return s;
}

// Gráfico de líneas en el tiempo. `series`: [{nombre, periodos, valores, color, ancho, discontinua}].
function lineas(id, series, { formato, eje = "", min = null, alto = 300 }) {
  const caja = document.getElementById(id);
  const todos = series.flatMap((s) => s.periodos.map(x));
  const xmin = Math.floor(Math.min(...todos)), xmax = Math.ceil(Math.max(...todos) + 1e-9);
  if (!caja.cuentasGrafico) caja.cuentasGrafico = EC.crear(caja, document.querySelector("main").clientWidth < 520 ? alto - 40 : alto);
  const g = caja.cuentasGrafico;
  const zoomAntes = g.getOption()?.dataZoom?.[0];
  const op = EC.tiempo({ min: xmin, max: xmax, marcasArriba: EC.algunaCapa(capas), aria: `${caja.getAttribute("aria-label")}.` });
  op.grid.top = EC.algunaCapa(capas) ? 84 : 28;
  op.yAxis = EC.ejeY({ nombre: eje, formato: (v) => formato(v, true), min: min ?? undefined });
  op.yAxis.scale = min === null;
  op.series = [
    EC.marcas(estado.d, { min: xmin, max: xmax, capas }),
    ...series.map((s, k) => EC.linea(`s${k}`, s.periodos.map((p, i) => [x(p), s.valores[i]]), s.color,
      { connectNulls: false, lineStyle: { color: s.color, width: s.ancho ?? 2, type: s.discontinua ? [5, 4] : "solid" } })),
  ];
  g.setOption(op, { notMerge: true });
  if (zoomAntes) g.dispatchAction({ type: "dataZoom", start: zoomAntes.start, end: zoomAntes.end });

  // Lectura del periodo más cercano al puntero (al entrar, el último).
  const leer = (pos) => {
    const c = document.getElementById(`${id}-lectura`);
    c.textContent = "";
    let mejor = null;
    for (const s of series) {
      s.periodos.forEach((p, i) => {
        if (s.valores[i] === null || s.valores[i] === undefined) return;
        const dx = Math.abs(x(p) - pos);
        if (!mejor || dx < mejor.dx - 1e-9) mejor = { dx, p };
      });
    }
    if (!mejor) return;
    const a = document.createElement("strong");
    a.className = "lectura-anio";
    a.textContent = nombrePeriodo(mejor.p);
    c.appendChild(a);
    for (const s of series) {
      const i = s.periodos.indexOf(mejor.p);
      if (i < 0 || s.valores[i] === null || s.valores[i] === undefined) continue;
      const f = document.createElement("span");
      f.className = "lectura-fila";
      const clave = document.createElement("span");
      clave.className = "clave-linea";
      clave.style.borderColor = s.color;
      const b = document.createElement("b");
      b.textContent = formato(s.valores[i]);
      f.append(clave, b, ` ${s.nombre}`);
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

const estado = { d: null };

function fuente(id, tablas, tipo, nota) {
  lineaFuente(document.getElementById(`${id}-fuente`), { fuentes: estado.d.fuentes, tablas, tipo, nota });
}

function pintar(e) {
  const c1 = EC.css("--serie-gastos"), c2 = EC.css("--serie-ingresos"), c3 = EC.css("--tinta"), suave = EC.css("--linea-fuerte");
  const pon = (id, partes) => {
    const p = document.getElementById(id);
    p.textContent = "";
    for (const t of partes) {
      if (Array.isArray(t)) {
        const b = document.createElement("strong");
        b.textContent = t[0];
        p.appendChild(b);
      } else p.append(t);
    }
  };
  const millones = (v, corto) => `${numero(v / 1e6, corto ? 0 : 2)}${corto ? "" : " millones"}`;
  const pct = (dec) => (v) => `${numero(v, dec)} %`;

  // 1. Empleo
  const a = e.afiliacion, epa = e.epa;
  if (a) {
    const n = a.meses.indexOf(a.ultimo);
    const t = epa.trimestres.length - 1;
    pon("r-empleo", [`En ${nombrePeriodo(a.ultimo)} había `, [`${numero(a.bruta[n], 0)} afiliados`],
      ` de media a la Seguridad Social (${numero(a.desest[n], 0)} sin el efecto de la época del año). Según la EPA, en el ${nombrePeriodo(epa.trimestres[t])} trabajaban `,
      [`${numero(epa.ocupados[t] / 1000, 2)} millones de personas`], ` y la tasa de paro era del `, [`${numero(epa.tasa_paro[t], 2)} %`],
      ...(e.paro_registrado ? [`. En los servicios públicos de empleo había ${numero(e.paro_registrado.total.at(-1), 0)} parados registrados en ${nombrePeriodo(e.paro_registrado.meses.at(-1))}: una cifra distinta, que mide otra cosa`] : []), "."]);
    lineas("g-afi", [
      { nombre: "afiliados sin estacionalidad (oficial)", periodos: a.meses, valores: a.desest, color: c1, ancho: 2.5 },
      { nombre: "afiliados tal cual", periodos: a.meses, valores: a.bruta, color: suave, ancho: 1.2 },
    ], { formato: millones, eje: "millones" });
    fuente("g-afi", [["ss_afiliados_medios", "afiliados medios"], ["ss_afiliados_desest_09", "desestacionalizados 2008-2020"], ["ss_afiliados_desest", "desestacionalizados desde 2021"]],
      "dato", "La desestacionalizada es la que publica la Seguridad Social (TRAMO-SEATS); no la calculamos nosotros.");
    const pr = e.paro_registrado;
    if (pr) {
      lineas("g-paro", [{ nombre: "parados registrados", periodos: pr.meses, valores: pr.total, color: c1 }], { formato: millones, eje: "millones", min: 0 });
      fuente("g-paro", [["sepe_paro_2001", "paro registrado 2001-2016"], ["sepe_paro", "últimos diez años"]], "dato",
        "Antes de mayo de 2005, datos reconstruidos por el SEPE. Sin ajuste de estacionalidad: el SEPE no publica una serie desestacionalizada.");
      dibujarBarrasH(document.getElementById("g-sector"), pr.por_sector, { formato: (v) => numero(v, 0) });
      document.getElementById("g-sector-lectura").textContent = nombrePeriodo(pr.ultimo);
      fuente("g-sector", [["sepe_paro", "paro registrado por sectores"]], "dato", "«Sin empleo anterior»: quien no había trabajado antes.");
    }
    lineas("g-epa", [
      { nombre: "tasa de actividad", periodos: epa.trimestres, valores: epa.tasa_actividad, color: c2 },
      { nombre: "tasa de empleo", periodos: epa.trimestres, valores: epa.tasa_empleo, color: c3 },
      { nombre: "tasa de paro", periodos: epa.trimestres, valores: epa.tasa_paro, color: c1, ancho: 2.5 },
    ], { formato: pct(2), eje: "%", min: 0 });
    fuente("g-epa", [["ine_epa423474", "tasa de paro"], ["ine_epa441060", "tasa de empleo"], ["ine_epa388079", "tasa de actividad"]], "dato",
      "Actividad y empleo, sobre la población de 16 y más años; paro, sobre los activos.");
    dibujarBarrasH(document.getElementById("g-reg"), a.por_regimen, { formato: (v) => numero(v, 0) });
    document.getElementById("g-reg-lectura").textContent = nombrePeriodo(a.ultimo);
    fuente("g-reg", [["ss_afiliados_medios", "afiliados medios por régimen"]], "dato",
      "Ojo: en la fuente, «régimen general» no incluye agrario ni empleo del hogar, que van aparte.");
    dibujarBarrasH(document.getElementById("g-edad"), a.por_edad, { formato: (v) => numero(v, 0), ordenar: false });
    document.getElementById("g-edad-lectura").textContent = nombrePeriodo(a.ultimo);
    fuente("g-edad", [["ss_afiliados_medios", "afiliados medios por edad"]], "dato");
    const cr = e.cruce_cotizaciones;
    if (cr) {
      lineas("g-cruce-afi", [{ nombre: "afiliados medios", periodos: cr.años, valores: cr.afiliados, color: c1 }], { formato: millones, eje: "millones", alto: 240 });
      fuente("g-cruce-afi", [["ss_afiliados_medios", "afiliados medios"]], "lectura", "Media de los doce meses de cada año.");
      lineas("g-cruce-cot", [{ nombre: `cotizaciones (miles de millones de € de ${cr.base_constantes})`, periodos: cr.años,
        valores: cr.cotizaciones_constantes.map((v) => v / 1000), color: c2 }], { formato: (v) => `${numero(v, 0)} mil M€`, eje: "mil M€", alto: 240 });
      fuente("g-cruce-cot", [["gov_10a_taxag", "cotizaciones sociales"], ["nama_10_gdp", "deflactor del PIB"]], "lectura",
        "Las cotizaciones dependen también de los salarios y de los tipos de cotización, no solo de cuántos afiliados hay.");
    }
  }

  // 2. Pensiones
  const pe = e.pensiones;
  if (pe) {
    const n = pe.meses.length - 1;
    pon("r-pensiones", [`El 1 de ${nombrePeriodo(pe.meses[n])} había `, [`${numero(pe.numero[n], 0)} pensiones contributivas`],
      `, con una pensión media de ${numero(pe.media[n], 2)} € al mes y una nómina mensual de `, [`${numero(pe.nomina[n] / 1e9, 1)} miles de millones de euros`],
      `. Por cada pensión había ${numero(pe.afiliados_por_pension_meses[n], 2)} afiliados.`]);
    const per = [...pe.años.map(String), ...pe.meses.filter((m) => Number(m.slice(0, 4)) > pe.años.at(-1))];
    const num = [...pe.numero_anual, ...pe.numero.filter((_, i) => Number(pe.meses[i].slice(0, 4)) > pe.años.at(-1))];
    const app = [...pe.afiliados_por_pension_años, ...pe.afiliados_por_pension_meses.filter((_, i) => Number(pe.meses[i].slice(0, 4)) > pe.años.at(-1))];
    lineas("g-pens", [{ nombre: "pensiones", periodos: per, valores: num, color: c1 }], { formato: millones, eje: "millones" });
    fuente("g-pens", [["ss_pensiones_avance", "evolución mensual de las pensiones"]], "dato", "Cada año, las pensiones en vigor el 1 de diciembre.");
    lineas("g-afipen", [{ nombre: "afiliados por pensión", periodos: per, valores: app, color: c3 }], { formato: (v) => numero(v, 2), eje: "afiliados" });
    fuente("g-afipen", [["ss_afiliados_medios", "afiliados medios"], ["ss_pensiones_avance", "pensiones en vigor"]], "lectura",
      "Dividiendo entre pensionistas (personas) en lugar de pensiones, la cifra sale mayor: hay quien cobra más de una.");
  }

  // 3. Precios
  const ipc = e.ipc;
  if (ipc) {
    const n = ipc.meses.length - 1;
    pon("r-ipc", [`En ${nombrePeriodo(ipc.meses[n])}, los precios eran un `, [`${numero(ipc.general[n], 1)} % más altos`],
      ` que un año antes. Sin los alimentos no elaborados ni los productos energéticos (la inflación subyacente), un ${numero(ipc.subyacente[n], 1)} %.`]);
    lineas("g-ipc", [
      { nombre: "general", periodos: ipc.meses, valores: ipc.general, color: c1, ancho: 2.5 },
      { nombre: "subyacente", periodos: ipc.meses, valores: ipc.subyacente, color: c2 },
    ], { formato: pct(1), eje: "%" });
    fuente("g-ipc", [["ine_ipc290750", "IPC general"], ["ine_ipc292510", "IPC subyacente"]], "dato");
  }

  // 4. Coste de la deuda
  const bo = e.bono, te = e.tesoro;
  if (bo && te) {
    const n = bo.meses.length - 1, m = te.meses.length - 1;
    pon("r-deuda", [`En ${nombrePeriodo(bo.meses[n])}, el bono del Estado a 10 años rendía en el mercado un `, [`${numero(bo.espana[n], 2)} %`],
      ` de media, ${numero(bo.prima_pb[n], 0)} puntos básicos más que el alemán (la prima de riesgo). Pero el tipo medio de toda la deuda viva del Estado era del `,
      [`${numero(te.total[m], 2)} %`], te.vida_media ? `, porque la deuda vence poco a poco: de media, en ${numero(te.vida_media.años, 2)} años.` : "."]);
    lineas("g-bono", [
      { nombre: "España", periodos: bo.meses, valores: bo.espana, color: c1, ancho: 2.5 },
      { nombre: "Alemania", periodos: bo.meses, valores: bo.alemania, color: c3 },
    ], { formato: pct(2), eje: "%" });
    fuente("g-bono", [["bce_bono_10", "tipos de interés a largo plazo (criterio de convergencia)"]], "dato", "Media mensual. La misma definición para los dos países.");
    lineas("g-prima", [{ nombre: "prima de riesgo", periodos: bo.meses, valores: bo.prima_pb, color: c1 }], { formato: (v) => `${numero(v, 0)} pb`, eje: "pb", min: 0, alto: 240 });
    fuente("g-prima", [["bce_bono_10", "tipos de interés a largo plazo"]], "lectura", "España menos Alemania; 100 puntos básicos son 1 punto porcentual.");
    lineas("g-tesoro", [
      { nombre: "toda la deuda viva", periodos: te.meses, valores: te.total, color: c1, ancho: 2.5 },
      { nombre: "letras (menos de un año)", periodos: te.meses, valores: te.letras, color: c2 },
    ], { formato: pct(2), eje: "%", min: 0 });
    fuente("g-tesoro", [["tesoro_tipo_medio_historico", "tipo medio de la deuda en circulación"], ["tesoro_tipo_medio", "últimos meses"], ["tesoro_vida_media", "vida media"]],
      "dato", "Tipo de emisión de la deuda viva a fin de cada mes. Es la deuda del Estado, no la de todas las administraciones.");
  }

  // 5. Crecimiento
  const pib = e.pib;
  if (pib) {
    const n = pib.trimestres.length - 1;
    pon("r-pib", [`En el ${nombrePeriodo(pib.trimestres[n])}, la economía producía un `, [`${numero(pib.interanual[n], 1)} % más`],
      " que un año antes, descontada la subida de precios. Si la economía crece más deprisa que el interés de la deuda, la deuda pesa menos sobre el PIB."]);
    lineas("g-pib", [{ nombre: "PIB en volumen", periodos: pib.trimestres, valores: pib.interanual, color: c1 }], { formato: pct(1), eje: "%" });
    fuente("g-pib", [["ine_cntr6654", "PIB, índice de volumen encadenado"]], "dato", "Ajustado de estacionalidad y calendario.");
  }

  // 6. Población
  const dp = e.dependencia;
  if (dp) {
    const n = dp.años.length - 1, pr = dp.proyeccion;
    const ult = pr.años.at(-1);
    pon("r-dep", [`En ${dp.años[n]} había `, [`${numero(dp.total[n], 1)} menores de 16 y mayores de 64`],
      ` por cada 100 personas de 16 a 64 años (${numero(dp.mayores[n], 1)} solo de mayores). Según la proyección del INE, en ${ult} serían ${numero(pr.total.at(-1), 1)}.`]);
    lineas("g-dep", [
      { nombre: "total", periodos: dp.años, valores: dp.total, color: c1, ancho: 2.5 },
      { nombre: "solo mayores de 64", periodos: dp.años, valores: dp.mayores, color: c3 },
      { nombre: "total, proyección", periodos: pr.años, valores: pr.total, color: c1, discontinua: true },
      { nombre: "mayores, proyección", periodos: pr.años, valores: pr.mayores, color: c3, discontinua: true },
    ], { formato: (v) => numero(v, 1), eje: "por cada 100", min: 0 });
    fuente("g-dep", [["ine_idb53241", "tasa de dependencia"], ["ine_idb53262", "dependencia de mayores"], ["ine_prop7465", "proyección"]], "dato",
      "La proyección supone que siguen las tendencias recientes de natalidad, mortalidad y migración; no es una predicción.");
  }
  EC.notaCapas(document.getElementById("nota-capas"), estado.d, capas);
}

async function arrancar() {
  const [e, aapp] = await Promise.all([fetch("datos/economia.json").then((r) => r.json()), fetch("datos/aapp.json").then((r) => r.json())]);
  estado.d = aapp;
  EC.capas(document.getElementById("capas"), capas, () => pintar(e));
  pintar(e);
  pintarComprobaciones(document.getElementById("comprobaciones"), e.comprobaciones);
  montarInfo();
}

arrancar();
