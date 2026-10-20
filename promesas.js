// Cuentas en limpio: página «Promesas». Pinta la lista de documentos de partida desde datos/documentos.json.
"use strict";

const TIPOS = [
  ["programa", "Programas electorales del 23 de julio de 2023"],
  ["coalicion", "Acuerdo de coalición del Gobierno"],
  ["investidura", "Acuerdos de investidura"],
];
const IDIOMAS = { es: "castellano", ca: "catalán", gl: "gallego", eu: "euskera" };
const ESTADOS = {
  disponible: "sigue publicado",
  retirado: "ya no está publicado",
  "no comprobable": "la web no deja comprobarlo de forma automática",
};

function nuevo(tipo, props = {}, padre = null) {
  const e = document.createElement(tipo);
  Object.assign(e, props);
  if (padre) padre.appendChild(e);
  return e;
}

function enlace(href, textoEnlace, padre) {
  return nuevo("a", { href, textContent: textoEnlace }, padre);
}

function documento(d, padre) {
  const li = nuevo("li", { className: "documento" }, padre);
  const cab = nuevo("p", { className: "documento-titulo" }, li);
  nuevo("strong", { textContent: d.partidos.join(" – ") }, cab);
  cab.appendChild(document.createTextNode(` · ${d.titulo}`));
  nuevo("p", { className: "documento-meta", textContent: `${d.paginas} páginas · ${IDIOMAS[d.idioma] || d.idioma} · ${numero(d.bytes / 1e6, 1)} MB` }, li);
  const enlaces = nuevo("p", { className: "documento-enlaces" }, li);
  enlace(d.original, "Publicación original", enlaces);
  enlaces.appendChild(document.createTextNode(` (${ESTADOS[d.original_estado] || d.original_estado}) · `));
  enlace(d.archivo, "Copia en el Internet Archive", enlaces);
  enlaces.appendChild(document.createTextNode(" · "));
  const h = nuevo("span", { className: "huella", textContent: `huella ${d.sha256.slice(0, 12)}…` }, enlaces);
  h.title = `SHA-256 completo: ${d.sha256}`;
  if (d.nota) nuevo("p", { className: "documento-nota", textContent: d.nota }, li);
}

async function arrancar() {
  const c = document.getElementById("lista-documentos");
  let datos;
  try {
    datos = await fetch("datos/documentos.json").then((r) => r.json());
  } catch {
    c.textContent = "No se ha podido cargar la lista de documentos.";
    return;
  }
  c.textContent = "";
  const dentro = datos.documentos.filter((d) => d.en_alcance);
  const fuera = datos.documentos.filter((d) => !d.en_alcance);
  for (const [tipo, titulo] of TIPOS) {
    const lista = dentro.filter((d) => d.tipo === tipo);
    if (!lista.length) continue;
    nuevo("h3", { textContent: `${titulo} (${lista.length})` }, c);
    const ul = nuevo("ul", { className: "documentos" }, c);
    for (const d of lista) documento(d, ul);
  }

  nuevo("h3", { textContent: "Lo que no hemos encontrado" }, c);
  const nf = nuevo("ul", { className: "documentos" }, c);
  for (const n of datos.no_encontrados) {
    const li = nuevo("li", { className: "documento" }, nf);
    nuevo("p", { className: "documento-titulo" }, li).appendChild(nuevo("strong", { textContent: n.que }));
    nuevo("p", { className: "documento-nota", textContent: n.detalle }, li);
  }

  nuevo("h3", { textContent: `Guardados, pero de los que no se sacan promesas (${fuera.length})` }, c);
  nuevo("p", { textContent: "Otras versiones o copias de los mismos documentos, que sirven para contrastar. Se guardan igual, con su huella." }, c);
  const ul = nuevo("ul", { className: "documentos" }, c);
  for (const d of fuera) documento(d, ul);

  // El Grupo Mixto: quién lo formaba al empezar y quién pasó a él después, con la regla que se aplica.
  const gm = datos.grupo_mixto;
  const m = document.getElementById("grupo-mixto");
  m.textContent = "";
  nuevo("p", {}, m).appendChild(nuevo("strong", { textContent: "El Grupo Mixto. " }));
  m.firstChild.appendChild(document.createTextNode(`Reúne a los diputados de partidos que no llegan a formar grupo propio. ${gm.inicio} Después pasaron a él diputados elegidos en otras listas:`));
  const ulm = nuevo("ul", {}, m);
  for (const t of gm.despues) nuevo("li", { textContent: t }, ulm);
  nuevo("p", { textContent: gm.regla }, m);
  const fm = nuevo("p", { className: "fuente-grafico", textContent: "Fuente: " }, m);
  enlace(gm.url, gm.fuente, fm);
  fm.appendChild(document.createTextNode(". "));
  nuevo("span", { className: "etiqueta-tipo dato", textContent: "dato" }, fm);

  const f = document.getElementById("documentos-fuente");
  f.textContent = `Fuente: la web de cada partido (o el medio que se indica, cuando el partido no lo publicó) y su captura en el Internet Archive. Direcciones, estado y huellas comprobados el ${fecha(datos.comprobado)}. `;
  nuevo("span", { className: "etiqueta-tipo dato", textContent: "dato" }, f);
  f.appendChild(document.createTextNode(" "));
  enlace("https://github.com/cuentasenlimpio/cuentasenlimpio.es/blob/main/codigo/promesas/documentos.json", "Catálogo completo (JSON)", f);
  f.appendChild(document.createTextNode("."));
}

