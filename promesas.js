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
  nuevo("p", { textContent: "Otras versiones o copias de los mismos documentos, que sirven para contrastar, y documentos de partidos fuera del alcance acordado (los del Grupo Mixto). Se guardan igual, con su huella." }, c);
  const ul = nuevo("ul", { className: "documentos" }, c);
  for (const d of fuera) documento(d, ul);

  const f = document.getElementById("documentos-fuente");
  f.textContent = `Fuente: la web de cada partido (o el medio que se indica, cuando el partido no lo publicó) y su captura en el Internet Archive. Direcciones, estado y huellas comprobados el ${fecha(datos.comprobado)}. `;
  nuevo("span", { className: "etiqueta-tipo dato", textContent: "dato" }, f);
  f.appendChild(document.createTextNode(" "));
  enlace("https://github.com/cuentasenlimpio/cuentasenlimpio.es/blob/main/codigo/promesas/documentos.json", "Catálogo completo (JSON)", f);
  f.appendChild(document.createTextNode("."));
}

arrancar();
