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

async function arrancar() {
  const [g, aapp] = await Promise.all([fetch("datos/gasto.json").then((r) => r.json()), fetch("datos/aapp.json").then((r) => r.json())]);
  const sel = montarSelectores({ años: g.años, alCambiar: (s) => pintar(g, aapp, s) });
  sel.periodo = EC.periodo(document.getElementById("periodo"), aapp, g.años);
  pintar(g, aapp, sel);
  pintarComprobaciones(document.getElementById("comprobaciones"), g.comprobaciones);
  const f = aapp.fuentes.find((x) => x.tabla === "gov_10a_exp");
  pintarUltimoAño(g.años, `Eurostat publica el reparto por funciones más tarde que los totales, que ya llegan a ${aapp.años.at(-1)} (ver Cuentas). Su última actualización es del ${fecha(f.actualizado_fuente)}; en cuanto publique un año nuevo, aparecerá aquí solo.`);
  let espera = null;
  window.addEventListener("resize", () => {
    clearTimeout(espera);
    espera = setTimeout(() => pintar(g, aapp, sel), 150);
  });
}

arrancar();
