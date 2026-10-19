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
const estado = { datos: null, unidad: "pib", indice: null, indicadorUE: "deuda", graficos: {}, marcar: {}, periodo: null };

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
  const min = años[0], max = años.at(-1);
  const g = estado.graficos[id] || (estado.graficos[id] = EC.crear(document.getElementById(id), alto));
  const puntosDe = (s) => años.map((a, i) => [a, s.valores[i] === null ? null : s.valores[i] * u.escala]);
  const lineas = series.map((s) => ({ ...s, datos: puntosDe(s), color: EC.css(`--serie-${s.clase}`) }));
  const opciones = {
    ...EC.tiempo({ min, max, aria: `${document.getElementById(id).getAttribute("aria-label")} En ${texto(u.eje, d.año_base_constantes)}.` }),
    yAxis: EC.ejeY({ nombre: texto(u.eje, d.año_base_constantes), formato: (v) => numero(v, 0), min: 0 }),
    series: [
      ...lineas.map((s) => EC.linea(s.clase, s.datos, s.color)),
      EC.marcas(d, { min, max, resaltada: estado.periodo?.resaltada() }),
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
  g.setOption(opciones, { notMerge: true });
  if (!g.cuentasListo) {
    g.cuentasListo = true;
    EC.alPasar(g, elegirDesde);
    estado.periodo.sumar(g, { ejeMin: min, ejeMax: max, marcas: { min, max } });
  }
  estado.marcar[id] = (i) => {
    g.setOption({ series: [EC.puntos("año", lineas.map((s) => s.datos[i]).filter(([, v]) => v !== null), lineas.map((s) => s.color))] });
    EC.fijar(g, años[i]);
    alMarcar(i);
  };
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
    ...EC.tiempo({ min, max, silueta: false, aria: `${document.getElementById(id).getAttribute("aria-label")} En ${u === "pib" ? "puntos del PIB" : texto(UNIDADES[u].eje, d.año_base_constantes)}.` }),
    yAxis: EC.ejeY({
      nombre: u === "pib" ? "puntos del PIB" : texto(UNIDADES[u].eje, d.año_base_constantes),
      formato: conSignoEje,
      min: Math.floor(minimo / paso) * paso, max: Math.ceil(maximo / paso) * paso,
    }),
    series: [
      EC.marcas(d, { min, max, desplazamiento: -0.5, resaltada: estado.periodo?.resaltada() }),
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
    estado.periodo.sumar(g, { desplazamiento: -0.5, ejeMin: min, ejeMax: max, marcas: { min, max, desplazamiento: -0.5 } });
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
  etiqueta.textContent = un.tipo;
  explicada.appendChild(etiqueta);
  explicada.appendChild(document.createTextNode(" " + texto(un.explica, d.año_base_constantes)));

  pintarLeyendaBarras();
  graficoBarras();
  // Cambiar de unidad no mueve el periodo elegido.
  estado.periodo.reaplicar();
  redibujarCruces();
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
  // Si el periodo elegido deja fuera el año que se está leyendo, se pasa al último año del periodo.
  estado.periodo = EC.periodo(document.getElementById("periodo"), estado.datos, estado.datos.años, {
    alCambiar: (desde, hasta) => {
      const año = estado.datos.años[estado.indice];
      if (año >= desde && año <= hasta) return;
      estado.indice = Math.max(0, Math.min(estado.datos.años.length - 1, hasta - estado.datos.años[0]));
      if (estado.marcar.g1) redibujarCruces();
    },
  });

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

  pintar();
  pintarFicha();
  pintarAcontecimientos();
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
