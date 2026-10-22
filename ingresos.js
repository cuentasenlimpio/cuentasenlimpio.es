// Cuentas en limpio: página «De dónde sale el dinero». Usa comun.js.
"use strict";

function pintar(g, aapp, sel) {
  const i = sel.indice;
  const u = sel.unidad;
  for (const s of document.querySelectorAll(".año-elegido")) s.textContent = g.años[i];
  // El último año puede venir de la IGAE antes de que lo publique Eurostat: provisional y sin segunda fuente.
  const provisional = !!g.provisional_igae?.[i];
  document.getElementById("aviso-provisional").hidden = !provisional;
  // «Lo liquidado que no se espera cobrar» es casi siempre cero: solo se enseña cuando no lo es.
  const visibles = g.partes.filter((p) => p.clave !== "no_cobrado" || p.corrientes.some((v) => v));

  dibujarBarrasH(document.getElementById("reparto"),
    visibles.map((p) => ({ nombre: p.nombre, valor: g.reparto[i][p.clave] })), { formato: (v) => numero(v, 1), sufijo: " €" });
  lineaFuente(document.getElementById("reparto-fuente"), provisional ? {
    fuentes: aapp.fuentes,
    tablas: [["igae_a_aapp_imp", "impuestos y cotizaciones de las administraciones públicas"], ["igae_a_aapp", "recursos no financieros"]],
    tipo: "lectura", nota: "Provisional: Eurostat aún no publica este año. Las mismas partidas que en los demás años, de la IGAE; ver «Comprobaciones».",
  } : {
    fuentes: aapp.fuentes,
    tablas: [["gov_10a_taxag", "impuestos y cotizaciones sociales"], ["gov_10a_main", "ingresos totales de las administraciones"]],
    tipo: "lectura", nota: "Cada parte ÷ ingresos totales del año × 100. «Otros ingresos» es la resta: ingresos totales − impuestos y cotizaciones.",
  });

  const esc = ESCALA[u];
  // Orden fijo, de mayor a menor peso en el último año con datos (el mismo que las barras), sea cual sea la unidad
  const peso = (p) => [...p.pib].reverse().find((v) => v !== null) ?? 0;
  const paneles = [...visibles].sort((x, y) => peso(y) - peso(x)).map((p) => ({ nombre: p.nombre, valores: p[u].map((v) => (v === null ? null : v * esc)) }));
  dibujarMultiples(document.getElementById("evolucion"), paneles, g.años, i,
    { formato: FORMATO[u], unidadEje: texto(UNIDADES[u].eje, g.año_base_constantes), periodo: sel.periodo });
  const extra = { constantes: [["nama_10_gdp", "deflactor del PIB"]], habitante: [["nama_10_pe", "población media"]] }[u] || [];
  lineaFuente(document.getElementById("evolucion-fuente"), {
    fuentes: aapp.fuentes,
    tablas: [["gov_10a_taxag", "impuestos y cotizaciones sociales"], ["gov_10a_main", "ingresos totales"], ...extra],
    tipo: u === "pib" || u === "corrientes" ? "dato" : "lectura",
    nota: "Algunas partidas son restas de datos publicados, por ejemplo los otros impuestos sobre lo que se compra: todos menos el IVA.",
    detalleTecnico: "«Otros impuestos sobre productos» = impuestos sobre productos − IVA. La fórmula de cada partida está en el fichero de datos de esta página (CSV, «Todos los números de esta página»).",
  });
}

const NOMBRES_CORTOS = {
  cotizaciones: "cotizaciones sociales", renta: "impuestos sobre la renta de los hogares (sobre todo el IRPF)", iva: "IVA",
  otros_ingresos: "otros ingresos", productos: "otros impuestos sobre lo que se compra",
  sociedades: "impuesto sobre los beneficios de las empresas", produccion: "otros impuestos sobre la producción",
};

// Respuesta corta: las tres mayores fuentes de ingresos del último año.
function pintarRespuesta(g, aapp) {
  const r = g.reparto.at(-1);
  const top = Object.entries(r).filter(([k]) => NOMBRES_CORTOS[k]).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const p = document.getElementById("respuesta");
  p.textContent = `De cada 100 € que ingresaron las administraciones en ${g.años.at(-1)}${g.provisional_igae?.at(-1) ? " (provisional)" : ""}, `;
  top.forEach(([k, v], j) => {
    if (j) p.append(j === 2 ? " y " : ", ");
    const b = document.createElement("strong");
    b.textContent = numero(Math.round(v), 0);
    p.append(b, ` ${j ? "de " : "salieron de "}${NOMBRES_CORTOS[k]}`);
  });
  p.append(".");
  const i = aapp.años.indexOf(g.años.at(-1)), hab = i >= 0 ? aapp.series.ingresos.habitante[i] : null;
  if (hab) {
    const q = document.createElement("span");
    q.className = "respuesta-persona";
    q.textContent = ` En total entraron ${eurosHablados(hab)} por habitante en el año, contando niños y jubilados.`;
    p.appendChild(q);
  }
}

async function arrancar() {
  const [g, aapp] = await Promise.all([fetch("datos/ingresos.json").then((r) => r.json()), fetch("datos/aapp.json").then((r) => r.json())]);
  const sel = montarSelectores({ años: g.años, alCambiar: (s) => pintar(g, aapp, s) });
  sel.periodo = EC.periodo(document.getElementById("periodo"), aapp, g.años);
  pintar(g, aapp, sel);
  pintarRespuesta(g, aapp);
  pintarComprobaciones(document.getElementById("comprobaciones"), g.comprobaciones);
  const f = aapp.fuentes.find((x) => x.tabla === "gov_10a_taxag");
  pintarUltimoAño(g.años, g.provisional_igae?.at(-1)
    ? `${g.años.at(-1)} es provisional. Eurostat publica el detalle por impuestos más tarde (lo actualizó por última vez el ${fecha(f.actualizado_fuente)}), así que ese año sale de la IGAE.${g.igae_marca_provisional ? " La IGAE también lo marca como provisional." : ""} Cuando Eurostat lo publique, sustituirá a este.`
    : `Eurostat publica el detalle por impuestos más tarde que los totales, que ya llegan a ${aapp.años.at(-1)} (ver Cuentas). Lo actualizó por última vez el ${fecha(f.actualizado_fuente)}. Cuando publique un año nuevo, aparecerá aquí solo.`);
  let espera = null;
  window.addEventListener("resize", () => {
    clearTimeout(espera);
    espera = setTimeout(() => pintar(g, aapp, sel), 150);
  });
}

arrancar();
