// Cuentas en limpio: página «En qué se gasta». Usa comun.js.
"use strict";

function pintar(g, aapp, sel) {
  const i = sel.indice;
  const u = sel.unidad;
  const año = g.años[i];
  for (const s of document.querySelectorAll(".año-elegido")) s.textContent = año;

  // De cada 100 €
  const r = g.reparto[i];
  const filas = g.funciones.map((f) => ({ nombre: f.codigo === "GF01" ? "Servicios públicos generales (sin intereses)" : f.nombre, valor: r[f.codigo] }));
  filas.push({ nombre: "Intereses de la deuda", valor: r.intereses });
  dibujarBarrasH(document.getElementById("reparto"), filas, { formato: (v) => numero(v, 1), sufijo: " €" });
  lineaFuente(document.getElementById("reparto-fuente"), {
    fuentes: aapp.fuentes, tablas: [["gov_10a_exp", "gasto de las administraciones públicas por funciones"]], tipo: "dato",
    nota: "Porcentaje del total que publica Eurostat (unidad PC_TOT), redondeado a un decimal. Los intereses (grupo 01.7) y el resto de servicios generales son una resta nuestra.",
  });

  // Evolución
  const esc = ESCALA[u];
  const paneles = g.funciones.map((f) => ({ nombre: f.nombre, valores: f[u].map((v) => (v === null ? null : v * esc)) }));
  dibujarMultiples(document.getElementById("evolucion"), paneles, g.años, i,
    { formato: FORMATO[u], unidadEje: texto(UNIDADES[u].eje, g.año_base_constantes), periodo: sel.periodo });
  const extra = { constantes: [["nama_10_gdp", "deflactor del PIB"]], habitante: [["nama_10_pe", "población media"]] }[u] || [];
  lineaFuente(document.getElementById("evolucion-fuente"), {
    fuentes: aapp.fuentes, tablas: [["gov_10a_exp", "gasto de las administraciones públicas por funciones"], ...extra],
    tipo: UNIDADES[u].tipo,
    nota: u === "pib" ? "Porcentaje del PIB que publica Eurostat." : texto(UNIDADES[u].explica, g.año_base_constantes),
  });

  // Quién paga
  const tabla = document.getElementById("quien");
  tabla.textContent = "";
  const cab = document.createElement("tr");
  for (const t of ["Partida", ...g.niveles.map((n) => n.nombre)]) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = t;
    cab.appendChild(th);
  }
  const thead = document.createElement("thead");
  thead.appendChild(cab);
  tabla.appendChild(thead);
  const tbody = document.createElement("tbody");
  for (const f of [...g.funciones, { codigo: "TOTAL", nombre: "Todo el gasto" }]) {
    const tr = document.createElement("tr");
    if (f.codigo === "TOTAL") tr.className = "fila-total";
    const td = document.createElement("td");
    td.textContent = f.nombre;
    tr.appendChild(td);
    for (const n of g.niveles) {
      const v = g.quien[i][f.codigo][n.codigo];
      const c = document.createElement("td");
      c.className = "celda-barra";
      const barra = document.createElement("span");
      barra.className = "relleno";
      barra.style.width = `${Math.min(100, v || 0)}%`;
      c.appendChild(barra);
      const t = document.createElement("span");
      t.className = "cifra";
      t.textContent = v === null ? "—" : `${numero(v, 1)} %`;
      c.appendChild(t);
      tr.appendChild(c);
    }
    tbody.appendChild(tr);
  }
  tabla.appendChild(tbody);
  lineaFuente(document.getElementById("quien-fuente"), {
    fuentes: aapp.fuentes, tablas: [["gov_10a_exp", "gasto por funciones de cada nivel de administración"]], tipo: "lectura",
    nota: "Gasto del nivel en esa partida ÷ gasto de todas las administraciones en esa partida; en servicios generales y en el total, sin las transferencias generales entre administraciones (grupo 01.8).",
  });
}

// Frase de respuesta de la portada de la página: las tres partidas mayores del año más reciente.
function pintarRespuesta(g) {
  const r = g.reparto.at(-1);
  const top = g.funciones.map((f) => ({ nombre: f.nombre.toLowerCase(), valor: r[f.codigo] }))
    .sort((a, b) => b.valor - a.valor).slice(0, 3);
  const p = document.getElementById("respuesta");
  p.textContent = `De cada 100 € que gastaron las administraciones en ${g.años.at(-1)}, `;
  top.forEach((t, k) => {
    if (k) p.appendChild(document.createTextNode(k === 2 ? " y " : ", "));
    const b = document.createElement("strong");
    b.textContent = numero(Math.round(t.valor), 0);
    p.append(b, ` a ${t.nombre}`);
  });
  p.append(".");
}

