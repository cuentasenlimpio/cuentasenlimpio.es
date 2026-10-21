// Cuentas en limpio: cálculo de lo que paga un sueldo (IRPF, cotizaciones e IVA estimado). Parámetros en sueldo.json.
// Sin dependencias: lo usan la página (sueldo.js) y las pruebas (herramientas/prueba_sueldo.mjs).
"use strict";

// Cuota de una escala [[desde, tipo %], …] aplicada a una base.
function cuotaEscala(escala, base) {
  let q = 0;
  for (let i = 0; i < escala.length; i++) {
    const [desde, tipo] = escala[i];
    const hasta = i + 1 < escala.length ? escala[i + 1][0] : Infinity;
    if (base > desde) q += ((Math.min(base, hasta) - desde) * tipo) / 100;
  }
  return q;
}

// Cuota de régimen común: escala sobre la base menos escala sobre el mínimo personal y familiar (art. 56 y 63 LIRPF).
const cuotaConMinimo = (escala, base, minimo) => Math.max(0, cuotaEscala(escala, base) - cuotaEscala(escala, Math.min(minimo, base)));

const EDADES = { "<65": 0, "65": 65, "70": 70, "75": 75 };

function cotizaciones(P, bruto, contrato) {
  const c = P.cotizaciones;
  const mensual = bruto / 12;
  const base = Math.min(mensual, c.base_max_mensual) * 12;
  const tipo = (lado) => {
    const t = c[lado];
    return t.contingencias_comunes + t.mei + t.desempleo[contrato] + t.formacion + (t.fogasa || 0) + (t.accidentes || 0);
  };
  // Cotización adicional de solidaridad: sobre lo que el sueldo pasa de la base máxima, por tramos.
  let exceso = Math.max(0, mensual - c.base_max_mensual), desde = 0, solTrab = 0, solEmp = 0;
  for (const [hasta, trab, emp] of c.solidaridad) {
    const tope = hasta === null ? Infinity : hasta * c.base_max_mensual;
    const parte = Math.max(0, Math.min(exceso, tope) - desde);
    solTrab += (parte * trab) / 100; solEmp += (parte * emp) / 100;
    desde = tope;
  }
  return {
    trabajador: (base * tipo("trabajador")) / 100 + solTrab * 12,
    empresa: (base * tipo("empresa")) / 100 + solEmp * 12,
    tope: mensual > c.base_max_mensual,
  };
}

// Cuántos hijos, en orden, y cuántos de cada edad.
const edadesHijos = (hijos) => ({
  n: hijos.length,
  menores3: hijos.filter((h) => h === "m3").length,
  menores6: hijos.filter((h) => h === "m3" || h === "3a5").length,
  de6a15: hijos.filter((h) => h === "6a15").length,
  menores14: hijos.filter((h) => h !== "16a24").length,
});
const porOrden = (importes, n) => { let s = 0; for (let i = 0; i < n; i++) s += importes[Math.min(i, importes.length - 1)]; return s; };

function irpfComun(P, t, e) {
  const p = P.irpf_comun, partes = [];
  const rn = Math.max(0, e.bruto - e.cotTrab);
  const [[r1, max], [r2, pend1], [r3, base2, pend2]] = p.reduccion;
  const reduccion = rn <= r1 ? max : rn <= r2 ? max - pend1 * (rn - r1) : rn < r3 ? base2 - pend2 * (rn - r2) : 0;
  const base = Math.max(0, rn - p.gasto_general - reduccion);
  const reparto = e.comparte ? 0.5 : 1;
  const h = edadesHijos(e.hijos);
  const minimo = (m) => m.contribuyente + (e.edad >= 65 ? m.mayor_65 : 0) + (e.edad >= 75 ? m.mayor_75 : 0)
    + reparto * (porOrden([m.descendiente_1, m.descendiente_2, m.descendiente_3, m.descendiente_4_y_siguientes], h.n) + h.menores3 * m.descendiente_menor_3);
  const minEst = minimo(p.minimos_estatales), minAut = minimo(t.minimos);
  const estatal = cuotaConMinimo(p.escala_estatal, base, minEst);
  let autonomica = cuotaConMinimo(t.escala, base, minAut);
  // Deducciones autonómicas que solo dependen de la edad, los hijos o el sueldo.
  let dedAut = 0;
  for (const d of t.deducciones || []) {
    const cabe = d.bi_max == null || base <= d.bi_max;
    let x = 0;
    if (d.tipo === "edad" && e.edad >= d.desde && cabe) x = d.importe;
    if (d.tipo === "por_hijo" && cabe) x = d.importe * h.n * reparto;
    if (d.tipo === "dos_hijos" && h.n === 2 && cabe) x = d.importe * reparto;
    if (d.tipo === "por_hijo_escolar" && cabe) x = d.importe * h.de6a15 * reparto;
    if (d.tipo === "trabajo" && e.bruto <= d.bruto_max) x = d.importe;
    if (x > 0) { dedAut += x; partes.push({ nombre: `Deducción autonómica: ${d.nombre}`, importe: -x }); }
  }
  autonomica = Math.max(0, autonomica - dedAut);
  let total = estatal + autonomica;
  if (t.ceuta_melilla) {
    const d = p.ceuta_melilla * total;
    total -= d; partes.push({ nombre: "Deducción por vivir y trabajar en Ceuta o Melilla (60 %)", importe: -d });
  }
  // Deducción para sueldos bajos (disposición adicional 61.ª LIRPF): se resta del total, sin bajar de cero.
  const s = p.smi_deduccion;
  const dsmi = Math.min(total, Math.max(0, e.bruto <= s.desde ? s.importe : s.importe - s.pendiente * (e.bruto - s.desde)));
  if (dsmi > 0) { total -= dsmi; partes.push({ nombre: "Deducción para sueldos bajos", importe: -dsmi }); }
  return { total: Math.max(0, total), estatal, autonomica, base, reduccion: rn - p.gasto_general - base, minimo: minEst, minimoAut: minAut, partes };
}

