// Cuentas en limpio: prototipo del gráfico de ingresos y gastos con Apache ECharts (zoom, periodo, legislaturas y
// acontecimientos). Mismos datos que cuentas.html (datos/aapp.json); se carga después de comun.js.
"use strict";

const estado = { datos: null, unidad: "pib", grafico: null, legislatura: null };

const css = (nombre) => getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();

// Posición de una fecha en el eje: el año más la fracción del año transcurrida. Cada dato anual va en el 1 de enero
// de su año, como en el resto de la web.
function posicion(iso) {
  const a = Number(iso.slice(0, 4));
  const dias = (Date.UTC(a + 1, 0, 1) - Date.UTC(a, 0, 1)) / 864e5;
  return a + (Date.parse(iso) - Date.UTC(a, 0, 1)) / 864e5 / dias;
}

const escapar = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// Legislaturas recortadas al periodo con datos, con su fin (el inicio de la siguiente).
function legislaturas() {
  const d = estado.datos;
  const min = d.años[0], max = d.años.at(-1);
  return d.legislaturas
    .map((l, k, todas) => ({
      nombre: l.nombre,
      inicio: l.inicio,
      desde: Math.max(min, posicion(l.inicio)),
      hasta: Math.min(max, k + 1 < todas.length ? posicion(todas[k + 1].inicio) : Infinity),
    }))
    .filter((l) => l.hasta > l.desde);
}

