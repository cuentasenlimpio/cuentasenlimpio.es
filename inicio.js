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
  // La respuesta en una frase, con lo relevante subrayado
  const resp = document.getElementById("portada-respuesta");
  if (resp) {
    const de100 = Math.round((100 * aapp.series.gastos.corrientes[i]) / aapp.series.ingresos.corrientes[i]);
    resp.textContent = `En ${año}, `;
    const s1 = document.createElement("strong");
    s1.textContent = saldo < 0 ? `por cada 100 € que entraron, salieron unos ${de100}` : `por cada 100 € que entraron, salieron unos ${de100} y sobró el resto`;
    resp.append(s1, saldo < 0 ? ". Lo que faltó se pidió prestado y se sumó a la deuda, que " : ". La deuda ");
    const s2 = document.createElement("strong");
    s2.textContent = v("deuda") >= 100 ? "ya supera todo lo que produce el país en un año" : `equivale a ${numero(Math.round(v("deuda")), 0)} de cada 100 € de lo que produce el país en un año`;
    resp.append(s2, ".");
  }
  // De cada 100 € que entraron: las cinco partes mayores
  const caja = document.getElementById("portada-reparto");
  if (caja && ingresos) {
    const r = ingresos.reparto.at(-1);
    const NOMBRES = { cotizaciones: "Cotizaciones", renta: "Impuesto sobre la renta", iva: "IVA", otros_ingresos: "Otros ingresos", sociedades: "Impuesto de sociedades", productos: "Impuestos especiales" };
    const filas = Object.entries(NOMBRES).map(([k, n]) => [n, r[k]]).filter(([, x]) => x).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const max = filas[0][1];
    caja.textContent = "";
    for (const [n, x] of filas) {
      const a = document.createElement("span"); a.textContent = n;
      const b = document.createElement("span"); b.className = "b"; b.style.width = `${(100 * x) / max}%`;
      const c = document.createElement("span"); c.className = "n"; c.textContent = numero(Math.round(x), 0);
      caja.append(a, b, c);
    }
    caja.setAttribute("aria-label", `De cada 100 € que entraron en ${ingresos.años.at(-1)}: ${filas.map(([n, x]) => `${n}, ${Math.round(x)}`).join("; ")}.`);
    const f = document.getElementById("reparto-fuente");
    f.textContent = "Fuente: Eurostat e IGAE. ";
    f.appendChild(etiquetaTipo("lectura"));
  }
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
    document.getElementById(id).parentElement.appendChild(s);
  };
  if (h("gastos")) {
    persona("k-ingresos", `${eurosHablados(h("ingresos"))} por habitante en el año.`);
    persona("k-gastos", `${eurosHablados(h("gastos"))} por habitante en el año.`);
    persona("k-saldo", `${eurosHablados(Math.abs(h("saldo")))} por habitante en el año.`);
    persona("k-deuda", `${eurosHablados(h("deuda"))} por habitante, en total. No es lo que debe cada persona: es la deuda dividida entre todos, para hacerse una idea de su tamaño.`);
  }

  // ¿Es mucho o poco? La media de la Unión Europea ese mismo año, con las mismas reglas (Eurostat).
  const ue = (k) => aapp.ue?.indicadores?.[k]?.EU27_2020?.[i];
  const media = (id, k, signo = 1) => {
    if (ue(k) === null || ue(k) === undefined) return;
    const s = document.createElement("span");
    s.className = "media-ue";
    s.textContent = `Media de la UE: ${numero(signo * ue(k), 1)} %.`;
    document.getElementById(id).parentElement.appendChild(s);
  };
  media("k-ingresos", "ingresos");
  media("k-gastos", "gastos");
  media("k-saldo", "saldo", saldo < 0 ? -1 : 1);
  media("k-deuda", "deuda");

  // Lo del año en curso no va en la portada: dos cifras de déficit en la misma tarjeta confundían. Está en cuentas.

  if (gasto) {
    const r = gasto.reparto.at(-1);
    const top = gasto.funciones.map((f) => ({ n: nombreLlano(f.codigo, f.nombre), v: r[f.codigo] })).sort((a, b) => b.v - a.v);
    pon("k-gastos-explica", `del PIB. En ${gasto.años.at(-1)}, ${numero(Math.round(top[0].v), 0)} de cada 100 € fueron a ${top[0].n}.`);
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
    pon("q-promesas", `${numero(promesas.distintas, 0)} promesas de ${promesas.documentos} documentos (programas de los partidos y acuerdos para formar Gobierno), con su cita literal y lo que se hizo después. No decimos si se cumplieron: enseñamos los hechos.`);
  }
  lineaFuente(document.getElementById("claves-fuente"), {
    fuentes: aapp.fuentes, tablas: [["gov_10a_main", "ingresos, gastos y saldo"], ["gov_10dd_edpt1", "deuda"]],
    tipo: "dato", nota: `Porcentajes del PIB de ${año} que publica Eurostat.`,
  });
}

arrancar();
