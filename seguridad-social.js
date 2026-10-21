// Cuentas en limpio: «¿Cómo se pagan las pensiones?». La Seguridad Social (S1314) en contabilidad nacional, de Eurostat.
"use strict";

async function arrancarSS() {
  let d, aapp;
  try {
    [d, aapp] = await Promise.all(["datos/seguridad_social.json", "datos/aapp.json"].map((u) => fetch(u).then((r) => r.json())));
  } catch {
    document.getElementById("respuesta").textContent = "No se han podido cargar los datos.";
    return;
  }
  const $ = (id) => document.getElementById(id);
  const p = d.partidas, años = d.años, i = años.length - 1, año = años[i];
  const m = (k) => p[k].meur[i], pib = (k) => p[k].pib[i];
  const de100 = (a, b) => Math.round((100 * a) / b);
  const r = $("respuesta");
  r.textContent = `En ${año}, la Seguridad Social ingresó ${eurosMillones(m("ingresos"))}. `;
  const s1 = document.createElement("strong");
  s1.textContent = `De cada 100 €, ${de100(m("cotizaciones"), m("ingresos"))} fueron cotizaciones y ${de100(m("transferencias") + m("transferencias_capital"), m("ingresos"))} llegaron de otras administraciones, sobre todo del Estado`;
  r.append(s1, `. Gastó ${eurosMillones(m("gastos"))}, casi todo (${de100(m("prestaciones"), m("gastos"))} de cada 100 €) en prestaciones: pensiones, paro, bajas y permisos. ${m("saldo") < 0 ? "Faltaron" : "Sobraron"} ${eurosMillones(Math.abs(m("saldo")))}, el ${numero(Math.abs(pib("saldo")), 1)} % del PIB.`);

  const caja = $("cifras");
  caja.textContent = "";
  for (const [nombre, k, explica] of [["Cotizaciones", "cotizaciones", "lo que pagan empresas y trabajadores por cada sueldo"],
    ["Transferencias de otras administraciones", "transferencias", "sobre todo del Estado, con dinero de los impuestos"],
    ["Prestaciones", "prestaciones", "pensiones contributivas, paro, bajas y permisos"],
    [m("saldo") < 0 ? "Faltó (déficit)" : "Sobró (superávit)", "saldo", "después de las transferencias"]]) {
    const dv = document.createElement("div");
    dv.innerHTML = "";
    const a = document.createElement("span"); a.className = "nombre"; a.textContent = `${nombre}, ${año}`;
    const b = document.createElement("span"); b.className = "valor"; b.textContent = `${numero(Math.abs(pib(k)), 1)} %`;
    const c = document.createElement("span"); c.className = "explica"; c.textContent = `del PIB: ${numero(Math.round(Math.abs(m(k))), 0)} millones de euros; ${explica}.`;
    dv.append(a, b, c);
    caja.appendChild(dv);
  }
  const tablas = [["gov_10a_main", "cuentas de los fondos de la Seguridad Social (sector S1314)"]];
  lineaFuente($("cifras-fuente"), { fuentes: aapp.fuentes, tablas, tipo: "dato" });

  const f1 = (v) => `${numero(v, 1)} %`;
  const etiquetasAños = años.map(String);
  EC.lineas($("g1"), { x: años, etiquetas: etiquetasAños, formato: f1, eje: "% del PIB", min: 0,
    aria: `Prestaciones y cotizaciones de la Seguridad Social en % del PIB, ${años[0]}–${año}`,
    series: [{ nombre: "prestaciones", v: p.prestaciones.pib, color: "--tinta" }, { nombre: "cotizaciones", v: p.cotizaciones.pib, color: "--c-primario" }] });
  lineaFuente($("g1-fuente"), { fuentes: aapp.fuentes, tablas, tipo: "dato" });
  EC.lineas($("g2"), { x: años, etiquetas: etiquetasAños, formato: f1, eje: "% del PIB", cero: true,
    aria: `Saldo de la Seguridad Social en % del PIB, publicado y sin transferencias, ${años[0]}–${año}`,
    series: [{ nombre: "sin transferencias de otras administraciones", v: p.saldo_sin_transferencias.pib, color: "--tinta" },
      { nombre: "saldo publicado", v: p.saldo.pib, color: "--c-primario" }] });
  lineaFuente($("g2-fuente"), { fuentes: aapp.fuentes, tablas, tipo: "lectura", nota: "El saldo sin transferencias es el publicado menos las transferencias corrientes y de capital recibidas." });

  const ea = d.este_ano;
  if (ea) {
    $("ea-explica").textContent = `Lo que el sistema de la Seguridad Social ha ingresado (derechos reconocidos) y gastado (obligaciones reconocidas) de enero a ${ea.mes} de ${ea.año}, frente a los mismos meses de ${ea.año - 1}, en millones de euros. Son cifras del presupuesto, no de contabilidad nacional: no incluyen el paro (el SEPE) y no son comparables con las de los gráficos de abajo.`;
    const t = $("ss-este-ano");
    t.textContent = "";
    const cab = t.createTHead().insertRow();
    for (const c of ["", `Hasta ${ea.mes.slice(0, 3)}. ${ea.año}`, `Mismos meses de ${ea.año - 1}`, "Variación"]) { const th = document.createElement("th"); th.textContent = c; cab.appendChild(th); }
    const cuerpo = t.createTBody();
    for (const [titulo, tipo] of [["Ingresos", "ingreso"], ["Gastos", "gasto"]]) {
      const a = cuerpo.insertRow(); a.className = "fila-area";
      const c0 = a.insertCell(); c0.textContent = titulo; c0.colSpan = 4;
      for (const f of ea.filas.filter((x) => x.tipo === tipo)) {
        const tr = cuerpo.insertRow();
        if (f.clave === "ingresos" || f.clave === "gastos") tr.className = "fila-total";
        tr.insertCell().textContent = f.nombre;
        for (const v of [numero(Math.round(f.actual), 0), numero(Math.round(f.anterior), 0), `${f.publicado > 0 ? "+" : ""}${numero(f.publicado, 1)} %`]) {
          const c = tr.insertCell(); c.className = "cifra"; c.textContent = v;
        }
      }
    }
    lineaFuente($("ea-fuente"), { fuentes: aapp.fuentes, tablas: [[ea.tabla, `ejecución del presupuesto del sistema hasta ${ea.mes} de ${ea.año}`]], tipo: "dato" });
    if (ea.prestamo_previsto) $("ea-prestamo").textContent = `Además, las previsiones de ${ea.año} incluyen un préstamo del Estado a la Seguridad Social de ${numero(Math.round(ea.prestamo_previsto), 0)} millones de euros a lo largo del año. Un préstamo no es un ingreso: se suma a lo que la Seguridad Social le debe al Estado.`;
    pintarComprobaciones($("ea-comprobaciones"), ea.comprobaciones);
  }

  const fr = d.fondo_reserva;
  if (fr) {
    const q = $("fondo-reserva");
    q.textContent = `El Fondo de Reserva, la «hucha de las pensiones», tenía ${numero(fr.meur, 0)} millones de euros al acabar ${fr.año}: algo menos de lo que cuesta un mes de pensiones contributivas. `;
    const a = document.createElement("a"); a.href = fr.url; a.textContent = `Fuente: ${fr.fuente}`;
    q.appendChild(a);
  }
}
const eurosMillones = (v) => `unos ${numero(Math.round(v / 100) * 100, 0)} millones de euros`;
document.addEventListener("DOMContentLoaded", arrancarSS);