function opciones() {
  const d = estado.datos;
  const u = UNIDADES[estado.unidad];
  const serie = (clave) => d.años.map((a, i) => {
    const v = d.series[clave][estado.unidad][i];
    return [a, v === null ? null : v * u.escala];
  });
  const ingresos = serie("ingresos"), gastos = serie("gastos");
  const fuente = getComputedStyle(document.body).fontFamily;
  const tinta = css("--tinta"), suave = css("--tinta-suave"), linea = css("--linea");
  const decimales = estado.unidad === "habitante" ? 0 : 1;

  // Hueco entre las dos líneas: un polígono que va por los ingresos y vuelve por los gastos.
  const contorno = [...ingresos, ...[...gastos].reverse()].filter(([, v]) => v !== null);

  const franjas = legislaturas().map((l, k) => [
    {
      name: l.nombre,
      xAxis: l.desde,
      itemStyle: { color: l.nombre === estado.legislatura ? css("--acento-tenue") : k % 2 ? "rgba(0,0,0,0)" : css("--franja") },
      label: { color: l.nombre === estado.legislatura ? css("--acento") : suave, fontWeight: l.nombre === estado.legislatura ? 600 : 400 },
    },
    { xAxis: l.hasta },
  ]);

  // Acontecimientos: líneas numeradas; si dos caen a menos de año y medio, sus números se alternan en dos alturas.
  let anterior = -Infinity, nivel = 0;
  const hitos = d.acontecimientos.lista.map((a, k) => {
    const x = posicion(a.fecha);
    nivel = x - anterior < 1.5 ? 1 - nivel : 0;
    anterior = x;
    return { xAxis: x, name: a.corto, label: { formatter: String(k + 1), distance: [0, 4 + nivel * 20] } };
  });

  return {
    animationDuration: 300,
    textStyle: { fontFamily: fuente, color: suave },
    aria: { enabled: true, label: { description: `Ingresos y gastos de las administraciones públicas en ${texto(u.eje, d.año_base_constantes)}, de ${d.años[0]} a ${d.años.at(-1)}.` } },
    grid: { left: 8, right: 16, top: 56, bottom: 64, containLabel: true },
    xAxis: {
      type: "value",
      min: d.años[0],
      max: d.años.at(-1),
      minInterval: 1,
      axisLine: { lineStyle: { color: css("--linea-fuerte") } },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { color: suave, formatter: (v) => (Number.isInteger(v) ? String(v) : ""), hideOverlap: true },
      axisPointer: { label: { show: false } },
    },
    yAxis: {
      type: "value",
      min: 0,
      name: texto(u.eje, d.año_base_constantes),
      nameLocation: "end",
      nameGap: 40,
      nameTextStyle: { color: suave, align: "left", fontSize: 12 },
      splitNumber: 4,
      axisLabel: { color: suave, formatter: (v) => numero(v, 0) },
      splitLine: { lineStyle: { color: linea } },
    },
    tooltip: {
      trigger: "axis",
      className: "tooltip-ec",
      borderWidth: 0,
      padding: 0,
      backgroundColor: "transparent",
      extraCssText: "box-shadow: none;",
      axisPointer: { type: "line", lineStyle: { color: suave, width: 1 } },
      formatter: (params) => {
        const i = d.años.indexOf(Math.round(params[0].axisValue));
        if (i < 0) return "";
        const ing = d.series.ingresos[estado.unidad][i], gas = d.series.gastos[estado.unidad][i];
        const saldo = (ing - gas) * u.escala;
        const prov = d.series.ingresos.provisional[estado.unidad][i] || d.series.gastos.provisional[estado.unidad][i];
        const leg = legislaturas().filter((l) => l.desde < d.años[i] + 1 && l.hasta > d.años[i]).map((l) => l.nombre);
        const fila = (clase, nombre, valor) =>
          `<div class="tt-fila"><span class="clave-linea ${clase}"></span><span>${nombre}</span><strong>${escapar(valor)}</strong></div>`;
        return `<div class="tt">
          <div class="tt-año">${d.años[i]}${prov ? " · provisional" : ""}</div>
          ${fila("ingresos", "Ingresos", formatear(ing, estado.unidad))}
          ${fila("gastos", "Gastos", formatear(gas, estado.unidad))}
          <div class="tt-fila tt-saldo"><span></span><span>${saldo < 0 ? "Déficit" : "Superávit"}</span><strong>${escapar(formatear(Math.abs(saldo) / u.escala, estado.unidad))}</strong></div>
          <div class="tt-nota">Legislatura ${escapar(leg.join(" y ")) || "—"}</div>
        </div>`;
      },
    },
    dataZoom: [
      { type: "inside", xAxisIndex: 0, filterMode: "none", minValueSpan: 3, zoomOnMouseWheel: "ctrl", moveOnMouseWheel: false, moveOnMouseMove: true },
      {
        type: "slider", xAxisIndex: 0, filterMode: "none", minValueSpan: 3, height: 26, bottom: 12,
        borderColor: linea, fillerColor: "rgba(138,90,18,0.12)", backgroundColor: css("--superficie"),
        handleStyle: { color: css("--superficie"), borderColor: css("--acento") },
        moveHandleStyle: { color: css("--acento-tenue") },
        dataBackground: { lineStyle: { color: css("--linea-fuerte") }, areaStyle: { color: css("--nota") } },
        selectedDataBackground: { lineStyle: { color: css("--acento") }, areaStyle: { color: css("--acento-tenue") } },
        textStyle: { color: suave },
        labelFormatter: (v) => String(Math.round(v)),
      },
    ],
    series: [
      {
        id: "ingresos", name: "Ingresos", type: "line", data: ingresos, symbol: "circle", symbolSize: 8, showSymbol: false,
        lineStyle: { width: 2, color: css("--serie-ingresos") }, itemStyle: { color: css("--serie-ingresos"), borderColor: css("--superficie"), borderWidth: 2 },
        emphasis: { disabled: true },
        markLine: {
          silent: true, symbol: "none",
          lineStyle: { color: tinta, type: [3, 3], width: 1 },
          label: {
            position: "end", color: css("--superficie"), backgroundColor: tinta, borderRadius: 9,
            width: 18, height: 18, lineHeight: 18, align: "center", fontSize: 11, fontWeight: 600, padding: 0,
          },
          data: hitos,
        },
      },
      {
        id: "gastos", name: "Gastos", type: "line", data: gastos, symbol: "circle", symbolSize: 8, showSymbol: false,
        lineStyle: { width: 2, color: css("--serie-gastos") }, itemStyle: { color: css("--serie-gastos"), borderColor: css("--superficie"), borderWidth: 2 },
        emphasis: { disabled: true },
      },
      {
        id: "base", type: "line", data: [], silent: true, z: 1, tooltip: { show: false },
        markArea: { silent: true, label: { position: "insideBottom", fontSize: 11, distance: 6 }, data: franjas },
      },
      {
        id: "hueco", type: "custom", data: [0], silent: true, clip: true, z: 1, tooltip: { show: false },
        renderItem: (_params, api) => ({
          type: "polygon",
          shape: { points: contorno.map((p) => api.coord(p)) },
          style: { fill: css("--hueco") },
        }),
      },
    ],
  };
}

