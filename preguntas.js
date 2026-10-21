// Cuentas en limpio: preguntas que se hace la gente, respondidas con datos (contenido en preguntas.json).
"use strict";

async function arrancarPreguntas() {
  const lista = document.getElementById("preguntas-lista");
  const indice = document.getElementById("preguntas-indice");
  let d;
  try { d = await fetch("preguntas.json").then((r) => r.json()); } catch { lista.textContent = "No se han podido cargar las preguntas."; return; }
  lista.textContent = "";
  const el = (tipo, props, padre) => {
    const e = document.createElement(tipo);
    Object.assign(e, props || {});
    if (padre) padre.appendChild(e);
    return e;
  };
  const enlace = (padre, href, texto) => el("a", { href, textContent: texto }, padre);
  for (const q of d.preguntas) {
    const li = el("li", {}, indice);
    enlace(li, `#${q.id}`, q.pregunta);
    const art = el("article", { className: "pregunta-faq", id: q.id }, lista);
    el("h2", { className: "pregunta", textContent: q.pregunta }, art);
    el("p", { className: "respuesta", textContent: q.respuesta }, art);
    el("h3", { textContent: "Lo que dicen los datos" }, art);
    for (const p of q.datos) el("p", { textContent: p }, art);
    if (q.no_dicen?.length) {
      const ojo = el("div", { className: "ojo" }, art);
      el("strong", { textContent: "Lo que los datos no dicen" }, ojo);
      for (const p of q.no_dicen) el("p", { textContent: p }, ojo);
    }
    if (q.debate) {
      const box = el("div", { className: "entender" }, art);
      el("p", { className: "rotulo", textContent: q.debate.hay_acuerdo ? "¿Hay acuerdo? En lo básico, sí" : "¿Hay acuerdo? No del todo" }, box);
      el("p", { textContent: q.debate.texto }, box);
      if (q.debate.posturas?.length) {
        const ul = el("ul", {}, box);
        for (const s of q.debate.posturas) {
          const it = el("li", {}, ul);
          el("strong", { textContent: `${s.quien}: ` }, it);
          it.append(`${s.sostiene} `);
          if (s.fuente?.url) { it.append("("); enlace(it, s.fuente.url, s.fuente.texto); it.append(")"); }
        }
      }
    }
    if (q.para_seguir?.length) {
      const p = el("p", { className: "para-seguir" }, art);
      p.append("Para verlo en la web: ");
      q.para_seguir.forEach((s, k) => { if (k) p.append(" · "); enlace(p, s.url, s.texto); });
    }
    const det = el("details", { className: "fuente-detalle" }, art);
    el("summary", { textContent: `Fuentes (${q.fuentes.length})` }, det);
    const ul = el("ul", {}, det);
    for (const f of q.fuentes) enlace(el("li", {}, ul), f.url, f.texto);
    if (q.comprobado) el("p", { className: "comprobado", textContent: `Comprobado el ${q.comprobado}.` }, art);
  }
  if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
}
document.addEventListener("DOMContentLoaded", arrancarPreguntas);
