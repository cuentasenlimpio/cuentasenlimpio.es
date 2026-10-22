// Cuentas en limpio: página «¿Cuánto paga un sueldo?». Cálculo en sueldo-calculo.js; parámetros en sueldo.json.
"use strict";

const EDAD_HIJO = [["m3", "Menos de 3 años"], ["3a5", "De 3 a 5 años"], ["6a15", "De 6 a 15 años"], ["16a24", "De 16 a 24 años"]];
const FORALES = ["Álava", "Bizkaia", "Gipuzkoa", "Navarra"];
const euros = (v) => `${numero(Math.round(v), 0)} €`;

async function arrancarSueldo() {
  let P, g, aapp;
  try {
    [P, g, aapp] = await Promise.all(["sueldo.json", "datos/gasto.json", "datos/aapp.json"].map((u) => fetch(u).then((r) => r.json())));
  } catch {
    document.getElementById("s-frase").textContent = "No se han podido cargar los datos de la calculadora.";
    return;
  }
  const $ = (id) => document.getElementById(id);
  const sel = $("s-territorio");
  const grupos = [
    ["Comunidades de régimen común", Object.keys(P.territorios).filter((t) => P.territorios[t].regimen === "comun" && !P.territorios[t].ceuta_melilla)],
    ["Ciudades autónomas", ["Ceuta", "Melilla"]],
    ["Haciendas forales (País Vasco y Navarra)", FORALES],
  ];
  for (const [nombre, lista] of grupos) {
    const og = document.createElement("optgroup");
    og.label = nombre;
    for (const t of lista.sort((a, b) => a.localeCompare(b, "es"))) og.appendChild(new Option(t, t));
    sel.appendChild(og);
  }

  const pintarHijos = () => {
    const n = +$("s-hijos").value, caja = $("s-edades-hijos");
    const previas = [...caja.querySelectorAll("select")].map((s) => s.value);
    caja.textContent = "";
    for (let i = 0; i < n; i++) {
      const l = document.createElement("label");
      l.textContent = `Edad del hijo ${i + 1}`;
      const s = document.createElement("select");
      for (const [v, t] of EDAD_HIJO) s.appendChild(new Option(t, v));
      s.value = previas[i] || "6a15";
      l.appendChild(s);
      caja.appendChild(l);
    }
    caja.hidden = !n;
    $("s-comparte-et").hidden = !n;
  };

  const calcular = () => {
    // Se acepta «30000», «30.000» o «30.000 €»: solo cuentan las cifras (los céntimos no hacen falta)
    const bruto = Math.min(1e6, Math.max(0, +$("s-bruto").value.split(",")[0].replace(/[^\d]/g, "") || 0));
    const territorio = sel.value;
    const entrada = {
      bruto, territorio, edad: $("s-edad").value, contrato: $("s-contrato").value,
      hijos: [...$("s-edades-hijos").querySelectorAll("select")].map((s) => s.value),
      comparte: $("s-comparte").checked,
    };
    pintar(P, g, aapp, entrada, calcularSueldo(P, entrada));
  };

  $("s-hijos").addEventListener("change", () => { pintarHijos(); calcular(); });
  $("sueldo-form").addEventListener("input", calcular);
  // Al salir del campo, el sueldo se vuelve a escribir con el punto de los miles
  $("s-bruto").addEventListener("blur", () => {
    const v = +$("s-bruto").value.split(",")[0].replace(/[^\d]/g, "");
    if (v) $("s-bruto").value = numero(v, 0);
  });
  $("sueldo-form").addEventListener("submit", (ev) => ev.preventDefault());
  $("s-comprobado").textContent = `Leyes y tipos de ${P.ejercicio}, comprobados el ${P.comprobado}.`;
  calcular();
}

function fila(tabla, { nombre, detalle, cifra, clase, barra }) {
  const tr = tabla.insertRow();
  if (clase) tr.className = clase;
  const a = tr.insertCell();
  a.textContent = nombre;
  for (const d of [].concat(detalle || [])) {
    const s = document.createElement("span");
    s.className = "detalle";
    s.textContent = d;
    a.appendChild(s);
  }
  if (barra !== undefined) {
    const b = document.createElement("span");
    b.className = "barra";
    b.style.width = `${barra}%`;
    a.appendChild(b);
  }
  const c = tr.insertCell();
  c.className = "cifra";
  c.textContent = cifra;
}