// ---- Periodo: botones, legislatura, acontecimiento y años, todos sobre el mismo zoom ----

function acercar(desde, hasta) {
  const d = estado.datos;
  desde = Math.max(d.años[0], desde);
  hasta = Math.min(d.años.at(-1), hasta);
  estado.grafico.dispatchAction({ type: "dataZoom", startValue: desde, endValue: hasta });
}

function periodoActual() {
  const d = estado.datos;
  const z = estado.grafico.getOption().dataZoom[0];
  const min = d.años[0], max = d.años.at(-1);
  return [min + ((max - min) * z.start) / 100, min + ((max - min) * z.end) / 100];
}

function sincronizarAños() {
  const [desde, hasta] = periodoActual();
  document.getElementById("filtro-desde").value = String(Math.ceil(desde - 1e-6));
  document.getElementById("filtro-hasta").value = String(Math.floor(hasta + 1e-6));
}

function soltarBotones(salvo = null) {
  for (const b of document.querySelectorAll("[data-periodo]")) b.setAttribute("aria-pressed", String(b === salvo));
}

function marcarLegislatura(nombre) {
  estado.legislatura = nombre || null;
  estado.grafico.setOption({ series: [{ id: "base", markArea: { data: opciones().series.find((x) => x.id === "base").markArea.data } }] });
}

function montarFiltros() {
  const d = estado.datos;
  const selLeg = document.getElementById("filtro-legislatura");
  const todas = legislaturas();
  todas.forEach((l, k) => { l.fin = k + 1 < todas.length ? todas[k + 1].inicio.slice(0, 4) : null; });
  for (const l of [...todas].reverse()) {
    const o = document.createElement("option");
    o.value = l.nombre;
    o.textContent = l.fin ? `${l.nombre} (${l.inicio.slice(0, 4)}–${l.fin})` : `${l.nombre} (desde ${l.inicio.slice(0, 4)})`;
    selLeg.appendChild(o);
  }
  const selAc = document.getElementById("filtro-acontecimiento");
  d.acontecimientos.lista.forEach((a, k) => {
    const o = document.createElement("option");
    o.value = String(k);
    o.textContent = `${k + 1}. ${a.corto} (${new Date(a.fecha).getFullYear()})`;
    selAc.appendChild(o);
  });
  for (const id of ["filtro-desde", "filtro-hasta"]) {
    const sel = document.getElementById(id);
    for (const a of d.años) {
      const o = document.createElement("option");
      o.value = String(a);
      o.textContent = a;
      sel.appendChild(o);
    }
  }

  for (const b of document.querySelectorAll("[data-periodo]")) {
    b.addEventListener("click", () => {
      soltarBotones(b);
      selLeg.value = "";
      selAc.value = "";
      marcarLegislatura(null);
      const max = d.años.at(-1);
      if (b.dataset.periodo === "todo") acercar(d.años[0], max);
      else if (b.dataset.periodo === "10") acercar(max - 10, max);
      else acercar(Number(b.dataset.periodo), max);
    });
  }
  // Una legislatura: del año anterior a su inicio al año en que acabó, para ver de dónde se partía.
  selLeg.addEventListener("change", () => {
    soltarBotones();
    selAc.value = "";
    const l = legislaturas().find((x) => x.nombre === selLeg.value);
    marcarLegislatura(l ? l.nombre : null);
    if (l) acercar(Math.floor(l.desde) - 1, Math.ceil(l.hasta));
    else acercar(d.años[0], d.años.at(-1));
  });
  // Un acontecimiento: tres años antes y tres después.
  selAc.addEventListener("change", () => {
    soltarBotones();
    selLeg.value = "";
    marcarLegislatura(null);
    if (selAc.value === "") return acercar(d.años[0], d.años.at(-1));
    const x = posicion(d.acontecimientos.lista[Number(selAc.value)].fecha);
    acercar(Math.floor(x) - 3, Math.floor(x) + 3);
  });
  const porAños = () => {
    soltarBotones();
    selLeg.value = "";
    selAc.value = "";
    marcarLegislatura(null);
    let desde = Number(document.getElementById("filtro-desde").value);
    let hasta = Number(document.getElementById("filtro-hasta").value);
    if (hasta - desde < 3) {
      if (desde + 3 <= d.años.at(-1)) hasta = desde + 3;
      else desde = hasta - 3;
    }
    acercar(desde, hasta);
  };
  document.getElementById("filtro-desde").addEventListener("change", porAños);
  document.getElementById("filtro-hasta").addEventListener("change", porAños);
  estado.grafico.on("datazoom", () => { estado.grafico.dispatchAction({ type: "hideTip" }); sincronizarAños(); });
  sincronizarAños();
}

