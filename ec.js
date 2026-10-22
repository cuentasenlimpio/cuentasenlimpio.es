// Cuentas en limpio: piezas comunes de los gráficos hechos con Apache ECharts (lib/echarts). Se carga después de
// comun.js y antes del script de cada página.
//
// Dos clases de gráfico en el tiempo, con la misma regla para las fechas:
//  - de líneas: cada dato anual va en el 1 de enero de su año (el eje va de 1995 a 2025);
//  - de barras: cada año ocupa su banda, centrada en el año (de 1994,5 a 2025,5): `desplazamiento: -0.5`.
// Una fecha cae en su año más la fracción del año transcurrida, más el desplazamiento.
"use strict";

const EC = (() => {
  const css = (nombre) => getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
  const letra = () => getComputedStyle(document.body).fontFamily;

  function posicion(iso, desplazamiento = 0) {
    const a = Number(iso.slice(0, 4));
    const dias = (Date.UTC(a + 1, 0, 1) - Date.UTC(a, 0, 1)) / 864e5;
    return a + (Date.parse(iso) - Date.UTC(a, 0, 1)) / 864e5 / dias + desplazamiento;
  }

  // Legislaturas con su tramo en el eje, recortadas a [min, max]. `fin` es el año en que acabó (null si sigue).
  function legislaturas(lista, min, max, desplazamiento = 0) {
    return lista
      .map((l, k) => ({
        nombre: l.nombre,
        inicio: l.inicio,
        fin: k + 1 < lista.length ? lista[k + 1].inicio : null,
        desde: Math.max(min, posicion(l.inicio, desplazamiento)),
        hasta: Math.min(max, k + 1 < lista.length ? posicion(lista[k + 1].inicio, desplazamiento) : Infinity),
      }))
      .filter((l) => l.hasta > l.desde);
  }

  // Serie sin datos que lleva las marcas: franjas de legislaturas y líneas numeradas de los acontecimientos.
  // `capas` elige qué se dibuja; los nombramientos de Presidentes del Gobierno (BOE) van apagados salvo que se pidan.
  function marcas(d, { min, max, desplazamiento = 0, resaltada = null, numeros = true,
    capas = { legislaturas: true, acontecimientos: true, gobiernos: false } }) {
    const franjas = (capas.legislaturas ? legislaturas(d.legislaturas, min, max, desplazamiento) : []).map((l, k) => {
      const esta = l.nombre === resaltada;
      return [
        {
          name: l.nombre,
          xAxis: l.desde,
          itemStyle: { color: esta ? css("--acento-tenue") : k % 2 ? "transparent" : css("--franja") },
          label: { color: esta ? css("--acento") : css("--tinta-suave"), fontWeight: esta ? 600 : 400 },
        },
        { xAxis: l.hasta },
      ];
    });
    // Si dos acontecimientos caen a menos de año y medio, sus números se alternan en dos alturas.
    let anterior = -Infinity, nivel = 0;
    const hitos = [];
    d.acontecimientos.lista.forEach((a, k) => {
      const x = posicion(a.fecha, desplazamiento);
      if (!capas.acontecimientos || x < min || x > max) return;
      nivel = x - anterior < 1.5 ? 1 - nivel : 0;
      anterior = x;
      hitos.push({ xAxis: x, name: a.corto, label: { formatter: String(k + 1), distance: [0, 22 + nivel * 20] } });
    });
    const tinta = css("--tinta");
    // Nombramientos: línea gris de puntos; el nombre solo en el primero de cada persona, para no amontonar.
    const suave = css("--tinta-suave");
    let quien = null;
    for (const n of capas.gobiernos && d.gobiernos ? d.gobiernos.lista : []) {
      const x = posicion(n.fecha, desplazamiento);
      const nuevo = n.persona !== quien;
      quien = n.persona;
      if (x < min || x > max) continue;
      hitos.push({
        xAxis: x, name: n.corto,
        lineStyle: { color: css("--linea-fuerte"), type: [2, 3], width: 1 },
        // Con las legislaturas a la vista, los nombres se pisarían: entonces solo la línea (los nombres van en la nota).
        label: nuevo && !capas.legislaturas
          ? { show: true, formatter: n.corto, position: "insideEndTop", color: suave, backgroundColor: "transparent",
            width: null, height: null, fontSize: 11, fontWeight: 400, padding: [0, 0, 2, 0] }
          : { show: false },
      });
    }
    return {
      id: "marcas", type: "line", data: [], silent: true, z: 1,
      // Los nombres de las legislaturas, encima del área del gráfico (fuera de las barras y las líneas); si no caben,
      // se ocultan los que se pisan.
      labelLayout: { hideOverlap: true },
      markArea: { silent: true, label: { position: "top", fontSize: 11, distance: 4 }, data: franjas },
      markLine: {
        silent: true, symbol: "none", animation: false,
        lineStyle: { color: tinta, type: [3, 3], width: 1 },
        label: numeros
          ? { position: "end", color: css("--superficie"), backgroundColor: tinta, borderRadius: 9, width: 18, height: 18,
            lineHeight: 18, align: "center", fontSize: 11, fontWeight: 600, padding: 0 }
          : { show: false },
        data: hitos,
      },
    };
  }

  // Opciones comunes de un gráfico en el tiempo. `slider`: barra de zoom debajo; `marcasArriba`: sitio para los
  // números de los acontecimientos.
  function tiempo({ min, max, aria, slider = true, marcasArriba = true, zoom = true, silueta = true }) {
    const suave = css("--tinta-suave"), linea = css("--linea");
    // En el móvil, sin barra de zoom: sus asas no se pueden usar con el dedo. Para acotar años están los botones de periodo.
    if (slider && matchMedia("(max-width: 40rem)").matches) slider = false;
    const dataZoom = [{
      type: "inside", xAxisIndex: 0, filterMode: "none", minValueSpan: 3, disabled: !zoom,
      zoomOnMouseWheel: "ctrl", moveOnMouseWheel: false, moveOnMouseMove: false,
    }];
    if (slider) {
      dataZoom.push({
        type: "slider", xAxisIndex: 0, filterMode: "none", minValueSpan: 3, height: 26, bottom: 8, showDataShadow: silueta, handleSize: "130%", brushSelect: false,
        borderColor: linea, fillerColor: css("--relleno-zoom"), backgroundColor: css("--superficie"),
        handleStyle: { color: css("--superficie"), borderColor: css("--acento") },
        moveHandleStyle: { color: css("--acento-tenue") },
        dataBackground: { lineStyle: { color: css("--linea-fuerte") }, areaStyle: { color: css("--nota") } },
        selectedDataBackground: { lineStyle: { color: css("--acento") }, areaStyle: { color: css("--acento-tenue") } },
        textStyle: { color: suave, fontSize: 11 },
        labelFormatter: (v) => String(Math.round(v)),
      });
    }
    return {
      animationDuration: 250,
      animationDurationUpdate: 250,
      textStyle: { fontFamily: letra(), color: suave },
      aria: { enabled: true, label: { description: aria } },
      grid: { left: 4, right: 14, top: marcasArriba ? 84 : 16, bottom: slider ? 54 : 8, containLabel: true },
      xAxis: {
        type: "value", min, max, minInterval: 1,
        axisLine: { lineStyle: { color: css("--linea-fuerte") } },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { color: suave, formatter: (v) => (Number.isInteger(v) ? String(v) : ""), hideOverlap: true },
        axisPointer: {
          show: true, type: "line", snap: false, status: "show", label: { show: false },
          lineStyle: { color: suave, width: 1, type: "solid" },
        },
      },
      tooltip: { trigger: "axis", showContent: false },
      dataZoom,
    };
  }

  function ejeY({ nombre, formato, min, max, splitNumber = 4 }) {
    const suave = css("--tinta-suave");
    return {
      type: "value", min, max, splitNumber,
      name: nombre, nameLocation: "end", nameGap: 66,
      nameTextStyle: { color: suave, align: "left", fontSize: 12 },
      axisLabel: { color: suave, formatter: formato },
      splitLine: { lineStyle: { color: css("--linea") } },
    };
  }

  function linea(id, datos, color, extra = {}) {
    return {
      id, type: "line", data: datos, symbol: "none", z: 3, silent: true,
      itemStyle: { color }, emphasis: { disabled: true }, ...extra,
      // Línea gruesa con extremos y uniones redondeadas (estilo de la web desde el 22/10/2026)
      lineStyle: { width: 3, color, cap: "round", join: "round", ...(extra.lineStyle || {}) },
    };
  }

  // Punto del año elegido sobre cada línea: borde del color de la superficie, como en el resto de la web.
  function puntos(id, puntosXY, colores) {
    return {
      id, type: "scatter", silent: true, z: 4, symbolSize: 11, animation: false,
      // Punto hueco: relleno de la superficie y borde del color de su línea
      data: puntosXY.map((p, k) => ({ value: p, itemStyle: { color: css("--superficie"), borderColor: colores[k], borderWidth: 2.5 } })),
    };
  }

  // Crea el gráfico en `contenedor` con la altura dada, y lo redimensiona con su caja.
  function crear(contenedor, alto) {
    contenedor.style.height = `${alto}px`;
    const g = echarts.init(contenedor, null, { renderer: "canvas" });
    let ancho = contenedor.clientWidth;
    new ResizeObserver(() => {
      if (contenedor.clientWidth === ancho) return g.resize();
      ancho = contenedor.clientWidth;
      g.resize();
      contenedor.dispatchEvent(new CustomEvent("cambio-ancho"));
    }).observe(contenedor);
    return g;
  }

  // Año bajo el puntero (al pasar el ratón o el dedo): llama a `alElegir(x)` con la posición en el eje.
  function alPasar(g, alElegir) {
    let ultimo = null;
    g.on("updateAxisPointer", (e) => {
      const eje = (e.axesInfo || []).find((a) => a.axisDim === "x");
      if (!eje || eje.value === ultimo) return;
      ultimo = eje.value;
      alElegir(eje.value);
    });
  }

  // Deja la línea vertical fija en `x` (el año elegido), también cuando el puntero sale del gráfico.
  function fijar(g, x) {
    g.setOption({ xAxis: { axisPointer: { value: x, status: "show" } } });
  }

  // ---- Periodo: botones, legislatura, acontecimiento y años, sobre el zoom de todos los gráficos sumados ----
  // `raiz` es un contenedor vacío; `años` son los años con datos de la página.
  // `hasta`: el eje puede seguir después del último año con datos (previsiones).
  function periodo(raiz, d, años, { desde2007 = true, alCambiar = () => {}, alResaltar = () => {}, hasta } = {}) {
    const graficos = [];
    let resaltada = null, moviendo = false;
    const min = años[0], max = hasta ?? años.at(-1);

    const crearEl = (tipo, props = {}, padre = raiz) => {
      const e = document.createElement(tipo);
      Object.assign(e, props);
      padre.appendChild(e);
      return e;
    };
    raiz.classList.add("filtros");
    raiz.setAttribute("role", "group");
    raiz.setAttribute("aria-label", "Periodo de los gráficos");
    const botones = crearEl("div", { className: "selector" });
    botones.setAttribute("role", "group");
    botones.setAttribute("aria-label", "Periodos rápidos");
    crearEl("span", { className: "selector-etiqueta", textContent: "Periodo" }, botones);
    const rapidos = [["todo", "Todo"], ["10", "Últimos 10 años"]].concat(desde2007 && min < 2007 ? [["2007", "Desde 2007"]] : [])
      .concat(max > años.at(-1) ? [["recientes", "Recientes y previsiones"]] : []);
    for (const [v, t] of rapidos) {
      const b = crearEl("button", { type: "button", textContent: t }, botones);
      b.dataset.periodo = v;
      b.setAttribute("aria-pressed", String(v === "todo"));
    }
    const etiqueta = (texto) => crearEl("label", { className: "filtro", textContent: `${texto} ` });
    const selLeg = crearEl("select", {}, etiqueta("Legislatura"));
    crearEl("option", { value: "", textContent: "Todas" }, selLeg);
    const legs = legislaturas(d.legislaturas, min, max);
    for (const l of [...legs].reverse()) {
      const t = l.fin ? `${l.nombre} (${l.inicio.slice(0, 4)}–${l.fin.slice(0, 4)})` : `${l.nombre} (desde ${l.inicio.slice(0, 4)})`;
      crearEl("option", { value: l.nombre, textContent: t }, selLeg);
    }
    const selAc = crearEl("select", {}, etiqueta("Acontecimiento"));
    crearEl("option", { value: "", textContent: "Ninguno" }, selAc);
    d.acontecimientos.lista.forEach((a, k) => {
      const año = Number(a.fecha.slice(0, 4));
      if (año >= min && año <= max) crearEl("option", { value: String(k), textContent: `${k + 1}. ${a.corto} (${año})` }, selAc);
    });
    const anos = crearEl("span", { className: "filtro" });
    const selDesde = crearEl("select", { id: `${raiz.id}-desde` });
    const selHasta = crearEl("select", { id: `${raiz.id}-hasta` });
    crearEl("label", { htmlFor: selDesde.id, textContent: "De" }, anos);
    anos.appendChild(selDesde);
    crearEl("label", { htmlFor: selHasta.id, textContent: "a" }, anos);
    anos.appendChild(selHasta);
    const todos = [...años];
    for (let a = años.at(-1) + 1; a <= max; a++) todos.push(a);
    for (const s of [selDesde, selHasta]) for (const a of todos) crearEl("option", { value: String(a), textContent: a }, s);
    selDesde.value = String(min);
    selHasta.value = String(max);

    // Aplica [desde, hasta] (en años) a todos los gráficos, cada uno con su desplazamiento.
    function aplicar(desde, hasta, salvo = null) {
      desde = Math.max(min, desde);
      hasta = Math.min(max, hasta);
      moviendo = true;
      for (const x of graficos) {
        if (x.g === salvo) continue;
        x.g.dispatchAction({ type: "dataZoom", startValue: desde + x.desplazamiento, endValue: hasta - x.desplazamiento });
      }
      moviendo = false;
      selDesde.value = String(Math.round(desde));
      selHasta.value = String(Math.round(hasta));
      alCambiar(Math.ceil(desde - 1e-6), Math.floor(hasta + 1e-6));
    }
    function resaltar(nombre) {
      resaltada = nombre || null;
      alResaltar(resaltada);
      for (const x of graficos) if (x.marcas) x.g.setOption({ series: [marcas(d, { ...x.marcas, resaltada })] });
    }
    const soltar = (salvo = null) => {
      for (const b of botones.querySelectorAll("[data-periodo]")) b.setAttribute("aria-pressed", String(b === salvo));
    };

    for (const b of botones.querySelectorAll("[data-periodo]")) {
      b.addEventListener("click", () => {
        soltar(b);
        selLeg.value = "";
        selAc.value = "";
        resaltar(null);
        const p = b.dataset.periodo;
        aplicar(p === "todo" ? min : p === "10" ? años.at(-1) - 10 : p === "recientes" ? años.at(-1) - 6 : Number(p), max);
      });
    }
    // Una legislatura: del año anterior a su inicio al año en que acabó, para ver de dónde se partía.
    selLeg.addEventListener("change", () => {
      soltar();
      selAc.value = "";
      const l = legs.find((x) => x.nombre === selLeg.value);
      resaltar(l ? l.nombre : null);
      if (l) aplicar(Math.floor(l.desde) - 1, Math.ceil(l.hasta));
      else aplicar(min, max);
    });
    // Un acontecimiento: tres años antes y tres después.
    selAc.addEventListener("change", () => {
      soltar();
      selLeg.value = "";
      resaltar(null);
      if (selAc.value === "") return aplicar(min, max);
      const año = Number(d.acontecimientos.lista[Number(selAc.value)].fecha.slice(0, 4));
      aplicar(año - 3, año + 3);
    });
    const porAños = () => {
      soltar();
      selLeg.value = "";
      selAc.value = "";
      resaltar(null);
      let desde = Number(selDesde.value), hasta = Number(selHasta.value);
      if (desde > hasta) [desde, hasta] = [hasta, desde];
      if (hasta - desde < 3) {
        if (desde + 3 <= max) hasta = desde + 3;
        else desde = hasta - 3;
      }
      aplicar(desde, hasta);
    };
    selDesde.addEventListener("change", porAños);
    selHasta.addEventListener("change", porAños);

    return {
      // `marcas`: los mismos parámetros con que el gráfico pintó sus marcas, para volver a pintarlas al resaltar.
      sumar(g, { desplazamiento = 0, ejeMin, ejeMax, marcas: m = null }) {
        const x = { g, desplazamiento, marcas: m };
        graficos.push(x);
        // Si alguien mueve la barra de zoom de un gráfico, los demás y los desplegables le siguen.
        g.on("datazoom", () => {
          if (moviendo) return;
          const z = g.getOption().dataZoom[0];
          const desde = ejeMin + ((ejeMax - ejeMin) * z.start) / 100 - desplazamiento;
          const hasta = ejeMin + ((ejeMax - ejeMin) * z.end) / 100 + desplazamiento;
          soltar();
          selLeg.value = "";
          selAc.value = "";
          if (resaltada) resaltar(null);
          aplicar(desde, hasta, g);
        });
      },
      // Para repintar un gráfico (al cambiar de unidad) sin perder el periodo elegido.
      rango() {
        return [Number(selDesde.value), Number(selHasta.value)];
      },
      resaltada: () => resaltada,
      reaplicar() {
        const [desde, hasta] = this.rango();
        aplicar(desde, hasta);
      },
    };
  }

  // ---- Líneas sencillas con lectura al pasar el puntero (las páginas que antes dibujaban su SVG a mano) ----
  // `x`: posiciones en el eje (años; trimestres y meses como fracción del año, o índices si `etiquetaEje` las nombra);
  // `etiquetas`: lo que se lee de cada posición; `series`: [{nombre, v (alineada con x), color («--variable» o color),
  // ancho, discontinua}; con `soloLectura` y su `formato`, la serie no se dibuja y solo sale en la lectura (por ejemplo, los
  // euros junto al % del PIB)]; `referencias`: líneas horizontales [{y, color, nombre}]. La lectura va debajo del gráfico.
  const colorDe = (c) => (c && c.startsWith("--") ? css(c) : c);
  function lectura(caja) {
    let l = caja.nextElementSibling;
    if (!l || !l.classList.contains("lectura-año")) {
      l = document.createElement("div");
      l.className = "lectura-año";
      l.setAttribute("aria-live", "polite");
      caja.after(l);
    }
    return l;
  }
  function clave(s) {
    const k = document.createElement("span");
    k.className = "clave-linea";
    k.style.borderColor = colorDe(s.color);
    if (s.discontinua) k.style.borderTopStyle = "dashed";
    return k;
  }
  function lineas(caja, { x, etiquetas, series, formato, formatoLectura = formato, eje = "", min = null, alto = 300, cero = false,
    referencias = [], slider = x.length > 16, etiquetaEje = null, aria = "" }) {
    if (!caja.cuentasGrafico) { caja.textContent = ""; caja.cuentasGrafico = crear(caja, alto); }
    const g = caja.cuentasGrafico;
    const xmin = etiquetaEje ? x[0] : Math.floor(x[0]), xmax = etiquetaEje ? x.at(-1) : Math.ceil(x.at(-1));
    const op = tiempo({ min: xmin, max: xmax, marcasArriba: false, slider, zoom: slider, aria: aria || caja.getAttribute("aria-label") || "" });
    op.grid.top = 28;
    if (etiquetaEje) op.xAxis.axisLabel.formatter = (v) => (Number.isInteger(v) ? etiquetaEje(v) : "");
    op.yAxis = ejeY({ nombre: eje, formato, min: min ?? undefined });
    op.yAxis.scale = min === null;
    op.series = series.filter((s) => !s.soloLectura).map((s, k) => linea(`s${k}`, x.map((xx, i) => [xx, s.v[i] ?? null]), colorDe(s.color),
      { connectNulls: false, lineStyle: { width: s.ancho ?? 3, type: s.discontinua ? [6, 5] : "solid" } }));
    const horizontales = [
      ...(cero ? [{ yAxis: 0, lineStyle: { color: css("--linea-fuerte"), type: "solid", width: 1 } }] : []),
      ...referencias.map((r) => ({ yAxis: r.y, lineStyle: { color: colorDe(r.color), type: "solid", width: 1.5 },
        label: { show: Boolean(r.nombre), formatter: r.nombre, position: "insideEndTop", color: colorDe(r.color), fontSize: 11 } })),
    ];
    if (horizontales.length) {
      op.series.push({ type: "line", data: [], silent: true, markLine: { silent: true, symbol: "none", label: { show: false }, data: horizontales } });
    }
    g.setOption(op, { notMerge: true });
    const caja2 = lectura(caja);
    g.cuentasLeer = (pos) => {
      let i = 0;
      x.forEach((xx, k) => { if (Math.abs(xx - pos) < Math.abs(x[i] - pos)) i = k; });
      caja2.textContent = "";
      const a = document.createElement("strong");
      a.className = "lectura-anio";
      a.textContent = etiquetas[i];
      caja2.appendChild(a);
      for (const s of series) {
        const v = s.v[i];
        if (v === null || v === undefined) continue;
        const f = document.createElement("span");
        f.className = "lectura-fila";
        const b = document.createElement("b");
        b.textContent = (s.formato || formatoLectura)(v);
        if (s.soloLectura) f.append(b, ` ${s.nombre}`);
        else f.append(clave(s), " ", b, ` ${s.nombre}`);
        caja2.appendChild(f);
      }
    };
    if (!g.cuentasLectura) {
      g.cuentasLectura = true;
      alPasar(g, (pos) => g.cuentasLeer(pos));
    }
    // Al empezar, la lectura muestra la última posición con dato de la serie principal (la última de la lista)
    const principal = series.filter((s) => !s.soloLectura).at(-1);
    const k0 = principal ? principal.v.map((v) => v !== null && v !== undefined).lastIndexOf(true) : -1;
    g.cuentasLeer(x[k0 >= 0 ? k0 : x.length - 1]);
  }

  // Barras agrupadas por año (una barra por serie), con la misma lectura que las líneas.
  // `min`: 0 por defecto; null deja que el eje baje de cero (series con valores negativos).
  function barras(caja, { años, series, formato, formatoLectura = formato, eje = "", alto = 300, aria = "", min = 0 }) {
    if (!caja.cuentasGrafico) { caja.textContent = ""; caja.cuentasGrafico = crear(caja, alto); }
    const g = caja.cuentasGrafico;
    const op = tiempo({ min: años[0] - 0.5, max: años.at(-1) + 0.5, marcasArriba: false, slider: false, zoom: false,
      aria: aria || caja.getAttribute("aria-label") || "" });
    op.grid.top = 28;
    op.yAxis = ejeY({ nombre: eje, formato, min: min ?? undefined });
    op.series = series.map((s, k) => ({
      id: `b${k}`, type: "bar", silent: true, barGap: "12%", barMaxWidth: 34,
      data: años.map((a, i) => ({ value: [a, s.v[i] ?? null], itemStyle: { borderRadius: (s.v[i] ?? 0) < 0 ? [0, 0, 4, 4] : [4, 4, 0, 0] } })),
      itemStyle: { color: colorDe(s.color) },
    }));
    g.setOption(op, { notMerge: true });
    const caja2 = lectura(caja);
    g.cuentasLeer = (pos) => {
      const i = Math.max(0, Math.min(años.length - 1, Math.round(pos) - años[0]));
      caja2.textContent = "";
      const a = document.createElement("strong");
      a.className = "lectura-anio";
      a.textContent = String(años[i]);
      caja2.appendChild(a);
      for (const s of series) {
        if (s.v[i] === null || s.v[i] === undefined) continue;
        const f = document.createElement("span");
        f.className = "lectura-fila";
        const k = document.createElement("span");
        k.className = "clave-barra";
        k.style.background = colorDe(s.color);
        const b = document.createElement("b");
        b.textContent = formatoLectura(s.v[i]);
        f.append(k, " ", b, ` ${s.nombre}`);
        caja2.appendChild(f);
      }
    };
    if (!g.cuentasLectura) {
      g.cuentasLectura = true;
      alPasar(g, (pos) => g.cuentasLeer(pos));
    }
    g.cuentasLeer(años.at(-1));
  }

  // ---- Barras horizontales ordenadas de mayor a menor, con el valor al final de cada barra ----
  // `filas`: [{nombre, valor}]. En pantallas estrechas el nombre va encima de la barra.
  // Ancho en píxeles de un texto con la letra de la página (para que nombres y cifras no se corten).
  const lienzoMedida = document.createElement("canvas").getContext("2d");
  function medir(texto, font) { lienzoMedida.font = font; return lienzoMedida.measureText(texto).width; }

  function barrasH(contenedor, filas, { formato, sufijo = "", ordenar = true }) {
    const fuenteM = letra();
    const anchoNombres = Math.max(...filas.map((f) => medir(f.nombre, `13px ${fuenteM}`)), 0);
    const anchoCifras = Math.max(...filas.map((f) => medir(`${formato(f.valor)}${sufijo}`, `600 13px ${fuenteM}`)), 0);
    // Si los nombres no caben a la izquierda (más del 45 % del ancho), van encima de su barra.
    const estrecho = contenedor.clientWidth < 520 || anchoNombres + 14 > contenedor.clientWidth * 0.45;
    const orden = ordenar ? [...filas].sort((a, b) => b.valor - a.valor) : [...filas];
    // Alto de cada fila: con los nombres encima, tantas líneas como necesite el nombre más el hueco de la barra.
    const W = Math.max(contenedor.clientWidth, 200);
    const lineas = orden.map((f) => (estrecho ? Math.max(1, Math.ceil(medir(f.nombre, `13px ${fuenteM}`) / ((W - 4) * 0.82))) : 1));
    const altos = lineas.map((l) => (estrecho ? 24 + 16 * l : 30));
    const ys = altos.map((_, k) => 6 + altos.slice(0, k).reduce((a, b) => a + b, 0));
    // Para lectores de pantalla: el gráfico es una imagen, así que su nombre lleva todas las partidas con su valor.
    const base = contenedor.dataset.etiqueta || (contenedor.dataset.etiqueta = contenedor.getAttribute("aria-label") || "");
    contenedor.setAttribute("aria-label", `${base}: ${orden.map((f) => `${f.nombre}, ${formato(f.valor)}${sufijo}`).join("; ")}.`);
    const alto = 12 + altos.reduce((a, b) => a + b, 0);
    if (!contenedor.cuentasGrafico) contenedor.cuentasGrafico = crear(contenedor, alto);
    const g = contenedor.cuentasGrafico;
    if (contenedor.style.height !== `${alto}px`) {
      contenedor.style.height = `${alto}px`;
      g.resize();
    }
    const maximo = Math.max(...orden.map((f) => f.valor), 0) || 1;
    const tinta = css("--tinta"), suave = css("--tinta-suave"), relleno = css("--c-primario"), fuente = letra();
    g.setOption({
      animationDurationUpdate: 300,
      aria: { enabled: false },
      series: [{
        type: "custom", coordinateSystem: "none", silent: true,
        data: orden.map((f, k) => [k, f.valor]),
        renderItem: (params, api) => {
          const k = params.dataIndex, f = orden[k];
          const ancho = api.getWidth();
          const izq = estrecho ? 0 : Math.ceil(anchoNombres) + 14, der = Math.ceil(anchoCifras) + 10;
          const y = ys[k], fila = altos[k];
          const yb = estrecho ? y + 2 + 16 * lineas[k] : y + fila / 2 - 7;
          const largo = Math.max(0, (Math.max(f.valor, 0) / maximo) * (ancho - izq - der));
          return {
            type: "group",
            children: [
              { type: "text", x: estrecho ? 0 : izq - 10, y: estrecho ? y + 2 : y + fila / 2,
                style: { text: f.nombre, fill: suave, font: `13px ${fuente}`, lineHeight: 16, align: estrecho ? "left" : "right", verticalAlign: estrecho ? "top" : "middle",
                  ...(estrecho ? { width: ancho - 4, overflow: "break" } : {}) } },
              { type: "rect", shape: { x: izq, y: yb, width: largo, height: 14, r: 7 }, style: { fill: relleno } },
              { type: "text", x: izq + largo + 6, y: yb + 7,
                style: { text: `${formato(f.valor)}${sufijo}`, fill: tinta, font: `600 13px ${fuente}`, verticalAlign: "middle" } },
            ],
          };
        },
      }],
    }, { notMerge: true });
  }

  // ---- Pequeños múltiplos: un gráfico de línea por panel, todos con la misma escala vertical ----
  // Marca el año elegido con un punto y escribe su valor. `periodo` (de EC.periodo) acota todos los paneles a la vez.
  function multiples(contenedor, paneles, años, indice, { formato, unidadEje, periodo = null }) {
    const valores = paneles.flatMap((p) => p.valores).filter((v) => v !== null && v !== undefined);
    // Si hay valores negativos (por ejemplo, déficit), el eje baja de cero con el mismo paso.
    const maximo = Math.max(...valores, 0), minimo = Math.min(...valores, 0);
    const ticks = pasos(Math.max(maximo, -minimo), 2);
    const ymax = maximo > 0 ? ticks.at(-1) : 0;
    const ymin = minimo < 0 ? -ticks.at(-1) : 0;
    const clave = paneles.map((p) => p.nombre).join("|");
    // Los paneles se crean una vez (o si cambian las partidas) y luego solo se actualizan.
    if (contenedor.cuentasClave !== clave) {
      contenedor.textContent = "";
      contenedor.cuentasClave = clave;
      contenedor.cuentasPaneles = paneles.map((p) => {
        const caja = document.createElement("figure");
        caja.className = "multiple";
        const titulo = document.createElement("figcaption");
        const nombre = document.createElement("span");
        nombre.textContent = p.nombre;
        if (p.info) {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "info";
          b.dataset.info = p.info;
          b.textContent = "i";
          nombre.append(" ", b);
        }
        const valor = document.createElement("b");
        titulo.append(nombre, valor);
        const lienzo = document.createElement("div");
        lienzo.className = "lienzo-multiple";
        caja.append(titulo, lienzo);
        contenedor.appendChild(caja);
        const g = crear(lienzo, 110);
        if (periodo) periodo.sumar(g, { ejeMin: años[0], ejeMax: años.at(-1) });
        return { g, valor };
      });
      const nota = document.createElement("p");
      nota.className = "nota-multiples";
      contenedor.appendChild(nota);
    }
    contenedor.querySelector(".nota-multiples").textContent =
      `Todos los paneles usan la misma escala (${unidadEje}) para que se puedan comparar entre sí.`;
    const color = css("--c-primario"), suave = css("--tinta-suave");
    paneles.forEach((p, k) => {
      const { g, valor } = contenedor.cuentasPaneles[k];
      const v = p.valores[indice];
      valor.textContent = v === null || v === undefined ? "sin dato" : formato(v);
      const opciones = tiempo({ min: años[0], max: años.at(-1), aria: `${p.nombre}: evolución de ${años[0]} a ${años.at(-1)}, en ${unidadEje}.`, slider: false, marcasArriba: false, zoom: false });
      if (g.cuentasYa) delete opciones.dataZoom;
      g.cuentasYa = true;
      opciones.grid = { left: 2, right: 16, top: 8, bottom: 2, containLabel: true };
      opciones.xAxis.axisPointer = { show: false };
      opciones.xAxis.axisLabel = { ...opciones.xAxis.axisLabel, fontSize: 10, showMinLabel: false };
      opciones.xAxis.splitNumber = 2;
      opciones.tooltip = { show: false };
      opciones.yAxis = { type: "value", min: ymin, max: ymax, interval: ticks[1], axisLabel: { color: suave, fontSize: 10, formatter: (t) => numero(t, ymax < 10 ? 1 : 0) }, splitLine: { lineStyle: { color: css("--linea") } } };
      opciones.series = [
        linea("valores", años.map((a, i) => [a, p.valores[i]]), color, { connectNulls: false }),
        puntos("año", v === null || v === undefined ? [] : [[años[indice], v]], [color]),
      ];
      // El zoom vigente se conserva: solo se cambian ejes y series.
      g.setOption(opciones, { replaceMerge: ["series"] });
    });
  }

  // ---- Capas de contexto: casillas (apagadas por defecto) y la nota que explica lo que se ve ----
  // `capas` es un objeto {gobiernos, legislaturas, acontecimientos} que comparten todos los gráficos de la página.
  function capas(raiz, estadoCapas, alCambiar) {
    raiz.classList.add("capas");
    raiz.setAttribute("role", "group");
    raiz.setAttribute("aria-label", "Contexto de los gráficos");
    raiz.textContent = "";
    const et = document.createElement("span");
    et.className = "selector-etiqueta";
    et.textContent = "Añadir contexto:";
    raiz.appendChild(et);
    const casillas = {};
    const lista = [["gobiernos", "Nombramientos del Presidente del Gobierno"], ["legislaturas", "Legislaturas"], ["acontecimientos", "Crisis externas"]];
    if ("previsiones" in estadoCapas) lista.unshift(["previsiones", "Año en curso y previsiones"]);
    for (const [clave, nombre] of lista) {
      const l = document.createElement("label");
      const c = document.createElement("input");
      c.type = "checkbox";
      c.checked = !!estadoCapas[clave];
      c.addEventListener("change", () => {
        estadoCapas[clave] = c.checked;
        alCambiar();
      });
      casillas[clave] = c;
      l.append(c, ` ${nombre}`);
      raiz.appendChild(l);
    }
    return { poner(clave, v) { estadoCapas[clave] = v; casillas[clave].checked = v; } };
  }

  const algunaCapa = (c) => !!(c && (c.gobiernos || c.legislaturas || c.acontecimientos));

  function notaCapas(nota, d, c, { conAcontecimientos = true } = {}) {
    nota.textContent = "";
    if (c.gobiernos) {
      const p = document.createElement("p");
      p.textContent = `Líneas grises de puntos: ${d.gobiernos.criterio}`;
      const det = document.createElement("details");
      const s = document.createElement("summary");
      s.textContent = "Los nombramientos, en el BOE";
      const ul = document.createElement("ul");
      for (const x of d.gobiernos.lista) {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.href = x.url;
        a.textContent = x.real_decreto;
        li.append(`${fecha(x.fecha)}: ${x.persona} (`, a, `, ${x.fuente.replace(/, BOE-.*/, "")})`);
        ul.appendChild(li);
      }
      det.append(s, ul);
      nota.append(p, det);
    }
    if (c.legislaturas) {
      const p = document.createElement("p");
      p.textContent = "Franjas: legislaturas, desde la sesión constitutiva del Congreso.";
      nota.appendChild(p);
    }
    if (c.acontecimientos && conAcontecimientos) {
      const p = document.createElement("p");
      p.textContent = "Números: " + d.acontecimientos.lista.map((a, k) => `${k + 1}. ${a.corto} (${fecha(a.fecha)})`).join("; ") + `. ${d.acontecimientos.criterio}`;
      nota.appendChild(p);
    }
  }

  return { capas, algunaCapa, notaCapas, css, posicion, legislaturas, marcas, tiempo, ejeY, linea, puntos, crear, alPasar, fijar, periodo, barrasH, multiples, lineas, barras };
})();

// Nombres que usan las páginas de gasto, ingresos y presupuesto.
const dibujarBarrasH = EC.barrasH;
const dibujarMultiples = EC.multiples;
