// Cuentas en limpio: «¿Qué pasaría si…?». Nueve calculadoras de mecanismos con las cifras de hoy (las mismas reglas que
// contexto/mecanismos.md). No son previsiones: cada una cambia una cosa y deja quieto todo lo demás.
"use strict";

const SVG = "http://www.w3.org/2000/svg";
const millones = (m) => `${numero(Math.round(m), 0)} millones de euros`;
const millonesHablados = (m) => (Math.abs(m) >= 10000 ? `unos ${numero(Math.round(m / 100) * 100, 0)} millones de euros`
  : `unos ${numero(Math.round(m / 10) * 10, 0)} millones de euros`);
const puntos = (p) => `${p > 0 ? "+" : p < 0 ? "−" : ""}${numero(Math.abs(p), 2).replace(/,?0+$/, "")} ${Math.abs(p) === 1 ? "punto" : "puntos"}`;
const pct = (v, d = 1) => `${numero(v, d)} %`;

function nodo(tipo, attrs, texto, padre) {
  const e = document.createElementNS(SVG, tipo);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (texto !== undefined) e.textContent = texto;
  if (padre) padre.appendChild(e);
  return e;
}

// Barras verticales sencillas (un solo color), con el valor encima de la primera, la última, las resaltadas (en otro
// tono) y las de `rotula`. Con valores negativos, el cero se coloca según la proporción de positivos y negativos.
function barras(caja, etiquetas, valores, { formato, resalta = [], rotula = [] } = {}) {
  const W = 420, H = 190, m = { i: 8, d: 8, a: 22, b: 22 };
  const pos = Math.max(0, ...valores), neg = Math.max(0, ...valores.map((v) => -v));
  const util = H - m.a - m.b - (neg > 0 ? 16 : 0), total = pos + neg || 1;
  const ancho = (W - m.i - m.d) / valores.length;
  const cero = m.a + (util * pos) / total;
  const alto = (v) => (Math.abs(v) * util) / total;
  const svg = nodo("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" });
  svg.setAttribute("aria-label", etiquetas.map((e, k) => `${e}: ${formato(valores[k])}`).join("; "));
  nodo("line", { x1: m.i, x2: W - m.d, y1: cero, y2: cero, class: "eje-recorrido" }, undefined, svg);
  const marcar = new Set([0, valores.length - 1, ...resalta, ...rotula]);
  valores.forEach((v, k) => {
    const x = m.i + k * ancho + 2, h = alto(v);
    const r = nodo("rect", { x, y: v >= 0 ? cero - h : cero, width: Math.max(1, ancho - 4), height: Math.max(h, 0.5), rx: 2, class: resalta.includes(k) ? "barra-escenario barra-elegida" : "barra-escenario" }, undefined, svg);
    nodo("title", {}, `${etiquetas[k]}: ${formato(v)}`, r);
    if (valores.length <= 12 || k % 2 === 0 || k === valores.length - 1)
      nodo("text", { x: x + ancho / 2 - 2, y: H - 6, "text-anchor": "middle", class: "rotulo-recorrido" }, etiquetas[k], svg);
    if (marcar.has(k) && v !== 0)
      nodo("text", { x: x + ancho / 2 - 2, y: v >= 0 ? cero - h - 6 : cero + h + 13, "text-anchor": "middle", class: "dato-recorrido" }, formato(v), svg);
  });
  caja.textContent = "";
  caja.appendChild(svg);
}

// Línea de la deuda: lo publicado (continua) y el escenario (discontinua), con el primer y el último valor rotulados.
function lineaEscenario(caja, años, publicado, escenario, referencia) {
  const W = 420, H = 210, m = { i: 10, d: 14, a: 20, b: 24 };
  const todos = [...publicado, ...escenario.map((p) => p[1]), referencia];
  const max = Math.max(...todos) * 1.08, min = Math.min(0, ...todos);
  const a0 = años[0], a1 = escenario.at(-1)[0];
  const x = (a) => m.i + ((a - a0) * (W - m.i - m.d)) / (a1 - a0);
  const y = (v) => H - m.b - ((v - min) * (H - m.a - m.b)) / (max - min);
  const svg = nodo("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" });
  svg.setAttribute("aria-label", `Deuda publicada de ${a0} a ${años.at(-1)} y escenario hasta ${a1}: ${pct(escenario.at(-1)[1], 0)} en ${a1}.`);
  nodo("line", { x1: m.i, x2: W - m.d, y1: y(referencia), y2: y(referencia), class: "ref-recorrido" }, undefined, svg);
  nodo("text", { x: W - m.d, y: y(referencia) + 14, "text-anchor": "end", class: "rotulo-recorrido" }, `${referencia} %: referencia europea`, svg);
  nodo("line", { x1: m.i, x2: W - m.d, y1: H - m.b, y2: H - m.b, class: "eje-recorrido" }, undefined, svg);
  nodo("polyline", { points: publicado.map((v, k) => `${x(años[k])},${y(v)}`).join(" "), class: "linea-recorrido" }, undefined, svg);
  nodo("polyline", { points: escenario.map(([a, v]) => `${x(a)},${y(v)}`).join(" "), class: "linea-recorrido linea-escenario" }, undefined, svg);
  const ult = [años.at(-1), publicado.at(-1)], fin = escenario.at(-1);
  for (const [a, v, ancla] of [[años[0], publicado[0], "start"], [...ult, "middle"], [...fin, "end"]]) {
    nodo("circle", { cx: x(a), cy: y(v), r: 3.5, class: "punto-recorrido" }, undefined, svg);
    nodo("text", { x: x(a), y: y(v) - 9, "text-anchor": ancla, class: "dato-recorrido" }, pct(v, 0), svg);
    nodo("text", { x: x(a), y: H - 7, "text-anchor": ancla, class: "rotulo-recorrido" }, a, svg);
  }
  caja.textContent = "";
  caja.appendChild(svg);
}

