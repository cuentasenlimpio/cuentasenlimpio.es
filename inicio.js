// Cuentas en limpio: portada. Las cuatro cifras salen de los mismos datos que el resto de la web.
"use strict";

const NOMBRES_INGRESOS = {
  cotizaciones: "cotizaciones sociales", renta: "impuestos sobre la renta de los hogares", iva: "IVA",
  otros_ingresos: "otros ingresos", productos: "otros impuestos sobre lo que se compra",
  sociedades: "impuesto sobre los beneficios de las empresas", produccion: "otros impuestos sobre la producción",
};

function lista(partes) {
  return partes.length > 1 ? `${partes.slice(0, -1).join(", ")} y ${partes.at(-1)}` : partes[0];
}

async function arrancar() {
  const leer = (f) => fetch(f).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [aapp, gasto, ingresos, promesas] = await Promise.all(
    ["datos/aapp.json", "datos/gasto.json", "datos/ingresos.json", "datos/promesas-resumen.json"].map(leer));
  if (!aapp) return;
  const i = aapp.años.length - 1, año = aapp.años[i];
  const v = (k) => aapp.series[k].pib[i];
  for (const s of document.querySelectorAll(".año-cuentas")) s.textContent = String(año);

  const gastos = v("gastos"), ingr = v("ingresos"), saldo = v("saldo"), deuda = v("deuda");
  document.getElementById("p-gastos").textContent = `${numero(gastos, 1)} euros`;
  document.getElementById("p-ingresos").textContent = `${numero(ingr, 1)}`;
  document.getElementById("p-deuda").textContent = `${numero(deuda, 1)}`;

  const cien = document.getElementById("cien");
  for (let k = 0; k < 100; k++) {
    const li = document.createElement("li");
    if (k < Math.round(gastos)) li.className = "lleno";
    cien.appendChild(li);
  }

  if (gasto) {
    const r = gasto.reparto.at(-1);
    const top = gasto.funciones.map((f) => ({ n: f.nombre.toLowerCase(), v: r[f.codigo] })).sort((a, b) => b.v - a.v).slice(0, 3);
    document.getElementById("p-gastos-detalle").textContent =
      `De cada 100 € de gasto, ${lista(top.map((t, k) => `${numero(Math.round(t.v), 0)} ${k ? "" : "van "}a ${t.n}`))} (${gasto.años.at(-1)}, último año con este detalle).`;
  }
  if (ingresos) {
    const r = ingresos.reparto.at(-1);
    const top = Object.entries(r).filter(([k]) => NOMBRES_INGRESOS[k]).sort((a, b) => b[1] - a[1]).slice(0, 3);
    document.getElementById("p-ingresos-detalle").textContent =
      `De cada 100 € que ingresan, ${lista(top.map(([k, x], j) => `${numero(Math.round(x), 0)} ${j ? "" : "son "}${NOMBRES_INGRESOS[k]}`))} (${ingresos.años.at(-1)}).`;
  }
  const t = document.getElementById("p-saldo"), d = document.getElementById("p-saldo-detalle");
  if (saldo < 0) {
    t.textContent = `Faltaron ${numero(-saldo, 1)}: el déficit.`;
    d.textContent = "Para cubrirlos, las administraciones piden prestado. El déficit es lo que falta en un año; la deuda, todo lo que se debe sumando todos los años.";
  } else {
    t.textContent = `Sobraron ${numero(saldo, 1)}: el superávit.`;
    d.textContent = "Lo que sobra puede servir para devolver deuda. El superávit es de un año; la deuda, todo lo que se debe sumando todos los años.";
  }
  lineaFuente(document.getElementById("pasos-fuente"), {
    fuentes: aapp.fuentes,
    tablas: [["gov_10a_main", "ingresos, gastos y saldo"], ["gov_10dd_edpt1", "deuda"], ["gov_10a_exp", "gasto por funciones"], ["gov_10a_taxag", "impuestos y cotizaciones"]],
    tipo: "dato", nota: `Porcentajes del PIB de ${año} que publica Eurostat. Los repartos «de cada 100 €» son de ${gasto ? gasto.años.at(-1) : "su último año"}, el último que publica con detalle.`,
  });
  if (promesas) {
    document.getElementById("sigue-promesas").textContent =
      `${numero(promesas.distintas, 0)} promesas de ${promesas.documentos} documentos de 2023, con su cita literal.`;
  }
}

arrancar();
