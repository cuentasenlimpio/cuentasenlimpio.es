// Cuentas en limpio: página «De dónde sale el dinero». Usa comun.js.
"use strict";

function pintar(g, aapp, sel) {
  const i = sel.indice;
  const u = sel.unidad;
  for (const s of document.querySelectorAll(".año-elegido")) s.textContent = g.años[i];
  // «Lo liquidado que no se espera cobrar» es casi siempre cero: solo se enseña cuando no lo es.
  const visibles = g.partes.filter((p) => p.clave !== "no_cobrado" || p.corrientes.some((v) => v));

  dibujarBarrasH(document.getElementById("reparto"),
    visibles.map((p) => ({ nombre: p.nombre, valor: g.reparto[i][p.clave] })), { formato: (v) => numero(v, 1), sufijo: " €" });
  lineaFuente(document.getElementById("reparto-fuente"), {
    fuentes: aapp.fuentes,
    tablas: [["gov_10a_taxag", "impuestos y cotizaciones sociales"], ["gov_10a_main", "ingresos totales de las administraciones"]],
    tipo: "lectura", nota: "Cada parte ÷ ingresos totales del año × 100. «Otros ingresos» es la resta: ingresos totales − impuestos y cotizaciones.",
  });

  const esc = ESCALA[u];
  const paneles = visibles.map((p) => ({ nombre: p.nombre, valores: p[u].map((v) => (v === null ? null : v * esc)) }));
  dibujarMultiples(document.getElementById("evolucion"), paneles, g.años, i,
    { formato: FORMATO[u], unidadEje: texto(UNIDADES[u].eje, g.año_base_constantes), periodo: sel.periodo });
  const extra = { constantes: [["nama_10_gdp", "deflactor del PIB"]], habitante: [["nama_10_pe", "población media"]] }[u] || [];
  lineaFuente(document.getElementById("evolucion-fuente"), {
    fuentes: aapp.fuentes,
    tablas: [["gov_10a_taxag", "impuestos y cotizaciones sociales"], ["gov_10a_main", "ingresos totales"], ...extra],
    tipo: u === "pib" || u === "corrientes" ? "dato" : "lectura",
    nota: "Algunas partidas son restas de datos publicados (por ejemplo, «otros impuestos sobre productos» = impuestos sobre productos − IVA); cada fórmula está en el CSV.",
  });
}

async function arrancar() {
  const [g, aapp] = await Promise.all([fetch("datos/ingresos.json").then((r) => r.json()), fetch("datos/aapp.json").then((r) => r.json())]);
  const sel = montarSelectores({ años: g.años, alCambiar: (s) => pintar(g, aapp, s) });
  sel.periodo = EC.periodo(document.getElementById("periodo"), aapp, g.años);
  pintar(g, aapp, sel);
  pintarComprobaciones(document.getElementById("comprobaciones"), g.comprobaciones);
  const f = aapp.fuentes.find((x) => x.tabla === "gov_10a_taxag");
  pintarUltimoAño(g.años, `Eurostat publica el detalle por impuestos más tarde que los totales, que ya llegan a ${aapp.años.at(-1)} (ver Cuentas). Su última actualización es del ${fecha(f.actualizado_fuente)}; en cuanto publique un año nuevo, aparecerá aquí solo.`);
  let espera = null;
  window.addEventListener("resize", () => {
    clearTimeout(espera);
    espera = setTimeout(() => pintar(g, aapp, sel), 150);
  });
}

arrancar();