// ---- Las promesas: buscador, filtros y lista ----

const POR_PAGINA = 40;
const DESCARTES = [["vaga", "vagas"], ["diagnostico", "diagnóstico"], ["valores", "valores"], ["balance", "balance"],
  ["explica", "explican otra"], ["critica", "crítica"], ["introduce", "abren lista"]];
const plano = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const docNombre = (d) => `${d.partidos.join(" – ")} · ${d.tipo === "programa" ? "programa" : d.tipo === "coalicion" ? "acuerdo de coalición" : d.tipo === "investidura" ? "acuerdo de investidura" : d.tipo}`;
const ordenAlfabetico = (a, b) => a.partidos.join(" ").localeCompare(b.partidos.join(" "), "es");

// Respuesta corta: cuántas promesas distintas y de cuántos documentos.
function pintarRespuesta(datos) {
  const p = document.getElementById("respuesta");
  const distintas = datos.documentos.reduce((t, d) => t + d.distintas, 0);
  p.textContent = "";
  const b = document.createElement("strong");
  b.textContent = `${numero(distintas, 0)} promesas`;
  p.append(b, ` en ${datos.documentos.length} documentos: los programas electorales del 23 de julio de 2023, el acuerdo de coalición y los acuerdos de investidura. Cada una, con su cita literal y la página donde está.`);
}

function pintarRecuento(datos) {
  const t = document.getElementById("recuento-tabla");
  t.textContent = "";
  const cab = nuevo("tr", {}, nuevo("thead", {}, t));
  for (const [txt, num] of [["Documento", false], ["Frases", true], ["Promesas distintas", true], ["Repetidas", true], ...DESCARTES.map(([, n]) => [n.charAt(0).toUpperCase() + n.slice(1), true])]) {
    const th = nuevo("th", { textContent: txt, scope: "col" }, cab);
    if (num) th.className = "num";
  }
  const cuerpo = nuevo("tbody", {}, t);
  for (const bloque of [true, false]) {
    const fila = nuevo("tr", {}, cuerpo);
    nuevo("th", { textContent: bloque ? "Gobierno" : "Demás partidos", scope: "colgroup", colSpan: 4 + DESCARTES.length }, fila);
    for (const d of datos.documentos.filter((x) => x.gobierno === bloque).sort(ordenAlfabetico)) {
      const tr = nuevo("tr", {}, cuerpo);
      nuevo("td", { textContent: docNombre(d) }, tr);
      for (const v of [d.frases, d.distintas, d.promesas - d.distintas, ...DESCARTES.map(([k]) => d.cuenta_frases[k] || 0)]) {
        nuevo("td", { className: "num", textContent: numero(v, 0) }, tr);
      }
    }
  }
  const f = document.getElementById("recuento-fuente");
  f.textContent = "Fuente: elaboración propia a partir de los 17 documentos de la lista de abajo. «Frases» no cuenta los títulos; una frase puede contener más de una promesa. ";
  nuevo("span", { className: "etiqueta-tipo lectura", textContent: "lectura" }, f);
  f.appendChild(document.createTextNode(` Clasificación doble e independiente, con un ${numero(100 * datos.fiabilidad.acuerdo, 1)} % de acuerdo; los ${numero(datos.fiabilidad.desacuerdos, 0)} desacuerdos, arbitrados (ver «Quién clasifica y cómo se comprueba»).`));
}

