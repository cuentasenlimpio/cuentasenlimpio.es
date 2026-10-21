// Cuentas en limpio: gráficos de ingresos, gastos y deuda.
// Dibujados con Apache ECharts (ec.js); todo el texto entra con textContent; los números salen de datos/aapp.json.
"use strict";

const FORMULAS = {
  pib: "Dato. Tal cual lo publica Eurostat (unidad PC_GDP).",
  corrientes: "Dato. Tal cual lo publica Eurostat en millones de moneda nacional (unidad MIO_NAC): euros, y hasta 1998 pesetas convertidas al tipo fijo de 166,386 por euro. Aquí se muestra en miles de millones. No usamos la unidad MIO_EUR de Eurostat porque antes de 1999 convierte con el tipo de mercado de cada año (ver «Comprobaciones»).",
  constantes: "Lectura. Valor en euros × deflactor del PIB de {base} ÷ deflactor del PIB del año (tabla nama_10_gdp, índice 2020 = 100, en moneda nacional).",
  habitante: "Lectura. Valor en euros ÷ población media del año (tabla nama_10_pe).",
};

// `graficos`: las instancias de ECharts; `marcar`: qué hace cada uno cuando cambia el año elegido.
const estado = { datos: null, unidad: "pib", indice: null, indicadorUE: "deuda", graficos: {}, marcar: {}, periodo: null,
  capas: { gobiernos: false, legislaturas: false, acontecimientos: false, previsiones: true } };

// Último año con dato anual cerrado y hasta dónde llega el eje cuando se ven las previsiones (dos años más).
const ULTIMO = () => estado.datos.años.at(-1);
const conRecientes = () => !!(estado.datos.recientes && estado.capas.previsiones && estado.unidad === "pib");
const HASTA = () => (estado.datos.recientes ? ULTIMO() + 2 : ULTIMO());

// Nombre corto de cada institución en los rótulos del gráfico.
const CORTO = { airef: "AIReF", bde: "BdE", ce: "Comisión", fmi: "FMI", gobierno: "Objetivo Gob." };

// Piezas de lo reciente para un gráfico de líneas en % del PIB: franjas de fiabilidad, punto del año en curso,
// una línea discontinua por institución y, en la deuda, el abanico de la AIReF.
function piezasRecientes(claves, colores, ultimosValores) {
  const r = estado.datos.recientes, ult = ULTIMO(), hasta = HASTA();
  const css = EC.css;
  const sinComprobar = Object.entries(r.fiabilidad).filter(([, f]) => !f.cuadra || f.igae_provisional).map(([a]) => Number(a));
  const desde = sinComprobar.length ? Math.min(...sinComprobar) - 0.5 : ult - 0.5;
  const rotulo = () => ({ show: false });
  const series = [{
    id: "tramos", type: "line", data: [], silent: true, z: 0,
    markArea: { silent: true, data: [
      [{ xAxis: desde, itemStyle: { color: EC.css("--sombra-tenue") }, label: rotulo() }, { xAxis: ult }],
      [{ xAxis: ult, itemStyle: { color: EC.css("--sombra-fuerte") }, label: rotulo() }, { xAxis: ult + 1 }],
      [{ xAxis: ult + 1, itemStyle: { color: "transparent" }, label: rotulo() }, { xAxis: hasta }],
    ] },
  }];
  claves.forEach((clave, k) => {
    const color = colores[k];
    // Año en curso: punto hueco (doce meses hasta el último trimestre, o la deuda del último trimestre).
    const ec = r.en_curso;
    const v = !ec ? null : clave === "deuda" ? ec.deuda?.pib : ec.series[clave]?.doce_meses_pib;
    if (v !== null && v !== undefined) {
      const x = clave === "deuda" ? ec.deuda.x : ec.x;
      series.push({ id: `encurso-${clave}`, type: "scatter", silent: true, z: 5, symbolSize: 9,
        itemStyle: { color: css("--superficie"), borderColor: color, borderWidth: 2 }, data: [[x, v]] });
    }
    for (const e of r.previsiones.emisores) {
      const pts = (e.series[clave] || []).filter((p) => p.año <= hasta);
      if (!pts.length) continue;
      const objetivo = e.tipo === "objetivo";
      series.push({
        id: `prev-${clave}-${e.id}`, type: "line", silent: true, z: 3,
        data: [[ult, ultimosValores[k]], ...pts.map((p) => [p.año, p.valor])],
        symbol: objetivo ? "diamond" : "none", symbolSize: 6, showSymbol: objetivo,
        itemStyle: { color }, lineStyle: { color, width: 1.5, type: objetivo ? [1, 3] : [5, 4], opacity: 0.8 },
        endLabel: { show: true, formatter: CORTO[e.id], color: css("--tinta-suave"), fontSize: 10, distance: 4 },
        labelLayout: { hideOverlap: true }, emphasis: { disabled: true },
      });
    }
  });
  const ab = r.previsiones.abanico;
  if (ab && claves.includes("deuda")) {
    const años = Object.keys(ab.deuda.p10).map(Number).filter((a) => a <= hasta).sort();
    const base = [ult, ultimosValores[claves.indexOf("deuda")]];
    const contorno = [base, ...años.map((a) => [a, ab.deuda.p90[a]]), ...años.reverse().map((a) => [a, ab.deuda.p10[a]])];
    series.push({ id: "abanico", type: "custom", data: [0], silent: true, clip: true, z: 1,
      renderItem: (_p, api) => ({ type: "polygon", shape: { points: contorno.map((q) => api.coord(q)) }, style: { fill: EC.css("--hueco") } }) });
  }
  return series;
}