function pintar(P, g, aapp, e, r) {
  const $ = (id) => document.getElementById(id);
  const t = P.territorios[e.territorio];
  const iva = r.iva.iva;
  const pagado = r.cotTrabajador + r.irpf.total + (iva || 0);
  const pagas = e.bruto ? ` Al mes, ${eurosHablados(r.neto / 14)} en 14 pagas o ${eurosHablados(r.neto / 12)} en 12.` : "";

  // La frase
  $("s-frase").textContent = !e.bruto ? "Falta el sueldo para hacer el cálculo."
    : `Con ${euros(e.bruto)} brutos al año en ${e.territorio}, quedan ${eurosHablados(r.neto)} netos.${pagas} `
      + `Por el camino se pagan ${eurosHablados(r.cotTrabajador)} de cotizaciones y ${eurosHablados(r.irpf.total)} de IRPF`
      + (iva === null ? "." : `. Con lo que se suele gastar con esa renta, el IVA sería de ${eurosHablados(iva)} más al año.`);

  // Del sueldo a lo que queda
  const tabla = $("s-tabla");
  tabla.textContent = "";
  fila(tabla, { nombre: "Sueldo bruto al año", cifra: euros(e.bruto) });
  const tipoCot = e.bruto ? (100 * r.cotTrabajador) / e.bruto : 0;
  fila(tabla, {
    nombre: "Cotizaciones a la Seguridad Social que paga el trabajador",
    detalle: [`El ${numero(tipoCot, 2)} % del sueldo: pensiones, bajas, paro y formación.`,
      ...(r.tope ? ["El sueldo pasa del tope de cotización: por encima de él solo se paga una cotización de solidaridad pequeña."] : [])],
    cifra: `− ${euros(r.cotTrabajador)}`,
  });
  const detIrpf = [];
  if (t.regimen === "comun") detIrpf.push(`Parte del Estado: ${euros(r.irpf.estatal)}. Parte de ${["Ceuta", "Melilla"].includes(e.territorio) ? "la ciudad" : "la comunidad"}: ${euros(r.irpf.autonomica)}.`);
  else detIrpf.push(`Lo cobra la Hacienda foral de ${e.territorio}, con sus propias normas.`);
  for (const p of r.irpf.partes) if (t.regimen === "comun") detIrpf.push(`${p.nombre}: ${euros(p.importe)}.`);
  fila(tabla, { nombre: "IRPF (impuesto sobre la renta)", detalle: detIrpf, cifra: `− ${euros(r.irpf.total)}` });
  fila(tabla, { nombre: "Lo que queda: sueldo neto", detalle: e.bruto ? `${euros(r.neto / 14)} al mes en 14 pagas; ${euros(r.neto / 12)} en 12.` : "", cifra: euros(r.neto), clase: "fila-total" });
  if (iva === null) fila(tabla, { nombre: "IVA", detalle: r.iva.aviso, cifra: "—" });
  else fila(tabla, {
    nombre: "IVA estimado de lo que se compra en un año",
    detalle: `Si gasta como la media de quienes tienen esa renta: unos ${euros(r.iva.gasto)} al año en compras, sin contar el alquiler.`,
    cifra: `− ${euros(iva)}`,
  });
  fila(tabla, {
    nombre: "Total pagado en estos impuestos", clase: "fila-total",
    detalle: e.bruto ? `Unos ${numero(Math.round((100 * pagado) / e.bruto), 0)} de cada 100 € del sueldo bruto.` : "",
    cifra: euros(pagado),
  });
  fila(tabla, {
    nombre: "Aparte: cotizaciones que paga la empresa por ese sueldo", clase: "aparte",
    detalle: `No salen del sueldo, pero son parte de lo que cuesta ese puesto: en total, ${euros(e.bruto + r.cotEmpresa)} al año.`,
    cifra: euros(r.cotEmpresa),
  });
  const pf = $("s-fuente-tabla");
  pf.textContent = "Fuente: la ley del IRPF y las normas de cada comunidad, la orden de cotización de 2026 y la Encuesta de Presupuestos Familiares del INE (ver «Normas y datos que usa»). ";
  pf.appendChild(etiquetaTipo("lectura"));

  // A qué va
  const año = g.años.at(-1), rep = g.reparto.at(-1);
  const filas = g.funciones.map((f) => ({
    nombre: f.codigo === "GF01" ? "funcionamiento de las administraciones, sin intereses (servicios generales)" : nombreLlano(f.codigo, f.nombre),
    v: rep[f.codigo],
  }));
  filas.push({ nombre: "intereses de la deuda", v: rep.intereses });
  filas.sort((a, b) => b.v - a.v);
  $("s-reparto-intro").textContent = `Los impuestos no van a un gasto concreto: se juntan con el resto de ingresos y pagan todo el presupuesto. `
    + `Lo que sí se puede hacer es ver qué tamaño tendría cada parte si los ${euros(pagado)} se repartieran como se repartió todo el gasto público en ${año}.`;
  const rt = $("s-reparto");
  rt.textContent = "";
  const max = filas[0].v;
  for (const f of filas) {
    const nombre = f.nombre.charAt(0).toUpperCase() + f.nombre.slice(1);
    fila(rt, { nombre, detalle: `${numero(f.v, 1)} de cada 100 €`, cifra: euros((pagado * f.v) / 100), barra: (100 * f.v) / max });
  }
  lineaFuente($("s-fuente-reparto"), {
    fuentes: aapp.fuentes, tablas: [["gov_10a_exp", "gasto de las administraciones públicas por funciones"]], tipo: "lectura",
    nota: `Reparto de ${año}, el último publicado; los euros son una multiplicación nuestra.`,
  });

  // Supuestos
  const sup = [
    "Un solo sueldo durante todo el año, a jornada completa y sin otras rentas (ni alquileres, ni intereses, ni un segundo trabajo). Declaración individual.",
    "El IRPF es el de la declaración de la renta. Lo que se retiene cada mes en la nómina puede ser algo distinto; la diferencia se ajusta al hacer la declaración.",
    "Sin deducciones que dependan de gastos o de situaciones concretas: alquiler, discapacidad, familia numerosa con título, donativos o planes de pensiones, entre otras. Con ellas, el IRPF sería menor.",
    "Las cotizaciones son las de un puesto de los grupos 4 a 7 (la mayoría de los empleos). En la parte de la empresa, la cotización por accidentes de trabajo se supone la de un trabajo de oficina (1,5 %); en otros oficios es más alta.",
  ];
  if (e.hijos.length) sup.push(e.comparte
    ? "Las ventajas por los hijos se reparten a medias con la otra madre o padre, como manda la ley cuando los dos tienen derecho."
    : "Las ventajas por los hijos son enteras para esta persona.");
  if (t.no_calculado) sup.push(`En ${e.territorio} hay otra deducción que no se calcula: ${t.no_calculado}`);
  if (t.regimen === "navarra") sup.push("Navarra: calculado con su ley foral de 2026. Aún no hay un ejemplo oficial de ese año con el que contrastarlo.");
  if (e.territorio === "Álava") sup.push("Álava: no se cuenta la rebaja de 200 € para quien vive en pueblos pequeños.");
  if (iva !== null) sup.push(
    "IVA: se supone que gasta como la media de los hogares con su misma renta, según la Encuesta de Presupuestos Familiares de 2025 del INE, con los tipos de IVA de 2026. El alquiler de vivienda no lleva IVA.",
    "Solo se cuenta el IVA que va en el precio. No entran otros impuestos de lo que se compra (gasolina, luz, tabaco, alcohol, seguros) ni el IVA que pagan médicos, colegios o bancos por lo que compran y que acaba en sus precios.",
    "La encuesta recoge menos gasto que las cuentas nacionales, así que el IVA real de la media de los hogares es algo mayor que esta estimación.");
  const ul = $("s-supuestos-lista");
  ul.textContent = "";
  for (const s of sup) { const li = document.createElement("li"); li.textContent = s; ul.appendChild(li); }

  const un = $("s-normas");
  un.textContent = "";
  for (const f of [...P.fuentes, { texto: `${e.territorio}: ${t.norma}`, url: t.url }]) {
    const li = document.createElement("li"), a = document.createElement("a");
    a.href = f.url; a.textContent = f.texto;
    li.appendChild(a); un.appendChild(li);
  }
}

document.addEventListener("DOMContentLoaded", arrancarSueldo);