function irpfVasco(t, e) {
  const dif = Math.max(0, e.bruto - e.cotTrab);
  const b = t.bonificacion;
  const bonif = Math.min(dif, dif <= b.hasta ? b.max : dif <= b.tope ? b.max - b.pendiente * (dif - b.hasta) : b.min);
  const base = dif - bonif;
  const cuota = Math.max(0, cuotaEscala(t.escala, base) - t.minoracion);
  const h = edadesHijos(e.hijos), reparto = e.comparte ? 0.5 : 1, partes = [];
  const hijos = reparto * (porOrden(t.descendientes, h.n) + h.menores6 * t.menor_6 + h.de6a15 * (t.de_6_a_15 || 0));
  if (hijos) partes.push({ nombre: "Deducción por hijos", importe: -hijos });
  let edad = 0;
  if (e.edad >= 65) {
    const max = e.edad >= 75 ? t.edad.mayor_75 : t.edad.mayor_65;
    edad = base <= t.edad.bi_plena ? max : base >= t.edad.bi_cero ? 0 : max * (t.edad.bi_cero - base) / (t.edad.bi_cero - t.edad.bi_plena);
    if (edad) partes.push({ nombre: "Deducción por edad", importe: -edad });
  }
  return { total: Math.max(0, cuota - hijos - edad), base, bonificacion: bonif, minoracion: t.minoracion, partes };
}

function irpfNavarra(t, e) {
  const rnt = Math.max(0, e.bruto - e.cotTrab);
  const ci = cuotaEscala(t.escala, rnt);
  const inc = rnt <= 17500 ? 1280 : rnt <= 30000 ? 1280 - 0.0904 * (rnt - 17500) : rnt <= 32000 ? 150 - 0.075 * (rnt - 30000) : 0;
  const personal = t.minimo_personal + inc + (e.edad >= 75 ? t.edad.mayor_75 : e.edad >= 65 ? t.edad.mayor_65 : 0);
  const trabajo = Math.min(ci, rnt <= 12500 ? 1400 : rnt <= 17500 ? 1400 - 0.14 * (rnt - 12500) : rnt <= 35000 ? 700 : rnt <= 50000 ? 700 - 0.02 * (rnt - 35000) : 400);
  const h = edadesHijos(e.hijos), reparto = e.comparte ? 0.5 : 1;
  const extra = rnt <= 20000 ? 0.4 : rnt < 30000 ? 0.4 * (30000 - rnt) / 10000 : 0;
  const hijos = reparto * (porOrden(t.descendientes, h.n) + h.menores3 * t.menor_3) * (1 + extra);
  const partes = [{ nombre: "Deducción por mínimo personal", importe: -personal }, { nombre: "Deducción por trabajo", importe: -trabajo }];
  if (hijos) partes.push({ nombre: "Deducción por hijos", importe: -hijos });
  return { total: Math.max(0, ci - personal - trabajo - hijos), base: rnt, partes };
}

// IVA estimado: la renta neta, pasada a renta equivalente, y la curva de la Encuesta de Presupuestos Familiares.
function ivaEstimado(P, territorio, neto, e) {
  if (P.iva.sin_iva[territorio]) return { iva: null, aviso: P.iva.sin_iva[territorio] };
  const h = edadesHijos(e.hijos);
  const uc = 1 + 0.3 * h.menores14 * (e.comparte ? 0.5 : 1);
  const req = neto / uc;
  const pts = P.iva.puntos;
  const interp = (k) => {
    if (req <= pts[0][0]) return pts[0][k];
    if (req >= pts.at(-1)[0]) return pts.at(-1)[k];
    const i = pts.findIndex((p) => p[0] >= req);
    const [x0, x1] = [pts[i - 1][0], pts[i][0]];
    return pts[i - 1][k] + ((pts[i][k] - pts[i - 1][k]) * (req - x0)) / (x1 - x0);
  };
  const gasto = interp(2), sobreRenta = interp(1);
  // Si la media del tramo gasta más de lo que ingresa, se limita el gasto a la renta.
  const p = gasto > 1 ? sobreRenta / gasto : sobreRenta;
  return { iva: neto * p, gasto: neto * Math.min(gasto, 1), uc, porcentaje: p };
}

function calcularSueldo(P, entrada) {
  const e = { ...entrada, edad: EDADES[entrada.edad] ?? 0, hijos: entrada.hijos || [] };
  const t = P.territorios[e.territorio];
  const cot = cotizaciones(P, e.bruto, e.contrato || "indefinido");
  e.cotTrab = cot.trabajador;
  const irpf = t.regimen === "comun" ? irpfComun(P, t, e) : t.regimen === "vasco" ? irpfVasco(t, e) : irpfNavarra(t, e);
  const neto = e.bruto - cot.trabajador - irpf.total;
  const iva = ivaEstimado(P, e.territorio, neto, e);
  return { bruto: e.bruto, cotTrabajador: cot.trabajador, cotEmpresa: cot.empresa, tope: cot.tope, irpf, neto, iva, regimen: t.regimen };
}

if (typeof module !== "undefined") module.exports = { calcularSueldo, cotizaciones, cuotaEscala, cuotaConMinimo, irpfComun, irpfVasco, irpfNavarra };