// ---- ¿Cuánto se invierte? (gasto por tipo, gov_10a_main) ----
const capas = { gobiernos: false, legislaturas: false, acontecimientos: false };

function pintarTipo(g, aapp, u) {
  const t = g.tipo;
  const n = t.años.length - 1, ultimo = t.años[n], primero = t.años[0];
  const de100 = Object.fromEntries(t.partes.map((p) => [p.clave, p.de_cada_100]));
  for (const s of document.querySelectorAll(".año-tipo")) s.textContent = `en ${ultimo}`;
  for (const s of document.querySelectorAll(".unidad-elegida")) s.textContent = texto(UNIDADES[u].eje, g.año_base_constantes);

  const resp = document.getElementById("tipo-respuesta");
  resp.textContent = `En ${ultimo}, `;
  const b = document.createElement("strong");
  b.textContent = `${numero(de100.inversion[n], 1)} de cada 100 €`;
  resp.append(b, ` de gasto público fueron inversión: obras, edificios, equipos y programas. En ${primero} eran ${numero(de100.inversion[0], 1)}.`);

  // Línea de la inversión, con el primer año, el máximo, el mínimo y el último rotulados.
  const esc = ESCALA[u], fmt = FORMATO[u];
  const valores = t.inversion[u].map((v) => (v === null ? null : v * esc));
  const pares = t.años.map((a, i) => [a, valores[i]]);
  const conDato = pares.filter((p) => p[1] !== null);
  const max = conDato.reduce((m, p) => (p[1] > m[1] ? p : m));
  const min = conDato.reduce((m, p) => (p[1] < m[1] ? p : m));
  const rotulos = [conDato[0], max, min, conDato.at(-1)].filter((p, k, l) => l.findIndex((q) => q[0] === p[0]) === k);
  const caja = document.getElementById("inversion");
  const estrecho = caja.clientWidth < 520;
  if (!caja.cuentasGrafico) caja.cuentasGrafico = EC.crear(caja, estrecho ? 280 : 340);
  const graf = caja.cuentasGrafico;
  const algunaCapa = EC.algunaCapa(capas);
  // Se conserva el zoom al repintar (cambio de unidad o de capas).
  const zoomAntes = graf.getOption()?.dataZoom?.[0];
  const op = EC.tiempo({ min: primero, max: ultimo, marcasArriba: algunaCapa,
    aria: `Inversión pública de ${primero} a ${ultimo}, en ${texto(UNIDADES[u].eje, g.año_base_constantes)}: ` +
      rotulos.map((p) => `${fmt(p[1])} en ${p[0]}`).join(", ") + "." });
  op.grid.top = algunaCapa ? 84 : 28;
  op.yAxis = EC.ejeY({ formato: (v) => numero(v, Number.isInteger(v) ? 0 : 1), min: 0 });
  op.yAxis.name = "";
  const color = EC.css("--c-primario");
  op.series = [
    EC.marcas(aapp, { min: primero, max: ultimo, capas }),
    EC.linea("inversion", pares, color, { lineStyle: { width: 3, color } }),
    {
      id: "rotulos", type: "scatter", silent: true, z: 5, symbolSize: 9,
      itemStyle: { color, borderColor: EC.css("--superficie"), borderWidth: 2 },
      label: { show: true, color: EC.css("--tinta"), fontWeight: 600, fontSize: 12,
        formatter: (x) => (x.value[0] === primero || x.value[0] === ultimo ? fmt(x.value[1]) : `${fmt(x.value[1])} en ${x.value[0]}`) },
      labelLayout: { hideOverlap: true },
      data: rotulos.map((p) => ({ value: p, label: { position: p === min ? "bottom" : p[0] === primero ? "right" : "top", distance: 8 } })),
    },
  ];
  graf.setOption(op, { notMerge: true });
  if (zoomAntes) graf.dispatchAction({ type: "dataZoom", start: zoomAntes.start, end: zoomAntes.end });

  // Lectura del año bajo el puntero (o el último, al entrar).
  const lectura = (k) => {
    const caja = document.getElementById("inversion-lectura");
    caja.textContent = "";
    const a = document.createElement("strong");
    a.className = "lectura-anio";
    a.textContent = String(t.años[k]);
    const b = document.createElement("b");
    b.textContent = valores[k] === null ? "sin dato" : fmt(valores[k]);
    const c = document.createElement("span");
    c.className = "lectura-fila";
    c.append(b, ` de inversión · ${numero(de100.inversion[k], 1)} de cada 100 € de gasto`);
    caja.append(a, c);
  };
  lectura(n);
  // El manejador se registra una vez y lee siempre la última función (cambia con la unidad).
  graf.cuentasLeer = (x) => lectura(Math.max(0, Math.min(n, Math.round(x) - primero)));
  if (!graf.cuentasLectura) {
    graf.cuentasLectura = true;
    EC.alPasar(graf, (x) => graf.cuentasLeer(x));
  }

  EC.notaCapas(document.getElementById("nota-capas"), aapp, capas);

  const extra = { constantes: [["nama_10_gdp", "deflactor del PIB"]], habitante: [["nama_10_pe", "población media"]] }[u] || [];
  lineaFuente(document.getElementById("inversion-fuente"), {
    fuentes: aapp.fuentes, tablas: [["gov_10a_main", "formación bruta de capital fijo, P.51g"], ...extra],
    tipo: UNIDADES[u].tipo, nota: u === "pib" ? "Porcentaje del PIB que publica Eurostat." : texto(UNIDADES[u].explica, g.año_base_constantes),
  });

  // Gasto corriente frente a inversión, a la misma escala.
  const cor = t.corriente.corrientes[n], inv = t.inversion.corrientes[n];
  document.getElementById("c-titulo").textContent =
    `En ${ultimo}, el gasto del día a día fue unas ${numero(Math.round(cor / inv), 0)} veces la inversión`;
  const ul = document.getElementById("comparadas");
  ul.textContent = "";
  const filas = [["Gasto corriente", t.corriente.pib[n], false], ["Inversión", t.inversion.pib[n], true]];
  for (const [nombre, v, destacada] of filas) {
    const li = document.createElement("li");
    const barra = document.createElement("span");
    barra.className = "barra";
    const r = document.createElement("span");
    r.className = destacada ? "relleno destacada" : "relleno";
    r.style.width = `calc((100% - 8.5rem) * ${v / filas[0][1]})`;
    barra.append(r, `${numero(v, 1)} % del PIB`);
    li.append(nombre, barra);
    ul.appendChild(li);
  }
  lineaFuente(document.getElementById("comparadas-fuente"), {
    fuentes: aapp.fuentes, tablas: [["gov_10a_main", "gasto de las administraciones públicas por tipo"]], tipo: "lectura",
    nota: "Gasto corriente = gasto total − gasto de capital (P.5 + NP + D.9), como define el SEC 2010; su % del PIB, con el del gasto total que publica Eurostat. La inversión (P.51g) es dato.",
  });

  // Las ocho partes del gasto en el último año.
  const tabla = document.getElementById("partes");
  tabla.textContent = "";
  const cab = document.createElement("thead");
  cab.innerHTML = "<tr><th scope=\"col\">Parte</th><th scope=\"col\">De cada 100 €</th></tr>";
  const cuerpo = document.createElement("tbody");
  for (const p of t.partes) {
    const tr = document.createElement("tr");
    const a = document.createElement("td");
    a.textContent = p.nombre;
    const v = document.createElement("td");
    v.textContent = numero(p.de_cada_100[n], 1);
    tr.append(a, v);
    cuerpo.appendChild(tr);
  }
  tabla.append(cab, cuerpo);
}

