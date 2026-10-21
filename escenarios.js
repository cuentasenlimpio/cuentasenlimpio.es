// Cuentas en limpio: «¿Qué pasaría si…?». Tres calculadoras de mecanismos con las cifras de hoy (las mismas reglas que
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

// Barras verticales sencillas (un solo color), con el valor encima de la primera, la última y la mayor.
function barras(caja, etiquetas, valores, { formato, resalta = [] } = {}) {
  const W = 420, H = 190, m = { i: 8, d: 8, a: 22, b: 22 };
  const max = Math.max(...valores.map(Math.abs), 1);
  const ancho = (W - m.i - m.d) / valores.length;
  const cero = valores.some((v) => v < 0) ? m.a + (H - m.a - m.b) / 2 : H - m.b;
  const alto = (v) => (Math.abs(v) * (valores.some((x) => x < 0) ? (H - m.a - m.b) / 2 : H - m.a - m.b)) / max;
  const svg = nodo("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" });
  svg.setAttribute("aria-label", etiquetas.map((e, k) => `${e}: ${formato(valores[k])}`).join("; "));
  nodo("line", { x1: m.i, x2: W - m.d, y1: cero, y2: cero, class: "eje-recorrido" }, undefined, svg);
  const marcar = new Set([0, valores.length - 1, ...resalta]);
  valores.forEach((v, k) => {
    const x = m.i + k * ancho + 2, h = alto(v);
    const r = nodo("rect", { x, y: v >= 0 ? cero - h : cero, width: Math.max(1, ancho - 4), height: Math.max(h, 0.5), rx: 2, class: resalta.includes(k) ? "barra-escenario barra-elegida" : "barra-escenario" }, undefined, svg);
    nodo("title", {}, `${etiquetas[k]}: ${formato(v)}`, r);
    if (valores.length <= 12 || k % 2 === 0 || k === valores.length - 1)
      nodo("text", { x: x + ancho / 2 - 2, y: H - 6, "text-anchor": "middle", class: "rotulo-recorrido" }, etiquetas[k], svg);
    if (marcar.has(k) && v !== 0)
      nodo("text", { x: x + ancho / 2 - 2, y: v >= 0 ? cero - h - 6 : cero + h + 14, "text-anchor": "middle", class: "dato-recorrido" }, formato(v), svg);
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
  const pintar = () => { o.textContent = mostrar(+r.value); alCambiar(); };
  r.addEventListener("input", pintar);
  r.closest("form").querySelectorAll("[data-valor]").forEach((b) => b.addEventListener("click", () => { r.value = b.dataset.valor; pintar(); }));
  r.closest("form").addEventListener("submit", (e) => e.preventDefault());
  o.textContent = mostrar(+r.value);
  return r;
}

async function arrancarEscenarios() {
  let a, e, eco, g;
  try {
    [a, e, eco, g] = await Promise.all(["aapp", "escala", "economia", "gasto"].map((n) => fetch(`datos/${n}.json`).then((r) => r.json())));
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
}

document.addEventListener("DOMContentLoaded", arrancarEscenarios);