const estrecho = () => document.querySelector("main").clientWidth < 520;

// Elige un año desde un gráfico (al pasar por encima): `x` es la posición en el eje, y cada año está en su entero.
function elegirDesde(x) {
  const años = estado.datos.años;
  const i = Math.max(0, Math.min(años.length - 1, Math.round(x) - años[0]));
  if (i === estado.indice) return;
  estado.indice = i;
  redibujarCruces();
}

// Ingresos y gastos (con el hueco entre los dos) o la deuda: líneas sobre las legislaturas y los acontecimientos.
function graficoLineas(id, { series, hueco, alto, alMarcar }) {
  const d = estado.datos;
  const u = UNIDADES[estado.unidad];
  const años = d.años;
  // El eje llega siempre al horizonte de las previsiones (si las hay), para que el zoom sea el mismo en todas las unidades.
  const min = años[0], max = HASTA();
  const g = estado.graficos[id] || (estado.graficos[id] = EC.crear(document.getElementById(id), alto));
  const puntosDe = (s) => años.map((a, i) => [a, s.valores[i] === null ? null : s.valores[i] * u.escala]);
  const lineas = series.map((s) => ({ ...s, datos: puntosDe(s), color: EC.css(`--serie-${s.clase}`) }));
  const opciones = {
    ...EC.tiempo({ min, max, marcasArriba: EC.algunaCapa(estado.capas), aria: `${document.getElementById(id).getAttribute("aria-label")} En ${texto(u.eje, d.año_base_constantes)}.` }),
    yAxis: EC.ejeY({ nombre: texto(u.eje, d.año_base_constantes), formato: (v) => numero(v, 0), min: 0 }),
    series: [
      ...lineas.map((s) => EC.linea(s.clase, s.datos, s.color)),
      EC.marcas(d, { min, max, resaltada: estado.periodo?.resaltada(), capas: estado.capas }),
    ],
  };
  if (hueco) {
    // Hueco entre las dos líneas: un polígono que va por la primera y vuelve por la segunda.
    const [a, b] = hueco.map((k) => lineas.find((s) => s.clave === k).datos);
    const contorno = [...a, ...[...b].reverse()].filter(([, v]) => v !== null);
    opciones.series.push({
      id: "hueco", type: "custom", data: [0], silent: true, clip: true, z: 2,
      renderItem: (_p, api) => ({ type: "polygon", shape: { points: contorno.map((p) => api.coord(p)) }, style: { fill: EC.css("--hueco") } }),
    });
  }
  if (conRecientes()) {
    const n = años.length - 1;
    opciones.series.push(...piezasRecientes(lineas.map((s) => s.clave), lineas.map((s) => s.color), lineas.map((s) => s.datos[n][1])));
  }
  g.setOption(opciones, { notMerge: true });
  if (!g.cuentasListo) {
    g.cuentasListo = true;
    EC.alPasar(g, elegirDesde);
    estado.periodo.sumar(g, { ejeMin: min, ejeMax: HASTA(), marcas: { min, max: HASTA(), capas: estado.capas } });
  }
  estado.marcar[id] = (i) => {
    g.setOption({ series: [EC.puntos("año", lineas.map((s) => s.datos[i]).filter(([, v]) => v !== null), lineas.map((s) => s.color))] });
    EC.fijar(g, años[i]);
    alMarcar(i);
  };
}

const COMPONENTES = [
  { clave: "deficit_primario", clase: "c-primario", nombre: "lo que faltó sin contar intereses", nombreNegativo: "lo que sobró sin contar intereses" },
  { clave: "intereses", clase: "c-intereses", nombre: "intereses de la deuda" },
  { clave: "activos", clase: "c-activos", nombre: "dinero prestado o invertido (activos financieros)" },
  { clave: "ajustes", clase: "c-ajustes", nombre: "otros ajustes contables" },
  { clave: "crecimiento", clase: "c-crecimiento", nombre: "lo que crece la economía (la deuda pesa menos)", soloPib: true },
];

function conSigno(v, unidad) {
  if (v === null || v === undefined) return "sin dato";
  const texto = unidad === "pib" ? `${numero(Math.abs(v), 2)} puntos del PIB` : formatear(Math.abs(v), unidad);
  return `${v < 0 ? "−" : "+"}${texto}`;
}

