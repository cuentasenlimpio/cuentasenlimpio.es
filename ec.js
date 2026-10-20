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
          itemStyle: { color: esta ? css("--acento-tenue") : k % 2 ? "rgba(0,0,0,0)" : css("--franja") },
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
    const dataZoom = [{
      type: "inside", xAxisIndex: 0, filterMode: "none", minValueSpan: 3, disabled: !zoom,
      zoomOnMouseWheel: "ctrl", moveOnMouseWheel: false, moveOnMouseMove: false,
    }];
    if (slider) {
      dataZoom.push({
        type: "slider", xAxisIndex: 0, filterMode: "none", minValueSpan: 3, height: 22, bottom: 8, showDataShadow: silueta,
        borderColor: linea, fillerColor: "rgba(138,90,18,0.12)", backgroundColor: css("--superficie"),
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
      grid: { left: 4, right: 14, top: marcasArriba ? 84 : 16, bottom: slider ? 50 : 8, containLabel: true },
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
      lineStyle: { width: 2, color }, itemStyle: { color }, emphasis: { disabled: true }, ...extra,
    };
  }

  // Punto del año elegido sobre cada línea: borde del color de la superficie, como en el resto de la web.
  function puntos(id, puntosXY, colores) {
    return {
      id, type: "scatter", silent: true, z: 4, symbolSize: 9, animation: false,
      data: puntosXY.map((p, k) => ({ value: p, itemStyle: { color: colores[k], borderColor: css("--superficie"), borderWidth: 2 } })),
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
  function periodo(raiz, d, años, { desde2007 = true, alCambiar = () => {}, alResaltar = () => {} } = {}) {
    const graficos = [];
    let resaltada = null, moviendo = false;
    const min = años[0], max = años.at(-1);

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
    const rapidos = [["todo", "Todo"], ["10", "Últimos 10 años"]].concat(desde2007 && min < 2007 ? [["2007", "Desde 2007"]] : []);
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
    for (const s of [selDesde, selHasta]) for (const a of años) crearEl("option", { value: String(a), textContent: a }, s);
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
        aplicar(p === "todo" ? min : p === "10" ? max - 10 : Number(p), max);
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

  // ---- Barras horizontales ordenadas de mayor a menor, con el valor al final de cada barra ----
  // `filas`: [{nombre, valor}]. En pantallas estrechas el nombre va encima de la barra.
  function barrasH(contenedor, filas, { formato, sufijo = "" }) {
    const estrecho = contenedor.clientWidth < 520;
    const fila = estrecho ? 40 : 30;
    const orden = [...filas].sort((a, b) => b.valor - a.valor);
    // Para lectores de pantalla: el gráfico es una imagen, así que su nombre lleva todas las partidas con su valor.
    const base = contenedor.dataset.etiqueta || (contenedor.dataset.etiqueta = contenedor.getAttribute("aria-label") || "");
    contenedor.setAttribute("aria-label", `${base}: ${orden.map((f) => `${f.nombre}, ${formato(f.valor)}${sufijo}`).join("; ")}.`);
    const alto = 12 + orden.length * fila;
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
          const izq = estrecho ? 0 : 300, der = 64;
          const y = 6 + k * fila;
          const yb = estrecho ? y + 18 : y + fila / 2 - 7;
          const largo = Math.max(0, (Math.max(f.valor, 0) / maximo) * (ancho - izq - der));
          return {
            type: "group",
            children: [
              { type: "text", x: estrecho ? 0 : izq - 10, y: estrecho ? y + 2 : y + fila / 2,
                style: { text: f.nombre, fill: suave, font: `13px ${fuente}`, align: estrecho ? "left" : "right", verticalAlign: estrecho ? "top" : "middle" } },
              { type: "rect", shape: { x: izq, y: yb, width: largo, height: 14, r: [0, 3, 3, 0] }, style: { fill: relleno } },
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
    const valores = paneles.flatMap((p) => p.valores).filter((v) => v !== null);
    const ticks = pasos(Math.max(...valores, 0), 2);
    const ymax = ticks.at(-1);
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
      opciones.yAxis = { type: "value", min: 0, max: ymax, interval: ticks[1], axisLabel: { color: suave, fontSize: 10, formatter: (t) => numero(t, ymax < 10 ? 1 : 0) }, splitLine: { lineStyle: { color: css("--linea") } } };
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
    for (const [clave, nombre] of [["gobiernos", "Nombramientos del Presidente del Gobierno"], ["legislaturas", "Legislaturas"], ["acontecimientos", "Crisis externas"]]) {
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

  return { capas, algunaCapa, notaCapas, css, posicion, legislaturas, marcas, tiempo, ejeY, linea, puntos, crear, alPasar, fijar, periodo, barrasH, multiples };
})();

// Nombres que usan las páginas de gasto, ingresos y presupuesto.
const dibujarBarrasH = EC.barrasH;
const dibujarMultiples = EC.multiples;
