// Cuentas en limpio: «¿Cuánto paga el País Vasco al Estado por el cupo?». Actas de la Comisión Mixta del Concierto
// Económico (copiadas a mano en datos/cupo_vasco.json y comprobadas cada día) y presupuesto de ingresos del Estado.
"use strict";

const mill = (miles) => numero(Math.round(miles / 1000), 0);  // las actas van en miles de euros
const mill1 = (miles) => numero(Math.round(miles / 100) / 10, 1);

async function arrancarCupo() {
  let d, aapp;
  try {
    [d, aapp] = await Promise.all(["datos/cupo_vasco.json", "datos/aapp.json"].map((u) => fetch(u).then((r) => r.json())));
  } catch {
    document.getElementById("respuesta").textContent = "No se han podido cargar los datos.";
    return;
  }
  const $ = (id) => document.getElementById(id);
  const fuente = [[d.tabla, "actas de la Comisión Mixta del Concierto Económico"]];
  const enlaceActa = (t) => {
    const a = document.createElement("a");
    a.href = `${d.actas[t.acta].url}#page=${t.pagina}`;
    a.textContent = `${t.acta}, p. ${t.pagina}`;
    return a;
  };
  const def = [...d.detalle].reverse().find((a) => a.definitivo);
  const prov = [...d.detalle].reverse().find((a) => a.provisional && !a.definitivo);
  const D = def.definitivo;

  const r = $("respuesta");
  r.textContent = "";
  const s1 = document.createElement("strong");
  s1.textContent = `El cupo de ${def.año} fue de ${mill(D.cupo)} millones de euros`;
  r.append(s1, `; descontadas las compensaciones, el líquido a pagar al Estado fue de ${mill(D.a_pagar)} millones.`);
  if (prov) r.append(` Para ${prov.año}, el cupo provisional es de ${mill(prov.provisional.cupo)} millones; el definitivo llegará cuando se liquide el año.`);

  const caja = $("cifras");
  caja.textContent = "";
  const base = d.años_base.at(-1);
  for (const [nombre, valor, explica] of [
    [`Cupo definitivo, ${def.año}`, `${mill(D.cupo)} M€`, `acta ${D.acta}.`],
    [`A pagar, ${def.año}`, `${mill(D.a_pagar)} M€`, "el cupo menos las compensaciones (Álava y dependencia)."],
    ...(prov ? [[`Cupo provisional, ${prov.año}`, `${mill(prov.provisional.cupo)} M€`, `acta ${prov.provisional.acta}.`]] : []),
    ["Parte del País Vasco", `${numero(base.indice_imputacion, 2)} %`, `de las cargas del Estado no asumidas; quinquenio ${d.leyes.at(-1).quinquenio}.`]]) {
    const dv = document.createElement("div");
    const a = document.createElement("span"); a.className = "nombre"; a.textContent = nombre;
    const b = document.createElement("span"); b.className = "valor"; b.textContent = valor;
    const c = document.createElement("span"); c.className = "explica"; c.textContent = explica;
    dv.append(a, b, c);
    caja.appendChild(dv);
  }
  lineaFuente($("cifras-fuente"), { fuentes: aapp.fuentes, tablas: fuente, tipo: "dato",
    nota: `Acta ${D.acta}, página ${D.pagina}${prov ? `; acta ${prov.provisional.acta}, página ${prov.provisional.pagina}` : ""}. Las actas no se republican: se enlazan en la tabla de abajo.` });

  EC.barras($("g1"), { años: d.años, formato: (v) => numero(Math.round(v), 0), formatoLectura: (v) => `${numero(Math.round(v), 0)} M€`, eje: "M€",
    aria: `Cupo provisional y definitivo del País Vasco, ${d.años[0]}–${d.años.at(-1)}`,
    series: [{ nombre: "provisional", v: d.serie.provisional, color: "--c-primario" }, { nombre: "definitivo", v: d.serie.definitivo, color: "--tinta" }] });
  const faltan = d.detalle.filter((a) => !a.provisional).map((a) => a.año);
  lineaFuente($("g1-fuente"), { fuentes: aapp.fuentes, tablas: fuente, tipo: "dato",
    nota: `${faltan.length ? `No hay acta publicada con el cupo provisional de ${faltan.join(" ni de ")}. ` : ""}${prov ? `El de ${prov.año} aún no tiene definitivo.` : ""}` });

  // Cálculo del año base
  $("g2-explica").textContent = `Cálculo del cupo de ${base.año}, año base del quinquenio ${d.leyes.at(-1).quinquenio}, en millones de euros (${base.presupuesto}).`;
  const t2 = $("calculo");
  t2.textContent = "";
  const fila = (nombre, detalle, v, clase) => {
    const tr = t2.insertRow();
    if (clase) tr.className = clase;
    const a = tr.insertCell(); a.textContent = nombre;
    if (detalle) { const s = document.createElement("span"); s.className = "detalle"; s.textContent = detalle; a.appendChild(s); }
    const c = tr.insertCell(); c.className = "cifra"; c.textContent = `${v < 0 ? "−" : ""}${mill(Math.abs(v))} M€`;
  };
  const aj = base.ajustes_detalle;
  fila("Gastos del Estado en su presupuesto", null, base.gastos_estado);
  fila("Menos lo que ya paga el País Vasco", "competencias traspasadas: sanidad, educación, policía…", -base.cargas_asumidas);
  fila("Cargas que el País Vasco no ha asumido", "defensa, exteriores, Casa Real, intereses y devoluciones de la deuda del Estado…", base.cargas_no_asumidas, "fila-total");
  fila(`Su parte: el ${numero(base.indice_imputacion, 2)} %`, null, base.imputacion);
  fila("Ajustes y compensaciones", `déficit del Estado: −${mill(-aj.deficit)}; ingresos que no son impuestos: −${mill(-aj.ingresos_no_tributarios)}; impuestos no concertados: −${mill(-aj.tributos_no_concertados)}; impuestos directos concertados: −${mill(-aj.directos_concertados)}`, base.ajustes);
  fila("Cupo", null, base.cupo, "fila-total");
  fila("Compensación a Álava", null, base.alava);
  fila("A pagar", null, base.a_pagar, "fila-total");
  lineaFuente($("g2-fuente"), { fuentes: aapp.fuentes, tablas: fuente, tipo: "dato", nota: `Acta ${base.acta}, página ${base.pagina}; método de la ${d.leyes.at(-1).nombre}.` });
  const leyes = $("g2-fuente");
  leyes.append(" ");
  d.leyes.forEach((l, k) => {
    const a = document.createElement("a"); a.href = l.url; a.textContent = `${l.nombre} (${l.quinquenio})`;
    leyes.append(k ? " · " : "Leyes del cupo: ", a);
  });

  // Año a año
  const t3 = $("años");
  t3.textContent = "";
  const cab = t3.createTHead().insertRow();
  for (const c of ["", "Provisional", "Definitivo", "Compensaciones", "A pagar", "Actas"]) { const th = document.createElement("th"); th.textContent = c; cab.appendChild(th); }
  const cuerpo = t3.createTBody();
  const notas = $("notas");
  notas.textContent = "";
  for (const a of d.detalle) {
    const tr = cuerpo.insertRow();
    tr.insertCell().textContent = String(a.año);
    const fin = a.definitivo || a.provisional;
    for (const v of [a.provisional?.cupo, a.definitivo?.cupo, Object.values(fin.compensaciones).reduce((x, y) => x + y, 0), fin.a_pagar]) {
      const c = tr.insertCell(); c.className = "cifra";
      c.textContent = v === undefined ? "—" : `${v < 0 ? "−" : ""}${mill1(Math.abs(v))}`;
    }
    const c = tr.insertCell();
    [a.provisional, a.definitivo].filter(Boolean).forEach((t, k) => { if (k) c.append(" · "); c.appendChild(enlaceActa(t)); });
    for (const t of [a.provisional, a.definitivo]) {
      if (t?.nota) { const li = document.createElement("li"); li.textContent = `${a.año}: ${t.nota}`; notas.appendChild(li); }
    }
  }
  const li = document.createElement("li");
  li.textContent = "Compensaciones y «A pagar»: las del definitivo si ya lo hay; si no, las del provisional. Las compensaciones son la de Álava (todos los años) y la de la dependencia, nivel acordado (desde 2021).";
  notas.prepend(li);
  lineaFuente($("g3-fuente"), { fuentes: aapp.fuentes, tablas: fuente, tipo: "dato", nota: "Las actas de 2017 a 2022 son documentos escaneados: sus cifras se han copiado a mano y se comprueba cada día que cuadran entre sí." });

  // Lo que anota el Estado
  const e = d.estado;
  const t4 = $("estado");
  t4.textContent = "";
  const cab4 = t4.createTHead().insertRow();
  for (const c of ["", ...e.map((x) => String(x.año))]) { const th = document.createElement("th"); th.textContent = c; cab4.appendChild(th); }
  const cu4 = t4.createTBody();
  for (const [nombre, detalle, vals] of [["Anotado por el Estado", "derechos reconocidos del concepto «Cupo del País Vasco»", e.map((x) => x.estado)],
    ["Cupo provisional del acta", "menos la compensación a Álava", e.map((x) => x.acta_provisional)]]) {
    const tr = cu4.insertRow();
    const a = tr.insertCell(); a.textContent = nombre;
    const s = document.createElement("span"); s.className = "detalle"; s.textContent = detalle; a.appendChild(s);
    for (const v of vals) { const c = tr.insertCell(); c.className = "cifra"; c.textContent = v === null ? "—" : numero(Math.round(v), 0); }
  }
  const tablasEstado = [...new Set(e.map((x) => x.tabla))];
  lineaFuente($("estado-fuente"), { fuentes: aapp.fuentes,
    tablas: [[tablasEstado.at(-1), "presupuesto de ingresos del Estado"], ...fuente], tipo: "dato",
    nota: `Liquidación de cada año${tablasEstado.some((t) => t.startsWith("ejec_dic_")) ? " y, para el último, el avance a 31 de diciembre" : ""}. Las dos cifras solo casan algunos años: está explicado en «Lo que no cuadra».` });

  pintarComprobaciones($("comprobaciones"), d.comprobaciones);
}
document.addEventListener("DOMContentLoaded", arrancarCupo);