function listaSupuestos(ul, frases) {
  ul.textContent = "";
  for (const f of frases) { const li = document.createElement("li"); li.textContent = f; ul.appendChild(li); }
}

// Un deslizador con su valor a la vista y botones de ejemplo que lo mueven.
function mando(id, mostrar, alCambiar) {
  const r = document.getElementById(id), o = document.getElementById(`${id}-v`);
  const pintar = () => { o.textContent = mostrar(+r.value); r.setAttribute("aria-valuetext", mostrar(+r.value)); alCambiar(); };
  if (!r.nextElementSibling?.classList.contains("extremos")) {
    const ex = document.createElement("div");
    ex.className = "extremos";
    ex.setAttribute("aria-hidden", "true");
    for (const v of [r.min, r.max]) { const s = document.createElement("span"); s.textContent = mostrar(+v); ex.appendChild(s); }
    r.after(ex);
  }
  r.addEventListener("input", pintar);
  r.closest("form").querySelectorAll("[data-valor]").forEach((b) => b.addEventListener("click", () => { r.value = b.dataset.valor; pintar(); }));
  r.closest("form").addEventListener("submit", (e) => e.preventDefault());
  o.textContent = mostrar(+r.value);
  r.setAttribute("aria-valuetext", mostrar(+r.value));
  return r;
}

