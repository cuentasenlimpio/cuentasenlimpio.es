// Cuentas en limpio: «¿Cuánta gente trabaja en lo público?». EPA (INE) y remuneración de asalariados (Eurostat).
"use strict";

// Tabla con barra bajo cada nombre; `resaltar` marca una fila (España en la comparación europea).
function tablaBarras(t, filas, { formato, resaltar = () => false }) {
  t.textContent = "";
  const max = Math.max(...filas.map((f) => f.v));
  for (const f of filas) {
    const tr = t.insertRow();
    if (resaltar(f)) tr.className = "fila-es";
    const a = tr.insertCell();
    a.textContent = f.nombre;
    if (f.detalle) { const d = document.createElement("span"); d.className = "detalle"; d.textContent = f.detalle; a.appendChild(d); }
    const b = document.createElement("span"); b.className = "barra"; b.style.width = `${Math.max(1, (100 * f.v) / max)}%`;
    a.appendChild(b);
    const c = tr.insertCell(); c.className = "cifra"; c.textContent = formato(f.v);
  }
}

const trimestreLegible = (t) => `${["primer", "segundo", "tercer", "cuarto"][Number(t.slice(-1)) - 1]} trimestre de ${t.slice(0, 4)}`;
const miles = (v) => `${numero(Math.round(v), 0)} mil`;

