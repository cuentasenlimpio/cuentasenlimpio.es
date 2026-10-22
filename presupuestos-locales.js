// Cuentas en limpio: «¿De dónde ingresan y en qué gastan ayuntamientos y diputaciones?». Liquidación de los
// presupuestos de las entidades locales (CONPREL, Ministerio de Hacienda), consolidada, desde 2003.
"use strict";

const mm = (v) => `${numero(Math.round(v), 0)} M€`;
const pct = (a, b) => `${numero((100 * a) / b, 0)} %`;

async function arrancarPL() {
  let d, aapp;
  try {
    [d, aapp] = await Promise.all(["datos/presupuestos_locales.json", "datos/aapp.json"].map((u) => fetch(u).then((r) => r.json())));
  } catch {
    document.getElementById("respuesta").textContent = "No se han podido cargar los datos.";
    return;
  }
  const $ = (id) => document.getElementById(id);
  const n = d.años.length - 1, a = d.años[n];
  const ing = d.ingresos_nofin[n], gas = d.gastos_nofin[n], saldo = ing - gas;
  const fuente = [[d.tablas.liquidacion, `liquidación de los presupuestos de las entidades locales ${a}`]];
  const av = d.avance;

  const r = $("respuesta");
  r.textContent = "";
  const s1 = document.createElement("strong");
  s1.textContent = `En ${a}, las entidades locales ingresaron ${numero(Math.round(ing), 0)} millones de euros y gastaron ${numero(Math.round(gas), 0)} millones`;
  r.append(s1, `, sin contar préstamos ni devoluciones de deuda: les ${saldo >= 0 ? "sobraron" : "faltaron"} ${numero(Math.abs(Math.round(saldo)), 0)} millones.`);
  if (av) r.append(` El avance de ${av.año}, todavía provisional, da ${numero(Math.round(av.ingresos_nofin), 0)} millones de ingresos y ${numero(Math.round(av.gastos_nofin), 0)} de gastos.`);

  const caja = $("cifras");
  caja.textContent = "";
  const personal = d.personal[n];
  for (const [nombre, valor, explica] of [
    [`Ingresos, ${a}`, mm(ing), "sin préstamos."],
    [`Gastos, ${a}`, mm(gas), "sin devoluciones de deuda."],
    [saldo >= 0 ? "Les sobró" : "Les faltó", mm(Math.abs(saldo)), "ingresos menos gastos, cálculo nuestro."],
    ["Personal", mm(personal), `el ${pct(personal, gas)} del gasto.`]]) {
    const dv = document.createElement("div");
    const x = document.createElement("span"); x.className = "nombre"; x.textContent = nombre;
    const y = document.createElement("span"); y.className = "valor"; y.textContent = valor;
    const z = document.createElement("span"); z.className = "explica"; z.textContent = explica;
    dv.append(x, y, z);
    caja.appendChild(dv);
  }
  lineaFuente($("cifras-fuente"), { fuentes: aapp.fuentes, tablas: av && d.tablas.avance ? [...fuente, [d.tablas.avance, `avance de ${av.año}`]] : fuente, tipo: "dato",
    nota: "Ingresos: capítulos 1 a 7; gastos: capítulos 1 a 7. Las sumas y la resta son un cálculo nuestro." });

  // Años en que cambia el conjunto de entidades
  const cambios = d.años.filter((x, i) => i && d.perimetros[x] !== d.perimetros[d.años[i - 1]]);
  $("g1-explica").textContent = `Ingresos y gastos no financieros (sin préstamos ni devoluciones de deuda) de todas las entidades locales, en millones de euros.${cambios.length ? ` El conjunto de entidades que entran se amplía en ${cambios.join(", ").replace(/, (\d+)$/, " y $1")}.` : ""}`;
  EC.lineas($("g1"), { x: d.años, etiquetas: d.años.map(String), formato: (v) => `${numero(Math.round(v / 1000), 0)} mil`, formatoLectura: mm, eje: "M€", min: 0,
    aria: `Ingresos y gastos no financieros de las entidades locales, ${d.años[0]}–${a}`,
    series: [{ nombre: "ingresos", v: d.ingresos_nofin, color: "--tinta" }, { nombre: "gastos", v: d.gastos_nofin, color: "--c-primario" },
      { nombre: "inversiones", v: d.inversion, color: "--linea-fuerte", discontinua: true }] });
  lineaFuente($("g1-fuente"), { fuentes: aapp.fuentes, tablas: [[d.tablas.liquidacion, `liquidaciones de ${d.años[0]} a ${a}`]], tipo: "dato", nota: "Un fichero por año; las sumas de capítulos son un cálculo nuestro." });

  // Ingresos por capítulos
  const ingr = d.ultimo.ingresos.filter((c) => c.cap <= 7);
  $("g2-explica").textContent = `Ingresos de ${a} por capítulos (derechos reconocidos), en millones de euros, sin préstamos ni activos financieros.`;
  const t = $("ingresos");
  t.textContent = "";
  const max = Math.max(...ingr.map((c) => c.reconocido));
  for (const c of [...ingr].sort((x, y) => y.reconocido - x.reconocido)) {
    const tr = t.insertRow();
    const x = tr.insertCell(); x.textContent = c.nombre;
    const det = document.createElement("span"); det.className = "detalle"; det.textContent = `${pct(c.reconocido, ing)} de los ingresos`; x.appendChild(det);
    const b = document.createElement("span"); b.className = "barra"; b.style.width = `${Math.max(1, (100 * c.reconocido) / max)}%`; x.appendChild(b);
    const y = tr.insertCell(); y.className = "cifra"; y.textContent = mm(c.reconocido);
  }
  const tt = t.insertRow(); tt.className = "fila-total";
  tt.insertCell().textContent = "Total";
  const tc = tt.insertCell(); tc.className = "cifra"; tc.textContent = mm(ing);
  lineaFuente($("g2-fuente"), { fuentes: aapp.fuentes, tablas: fuente, tipo: "dato", nota: "Los porcentajes son un cálculo nuestro." });

  // Políticas de gasto
  const P = d.programas;
  $("g3-explica").textContent = `Gasto de ${P.año} por políticas (obligaciones reconocidas, todos los capítulos), en millones de euros, y el de ${P.inicial}, el primer año con esta clasificación.`;
  const t3 = $("politicas");
  t3.textContent = "";
  const cab = t3.createTHead().insertRow();
  for (const c of ["", String(P.año), String(P.inicial)]) { const th = document.createElement("th"); th.textContent = c; cab.appendChild(th); }
  const cu = t3.createTBody();
  for (const p of [...P.politicas].sort((x, y) => y.total - x.total)) {
    const tr = cu.insertRow();
    const x = tr.insertCell(); x.textContent = p.nombre.replace(/^\s+/, "");
    for (const v of [p.total, p.inicial]) { const c = tr.insertCell(); c.className = "cifra"; c.textContent = v === null ? "—" : numero(Math.round(v), 0); }
  }
  const tr3 = cu.insertRow(); tr3.className = "fila-total";
  tr3.insertCell().textContent = "Total";
  const c3 = tr3.insertCell(); c3.className = "cifra"; c3.textContent = numero(Math.round(P.total), 0);
  tr3.insertCell().className = "cifra";
  const notas = $("notas-politicas");
  notas.textContent = "";
  if (P.forales_94) {
    const li = document.createElement("li");
    li.textContent = `«Transferencias a otras Administraciones Públicas» es sobre todo lo que las diputaciones forales del País Vasco, que cobran los impuestos, pasan al Gobierno Vasco y al Estado (el cupo): ${numero(Math.round(P.forales_94), 0)} millones en ${P.año}, antes de quitar lo que se pagan entre entidades locales.`;
    notas.appendChild(li);
  }
  const li2 = document.createElement("li");
  li2.textContent = "«Bienestar comunitario» es sobre todo recogida de basuras, limpieza, agua y alumbrado. El total incluye intereses y devoluciones de deuda, por eso es mayor que el gasto de arriba.";
  notas.appendChild(li2);
  lineaFuente($("g3-fuente"), { fuentes: aapp.fuentes, tablas: fuente, tipo: "dato", nota: "Clasificación por programas de la Orden EHA/3565/2008, en vigor desde 2010." });

  // Ejecución por capítulos
  const t4 = $("ejecucion");
  t4.textContent = "";
  const cab4 = t4.createTHead().insertRow();
  for (const c of ["", "Presupuestado", "Gastado", "Gastado de cada 100 €"]) { const th = document.createElement("th"); th.textContent = c; cab4.appendChild(th); }
  const cu4 = t4.createTBody();
  for (const c of d.ultimo.gastos.filter((x) => x.definitivo && x.cap !== 5)) {
    const tr = cu4.insertRow();
    tr.insertCell().textContent = c.nombre;
    for (const v of [numero(Math.round(c.definitivo), 0), numero(Math.round(c.reconocido), 0), numero(Math.round((100 * c.reconocido) / c.definitivo), 0)]) {
      const x = tr.insertCell(); x.className = "cifra"; x.textContent = v;
    }
  }
  $("g4-explica").textContent = `Créditos definitivos (lo presupuestado con los cambios del año) y obligaciones reconocidas (lo gastado) en ${a}, por capítulos, en millones de euros. Las inversiones son las que más se quedan sin gastar: parte de su crédito se arrastra de un año a otro. No aparece el fondo de contingencia, que no se gasta como tal: se pasa a otras partidas cuando hace falta.`;
  lineaFuente($("g4-fuente"), { fuentes: aapp.fuentes, tablas: fuente, tipo: "dato", nota: "El porcentaje es un cálculo nuestro." });

  pintarComprobaciones($("comprobaciones"), d.comprobaciones);
}
document.addEventListener("DOMContentLoaded", arrancarPL);