async function arrancar() {
  const [g, aapp] = await Promise.all([fetch("datos/gasto.json").then((r) => r.json()), fetch("datos/aapp.json").then((r) => r.json())]);
  const sel = montarSelectores({ años: g.años, alCambiar: (s) => { pintar(g, aapp, s); pintarTipo(g, aapp, s.unidad); } });
  sel.periodo = EC.periodo(document.getElementById("periodo"), aapp, g.años);
  pintar(g, aapp, sel);
  pintarRespuesta(g);
  pintarTipo(g, aapp, sel.unidad);
  EC.capas(document.getElementById("capas"), capas, () => pintarTipo(g, aapp, sel.unidad));
  pintarComprobaciones(document.getElementById("comprobaciones"), g.comprobaciones);
  const f = aapp.fuentes.find((x) => x.tabla === "gov_10a_exp");
  pintarUltimoAño(g.años, `Eurostat publica el reparto por funciones más tarde que los totales, que ya llegan a ${aapp.años.at(-1)} (ver Cuentas). Su última actualización es del ${fecha(f.actualizado_fuente)}; en cuanto publique un año nuevo, aparecerá aquí solo.`);
  let espera = null;
  window.addEventListener("resize", () => {
    clearTimeout(espera);
    espera = setTimeout(() => { pintar(g, aapp, sel); pintarTipo(g, aapp, sel.unidad); }, 150);
  });
}

arrancar();
