// Cuentas en limpio: «¿Cómo va este año?». Datos en datos/este_ano.json (los rehace la construcción diaria).
"use strict";

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES_LARGOS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const mm = (v) => `${numero(Math.round(v), 0)} M€`;
const mmHablado = (v) => `unos ${numero(Math.round(Math.abs(v) / 100) * 100, 0)} millones de euros`;
const variacion = (a, b) => (b ? (100 * (a - b)) / Math.abs(b) : null);
const conSignoPct = (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${numero(Math.abs(v), 1)} %`;

function cifra(caja, nombre, valor, explica, clase = "") {
  const d = document.createElement("div");
  if (clase) d.className = clase;
  const n = document.createElement("span"); n.className = "nombre"; n.textContent = nombre;
  const v = document.createElement("span"); v.className = "valor"; v.textContent = valor;
  const e = document.createElement("span"); e.className = "explica"; e.textContent = explica;
  d.append(n, v, e);
  caja.appendChild(d);
}

async function arrancarEsteAno() {
  let d, aapp;
  try {
    [d, aapp] = await Promise.all(["datos/este_ano.json", "datos/aapp.json"].map((u) => fetch(u).then((r) => r.json())));
  } catch {
    document.getElementById("respuesta").textContent = "No se han podido cargar los datos del año.";
    return;
  }
  const $ = (id) => document.getElementById(id);
  const frase = $("respuesta");
  frase.textContent = "";

  // Déficit acumulado
  const def = d.deficit;
  if (def) {
    const a = def.actual, p = def.anterior;
    const falta = a.saldo < 0;
    const s1 = document.createElement("strong");
    s1.textContent = `Hasta ${def.mes_nombre} de ${def.año}, ${falta ? "faltaron" : "sobraron"} ${mmHablado(a.saldo)}`;
    frase.append(s1, ` en el Estado, las comunidades y la Seguridad Social; en los mismos meses de ${def.año - 1}, ${p.saldo < 0 ? "faltaron" : "sobraron"} ${mmHablado(p.saldo)}. `);
    $("d-ambito").textContent = `Acumulado de enero a ${def.mes_nombre}, en millones de euros. ${def.ambito}. Datos provisionales de la IGAE, actualizados el ${def.actualizado}.`;
    const caja = $("d-cifras");
    caja.textContent = "";
    cifra(caja, `${falta ? "Faltó" : "Sobró"} (enero–${def.mes_nombre} ${def.año})`, mm(Math.abs(a.saldo)),
      `El ${numero(Math.abs(a.saldo_pib), 1)} % del PIB. Un año antes: ${mm(Math.abs(p.saldo))} (${numero(Math.abs(p.saldo_pib), 1)} %).`, "caja-destacada");
    cifra(caja, "Ingresos", mm(a.ingresos), `${conSignoPct(variacion(a.ingresos, p.ingresos))} frente a los mismos meses de ${def.año - 1}.`);
    cifra(caja, "Gastos", mm(a.gastos), `${conSignoPct(variacion(a.gastos, p.gastos))} frente a los mismos meses de ${def.año - 1}.`);
    cifra(caja, "De ellos, intereses", mm(a.intereses), `${conSignoPct(variacion(a.intereses, p.intereses))} frente a los mismos meses de ${def.año - 1}.`);
    $("d-pie").textContent = `Saldo acumulado desde enero, mes a mes, en millones de euros (negativo: falta dinero)`;
    EC.lineas($("d-grafico"), { x: [...Array(12).keys()], etiquetas: MESES_LARGOS, etiquetaEje: (k) => MESES_CORTOS[k], slider: false,
      formato: (v) => `${numero(Math.round(v / 1000), 0)} mil`, formatoLectura: mm, eje: "M€", cero: true,
      aria: `Saldo acumulado desde enero, mes a mes, en ${def.año - 1} y ${def.año}`,
      series: [{ nombre: String(def.año - 1), v: def.serie_anterior, color: "--tinta" }, { nombre: String(def.año), v: def.serie_actual, color: "--c-primario" }] });
    lineaFuente($("d-fuente"), {
      fuentes: aapp.fuentes, tablas: [[def.tabla, "operaciones no financieras mensuales de las administraciones (contabilidad nacional)"]], tipo: "dato",
      nota: "Los porcentajes de variación son un cálculo nuestro.",
    });
  }

  // Recaudación
  const rec = d.recaudacion;
  if (rec) {
    const v = variacion(rec.total.actual, rec.total.anterior);
    const s2 = document.createElement("strong");
    s2.textContent = `Hacienda ha recaudado ${mmHablado(rec.total.actual)} en impuestos hasta ${rec.mes_nombre}`;
    frase.append(s2, `, un ${numero(Math.abs(v), 1)} % ${v >= 0 ? "más" : "menos"} que en los mismos meses de ${rec.año - 1}.`);
    $("r-ambito").textContent = `Acumulado de enero a ${rec.mes_nombre} de ${rec.año}, frente a los mismos meses de ${rec.año - 1}. ${rec.ambito}.`;
    const t = $("r-tabla");
    t.textContent = "";
    const max = Math.max(...rec.impuestos.map((i) => i.actual));
    const fila = (nombre, act, ant, total) => {
      const tr = t.insertRow();
      if (total) tr.className = "fila-total";
      const a = tr.insertCell();
      a.textContent = nombre;
      const det = document.createElement("span");
      det.className = "detalle";
      det.textContent = `${conSignoPct(variacion(act, ant))} frente a ${rec.año - 1} (${numero(Math.round(ant), 0)} millones)`;
      a.appendChild(det);
      if (!total) { const b = document.createElement("span"); b.className = "barra"; b.style.width = `${(100 * act) / max}%`; a.appendChild(b); }
      const c = tr.insertCell();
      c.className = "cifra";
      c.textContent = `${numero(Math.round(act), 0)} M€`;
    };
    for (const i of rec.impuestos) fila(i.nombre, i.actual, i.anterior, false);
    fila("Total de ingresos tributarios", rec.total.actual, rec.total.anterior, true);
    const años = Object.keys(rec.series).sort();
    $("r-pie").textContent = "Recaudación acumulada desde enero, mes a mes, en millones de euros";
    EC.lineas($("r-grafico"), { x: [...Array(12).keys()], etiquetas: MESES_LARGOS, etiquetaEje: (k) => MESES_CORTOS[k], slider: false,
      formato: (v) => `${numero(Math.round(v / 1000), 0)} mil`, formatoLectura: mm, eje: "M€", min: 0,
      aria: `Recaudación acumulada desde enero, mes a mes, ${años.join(", ")}`,
      series: años.map((a, k) => ({ nombre: a, v: rec.series[a],
        color: k === años.length - 1 ? "--c-primario" : k === años.length - 2 ? "--tinta" : "--linea-fuerte", discontinua: k < años.length - 2 })) });
    lineaFuente($("r-fuente"), {
      fuentes: aapp.fuentes, tablas: [[rec.tabla, "informe mensual de recaudación tributaria"]], tipo: "dato",
      nota: "Las sumas desde enero y los porcentajes de variación son un cálculo nuestro.",
    });
  }
}
document.addEventListener("DOMContentLoaded", arrancarEsteAno);