async function arrancarEscenarios() {
  let a, e, eco, g, ep, ss, rec, bf;
  try {
    [a, e, eco, g, ep, ss, rec, bf] = await Promise.all(["aapp", "escala", "economia", "gasto", "empleo_publico", "seguridad_social", "recaudacion", "beneficios_fiscales"]
      .map((n) => fetch(`datos/${n}.json`).then((r) => r.json())));
  } catch {
    for (const p of document.querySelectorAll(".resultado")) p.textContent = "No se han podido cargar los datos.";
    return;
  }
  const $ = (id) => document.getElementById(id);
  const i = a.años.length - 1, año = a.años[i], s = a.series;
  const k = e.años.indexOf(año);
  const pib = e.pib_meur[k], pob = e.poblacion[k];
  const deuda = s.deuda.corrientes[i];
  const intereses = (a.cambio_deuda.pib.intereses[i] * pib) / 100;
  const vida = eco.tesoro.vida_media.años;
  const F = a.fuentes;
  const añoG = g.años.at(-1);
  const partidas = g.funciones.map((f) => ({ nombre: nombreLlano(f.codigo, f.nombre), meur: f.corrientes.at(-1) }));

  // Partida de gasto conocida de tamaño parecido, para dar escala (sin usar las muy grandes).
  const comoPartida = (m) => {
    const c = partidas.filter((p) => p.meur > 0).map((p) => ({ ...p, r: m / p.meur })).filter((p) => p.r >= 0.25 && p.r <= 1.5)
      .sort((x, y) => Math.abs(1 - x.r) - Math.abs(1 - y.r))[0];
    if (!c) return "";
    const veces = c.r >= 0.9 && c.r <= 1.1 ? "más o menos lo mismo que" : c.r < 1 ? `${c.r < 0.4 ? "cerca de un tercio de" : c.r < 0.6 ? "cerca de la mitad de" : "cerca de tres cuartas partes de"}` : "algo más de";
    return ` Es ${veces} lo que se gastó en ${c.nombre} en ${añoG}.`;
  };

  // 1. Tipos de interés
  const pintarTipos = () => {
    const p = +$("tipos-p").value;
    const extra = (deuda * p) / 100;
    const enAño = (t) => (extra * Math.min(Math.max(t - 0.5, 0), vida)) / vida; // pagado durante el año t
    const años = Array.from({ length: 10 }, (_, t) => t + 1);
    const valores = años.map(enAño);
    const total10 = valores.reduce((x, y) => x + y, 0);
    const lleno = extra;
    if (p === 0) {
      $("tipos-frase").textContent = "Sin cambio de tipos no hay coste extra. Con el mando se elige un cambio.";
    } else {
      const verbo = p > 0 ? "costaría" : "se ahorrarían";
      $("tipos-frase").textContent = `Con ${puntos(Math.abs(p)).replace("+", "")} ${p > 0 ? "más" : "menos"} de interés, el primer año se ${p > 0 ? "pagarían" : "ahorrarían"} ${millonesHablados(Math.abs(valores[0]))}. `
        + `Cuando se haya renovado toda la deuda, en unos ${numero(vida, 0)} años, ${verbo} ${millonesHablados(Math.abs(lleno))} cada año: `
        + `${eurosHablados(Math.abs(lleno * 1e6) / pob)} por habitante y ${pct((100 * Math.abs(lleno)) / pib, 1)} del PIB.`
        + (p > 0 ? comoPartida(lleno) : "")
        + ` En diez años, ${p > 0 ? "sumaría" : "se ahorrarían"} ${millonesHablados(Math.abs(total10))}.`;
    }
    $("tipos-pie").textContent = p >= 0 ? "Coste extra de intereses de cada año, en millones de euros (año 1 = el primero tras la subida)"
      : "Ahorro de intereses de cada año, en millones de euros (año 1 = el primero tras la bajada)";
    barras($("tipos-grafico"), años.map(String), valores.map(Math.abs), { formato: (v) => numero(Math.round(v), 0) });
    listaSupuestos($("tipos-supuestos"), [
      `Deuda de partida: la de todas las administraciones al acabar ${año}, ${millones(deuda)}, y no cambia.`,
      `Cada año vence y se vuelve a pedir prestada la misma parte de la deuda: 1 ÷ ${numero(vida, 2)} años, la vida media de la deuda del Estado (Tesoro, ${fecha(eco.tesoro.vida_media.mes + "-01").replace(/^1 de /, "")}). Lo que vence se renueva a lo largo del año, así que el primer año cuenta la mitad.`,
      "Todo lo que se renueva se paga con el cambio de interés elegido; lo que no vence sigue igual.",
      "Las letras del Tesoro (a menos de un año) se renuevan antes, y eso adelanta el efecto. Si la deuda crece, el efecto es mayor.",
      `Para comparar: en ${año} se pagaron ${millonesHablados(intereses)} de intereses.`,
    ]);
  };
  mando("tipos-p", puntos, pintarTipos);
  lineaFuente($("tipos-fuente"), {
    fuentes: F, tablas: [["gov_10dd_edpt1", "deuda de las administraciones"], ["tesoro_vida_media", "vida media de la deuda del Estado"]], tipo: "lectura",
    nota: "Aproximación nuestra con los supuestos de arriba.",
  });
  pintarTipos();

  // 2. Inflación y pensiones
  const pe = eco.pensiones;
  const nominaMes = pe.nomina_anual.at(-1), añoNom = pe.años.at(-1);
  const media = pe.media.at(-1), numPens = pe.numero.at(-1);
  const pintarInflacion = () => {
    const pi = +$("inflacion-p").value;
    const coste = (nominaMes * 14 * pi) / 100 / 1e6;
    const subidaMes = (media * pi) / 100;
    $("inflacion-frase").textContent = `Con una inflación media del ${pct(pi)}, la pensión media (${numero(media, 0)} € al mes) subiría unos ${numero(Math.round(subidaMes), 0)} € al mes. `
      + `Para los ${numero(Math.round(numPens / 1e5) / 10, 1)} millones de pensiones contributivas, son ${millonesHablados(coste)} más al año: `
      + `${eurosHablados((coste * 1e6) / pob)} por habitante y ${pct((100 * coste) / pib, 2)} del PIB.` + comoPartida(coste)
      + " Ese coste se queda en los años siguientes: la pensión no vuelve a bajar.";
    const escala = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    barras($("inflacion-grafico"), escala.map((x) => `${x} %`), escala.map((x) => (nominaMes * 14 * x) / 100 / 1e6),
      { formato: (v) => numero(Math.round(v / 100) * 100, 0), resalta: [Math.round(pi)] });
    listaSupuestos($("inflacion-supuestos"), [
      `Nómina de las pensiones contributivas: la de diciembre de ${añoNom} (${millones(nominaMes / 1e6)} al mes), por 14 pagas.`,
      `Pensión media y número de pensiones: Seguridad Social, ${fecha(pe.meses.at(-1) + "-01").replace(/^1 de /, "")}.`,
      "Todas las pensiones contributivas suben lo mismo que la inflación media de diciembre a noviembre, como manda la ley. Las no contributivas y las de los funcionarios del Estado (clases pasivas) no están en esta cuenta.",
      "No se cuenta lo que la inflación sube los ingresos (más IVA, más IRPF y más cotizaciones si suben los sueldos), ni que haya más o menos pensionistas.",
    ]);
  };
  mando("inflacion-p", (v) => pct(v), pintarInflacion);
  lineaFuente($("inflacion-fuente"), {
    fuentes: F, tablas: [["ss_pensiones_avance", "pensiones contributivas en vigor"]], tipo: "lectura",
    nota: "Aproximación nuestra con los supuestos de arriba.",
  });
  pintarInflacion();

  // 3. Dinámica de la deuda
  const d0 = s.deuda.pib[i];
  const pb0 = +(s.saldo.pib[i] + a.cambio_deuda.pib.intereses[i]).toFixed(1);
  const r0 = +((100 * intereses) / s.deuda.corrientes[i - 1]).toFixed(1);
  const g0 = +(100 * (pib / e.pib_meur[k - 1] - 1)).toFixed(1);
  const hoy = () => { $("deuda-pb").value = pb0; $("deuda-r").value = r0; $("deuda-g").value = g0; for (const id of ["deuda-pb", "deuda-r", "deuda-g"]) $(id).dispatchEvent(new Event("input")); };
  const signo = (v) => (v > 0 ? `sobra ${pct(v)}` : v < 0 ? `falta ${pct(-v)}` : "ni falta ni sobra");
  const pintarDeuda = () => {
    const pb = +$("deuda-pb").value, r = +$("deuda-r").value / 100, gr = +$("deuda-g").value / 100;
    const camino = [[año, d0]];
    let d = d0;
    for (let t = 1; t <= 10; t++) { d = (d * (1 + r)) / (1 + gr) - pb; camino.push([año + t, d]); }
    const estable = (d0 * (r - gr)) / (1 + gr);
    const fin = camino.at(-1)[1];
    $("deuda-frase").textContent = `Con estos valores, la deuda pasaría del ${pct(d0, 1)} del PIB en ${año} al ${pct(fin, 0)} en ${año + 10}. `
      + (Math.abs(estable) < 0.05 ? "Con este interés y este crecimiento, la deuda se queda igual si no falta ni sobra dinero sin contar intereses."
        : `Para que la deuda no subiera ni bajara, haría falta que ${estable > 0 ? `sobrara un ${pct(estable)}` : `faltara como mucho un ${pct(-estable)}`} del PIB cada año sin contar intereses`
          + ` (${millonesHablados(Math.abs((estable * pib) / 100))} de ${año}).`);
    const desde = Math.max(0, i - 15);
    lineaEscenario($("deuda-grafico"), a.años.slice(desde), s.deuda.pib.slice(desde), camino, 60);
    listaSupuestos($("deuda-supuestos"), [
      `Valores de hoy: en ${año}, sin contar intereses, ${signo(pb0)} del PIB; interés medio pagado, ${pct(r0)} (intereses de ${año} ÷ deuda de ${año - 1}); crecimiento de la economía con precios, ${pct(g0)}.`,
      "Los tres valores se mantienen iguales los diez años. En la realidad cambian, y unos influyen en otros (por ejemplo, más interés suele frenar el crecimiento).",
      "No se cuentan compras o ventas de activos financieros ni otros ajustes que también mueven la deuda (en «Por qué cambió la deuda», en Cuentas, se ven año a año).",
      "Regla: deuda del año = deuda del año anterior × (1 + interés) ÷ (1 + crecimiento) − lo que sobra sin contar intereses, todo en % del PIB.",
    ]);
  };
  mando("deuda-pb", (v) => (v > 0 ? `sobra ${pct(v)}` : v < 0 ? `falta ${pct(-v)}` : "ni falta ni sobra"), pintarDeuda);
  mando("deuda-r", (v) => pct(v), pintarDeuda);
  mando("deuda-g", (v) => pct(v), pintarDeuda);
  $("deuda-hoy").addEventListener("click", hoy);
  lineaFuente($("deuda-fuente"), {
    fuentes: F, tablas: [["gov_10dd_edpt1", "deuda e intereses"], ["gov_10a_main", "saldo"], ["nama_10_gdp", "PIB"]], tipo: "lectura",
    nota: "La línea continua es lo publicado; la discontinua, una aproximación nuestra con los valores elegidos.",
  });
  hoy();

  // Atajos que salen de los datos (se crean antes de enlazar el mando, que les pone el clic)
  const atajo = (caja, valor, texto) => {
    const b = document.createElement("button");
    b.type = "button"; b.dataset.valor = valor; b.textContent = texto;
    $(caja).appendChild(b);
  };
  const miles = (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${numero(Math.abs(v), 0)}`;
  const pibDe = (a_) => e.pib_meur[e.años.indexOf(a_)], pobDe = (a_) => e.poblacion[e.años.indexOf(a_)];

  // 4. Sueldos públicos
  const R = ep.remuneracion, añoR = R.años.at(-1), iR = R.años.length - 1;
  const niveles = [["Estado", "estado"], ["Comunidades", "comunidades"], ["Ayuntamientos", "local"], ["Seg. Social", "seguridad_social"]];
  const pintarSueldos = () => {
    const p = +$("sueldos-p").value;
    const total = (R.total.meur[iR] * p) / 100;
    const por = niveles.map(([, k]) => (R[k].meur[iR] * p) / 100);
    const cc = por[1];
    $("sueldos-frase").textContent = p === 0 ? "Sin cambio de sueldos no hay coste extra. Con el mando se elige un cambio."
      : `Con los sueldos un ${pct(Math.abs(p), Number.isInteger(p) ? 0 : 1)} ${p > 0 ? "más altos" : "más bajos"}, las administraciones ${p > 0 ? "pagarían" : "se ahorrarían"} ${millonesHablados(Math.abs(total))} al año: `
        + `${eurosHablados(Math.abs(total * 1e6) / pobDe(añoR))} por habitante y ${pct((100 * Math.abs(total)) / pibDe(añoR), 2)} del PIB. `
        + `De eso, ${millonesHablados(Math.abs(cc))} ${p > 0 ? "los pagarían" : "se los ahorrarían"} las comunidades autónomas.` + (p > 0 ? comoPartida(total) : "");
    $("sueldos-pie").textContent = `${p >= 0 ? "Coste extra" : "Ahorro"} de cada año por administración, en millones de euros (sueldos de ${añoR})`;
    barras($("sueldos-grafico"), niveles.map(([n]) => n), por.map(Math.abs), { formato: (v) => numero(Math.round(v), 0), rotula: [1, 2] });
    listaSupuestos($("sueldos-supuestos"), [
      `Sueldos de partida: la remuneración de todo el personal de las administraciones en ${añoR}, ${millones(R.total.meur[iR])} (sueldos y cotizaciones que paga el empleador), el ${pct(R.pct_gasto.at(-1))} de todo su gasto.`,
      "Sube lo mismo el sueldo de todo el personal, y en la misma proporción las cotizaciones que paga la administración. No cambia el número de personas.",
      "No se cuenta lo que vuelve en IRPF y en cotizaciones del propio trabajador, ni el efecto en el consumo.",
      "Cada administración paga a su personal: Estado incluye ministerios y sus organismos; Seguridad Social, sus fondos (sin el personal sanitario, que es de las comunidades).",
    ]);
  };
  mando("sueldos-p", (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${pct(Math.abs(v), Number.isInteger(v) ? 0 : 1)}`, pintarSueldos);
  lineaFuente($("sueldos-fuente"), {
    fuentes: F, tablas: [["gov_10a_main", "remuneración de asalariados de cada administración (D.1)"]], tipo: "lectura",
    nota: "Aproximación nuestra con los supuestos de abajo.",
  });
  pintarSueldos();

  // 5. Más pensiones
  const crecPens = Math.round((pe.numero_anual.at(-1) - pe.numero_anual.at(-2)) / 1000) * 1000;
  const afPorPens = pe.afiliados_por_pension_meses.at(-1);
  const mesPens = fecha(pe.meses.at(-1) + "-01").replace(/^1 de /, "");
  atajo("pensionistas-atajos", crecPens, `+${numero(crecPens, 0)} (lo que crecieron en ${pe.años.at(-1)})`);
  atajo("pensionistas-atajos", crecPens * 10, `+${numero(crecPens * 10, 0)} (diez años creciendo igual)`);
  atajo("pensionistas-atajos", 500000, "Volver al valor inicial");
  const pintarPensionistas = () => {
    const n = +$("pensionistas-p").value;
    const coste = (n * media * 14) / 1e6;
    const ratio = (afPorPens * numPens) / (numPens + n);
    $("pensionistas-frase").textContent = n === 0 ? `Con las pensiones de hoy, hay ${numero(afPorPens, 2)} afiliados por cada pensión.`
      : `Con ${numero(n, 0)} pensiones más y la pensión media de hoy (${numero(media, 0)} € al mes), el gasto subiría ${millonesHablados(coste)} al año: `
        + `${eurosHablados((coste * 1e6) / pob)} por habitante y ${pct((100 * coste) / pib, 2)} del PIB.` + comoPartida(coste)
        + ` Si el empleo no cambia, habría ${numero(ratio, 2)} afiliados por cada pensión, frente a ${numero(afPorPens, 2)} hoy.`;
    const añosP = pe.años, hist = pe.afiliados_por_pension_años;
    barras($("pensionistas-grafico"), [...añosP.map(String), "Cálculo"], [...hist, ratio],
      { formato: (v) => numero(v, 2), resalta: [hist.length] });
    listaSupuestos($("pensionistas-supuestos"), [
      `Pensiones contributivas en vigor: ${numero(numPens, 0)}, con una pensión media de ${numero(media, 2)} € al mes (Seguridad Social, ${mesPens}). Las nuevas cobran esa media, 14 pagas al año.`,
      `Afiliados por pensión: ${numero(afPorPens, 2)} (${mesPens}), el dato que publica la Seguridad Social. Con más pensiones y el mismo número de afiliados, baja en proporción.`,
      "Las pensiones nuevas de jubilación suelen ser más altas que la media, porque los sueldos de ahora son más altos que los de hace décadas: con eso el coste sería mayor.",
      "No cuenta las pensiones no contributivas ni las de los funcionarios del Estado (clases pasivas), ni que dejen de cobrarse otras pensiones.",
    ]);
  };
  mando("pensionistas-p", (v) => `+${numero(v, 0)}`, pintarPensionistas);
  const dep = eco.dependencia, pr = dep.proyeccion;
  const iDep = dep.mayores.findLastIndex((v) => v != null);
  const año50 = pr.años.includes(2050) ? 2050 : pr.años.at(-1);
  $("pensionistas-ine").textContent = `Por cada 100 personas de 16 a 64 años había ${numero(dep.mayores[iDep], 0)} de 65 o más en ${dep.años[iDep]}. `
    + `Según la proyección del INE, serían ${numero(pr.mayores[pr.años.indexOf(año50)], 0)} en ${año50}. La proyección cuenta personas, no pensiones: no se puede pasar directamente a esta calculadora.`;
  lineaFuente($("pensionistas-fuente"), {
    fuentes: F, tablas: [["ss_pensiones_avance", "pensiones contributivas en vigor y afiliados por pensión"], ["ine_idb53262", "tasa de dependencia de mayores de 64 años"], ["ine_prop7467", "su proyección"]], tipo: "lectura",
    nota: "La última barra es una aproximación nuestra con los supuestos de abajo; las demás, datos publicados.",
  });
  pintarPensionistas();

  // 6. Empleo y cotizaciones
  const AF = eco.afiliacion.anual, cot = ss.partidas.cotizaciones;
  const añoE = Math.min(AF.años.at(-1), ss.años.at(-1));
  const afil = AF.afiliados[AF.años.indexOf(añoE)], cotE = cot.meur[ss.años.indexOf(añoE)];
  const cotMedia = (cotE * 1e6) / afil;
  const crecAf = Math.round((afil - AF.afiliados[AF.años.indexOf(añoE - 1)]) / 1000) * 1000;
  const peorAf = AF.años.slice(1).map((y, k) => [y, AF.afiliados[k + 1] - AF.afiliados[k]]).sort((x, y) => x[1] - y[1])[0];
  atajo("empleo-atajos", crecAf, `${miles(crecAf)} (lo que creció la afiliación media en ${añoE})`);
  atajo("empleo-atajos", Math.round(peorAf[1] / 1000) * 1000, `${miles(Math.round(peorAf[1] / 1000) * 1000)} (lo que cayó en ${peorAf[0]})`);
  atajo("empleo-atajos", 500000, "Volver al valor inicial");
  const escalaE = [-2000000, -1500000, -1000000, -500000, 0, 500000, 1000000, 1500000, 2000000];
  const pintarEmpleo = () => {
    const n = +$("empleo-p").value;
    const extra = (n * cotMedia) / 1e6;
    $("empleo-frase").textContent = n === 0 ? `Con el empleo de ${añoE}, la Seguridad Social ingresó ${millonesHablados(cotE)} en cotizaciones.`
      : `Con ${numero(Math.abs(n), 0)} afiliados ${n > 0 ? "más" : "menos"}, que cotizaran lo mismo que la media (${numero(Math.round(cotMedia), 0)} € al año cada uno), `
        + `${n > 0 ? "entrarían" : "dejarían de entrar"} ${millonesHablados(Math.abs(extra))} al año en cotizaciones: ${pct((100 * Math.abs(extra)) / cotE, 1)} de lo que se ingresó en ${añoE} `
        + `y ${pct((100 * Math.abs(extra)) / pibDe(añoE), 2)} del PIB.`;
    barras($("empleo-grafico"), escalaE.map((x) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${numero(Math.abs(x) / 1e6, 1).replace(/,0$/, "")} M`), escalaE.map((x) => (x * cotMedia) / 1e6),
      { formato: (v) => `${v < 0 ? "−" : ""}${numero(Math.round(Math.abs(v) / 100) * 100, 0)}`, resalta: [escalaE.reduce((m, x, k) => (Math.abs(x - n) < Math.abs(escalaE[m] - n) ? k : m), 0)] });
    listaSupuestos($("empleo-supuestos"), [
      `Cotizaciones de ${añoE}: ${millones(cotE)}, todas las que ingresaron los fondos de la Seguridad Social (también el paro, que cobra el SEPE).`,
      `Afiliados: ${numero(afil, 0)}, la media de los doce meses de ${añoE}. Cotización media por afiliado: cotizaciones ÷ afiliados, ${numero(Math.round(cotMedia), 0)} € al año.`,
      "Los afiliados de más cotizan lo mismo que la media. Si son empleos con menos sueldo o a tiempo parcial, cotizan menos; si son autónomos, pagan su propia cuota.",
      "No se cuenta lo que cambia el gasto en paro (no hay una serie separada en estos datos) ni el IRPF o el IVA de más o de menos.",
    ]);
  };
  mando("empleo-p", (v) => miles(v), pintarEmpleo);
  lineaFuente($("empleo-fuente"), {
    fuentes: F, tablas: [["ss_afiliados_medios", "afiliados medios a la Seguridad Social"], ["gov_10a_main", "cotizaciones de los fondos de la Seguridad Social (D.61, sector S1314)"]], tipo: "lectura",
    nota: "Aproximación nuestra con los supuestos de abajo.",
  });
  pintarEmpleo();

  // 7. Más o menos gasto en una partida
  const iG = g.años.length - 1, iA = a.años.indexOf(añoG);
  const pibG = pibDe(añoG), pobG = pobDe(añoG), saldoG = s.saldo.pib[iA];
  const sel = $("partida-f");
  for (const f of g.funciones) {
    const o = document.createElement("option");
    o.value = f.codigo; o.textContent = nombreLlano(f.codigo, f.nombre).replace(/^./, (c) => c.toUpperCase());
    sel.appendChild(o);
  }
  sel.value = "GF07";
  const pintarPartida = () => {
    const f = g.funciones.find((x) => x.codigo === sel.value), p = +$("partida-p").value;
    const base = f.corrientes[iG], extra = (base * p) / 100;
    const nuevoSaldo = saldoG - (100 * extra) / pibG;
    const nombre = nombreLlano(f.codigo, f.nombre);
    $("partida-frase").textContent = p === 0 ? `En ${añoG} se gastaron ${millonesHablados(base)} en ${nombre}. Con el mando se elige un cambio.`
      : `En ${añoG} se gastaron ${millonesHablados(base)} en ${nombre}. Un ${pct(Math.abs(p), 0)} ${p > 0 ? "más" : "menos"} son ${millonesHablados(Math.abs(extra))} al año: `
        + `${eurosHablados(Math.abs(extra * 1e6) / pobG)} por habitante y ${pct((100 * Math.abs(extra)) / pibG, 2)} del PIB. `
        + `Si no cambiara nada más, ${saldoG < 0 ? "el déficit" : "el saldo"} de ${añoG} habría pasado del ${pct(Math.abs(saldoG))} al ${pct(Math.abs(nuevoSaldo))} del PIB`
        + (Math.sign(nuevoSaldo) !== Math.sign(saldoG) && nuevoSaldo !== 0 ? (nuevoSaldo > 0 ? ", con superávit." : ", con déficit.") : ".");
    $("partida-pie").textContent = `Saldo de todas las administraciones en ${añoG}, en % del PIB: el publicado y con el cambio (negativo = déficit)`;
    barras($("partida-grafico"), [`Publicado`, "Con el cambio"], [saldoG, nuevoSaldo], { formato: (v) => `${v < 0 ? "−" : ""}${numero(Math.abs(v), 2)} %`, resalta: [1] });
    listaSupuestos($("partida-supuestos"), [
      `Gasto de partida: el de todas las administraciones en ${nombre} en ${añoG} (${millones(base)}), según la clasificación por funciones de Eurostat.`,
      "Cambia solo esa partida y todo lo demás se queda igual: los ingresos, las otras partidas y el PIB.",
      "En la realidad, más gasto puede mover la economía y los ingresos, y un cambio grande no se hace de un año para otro.",
      `Saldo de ${añoG}: ${pct(saldoG)} del PIB (Eurostat).`,
    ]);
  };
  sel.addEventListener("change", pintarPartida);
  mando("partida-p", (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${pct(Math.abs(v), 0)}`, pintarPartida);
  lineaFuente($("partida-fuente"), {
    fuentes: F, tablas: [["gov_10a_exp", "gasto de las administraciones por funciones"], ["gov_10a_main", "saldo"]], tipo: "lectura",
    nota: "La barra «Con el cambio» es una aproximación nuestra con los supuestos de abajo.",
  });
  pintarPartida();

  // Solo las tablas que están en la lista de fuentes (si una descarga falla un día, la página no se rompe)
  const enF = (ts) => ts.filter(([t_]) => F.some((f) => f.tabla === t_));

  // 8. IVA: base de cada tipo (preparada en construir.py a partir del informe de recaudación y la memoria de beneficios fiscales)
  const IV = rec.iva_tipos, ptos = (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${numero(Math.abs(v), 1).replace(/,0$/, "")} ${Math.abs(v) === 1 ? "punto" : "puntos"}`;
  if (IV) {
    const tiposIVA = [["21", "General (21 %)"], ["10", "Reducido (10 %)"], ["4", "Superreducido (4 %)"]];
    const nomTipo = { 21: "el tipo general", 10: "el tipo reducido", 4: "el tipo superreducido", todos: "los tres tipos" };
    const pibI = pibDe(IV.año), pobI = pobDe(IV.año);
    const pintarIVA = () => {
      const x = +$("iva-p").value, sel = $("iva-tipo").value;
      const por = tiposIVA.map(([k]) => (IV.bases[k] * x) / 100);
      const extra = sel === "todos" ? por.reduce((s_, v) => s_ + v, 0) : por[tiposIVA.findIndex(([k]) => k === sel)];
      const desde = sel === "todos" ? "" : ` (del ${sel} % al ${numero(+sel + x, 1).replace(/,0$/, "")} %)`;
      $("iva-frase").textContent = x === 0 ? `En ${IV.año}, el IVA devengado fue de ${millonesHablados(IV.devengado)}. Con el mando se elige un cambio.`
        : `Con ${ptos(Math.abs(x)).replace("+", "")} ${x > 0 ? "más" : "menos"} en ${nomTipo[sel]}${desde}, se ${x > 0 ? "ingresarían" : "dejarían de ingresar"} ${millonesHablados(Math.abs(extra))} al año: `
          + `${eurosHablados(Math.abs(extra * 1e6) / pobI)} por habitante y ${pct((100 * Math.abs(extra)) / pibI, 2)} del PIB, un ${pct((100 * Math.abs(extra)) / IV.devengado, 1)} ${x > 0 ? "más" : "menos"} de IVA que en ${IV.año}.`
          + (x > 0 ? comoPartida(Math.abs(extra)) : "");
      $("iva-pie").textContent = `${x >= 0 ? "Recaudación de más" : "Recaudación de menos"} al año si cambia cada tipo ${ptos(Math.abs(x)).replace("+", "")}, en millones de euros (${IV.año})`;
      barras($("iva-grafico"), tiposIVA.map(([, n]) => n), por.map(Math.abs), { formato: (v) => numero(Math.round(v), 0),
        resalta: sel === "todos" ? [0, 1, 2] : [tiposIVA.findIndex(([k]) => k === sel)], rotula: [0, 1, 2] });
      listaSupuestos($("iva-supuestos"), [
        `Base de partida: el gasto final sujeto a IVA de ${IV.año}, ${millones(IV.gasto)} (consumo de los hogares, compras de las administraciones y vivienda nueva), con un tipo efectivo del ${pct(IV.tipo_efectivo)}: ${millones(IV.devengado)} de IVA.`,
        `El informe de recaudación no reparte esa base por tipos. Se reparte con la memoria de beneficios fiscales de ${IV.año_reparto} (la del último presupuesto aprobado), que dice cuánto se deja de ingresar por cada tipo reducido frente al general; de ahí sale la base de cada uno, y la del general es lo que queda del IVA de ese año. Ese reparto se lleva a ${IV.año} en proporción al IVA devengado.`,
        `Bases resultantes en ${IV.año}: ${tiposIVA.map(([k, n]) => `${n.replace(/ \(.*/, "").toLowerCase()}, ${millones(IV.bases[k])}`).join("; ")}.`,
        "Se compra lo mismo con el tipo nuevo: no se cuenta que suban los precios y se compre menos, ni el fraude. A corto plazo, el consumo cambia poco con el IVA; a más plazo, algo más.",
        "Las cifras son las de la Agencia Tributaria, que no recauda el IVA de las haciendas forales del País Vasco y Navarra; Canarias (IGIC), Ceuta y Melilla tienen otros impuestos.",
      ]);
    };
    $("iva-tipo").addEventListener("change", pintarIVA);
    mando("iva-p", ptos, pintarIVA);
    lineaFuente($("iva-fuente"), {
      fuentes: F, tablas: enF([[rec.tablas.bases, "Informe Anual de Recaudación Tributaria: base, tipo efectivo e IVA devengado (cuadro 1.3)"], [bf.tabla, `Memoria de Beneficios Fiscales de ${IV.año_reparto}, página ${IV.memoria_pagina}`]]), tipo: "lectura",
      nota: "El reparto por tipos y el cálculo son una aproximación nuestra con los supuestos de abajo.",
    });
    pintarIVA();
  } else document.getElementById("iva").hidden = true;

  // 9. IRPF: base general menos el mínimo personal y familiar, por tramos de rendimiento (Estadística de declarantes)
  const IR = rec.irpf_tramos;
  if (IR) {
    const corto = (t) => t.replace("Negativo y Cero", "≤0").replace("Mayor de ", ">").replace(/^\((.*) - (.*)\]$/, "$1–$2");
    const techo = (t) => t.replace("Negativo y Cero", "≤0").replace("Mayor de ", ">").replace(/^\((.*) - (.*)\]$/, "$2");
    const gravable = IR.tramos.map((f) => Math.max(0, f.base - f.minimo));
    const total = gravable.reduce((s_, v) => s_ + v, 0);
    const devIR = IR.devengado[String(IR.año)];
    const pibR = pibDe(IR.año), pobR = pobDe(IR.año);
    const k30 = IR.tramos.findIndex((f) => f.tramo.startsWith("(30 "));
    const desde60 = IR.tramos.map((f, k) => (/^\((60|150) |^Mayor/.test(f.tramo) ? gravable[k] : 0)).reduce((s_, v) => s_ + v, 0);
    const pintarIRPF = () => {
      const x = +$("irpf-p").value;
      const por = gravable.map((v) => (v * x) / 100), extra = (total * x) / 100;
      const media30 = k30 >= 0 ? (por[k30] * 1e6) / IR.tramos[k30].declaraciones : null;
      $("irpf-frase").textContent = x === 0 ? `Sin cambio de tipos no cambia nada. Con el mando se elige un cambio.`
        : `Con ${ptos(Math.abs(x)).replace("+", "")} ${x > 0 ? "más" : "menos"} en todos los tramos, se ${x > 0 ? "ingresarían" : "dejarían de ingresar"} ${millonesHablados(Math.abs(extra))} al año: `
          + `${eurosHablados(Math.abs(extra * 1e6) / pobR)} por habitante, ${pct((100 * Math.abs(extra)) / pibR, 2)} del PIB y un ${pct((100 * Math.abs(extra)) / devIR, 1)} ${x > 0 ? "más" : "menos"} de IRPF que en ${IR.año}. `
          + `De cada 100 € de diferencia, ${numero(Math.round((100 * desde60) / total), 0)} corresponderían a declaraciones con más de 60.000 € de rendimientos`
          + (media30 ? `; una declaración media de 30.000 a 60.000 € ${x > 0 ? "pagaría" : "se ahorraría"} unos ${numero(Math.round(Math.abs(media30) / 10) * 10, 0)} € al año.` : ".")
          + (x > 0 ? comoPartida(Math.abs(extra)) : "");
      $("irpf-pie").textContent = `${x >= 0 ? "Recaudación de más" : "Recaudación de menos"} al año por tramo de rendimientos de la declaración, en millones de euros, ${IR.año}. Debajo de cada barra, hasta cuántos miles de euros de rendimientos tiene la declaración`;
      barras($("irpf-grafico"), IR.tramos.map((f) => techo(f.tramo)), por.map(Math.abs), { formato: (v) => numero(Math.round(v), 0), rotula: [k30] });
      listaSupuestos($("irpf-supuestos"), [
        `Declaraciones del IRPF de ${IR.año} (las últimas con estadística), del territorio común: sin País Vasco ni Navarra, que tienen su propio IRPF.`,
        `Base de partida: la base liquidable general sometida a gravamen menos la parte del mínimo personal y familiar que se le resta (media de la parte estatal y la autonómica), ${millones(total)} en total. Los tramos en que el mínimo es mayor que la base (${IR.sin_cuota.map(corto).join(", ")} mil €) cuentan como cero: ahí casi nadie paga cuota.`,
        "Suben por igual todos los tipos de la escala general, la estatal y la autonómica sumadas. No cambian las rentas del ahorro (intereses, dividendos y ganancias), que tienen su propia escala, ni las deducciones.",
        "Se declara lo mismo con los tipos nuevos: no se cuenta que algunas personas trabajen, declaren o se organicen de otra forma, que pesa más en las rentas altas.",
        `Para comparar: el IRPF devengado de ${IR.año} fue de ${millones(devIR)} (Informe Anual de Recaudación, todo el territorio común).`,
      ]);
    };
    mando("irpf-p", ptos, pintarIRPF);
    lineaFuente($("irpf-fuente"), {
      fuentes: F, tablas: enF([["aeat_irpf_505", `Estadística de los declarantes del IRPF ${IR.año}: base liquidable general sometida a gravamen`], ["aeat_irpf_521", "mínimo personal y familiar (estatal)"], ["aeat_irpf_523", "mínimo personal y familiar (autonómico)"], [rec.tablas.bases, "IRPF devengado (cuadro 1.3 del Informe Anual de Recaudación)"]]), tipo: "lectura",
      nota: "Aproximación nuestra con los supuestos de abajo.",
    });
    pintarIRPF();
  } else document.getElementById("irpf").hidden = true;
}

document.addEventListener("DOMContentLoaded", arrancarEscenarios);