async function arrancarEP() {
  let d, aapp;
  try {
    [d, aapp] = await Promise.all(["datos/empleo_publico.json", "datos/aapp.json"].map((u) => fetch(u).then((r) => r.json())));
  } catch {
    document.getElementById("respuesta").textContent = "No se han podido cargar los datos.";
    return;
  }
  const $ = (id) => document.getElementById(id);
  const e = d.epa, rem = d.remuneracion;
  const i = e.trimestres.length - 1, t = e.trimestres[i];
  const ia = e.trimestres.indexOf(`${Number(t.slice(0, 4)) - 1}${t.slice(4)}`);
  const admin = Object.fromEntries(e.admin.map((a) => [a.clave, a]));
  const de100 = (a, b) => Math.round((100 * a) / b);
  const ri = rem.años.length - 1, rAño = rem.años[ri];

  const r = $("respuesta");
  r.textContent = "";
  const s1 = document.createElement("strong");
  s1.textContent = `En el ${trimestreLegible(t)}, unos ${numero(Math.round(e.total[i] / 10) / 100, 2)} millones de asalariados trabajaban para el sector público: ${numero(e.pct_asalariados[i], 0)} de cada 100 de los que trabajan por cuenta ajena`;
  r.append(s1, `. ${de100(admin.comunidades.v[i], e.total[i])} de cada 100 lo hacían para una comunidad autónoma. En ${rAño}, las administraciones pagaron ${numero(Math.round(rem.total.meur[ri] / 1000), 0)} mil millones de euros en sueldos y cotizaciones de su personal: el ${numero(rem.total.pib[ri], 1)} % del PIB y ${numero(Math.round(rem.pct_gasto[ri]), 0)} de cada 100 € de todo el gasto público.`);

  const caja = $("cifras");
  caja.textContent = "";
  const cifra = (nombre, valor, explica) => {
    const dv = document.createElement("div");
    const a = document.createElement("span"); a.className = "nombre"; a.textContent = nombre;
    const b = document.createElement("span"); b.className = "valor"; b.textContent = valor;
    const c = document.createElement("span"); c.className = "explica"; c.textContent = explica;
    dv.append(a, b, c);
    caja.appendChild(dv);
  };
  const variacionAnual = ia >= 0 ? e.total[i] - e.total[ia] : null;
  cifra(`Asalariados públicos, ${t.replace("T", " T")}`, miles(e.total[i]),
    variacionAnual === null ? "personas, según la EPA." : `personas; ${variacionAnual >= 0 ? "+" : "−"}${miles(Math.abs(variacionAnual))} en un año, según la EPA.`);
  cifra("De cada 100 asalariados", `${numero(e.pct_asalariados[i], 1)}`, "trabajan para el sector público.");
  cifra("Con contrato temporal", `${numero(e.pct_temporal[i], 1)} %`, "de los asalariados públicos.");
  cifra(`Sueldos públicos, ${rAño}`, `${numero(rem.total.pib[ri], 1)} %`, `del PIB: ${numero(Math.round(rem.total.meur[ri]), 0)} millones de euros, con las cotizaciones que paga la administración.`);
  lineaFuente($("cifras-fuente"), { fuentes: aapp.fuentes, tablas: [["ine_epa416131", "EPA: asalariados del sector público"], ["ine_epa450290", "EPA: % de asalariados públicos"], ["ine_epa416424", "EPA: % de temporales"], ["gov_10a_main", "remuneración de asalariados de las administraciones (D.1)"]], tipo: "dato" });

  const xT = e.trimestres.map((t) => Number(t.slice(0, 4)) + (Number(t.slice(-1)) - 1) / 4);
  const etT = e.trimestres.map((t) => `${["1.er", "2.º", "3.er", "4.º"][Number(t.slice(-1)) - 1]} trimestre de ${t.slice(0, 4)}`);
  EC.lineas($("g1"), { x: xT, etiquetas: etT, formato: (v) => numero(Math.round(v), 0), formatoLectura: (v) => `${numero(Math.round(v), 0)} mil`,
    eje: "miles", min: 0, aria: `Asalariados del sector público por administración, en miles, ${e.trimestres[0]}–${t}`,
    series: [{ nombre: "comunidades autónomas", v: admin.comunidades.v, color: "--c-primario" },
      { nombre: "ayuntamientos, diputaciones y cabildos", v: admin.local.v, color: "--tinta" },
      { nombre: "Administración central", v: admin.central.v, color: "--linea-fuerte", discontinua: true }] });
  lineaFuente($("g1-fuente"), { fuentes: aapp.fuentes, tablas: [["ine_epa416134", "EPA: asalariados públicos en las comunidades autónomas"], ["ine_epa416135", "en la Administración local"], ["ine_epa416132", "en la Administración central"]], tipo: "dato" });
  $("reparto-t").textContent = `Todos los tipos de administración en el ${trimestreLegible(t)}, en miles de personas. Fuente: INE, Encuesta de Población Activa (tabla 65193).`;
  tablaBarras($("reparto"), e.admin.filter((a) => a.v[i] !== null).map((a) => ({ nombre: a.nombre, v: a.v[i] })).sort((a, b) => b.v - a.v), { formato: miles });

  EC.lineas($("g2"), { x: xT, etiquetas: etT, formato: (v) => `${numero(v, 0)} %`, formatoLectura: (v) => `${numero(v, 1)} %`, eje: "%", min: 0,
    aria: `Asalariados públicos en % del total y temporales en % de los públicos, ${e.trimestres[0]}–${t}`,
    series: [{ nombre: "públicos, de cada 100 asalariados", v: e.pct_asalariados, color: "--c-primario" },
      { nombre: "temporales, de cada 100 asalariados públicos", v: e.pct_temporal, color: "--tinta" }] });
  lineaFuente($("g2-fuente"), { fuentes: aapp.fuentes, tablas: [["ine_epa450290", "EPA: % de asalariados públicos"], ["ine_epa416424", "EPA: % de temporales en el sector público"]], tipo: "dato" });

  const rg = d.registro;
  if (rg) {
    const ed = rg.ediciones, ul = ed.at(-1);
    const nomPer = (p) => `${p.endsWith("-01") ? "enero" : "julio"} ${p.slice(0, 4)}`;
    $("rcp-explica").textContent = `Efectivos de las administraciones según la estadística del Registro Central de Personal: ${numero(ul.total, 0)} en ${nomPer(ul.periodo)}. Es semestral; las ediciones desde julio de 2023 se revisaron en agosto de 2026 y son comparables entre sí; las anteriores, no.`;
    const t = $("rcp-serie");
    t.textContent = "";
    const cab = t.createTHead().insertRow();
    for (const c of ["", ...ed.map((x) => nomPer(x.periodo))]) { const th = document.createElement("th"); th.textContent = c; cab.appendChild(th); }
    const cuerpo = t.createTBody();
    for (const [n, k, total] of [["Estado", "estado"], ["Comunidades autónomas", "ccaa"], ["Entidades locales", "local"], ["Total", "total", true]]) {
      const tr = cuerpo.insertRow();
      if (total) tr.className = "fila-total";
      tr.insertCell().textContent = n;
      for (const x of ed) { const c = tr.insertCell(); c.className = "cifra"; c.textContent = numero(x[k], 0); }
    }
    const t2 = $("rcp-reparto");
    t2.textContent = "";
    const max = Math.max(...rg.ultima.sub.map((x) => x.v));
    const NOMBRES_RCP = { "INSTITUCIONES SANITARIAS": "Instituciones sanitarias", "DOCENCIA NO UNIVERSITARIA": "Docencia no universitaria",
      "AYUNTAMIENTOS Y OTRAS ENTIDADES LOCALES Y SUS OOAA": "Ayuntamientos y otras entidades locales, con sus organismos",
      "FUERZAS ARMADAS Y FUERZAS Y CUERPOS DE SEGURIDAD DEL ESTADO": "Fuerzas Armadas y Fuerzas y Cuerpos de Seguridad del Estado",
      "ADMINISTRACION DEL ESTADO": "Administración del Estado", "ADMINISTRACION GENERAL CCAA": "Administración general de las comunidades",
      "UNIVERSIDADES": "Universidades públicas", "DIPUTACIONES CABILDOS Y CONSEJOS INSULARES Y SUS OOAA": "Diputaciones, cabildos y consejos insulares, con sus organismos",
      "ADMINISTRACION DE JUSTICIA": "Administración de Justicia", "POLICIA": "Policías autonómicas",
      "ADMINISTRACION AL SERVICIO DE TRIBUNALES DE INSTANCIA": "Administración al servicio de los tribunales de instancia" };
    const minus = (s) => NOMBRES_RCP[s] || s.charAt(0) + s.slice(1).toLowerCase();
    for (const x of rg.ultima.sub) {
      const tr = t2.insertRow();
      const a = tr.insertCell(); a.textContent = minus(x.nombre);
      const sp = document.createElement("span"); sp.className = "detalle"; sp.textContent = { estado: "Estado", ccaa: "Comunidades autónomas", local: "Entidades locales" }[x.admin] || "";
      a.appendChild(sp);
      const b = document.createElement("span"); b.className = "barra"; b.style.width = `${(100 * x.v) / max}%`; a.appendChild(b);
      const c = tr.insertCell(); c.className = "cifra"; c.textContent = numero(x.v, 0);
    }
    lineaFuente($("rcp-fuente"), { fuentes: aapp.fuentes, tablas: [[rg.ultima.tabla, `estadística del personal al servicio de las administraciones, ${nomPer(ul.periodo)}`]], tipo: "dato",
      nota: `De ellos, ${numero(rg.ultima.tipos["PERSONAL FUNCIONARIO DE CARRERA"], 0)} funcionarios de carrera (con el personal estatutario de la sanidad), ${numero(rg.ultima.tipos["PERSONAL LABORAL"], 0)} laborales y ${numero(rg.ultima.tipos["OTRO PERSONAL"], 0)} de otro tipo (interinos, eventuales…). Esta cifra no tiene todavía una segunda fuente con la que contrastarla.` });
  }

  if (d.ccaa) {
    $("g3-explica").textContent = `De cada 100 asalariados de cada comunidad autónoma, cuántos trabajan para el sector público, en el ${trimestreLegible(d.ccaa.periodo)}. En el conjunto de España: ${numero(d.ccaa.total, 1)}.`;
    tablaBarras($("ccaa"), [...d.ccaa.filas].sort((a, b) => b.pct - a.pct).map((c) => ({ nombre: c.nombre, v: c.pct })), { formato: (v) => numero(v, 1) });
    lineaFuente($("g3-fuente"), { fuentes: aapp.fuentes, tablas: [[d.ccaa.tabla, "EPA: asalariados por sector y comunidad autónoma"]], tipo: "dato", nota: "En Ceuta, Melilla y las comunidades pequeñas el error de muestreo de la EPA es grande." });
  }

  EC.lineas($("g4"), { x: rem.años, etiquetas: rem.años.map(String), formato: (v) => `${numero(v, 1)} %`, eje: "% del PIB",
    aria: `Remuneración de asalariados de las administraciones públicas en % del PIB, ${rem.años[0]}–${rAño}`,
    series: [{ nombre: "del PIB", v: rem.total.pib, color: "--c-primario" }, { nombre: "", v: rem.total.meur, soloLectura: true, formato: (v) => `${numero(Math.round(v), 0)} M€` },
      { nombre: "de cada 100 € de gasto público", v: rem.pct_gasto, soloLectura: true, formato: (v) => numero(v, 1) }] });
  lineaFuente($("g4-fuente"), { fuentes: aapp.fuentes, tablas: [["gov_10a_main", "remuneración de asalariados de las administraciones (D.1, sector S13)"]], tipo: "dato" });
  tablaBarras($("subsectores"), [["Comunidades autónomas", "comunidades"], ["Estado y sus organismos", "estado"], ["Ayuntamientos, diputaciones y cabildos", "local"], ["Seguridad Social", "seguridad_social"]]
    .map(([n, k]) => ({ nombre: n, v: rem[k].meur[ri], detalle: `${numero(rem[k].pib[ri], 1)} % del PIB` })), { formato: (v) => `${numero(Math.round(v), 0)} M€` });
  lineaFuente($("subsectores-fuente"), { fuentes: aapp.fuentes, tablas: [["gov_10a_main", `remuneración de asalariados por subsector en ${rAño} (S1311, S1312, S1313 y S1314)`]], tipo: "dato" });

  if (d.ue) {
    const pos = d.ue.paises.filter((p) => p.geo !== "EU27_2020").findIndex((p) => p.geo === "ES") + 1;
    const media = d.ue.paises.find((p) => p.geo === "EU27_2020");
    $("g5-explica").textContent = `Remuneración de los asalariados de las administraciones públicas en porcentaje del PIB de cada país, en ${d.ue.año}. España ocupa el puesto ${pos} de 27${media ? `; la media de la UE es el ${numero(media.v, 1)} %` : ""}.`;
    tablaBarras($("ue"), d.ue.paises.map((p) => ({ nombre: p.nombre, v: p.v })), { formato: (v) => `${numero(v, 1)} %`, resaltar: (f) => f.nombre === "España" || f.nombre === "UE-27" });
    lineaFuente($("g5-fuente"), { fuentes: aapp.fuentes, tablas: [["ue_gov_10a_main", "remuneración de asalariados de las administraciones en % del PIB (UE-27)"]], tipo: "dato" });
  }
}
document.addEventListener("DOMContentLoaded", arrancarEP);