// Barras apiladas con signo: lo que suma deuda, hacia arriba; lo que la resta, hacia abajo. El punto es la
// variación total del año, que es exactamente la suma de las barras. Cada año ocupa su banda, centrada en el año.
function graficoBarras() {
  const id = "g3";
  const d = estado.datos;
  const u = estado.unidad;
  const datos = d.cambio_deuda[u];
  const comps = COMPONENTES.filter((c) => !c.soloPib || u === "pib");
  const años = d.años;
  const min = años[0] - 0.5, max = años.at(-1) + 0.5;
  const esc = u === "pib" ? 1 : UNIDADES[u].escala;
  const g = estado.graficos[id] || (estado.graficos[id] = EC.crear(document.getElementById(id), estrecho() ? 360 : 420));

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
  const paso = pasos(Math.max(maximo, -minimo), estrecho() ? 3 : 4)[1];
  const colores = Object.fromEntries(comps.map((c) => [c.clave, EC.css(`--${c.clase}`)]));
  const superficie = EC.css("--superficie"), tinta = EC.css("--tinta");

  const conSignoEje = (v) => {
    const valor = Math.abs(v) < paso / 1000 ? 0 : v;
    return (valor > 0 ? "+" : valor < 0 ? "−" : "") + numero(Math.abs(valor), paso < 1 ? 1 : 0);
  };
  g.setOption({
    ...EC.tiempo({ min, max, silueta: false, marcasArriba: EC.algunaCapa(estado.capas), aria: `${document.getElementById(id).getAttribute("aria-label")} En ${u === "pib" ? "puntos del PIB" : texto(UNIDADES[u].eje, d.año_base_constantes)}.` }),
    yAxis: EC.ejeY({
      nombre: u === "pib" ? "puntos del PIB" : texto(UNIDADES[u].eje, d.año_base_constantes),
      formato: conSignoEje,
      min: Math.floor(minimo / paso) * paso, max: Math.ceil(maximo / paso) * paso,
    }),
    series: [
      EC.marcas(d, { min, max, desplazamiento: -0.5, resaltada: estado.periodo?.resaltada(), capas: estado.capas }),
      {
        id: "barras", type: "custom", clip: true, silent: true, z: 3,
        data: años.map((a, i) => [a, i]),
        encode: { x: 0 },
        renderItem: (_p, api) => {
          const i = api.value(1);
          const x = api.coord([api.value(0), 0])[0];
          const grosor = Math.min(24, api.size([1, 0])[0] * 0.72);
          const hijos = [];
          let arriba = 0, abajo = 0;
          for (const c of comps) {
            const v = datos[c.clave][i];
            if (v === null || v === 0) continue;
            const desde = v > 0 ? arriba : abajo;
            const hasta = desde + v * esc;
            const y0 = api.coord([0, desde])[1], y1 = api.coord([0, hasta])[1];
            const alto_px = Math.abs(y1 - y0);
            const hueco = alto_px > 3 ? 1 : 0;  // 2 px de superficie entre segmentos: 1 arriba y 1 abajo
            hijos.push({
              type: "rect",
              shape: { x: x - grosor / 2, y: Math.min(y0, y1) + hueco, width: grosor, height: Math.max(0.5, alto_px - 2 * hueco) },
              style: { fill: colores[c.clave] },
            });
            if (v > 0) arriba = hasta; else abajo = hasta;
          }
          if (datos.variacion[i] !== null) {
            const [cx, cy] = api.coord([api.value(0), datos.variacion[i] * esc]);
            hijos.push({ type: "circle", shape: { cx, cy, r: Math.min(4.5, grosor / 2.5 + 1) }, style: { fill: tinta, stroke: superficie, lineWidth: 2 }, z2: 10 });
          }
          return { type: "group", children: hijos };
        },
      },
    ],
  }, { notMerge: true });
  if (!g.cuentasListo) {
    g.cuentasListo = true;
    EC.alPasar(g, elegirDesde);
    estado.periodo.sumar(g, { desplazamiento: -0.5, ejeMin: min, ejeMax: max, marcas: { min, max, desplazamiento: -0.5, capas: estado.capas } });
  }
  estado.marcar[id] = (i) => {
    EC.fijar(g, años[i]);
    lecturaBarras(i, comps);
  };
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
function graficoUE() {
  const id = "g4";
  const contenedor = document.getElementById(id);
  const d = estado.datos;
  const i = estado.indice;
  const ind = estado.indicadorUE;
  const valores = d.ue.indicadores[ind];
  const paises = Object.keys(d.ue.paises).filter((p) => p !== "EU27_2020" && valores[p][i] !== null);
  paises.sort((a, b) => valores[b][i] - valores[a][i]);
  const media = valores.EU27_2020[i];
  const fila = 19;
  const alto = 34 + 28 + Math.max(1, paises.length) * fila;
  if (!estado.graficos[id]) {
    estado.graficos[id] = EC.crear(contenedor, alto);
    const g = estado.graficos[id];
    // La fila entera bajo el puntero, no solo el punto: así se lee el país sin apuntar a un círculo de 9 px.
    g.getZr().on("mousemove", (e) => {
      const lista = g.cuentasPaises || [];
      const [, k] = g.convertFromPixel({ gridIndex: 0 }, [e.offsetX, e.offsetY]);
      const p = lista[Math.round(k)];
      if (g.containPixel({ gridIndex: 0 }, [e.offsetX, e.offsetY]) && p) lecturaUE(p, g.cuentasMedia, lista);
      else lecturaUE(null, g.cuentasMedia, lista);
    });
    g.getZr().on("globalout", () => lecturaUE(null, g.cuentasMedia, g.cuentasPaises || []));
  }
  const g = estado.graficos[id];
  contenedor.style.height = `${alto}px`;
  g.resize();
  g.cuentasPaises = paises;
  g.cuentasMedia = media;
  if (!paises.length) {
    g.clear();
    g.setOption({ title: { text: `Eurostat no tiene este dato para ${d.años[i]}.`, textStyle: { fontSize: 13, fontWeight: 400, color: EC.css("--tinta-suave") } } });
    lecturaUE(null, media, paises);
    return;
  }
  const lista = paises.map((p) => valores[p][i]).concat(media === null ? [] : [media], [0]);
  const lo = Math.min(...lista), hi = Math.max(...lista);
  const paso = pasos(Math.max(Math.abs(lo), Math.abs(hi)), estrecho() ? 3 : 5)[1];
  const suave = EC.css("--tinta-suave"), tinta = EC.css("--tinta"), acento = EC.css("--acento");
  const conSigno = (v, dec) => `${v < 0 ? "−" : ""}${numero(Math.abs(v), dec)} %`;
  g.setOption({
    animationDurationUpdate: 300,
    textStyle: { fontFamily: getComputedStyle(document.body).fontFamily, color: suave },
    aria: { enabled: true, label: { description: `${INDICADORES_UE[ind]} en ${d.años[i]}, en % del PIB: ${paises.map((p) => `${d.ue.paises[p]}, ${conSigno(valores[p][i], 1)}`).join("; ")}.` } },
    grid: { left: 4, right: 56, top: 34, bottom: 28, containLabel: true },
    xAxis: {
      type: "value", min: Math.floor(lo / paso) * paso, max: Math.ceil(hi / paso) * paso, interval: paso,
      axisLabel: { color: suave, formatter: (v) => conSigno(v, 0) },
      splitLine: { lineStyle: { color: EC.css("--linea") } },
    },
    yAxis: {
      type: "category", inverse: true, data: paises.map((p) => d.ue.paises[p]),
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: {
        fontSize: 12, color: suave,
        formatter: (v) => (v === d.ue.paises.ES ? `{es|${v}}` : v),
        rich: { es: { color: tinta, fontWeight: 600, fontSize: 12 } },
      },
    },
    series: [{
      id: "paises", type: "scatter", silent: true, animation: false,
      data: paises.map((p) => {
        const es = p === "ES";
        return {
          value: [valores[p][i], d.ue.paises[p]],
          symbolSize: es ? 12 : 9,
          itemStyle: es ? { color: acento, borderColor: EC.css("--fondo"), borderWidth: 2 } : { color: EC.css("--linea-fuerte") },
          label: es ? { show: true, position: "right", distance: 8, formatter: conSigno(valores[p][i], 1), color: tinta, fontWeight: 600, fontSize: 12 } : { show: false },
        };
      }),
      markLine: media === null ? undefined : {
        silent: true, symbol: "none", animation: false,
        lineStyle: { color: tinta, type: [4, 3], width: 1 },
        label: { position: "start", formatter: `UE-27: ${conSigno(media, 1)}`, color: tinta, fontSize: 12, distance: 6 },
        data: [{ xAxis: media }],
      },
    }],
  }, { notMerge: true });
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
  graficoUE();
  for (const id of ["g1", "g2", "g3"]) estado.marcar[id]?.(estado.indice);
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

  graficoLineas("g1", {
    series: [
      { clave: "gastos", clase: "gastos", valores: s.gastos[u] },
      { clave: "ingresos", clase: "ingresos", valores: s.ingresos[u] },
    ],
    hueco: ["ingresos", "gastos"],
    alto: estrecho() ? 360 : 430,
    alMarcar: (i) => {
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

  graficoLineas("g2", {
    series: [{ clave: "deuda", clase: "deuda", valores: s.deuda[u] }],
    hueco: null,
    alto: estrecho() ? 320 : 380,
    alMarcar: (i) => {
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
  etiqueta.textContent = ETIQUETA_TIPO[un.tipo] || un.tipo;
  explicada.appendChild(etiqueta);
  explicada.appendChild(document.createTextNode(" " + texto(un.explica, d.año_base_constantes)));

  pintarLeyendaBarras();
  graficoBarras();
  // Cambiar de unidad no mueve el periodo elegido.
  estado.periodo.reaplicar();
  redibujarCruces();
  pintarFuenteUE();
  pintarFuente("g1-fuente", "gov_10a_main");
  pintarRecientes("g1-recientes", "saldo");
  pintarRecientes("g2-recientes", "deuda");
  montarInfo();
  pintarFuente("g2-fuente", "gov_10dd_edpt1");
  pintarFuente("g3-fuente", "gov_10dd_edpt3",
    [["gov_10dd_edpt1", u === "pib" ? "intereses y PIB de la misma notificación" : "intereses de la misma notificación"]],
    u === "pib"
      ? "Cada parte, dividida entre el PIB del año. «Lo que crece la economía» es lo que baja el porcentaje solo porque la economía es más grande."
      : "Lo que faltó sin contar intereses es una resta: déficit menos intereses.");
  // La fórmula exacta, para quien quiera comprobarla, en el detalle de la fuente.
  const lista3 = document.getElementById("g3-fuente").nextElementSibling?.querySelector("ul");
  if (u === "pib" && lista3) {
    const li = document.createElement("li");
    li.textContent = "Cómo se calcula lo que crece la economía: variación del porcentaje = variación de la deuda ÷ PIB − porcentaje del año anterior × crecimiento ÷ (1 + crecimiento), con el crecimiento del PIB en euros de cada año. Es una igualdad exacta.";
    lista3.appendChild(li);
  }
  pintarTabla();
  pintarClaveDeuda();
}

// Una frase con lo más llamativo del último año del desglose de la deuda: cuánto del déficit fueron intereses.
function pintarClaveDeuda() {
  const c = estado.datos.cambio_deuda?.pib, d = estado.datos;
  const el = document.getElementById("g3-clave");
  if (!c || !el) return;
  const i = d.años.length - 1, int_ = c.intereses[i], prim = c.deficit_primario[i];
  if (int_ === null || prim === null) return;
  const total = int_ + prim;
  el.textContent = prim <= 0.05
    ? `En ${d.años[i]}, casi todo el déficit fueron intereses de la deuda: ${numero(int_, 1)} puntos del PIB de intereses, y sin contarlos ${prim < -0.05 ? `sobró un ${numero(-prim, 1)} %` : "las cuentas quedaron prácticamente equilibradas"}.`
    : `En ${d.años[i]}, de un déficit de ${numero(total, 1)} puntos del PIB, ${numero(int_, 1)} fueron intereses de la deuda y ${numero(prim, 1)}, el resto.`;
}

// Línea de fuente bajo cada gráfico: la tabla de Eurostat de la que sale y, si la unidad es una lectura, las tablas
// que intervienen en el cálculo. Cambia con la unidad.
function pintarFuente(id, tabla, otras = [], nota = "") {
  const d = estado.datos;
  const u = estado.unidad;
  const extra = { constantes: ["nama_10_gdp", "deflactor del PIB"], habitante: ["nama_10_pe", "población media"] }[u];
  const p = document.getElementById(id);
  lineaFuente(p, {
    fuentes: d.fuentes, tablas: [[tabla, null], ...otras, ...(extra ? [extra] : [])],
    tipo: nota && u === "pib" ? "lectura" : UNIDADES[u].tipo, nota,
  });
  // Las legislaturas y los acontecimientos del gráfico, en el detalle.
  const c = d.fuentes.find((x) => x.tabla === "legislaturas");
  const lista = p.nextElementSibling?.querySelector("ul");
  if (c && lista) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = c.url_navegador;
    a.textContent = "Congreso de los Diputados, sesiones constitutivas de cada legislatura";
    li.append("Legislaturas: ", a, ` (descargada el ${fecha(c.descargado)}). Acontecimientos: el documento oficial de cada uno, en su lista bajo el primer gráfico.`);
    lista.appendChild(li);
  }
}
function pintarFuenteUE() {
  const d = estado.datos;
  const tabla = estado.indicadorUE === "deuda" ? "ue_gov_10dd_edpt1" : "ue_gov_10a_main";
  lineaFuente(document.getElementById("g4-fuente"), {
    fuentes: d.fuentes, tablas: [[tabla, null]], tipo: "dato", nota: "En porcentaje del PIB de cada país. La media es la de los 27 países de la UE, tal como la calcula Eurostat.",
  });
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
  const hayProvisional = ["ingresos", "gastos", "saldo", "deuda"].some((k) => s[k].provisional[u].some(Boolean));
  leyenda.textContent = `En ${texto(UNIDADES[u].eje, d.año_base_constantes)}. Saldo negativo = déficit.${hayProvisional ? " «p» = provisional." : ""}`;
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
  const deEstaPagina = ["gov_10a_main", "gov_10dd_edpt1", "gov_10dd_edpt3", "ue_gov_10a_main", "ue_gov_10dd_edpt1", "nama_10_gdp", "nama_10_pe", "ert_h_eur_a", "legislaturas", "bde_be1106", "igae_a_aapp", "ine_pib", "ine_poblacion"];
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
    for (const [t, href] of enlaces.filter(([, h]) => h)) {
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

// Respuesta corta del último año y cuántos años hubo superávit (todo sale de los datos). Primero, en llano; luego,
// las cifras sobre el PIB, por habitante y frente a la media de la UE.
function pintarRespuesta() {
  const d = estado.datos, s = d.series, i = d.años.length - 1;
  const v = (k) => numero(s[k].pib[i], 1);
  const saldo = s.saldo.pib[i], deuda = s.deuda.pib[i];
  const de100 = Math.round((100 * s.gastos.corrientes[i]) / s.ingresos.corrientes[i]);
  const p = document.getElementById("respuesta");
  p.textContent = `En ${d.años[i]}, las administraciones ${saldo < 0 ? "gastaron más de lo que ingresaron" : "ingresaron más de lo que gastaron"}: por cada 100 € que entraron, salieron unos ${numero(de100, 0)}. `;
  const b = document.createElement("strong");
  b.textContent = saldo < 0 ? "Lo que faltó, el déficit, se pidió prestado" : "Lo que sobró, el superávit, redujo lo que había que pedir prestado";
  const peso = deuda >= 100 ? "ya supera todo lo que produce el país en un año" : deuda >= 90 ? "ya equivale a casi todo lo que produce el país en un año"
    : `equivale a ${numero(Math.round(deuda), 0)} de cada 100 € de lo que produce el país en un año`;
  p.append(b, ` y se sumó a la deuda, que ${peso}.`);
  // Las cifras exactas, plegadas debajo de la frase: la respuesta se lee primero en llano.
  let plegadas = document.getElementById("respuesta-cifras");
  if (!plegadas) {
    plegadas = document.createElement("details");
    plegadas.id = "respuesta-cifras";
    plegadas.className = "fuente-detalle respuesta-cifras";
    p.after(plegadas);
  }
  plegadas.textContent = "";
  const resumen = document.createElement("summary");
  resumen.textContent = "Las cifras exactas, por habitante y frente a la Unión Europea";
  plegadas.appendChild(resumen);
  const cifras = document.createElement("p");
  cifras.className = "respuesta-persona";
  const ue = (k) => d.ue?.indicadores?.[k]?.EU27_2020?.[i];
  cifras.textContent = `En cifras: ingresos, ${v("ingresos")} % del PIB; gastos, ${v("gastos")} %; ${saldo < 0 ? "déficit" : "superávit"}, ${numero(Math.abs(saldo), 1)} %; deuda, ${v("deuda")} %.`
    + (ue("deuda") !== undefined && ue("deuda") !== null ? ` En la Unión Europea, de media: ${ue("saldo") < 0 ? "déficit" : "superávit"} del ${numero(Math.abs(ue("saldo")), 1)} % y deuda del ${numero(ue("deuda"), 1)} %.` : "");
  plegadas.appendChild(cifras);
  // A escala de persona (lectura: euros de cada serie entre la población media del año, de Eurostat).
  const h = (k) => s[k].habitante[i];
  if (h("gastos")) {
    const q = document.createElement("p");
    q.className = "respuesta-persona";
    q.textContent = `Por habitante: entraron ${eurosHablados(h("ingresos"))} y se gastaron ${eurosHablados(h("gastos"))} en el año, `
      + `${saldo < 0 ? "faltaron" : "sobraron"} ${eurosHablados(Math.abs(h("saldo")))}, y la deuda equivale a ${eurosHablados(h("deuda"))} por cada habitante. No es lo que debe cada persona: es la deuda dividida entre todos, para hacerse una idea de su tamaño.`;
    plegadas.appendChild(q);
  }
  const con = d.años.filter((a, k) => s.saldo.pib[k] !== null && s.saldo.pib[k] >= 0);
  const t = document.getElementById("superavit");
  if (t) {
    t.textContent = con.length
      ? `En los ${d.años.length} años de la serie, las administraciones solo ingresaron al menos lo que gastaron en ${con.length === 1 ? "uno" : numero(con.length, 0)} (${con.length > 1 ? `${con.slice(0, -1).join(", ")} y ${con.at(-1)}` : con[0]}).`
      : `En los ${d.años.length} años de la serie, las administraciones gastaron cada año más de lo que ingresaron.`;
  }
}

const FIN_TRIMESTRE = ["marzo", "junio", "septiembre", "diciembre"];

// Debajo de un gráfico: el año en curso, la fiabilidad del último año y las previsiones de cada institución.
// `clave`: "saldo" o "deuda".
function pintarRecientes(id, clave) {
  const caja = document.getElementById(id);
  const r = estado.datos.recientes;
  caja.textContent = "";
  if (!r || !estado.capas.previsiones) return;
  let destino = caja;
  const el = (tipo, props = {}, padre = destino) => {
    const e = document.createElement(tipo);
    Object.assign(e, props);
    padre.appendChild(e);
    return e;
  };
  const ult = ULTIMO();
  // Leyenda de las franjas y las líneas de lo reciente.
  const sin = Object.entries(r.fiabilidad).filter(([, f]) => !f.cuadra || f.igae_provisional).map(([a]) => Number(a)).sort();
  const ley = el("ul", { className: "leyenda-series" });
  const item = (clase, texto) => {
    const li = el("li", {}, ley);
    el("span", { className: clase }, li);
    li.append(texto);
  };
  item("clave-area tenue", `Fondo claro: provisional (${sin.length > 1 ? `${sin[0]}–${sin.at(-1)}` : sin[0] ?? ult})`);
  item("clave-area oscura", `Fondo oscuro: ${ult + 1}, en curso (punto hueco: último dato)`);
  item("clave-discontinua", `Discontinuas: previsiones de cada institución; de puntos: objetivo del Gobierno`);
  // Lo demás (lo provisional, lo del año en curso y las previsiones), plegado: es para quien quiera el detalle.
  const det = el("details", { className: "plegable-controles recientes-detalle" });
  el("summary", { textContent: clave === "saldo" ? "Lo más reciente y lo que prevén las instituciones: el déficit" : "Lo más reciente y lo que prevén las instituciones: la deuda" }, det);
  destino = det;
  const h3 = el("p", { className: "como-leer", textContent: "Cómo leer una previsión " });
  el("button", { type: "button", className: "info", textContent: "i" }, h3).dataset.info = "previsiones";
  const f = clave === "saldo" ? r.fiabilidad[String(ult)] : null;
  if (f) {
    const p = el("p");
    const b = el("strong", { textContent: `${ult}, provisional. ` }, p);
    p.append(f.nota + (f.igae_provisional ? ` La IGAE aún marca ${ult} como provisional.` : ""));
  }
  const ec = r.en_curso;
  if (ec && clave === "saldo") {
    const s_ = ec.series.saldo, mes = FIN_TRIMESTRE[ec.trimestre - 1];
    const p = el("p");
    el("strong", { textContent: `${ec.año}, en curso. ` }, p);
    p.append(`De enero a ${mes}, el saldo fue del ${numero(s_.acumulado_pib, 2)} % del PIB de esos meses, frente al ${numero(s_.acumulado_anterior_pib, 2)} % en el mismo periodo de ${ec.año - 1} (dato de la IGAE). ` +
      `En los doce meses que acaban en ${mes} de ${ec.año}: ${numero(s_.doce_meses_pib, 1)} %. Es el punto hueco del gráfico: lo de los cuatro últimos trimestres, dividido entre lo que produjo la economía en ese tiempo. ` +
      "Un trimestre no anticipa el año: el gasto y los impuestos no se reparten igual entre trimestres.");
  }
  if (ec && clave === "deuda" && ec.deuda) {
    const p = el("p");
    el("strong", { textContent: `${ec.deuda.año}, en curso. ` }, p);
    p.append(`A final de ${FIN_TRIMESTRE[ec.deuda.trimestre - 1]} de ${ec.deuda.año}, la deuda era del ${numero(ec.deuda.pib, 1)} % del PIB (dato del Banco de España, punto hueco del gráfico). A mitad de año suele estar más alta que en diciembre.`);
  }
  // Tabla: una fila por institución, con su publicación. Antes, en una frase, entre qué cifras se mueven.
  const años = [ult + 1, ult + 2];
  const prev = r.previsiones.emisores.filter((e) => e.tipo !== "objetivo")
    .map((e) => e.series[clave]?.find((x) => x.año === ult + 1)?.valor).filter((x) => x !== undefined);
  if (prev.length > 1) {
    const lo = Math.min(...prev), hi = Math.max(...prev);
    const pr = el("p");
    pr.textContent = clave === "saldo"
      ? `Para ${ult + 1}, las ${prev.length} instituciones prevén ${hi < 0 ? `un déficit de entre el ${numero(-hi, 1)} % y el ${numero(-lo, 1)} %` : `un saldo de entre el ${numero(lo, 1)} % y el ${numero(hi, 1)} %`} del PIB.`
      : `Para ${ult + 1}, las ${prev.length} instituciones prevén una deuda de entre el ${numero(lo, 1)} % y el ${numero(hi, 1)} % del PIB.`;
  }
  const tabla = el("table", { className: "previsiones" }, el("div", { className: "tabla" }));
  const cab = el("tr", {}, el("thead", {}, tabla));
  for (const t of ["Quién", ...años.map(String), "De qué publicación"]) el("th", { scope: "col", textContent: t }, cab);
  const cuerpo = el("tbody", {}, tabla);
  for (const e of r.previsiones.emisores) {
    const pts = e.series[clave];
    if (!pts?.length) continue;
    const tr = el("tr", {}, cuerpo);
    el("td", { textContent: e.tipo === "objetivo" ? `${e.nombre} (meta, no previsión)` : e.nombre }, tr);
    for (const a of años) {
      const p = pts.find((x) => x.año === a);
      el("td", { textContent: p ? `${numero(p.valor, 1)} %` : "—" }, tr);
    }
    const td = el("td", {}, tr);
    const usadas = [...new Set(pts.filter((x) => años.includes(x.año)).map((x) => x.publicacion))];
    usadas.forEach((k, j) => {
      const pub = e.publicaciones[k];
      if (j) td.append("; ");
      el("a", { href: pub.url, textContent: `${fecha(pub.fecha)}` }, td);
    });
  }
  const nota = el("p", { className: "fuente-grafico" });
  nota.append(clave === "saldo" ? "Saldo en % del PIB: negativo es déficit. " : "Deuda en % del PIB. ");
  nota.append(`${r.previsiones.criterio} Líneas discontinuas: previsiones; de puntos y rombos: objetivo del Gobierno. `);
  const ab = r.previsiones.abanico;
  if (clave === "deuda" && ab) {
    nota.append(`Zona gris: abanico de la AIReF (${fecha(ab.fecha)}): en 8 de cada 10 de sus escenarios, la deuda de ${ult + 2} quedaría entre el ${numero(ab.deuda.p10[ult + 2], 1)} % y el ${numero(ab.deuda.p90[ult + 2], 1)} %. `);
  }
  if (clave === "saldo") nota.append("En el gráfico de arriba se ven las previsiones de ingresos y gastos de la Comisión Europea y del FMI, las únicas que las publican por separado. ");
  const fuente = el("p", { className: "fuente-grafico" });
  lineaFuente(fuente, { fuentes: estado.datos.fuentes,
    tablas: clave === "saldo" ? [["igae_t_aapp", "operaciones trimestrales de las AAPP"], ["igae_a_aapp", "operaciones anuales"], ["ine_pib", "PIB trimestral"]]
      : [["bde_be1107", "deuda en % del PIB"]],
    tipo: "dato", nota: "Las previsiones, en el enlace de cada fila. Las cifras de los PDF se copian a mano; las de hojas de cálculo se comprueban solas cada día." });
}

// Encender o apagar una capa de contexto: se repintan los gráficos (cambia el hueco de arriba) y la nota.
function cambiarCapas() {
  pintar();
  // Los acontecimientos ya tienen su lista detallada bajo el primer gráfico.
  EC.notaCapas(document.getElementById("nota-capas"), estado.datos, estado.capas, { conAcontecimientos: false });
  document.getElementById("acontecimientos").hidden = !estado.capas.acontecimientos;
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
  // Si el periodo elegido deja fuera el año que se está leyendo, se pasa al último año del periodo.
  estado.periodo = EC.periodo(document.getElementById("periodo"), estado.datos, estado.datos.años, {
    hasta: estado.datos.recientes ? estado.datos.años.at(-1) + 2 : undefined,
    alCambiar: (desde, hasta) => {
      const año = estado.datos.años[estado.indice];
      if (año >= desde && año <= hasta) return;
      estado.indice = Math.max(0, Math.min(estado.datos.años.length - 1, hasta - estado.datos.años[0]));
      if (estado.marcar.g1) redibujarCruces();
    },
    // Elegir una legislatura enciende su capa: si no, no se vería qué tramo es.
    alResaltar: (nombre) => {
      if (nombre && !estado.capas.legislaturas && estado.uiCapas) {
        estado.uiCapas.poner("legislaturas", true);
        setTimeout(cambiarCapas, 0);
      }
    },
  });
  estado.uiCapas = EC.capas(document.getElementById("capas"), estado.capas, cambiarCapas);

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
      graficoUE();
      pintarFuenteUE();
    });
  }

  pintarRespuesta();
  pintar();
  pintarFicha();
  pintarAcontecimientos();
  document.getElementById("acontecimientos").hidden = true;
  // En móvil y en escritorio cambian la altura de los gráficos y los pasos del eje: se repintan al cruzar ese ancho.
  let eraEstrecho = estrecho();
  window.addEventListener("resize", () => {
    if (estrecho() === eraEstrecho) return;
    eraEstrecho = estrecho();
    for (const [id, alto] of [["g1", eraEstrecho ? 360 : 430], ["g2", eraEstrecho ? 320 : 380], ["g3", eraEstrecho ? 360 : 420]]) {
      document.getElementById(id).style.height = `${alto}px`;
    }
    pintar();
  });
}

arrancar();