// ---- Textos que acompañan al gráfico ----

function pintarUnidad() {
  const un = UNIDADES[estado.unidad];
  const p = document.getElementById("unidad-explicada");
  p.textContent = "";
  const t = document.createElement("span");
  t.className = `etiqueta-tipo ${un.tipo}`;
  t.textContent = un.tipo;
  p.appendChild(t);
  p.appendChild(document.createTextNode(" " + texto(un.explica, estado.datos.año_base_constantes)));
}

function pintarFuente() {
  const d = estado.datos;
  const porTabla = Object.fromEntries(d.fuentes.map((f) => [f.tabla, f]));
  const p = document.getElementById("p1-fuente");
  const enlace = (f, textoEnlace) => {
    const a = document.createElement("a");
    a.href = f.url_navegador;
    a.textContent = textoEnlace;
    return a;
  };
  const f = porTabla.gov_10a_main;
  p.textContent = "Fuente: Eurostat, ";
  p.appendChild(enlace(f, f.nombre.charAt(0).toLowerCase() + f.nombre.slice(1)));
  p.appendChild(document.createTextNode(` (tabla gov_10a_main, actualizada el ${fecha(f.actualizado_fuente)})`));
  const extra = { constantes: ["nama_10_gdp", "deflactor del PIB"], habitante: ["nama_10_pe", "población media"] }[estado.unidad];
  if (extra) {
    const g = porTabla[extra[0]];
    p.appendChild(document.createTextNode(" y "));
    p.appendChild(enlace(g, extra[1]));
    p.appendChild(document.createTextNode(` (tabla ${extra[0]}, actualizada el ${fecha(g.actualizado_fuente)})`));
  }
  p.appendChild(document.createTextNode(". Legislaturas: Congreso de los Diputados. Acontecimientos: la fuente de cada uno, en la lista. "));
  const t = document.createElement("span");
  t.className = `etiqueta-tipo ${UNIDADES[estado.unidad].tipo}`;
  t.textContent = UNIDADES[estado.unidad].tipo;
  p.appendChild(t);
}

function pintarAcontecimientos() {
  const a = estado.datos.acontecimientos;
  const c = document.getElementById("acontecimientos");
  c.textContent = "";
  const titulo = document.createElement("p");
  const b = document.createElement("strong");
  b.textContent = "Acontecimientos marcados en el gráfico. ";
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

function cambiarUnidad(unidad) {
  estado.unidad = unidad;
  for (const b of document.querySelectorAll("[data-unidad]")) b.setAttribute("aria-pressed", String(b.dataset.unidad === unidad));
  // Cambiar de unidad no mueve el periodo elegido.
  const [desde, hasta] = periodoActual();
  estado.grafico.setOption(opciones(), { replaceMerge: ["series"] });
  acercar(desde, hasta);
  pintarUnidad();
  pintarFuente();
}

async function iniciar() {
  const r = await fetch("datos/aapp.json");
  estado.datos = await r.json();
  const contenedor = document.getElementById("p1");
  estado.grafico = echarts.init(contenedor, null, { renderer: "canvas" });
  estado.grafico.setOption(opciones());
  pintarUnidad();
  pintarFuente();
  pintarAcontecimientos();
  montarFiltros();
  for (const b of document.querySelectorAll("[data-unidad]")) b.addEventListener("click", () => cambiarUnidad(b.dataset.unidad));
  new ResizeObserver(() => estado.grafico.resize()).observe(contenedor);
}

document.addEventListener("DOMContentLoaded", iniciar);