// Partido del documento → cómo aparece en las votaciones: su grupo o, en el Grupo Mixto, la formación con la que se
// presentaron sus diputados.
const EN_VOTACION = { PP: ["PP"], PSOE: ["PSOE"], Vox: ["Vox"], Sumar: ["Sumar"], ERC: ["ERC"], Junts: ["Junts"], "EH Bildu": ["EH Bildu"],
  "EAJ-PNV": ["PNV"], BNG: ["Grupo Mixto", "BNG"], UPN: ["Grupo Mixto", "UPN"], "Coalición Canaria": ["Grupo Mixto", "CCa"] };
const CLASE = { misma: "Trata la misma medida", contraria: "Regula la misma medida en sentido contrario" };
const RANGO = { LO: "Ley orgánica", L: "Ley", RDL: "Real decreto-ley" };

function votoDe(v, partido) {
  const [g, f] = EN_VOTACION[partido] || [];
  const r = f ? v.mixto_por_formacion[f] : v.grupos[g];
  if (!r) return null;
  const total = Object.values(r).reduce((a, b) => a + b, 0);
  const [voto, n] = Object.entries(r).sort((a, b) => b[1] - a[1])[0];
  return n === total ? voto : Object.entries(r).filter(([, x]) => x).map(([k, x]) => `${k}: ${x}`).join(", ");
}

function bloqueHechos(rels, normas, d, padre) {
  const caja = nuevo("div", { className: "hechos" }, padre);
  nuevo("p", { className: "hechos-titulo", textContent: "Hechos encontrados" }, caja);
  const ol = nuevo("ol", { className: "hechos-lista" }, caja);
  for (const r of rels.sort((a, b) => (normas[a.hecho]?.publicada || "").localeCompare(normas[b.hecho]?.publicada || ""))) {
    const n = normas[r.hecho];
    if (!n) continue;
    const li = nuevo("li", { className: `hecho hecho-${r.clase}` }, ol);
    const t = nuevo("p", { className: "hecho-norma" }, li);
    nuevo("strong", { textContent: `${CLASE[r.clase]}${r.parcial ? ", en parte" : ""}: ` }, t);
    enlace(n.url, n.titulo, t);
    t.appendChild(document.createTextNode(` Publicado en el BOE el ${fecha(n.publicada)}.`));
    nuevo("p", { className: "hecho-motivo", textContent: `Por qué la enlazamos: ${r.motivo}` }, li);
    // Paso por el Congreso: la última votación decisiva y cómo votó quien hizo la promesa.
    const vs = n.tramitacion.flatMap((tr) => tr.votaciones.map((v) => ({ ...v, expediente: tr.expediente, ficha: tr.url })));
    if (vs.length) {
      const v = vs.at(-1);
      const p = nuevo("p", { className: "hecho-voto" }, li);
      p.appendChild(document.createTextNode(`${v.paso} en el Congreso (${v.fecha}): ${v.asentimiento ? "por asentimiento" : `${v.si} sí, ${v.no} no, ${v.abstencion} abstenciones`}. `));
      const quienes = d.partidos.map((pa) => [pa, votoDe(v, pa)]).filter(([, x]) => x);
      if (quienes.length) p.appendChild(document.createTextNode(quienes.map(([pa, x]) => `${pa}: ${x}`).join(" · ") + ". "));
      else if (v.nota) {
        p.appendChild(document.createTextNode("El voto de cada grupo no está en los datos abiertos: "));
        enlace(v.url, "ver el Diario de Sesiones", p);
        p.appendChild(document.createTextNode(". "));
      }
      enlace(v.ficha, `expediente ${v.expediente}`, p);
    } else if (n.rango === "RDL") {
      nuevo("p", { className: "hecho-voto", textContent: "Sin votación de convalidación en el Pleno en los datos abiertos del Congreso. Con las Cortes disueltas (desde el 6 de octubre de 2026), la convalidación corresponde a la Diputación Permanente (artículo 78 de la Constitución)." }, li);
    }
  }
  return caja;
}

