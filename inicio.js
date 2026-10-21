// Cuentas en limpio: portada. Las cifras salen de los mismos datos que el resto de la web.
"use strict";

const NOMBRES_INGRESOS = {
  cotizaciones: "cotizaciones sociales", renta: "impuestos sobre la renta", iva: "IVA", otros_ingresos: "otros ingresos",
  productos: "otros impuestos sobre lo que se compra", sociedades: "impuesto de sociedades", produccion: "impuestos sobre la producción",
};


async function arrancar() {
  const leer = (f) => fetch(f).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [aapp, gasto, ingresos, promesas] = await Promise.all(
    ["datos/aapp.json", "datos/gasto.json", "datos/ingresos.json", "datos/promesas-resumen.json"].map(leer));
  if (!aapp) return;
  const i = aapp.años.length - 1, año = aapp.años[i];
  const v = (k) => aapp.series[k].pib[i];
  for (const s of document.querySelectorAll(".año-cuentas")) s.textContent = String(año);
  const pon = (id, t) => { document.getElementById(id).textContent = t; };
  pon("k-ingresos", `${numero(v("ingresos"), 1)} %`);
  pon("k-gastos", `${numero(v("gastos"), 1)} %`);
  pon("k-deuda", `${numero(v("deuda"), 1)} %`);
  const saldo = v("saldo");
  pon("k-saldo", `${numero(Math.abs(saldo), 1)} %`);
  if (saldo >= 0) {
    pon("k-saldo-nombre", "Superávit");
    pon("k-saldo-explica", "del PIB. Lo que sobra tras cubrir el gasto.");
  }

  // A escala de persona, debajo de cada cifra (lectura: euros entre la población media del año, de Eurostat).
  const h = (k) => aapp.series[k].habitante[i];
  const persona = (id, t) => {
    const s = document.createElement("span");
    s.className = "persona";
    s.textContent = t;
    document.getElementById(id).parentElement.querySelector(".explica").after(s);
  };
  if (h("gastos")) {
    persona("k-ingresos", `${eurosHablados(h("ingresos"))} por habitante en el año.`);
    persona("k-gastos", `${eurosHablados(h("gastos"))} por habitante en el año.`);
    persona("k-saldo", `${eurosHablados(Math.abs(h("saldo")))} por habitante en el año.`);
    persona("k-deuda", `${eurosHablados(h("deuda"))} por habitante, en total.`);
  }

  // Año en curso, debajo de las cifras de déficit y deuda.
  const ec = aapp.recientes?.en_curso;
  const FIN = ["marzo", "junio", "septiembre", "diciembre"];
  const añadir = (id, texto) => {
    const span = document.createElement("span");
    span.className = "reciente";
    span.textContent = texto;
    document.getElementById(id).after(span);
  };
  if (ec?.series?.saldo?.doce_meses_pib !== null && ec?.series?.saldo) {
    añadir("k-saldo-explica", `${ec.año}, en curso: ${numero(Math.abs(ec.series.saldo.doce_meses_pib), 1)} % en los doce meses hasta ${FIN[ec.trimestre - 1]}.`);
  }
  if (ec?.deuda) añadir("k-deuda-explica", `${ec.deuda.año}, en curso: ${numero(ec.deuda.pib, 1)} % a final de ${FIN[ec.deuda.trimestre - 1]}.`);
  if (gasto) {
    const r = gasto.reparto.at(-1);
    const top = gasto.funciones.map((f) => ({ n: f.nombre.toLowerCase(), v: r[f.codigo] })).sort((a, b) => b.v - a.v);
    pon("k-gastos-explica", `del PIB. ${numero(Math.round(top[0].v), 0)} de cada 100 € van a ${top[0].n} (${gasto.años.at(-1)}).`);
    pon("q-gasto", `De cada 100 € de gasto: ${lista([...top.slice(0, 3).map((t) => `${numero(Math.round(t.v), 0)} a ${t.n}`),
      `${numero(r.intereses, 1)} a intereses de la deuda`])} (${gasto.años.at(-1)}).`);
    const t = gasto.tipo, n = t.años.length - 1, inv = t.partes.find((p) => p.clave === "inversion").de_cada_100;
    pon("q-inversion", `${numero(inv[n], 1)} de cada 100 € de gasto en ${t.años[n]}, frente a ${numero(inv[0], 1)} en ${t.años[0]}. Qué cuenta como inversión y por qué importa.`);
  }
  if (ingresos) {
    const r = ingresos.reparto.at(-1);
    const top = Object.entries(r).filter(([k]) => NOMBRES_INGRESOS[k] && k !== "otros_ingresos").sort((a, b) => b[1] - a[1]).slice(0, 3);
    pon("q-ingresos", `De cada 100 € que ingresan: ${lista(top.map(([k, x]) => `${numero(Math.round(x), 0)} de ${NOMBRES_INGRESOS[k]}`))} (${ingresos.años.at(-1)}${ingresos.provisional_igae?.at(-1) ? ", provisional" : ""}). Y cómo ha cambiado desde 1995.`);
  }
  if (promesas) {
    pon("q-promesas", `${numero(promesas.distintas, 0)} promesas de ${promesas.documentos} documentos, con su cita literal. Sin veredicto: la promesa y los hechos.`);
  }
  lineaFuente(document.getElementById("claves-fuente"), {
    fuentes: aapp.fuentes, tablas: [["gov_10a_main", "ingresos, gastos y saldo"], ["gov_10dd_edpt1", "deuda"]],
    tipo: "dato", nota: `Porcentajes del PIB de ${año} que publica Eurostat.`,
  });
}

arrancar();