async function arrancarPromesas() {
  const resumen = document.getElementById("promesas-resumen");
  let datos, hechos;
  try {
    [datos, hechos] = await Promise.all([fetch("datos/promesas.json").then((r) => r.json()),
      fetch("datos/hechos.json").then((r) => (r.ok ? r.json() : null)).catch(() => null)]);
  } catch {
    resumen.textContent = "No se han podido cargar las promesas.";
    return;
  }
  const docs = Object.fromEntries(datos.documentos.map((d) => [d.id, d]));
  // Hechos: relaciones por promesa (las de cualquier promesa de la misma frase se muestran juntas).
  const normas = Object.fromEntries((hechos?.normas || []).map((n) => [n.clave, n]));
  const relaciones = {};
  for (const r of hechos?.relaciones || []) (relaciones[r.promesa] ||= []).push(r);
  for (const p of datos.promesas) p.hechos = relaciones[`${p.d}:${p.id}`] || [];
  for (const p of datos.promesas) p.buscable = plano(`${p.e} ${p.c} ${p.x}`);
  const distintas = datos.promesas.filter((p) => !p.r).length;
  resumen.textContent = `${numero(distintas, 0)} promesas distintas en ${datos.documentos.length} documentos de la XV Legislatura, cada una con su cita literal y su página.`;

  const sel = document.getElementById("p-doc");
  for (const [bloque, nombre] of [[true, "Gobierno"], [false, "Demás partidos"]]) {
    const g = nuevo("optgroup", { label: nombre }, sel);
    for (const d of datos.documentos.filter((x) => x.gobierno === bloque).sort(ordenAlfabetico)) nuevo("option", { value: d.id, textContent: docNombre(d) }, g);
  }
  // Orden de la lista: Gobierno y demás partidos, documentos por orden alfabético y, dentro, por página.
  const orden = datos.documentos.slice().sort((a, b) => (b.gobierno - a.gobierno) || ordenAlfabetico(a, b)).map((d) => d.id);
  datos.promesas.sort((a, b) => orden.indexOf(a.d) - orden.indexOf(b.d) || a.p - b.p);

  const estado = { texto: "", quien: "", doc: "", paso: "", repes: false, vistas: POR_PAGINA };
  const lista = document.getElementById("promesas-lista");
  const cuenta = document.getElementById("promesas-cuenta");
  const mas = document.getElementById("promesas-mas");

  // Una tarjeta por frase: si de una misma frase salen varias promesas, sus etiquetas van juntas y la cita, una vez.
  const LARGA = 420;
  function tarjeta(grupo) {
    const p = grupo[0];
    const d = docs[p.d];
    const li = nuevo("li", { className: "promesa" });
    if (grupo.length === 1) nuevo("p", { className: "promesa-etiqueta", textContent: p.e }, li);
    else {
      const ul = nuevo("ul", { className: "promesa-etiquetas" }, li);
      for (const q of grupo) nuevo("li", { className: "promesa-etiqueta", textContent: q.e }, ul);
    }
    const cita = nuevo("blockquote", { className: "promesa-cita" }, li);
    cita.lang = d.idioma;
    if (p.c.length > LARGA) {
      const corta = p.c.slice(0, LARGA).replace(/\s+\S*$/, "");
      cita.textContent = `«${corta}…»`;
      const b = nuevo("button", { type: "button", className: "ver-entera", textContent: "Ver la frase entera" }, li);
      b.addEventListener("click", () => { cita.textContent = `«${p.c}»`; b.remove(); });
    } else cita.textContent = `«${p.c}»`;
    if (p.x) nuevo("p", { className: "promesa-contexto", textContent: `Dentro de la lista que empieza: «${p.x}»` }, li);
    const meta = nuevo("p", { className: "promesa-meta" }, li);
    nuevo("span", { className: "promesa-doc", textContent: docNombre(d) }, meta);
    meta.appendChild(document.createTextNode(` · página ${p.p} · `));
    enlace(`${d.archivo_crudo}#page=${p.p}`, "ver en el documento", meta);
    if (p.v) meta.appendChild(document.createTextNode(` · verbo: «${p.v}»`));
    if (grupo.some((q) => q.r)) meta.appendChild(document.createTextNode(" · repite una promesa anterior del mismo documento"));
    // Notas para el lector (límites, quién decide…); las notas de trabajo internas no se muestran.
    const notas = [...new Set(grupo.map((q) => (q.n || "").replace(/\s*Arbitrada:.*$/, "")
      .replace(/\s*(Repetición detectada|Primera aparición|Etiquetas corregidas|Clasificada a mano|Continuación)[^.]*\./g, "").trim()).filter(Boolean))];
    for (const n of notas) nuevo("p", { className: "promesa-nota", textContent: n }, li);
    if (hechos) {
      const rels = grupo.flatMap((q) => q.hechos);
      const vistos = new Set();
      const unicas = rels.filter((r) => !vistos.has(r.hecho) && vistos.add(r.hecho));
      if (unicas.length) bloqueHechos(unicas, normas, d, li);
      else nuevo("p", { className: "hechos-ninguno", textContent: "Sin hechos encontrados en las leyes, leyes orgánicas y reales decretos-leyes de la legislatura. Aún no hemos revisado los reales decretos, el Plan Anual Normativo ni las iniciativas que no prosperaron." }, li);
    }
    return li;
  }
  const unidad = (p) => (p.id.match(/^(.*\d)[a-z]$/) || [, p.id])[1];
  function agrupar(lista) {
    const grupos = [];
    for (const p of lista) {
      const ult = grupos.at(-1);
      if (ult && ult[0].d === p.d && unidad(ult[0]) === unidad(p)) ult.push(p);
      else grupos.push([p]);
    }
    return grupos;
  }

  function pintar() {
    const palabras = plano(estado.texto).split(/\s+/).filter(Boolean);
    const hits = datos.promesas.filter((p) => (estado.repes || !p.r)
      && (!estado.doc || p.d === estado.doc)
      && (!estado.paso || (estado.paso === "con" ? p.hechos.length > 0 : p.hechos.length === 0))
      && (!estado.quien || (estado.quien === "gobierno") === docs[p.d].gobierno)
      && palabras.every((w) => p.buscable.includes(w)));
    lista.textContent = "";
    for (const g of agrupar(hits.slice(0, estado.vistas))) lista.appendChild(tarjeta(g));
    cuenta.textContent = hits.length ? `${numero(hits.length, 0)} promesas${hits.length > estado.vistas ? ` · se muestran las ${numero(estado.vistas, 0)} primeras` : ""}` : "Ninguna promesa coincide con la búsqueda.";
    mas.hidden = hits.length <= estado.vistas;
  }

  let espera = null;
  document.getElementById("p-texto").addEventListener("input", (ev) => {
    clearTimeout(espera);
    espera = setTimeout(() => { estado.texto = ev.target.value; estado.vistas = POR_PAGINA; pintar(); }, 200);
  });
  for (const b of document.querySelectorAll("[data-quien]")) {
    b.addEventListener("click", () => {
      estado.quien = b.dataset.quien; estado.vistas = POR_PAGINA;
      for (const o of document.querySelectorAll("[data-quien]")) o.setAttribute("aria-pressed", String(o === b));
      pintar();
    });
  }
  sel.addEventListener("change", () => { estado.doc = sel.value; estado.vistas = POR_PAGINA; pintar(); });
  const selPaso = document.getElementById("p-paso");
  if (hechos) selPaso.addEventListener("change", () => { estado.paso = selPaso.value; estado.vistas = POR_PAGINA; pintar(); });
  else selPaso.closest("label").hidden = true;
  document.getElementById("p-repes").addEventListener("change", (ev) => { estado.repes = ev.target.checked; estado.vistas = POR_PAGINA; pintar(); });
  mas.addEventListener("click", () => { estado.vistas += POR_PAGINA; pintar(); });
  pintar();

  const f = document.getElementById("promesas-fuente");
  f.textContent = "Fuente: los documentos de cada partido (lista y enlaces más abajo); la cita y la página son del documento; «ver en el documento» abre su copia del Internet Archive en esa página. La etiqueta, el verbo y las notas son nuestros. ";
  nuevo("span", { className: "etiqueta-tipo lectura", textContent: "lectura" }, f);
  f.appendChild(document.createTextNode(" "));
  enlace("datos/promesas.csv", "Todas las promesas en CSV", f);
  f.appendChild(document.createTextNode("."));
  pintarRecuento(datos);
  pintarRespuesta(datos);
  // Fiabilidad de la relación hechos–promesas, en el método.
  const fh = hechos?.fiabilidad, m = document.getElementById("hechos-metodo");
  if (fh && m) {
    const a = fh.auditoria;
    m.appendChild(document.createTextNode(` De ${numero(fh.pares_candidatos, 0)} pares norma–promesa revisados, las dos clasificaciones coincidieron en el ${numero(fh.acuerdo, 1)} % (kappa ${numero(fh.kappa, 2)}; ${numero(fh.acuerdo_en_enlazados, 1)} % en los pares que alguna enlazó); los ${numero(fh.desacuerdos, 0)} desacuerdos se arbitraron. Una cuarta revisión independiente de una muestra al azar no enlazó ${numero(a.enlazados_que_la_auditoria_no_enlaza, 0)} de ${numero(a.enlazados_revisados, 0)} relaciones publicadas y sí enlazó ${numero(a.descartados_que_la_auditoria_enlaza, 0)} de ${numero(a.descartados_revisados, 0)} pares descartados: es la medida de cuánto puede sobrar o faltar. Resultado: ${numero(fh.misma, 0)} relaciones «trata la misma medida» y ${numero(fh.contraria, 0)} «en sentido contrario».`));
  }
}

arrancar();
arrancarPromesas();
