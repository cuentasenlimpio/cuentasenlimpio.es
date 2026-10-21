// Cuentas en limpio: buscador. Índice en datos/buscador.json (lo rehace la construcción diaria). Sin tildes ni mayúsculas.
"use strict";

const ORDEN_TIPO = { Pregunta: 0, Palabra: 1, Página: 2, Apartado: 3, Explicación: 4, "Lectura fácil": 5 };
const normal = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Escribe `texto` en `padre` marcando con <mark> las palabras buscadas (sin tildes ni mayúsculas).
function conMarcas(padre, texto, palabras) {
  const n = normal(texto);
  const tramos = [];
  for (const p of palabras) {
    let i = n.indexOf(p);
    while (i >= 0) { tramos.push([i, i + p.length]); i = n.indexOf(p, i + p.length); }
  }
  tramos.sort((a, b) => a[0] - b[0]);
  let pos = 0;
  for (const [a, b] of tramos) {
    if (a < pos) continue;
    padre.append(texto.slice(pos, a));
    const m = document.createElement("mark");
    m.textContent = texto.slice(a, b);
    padre.appendChild(m);
    pos = b;
  }
  padre.append(texto.slice(pos));
}

async function arrancarBuscador() {
  const q = document.getElementById("q"), lista = document.getElementById("resultados"), estado = document.getElementById("estado");
  let entradas = [];
  try {
    entradas = (await fetch("datos/buscador.json").then((r) => r.json())).entradas;
  } catch {
    estado.textContent = "No se ha podido cargar el buscador.";
    return;
  }
  for (const e of entradas) { e.nt = normal(e.t); e.nd = normal(e.d); e.nx = normal(e.x); }

  const buscar = () => {
    const palabras = normal(q.value).split(/\s+/).filter((p) => p.length > 1);
    lista.textContent = "";
    if (!palabras.length) { estado.textContent = "Busca en las páginas, sus apartados, las palabras del glosario, las preguntas y las explicaciones."; return; }
    const res = [];
    for (const e of entradas) {
      let puntos = 0, todas = true;
      for (const p of palabras) {
        if (e.nt.includes(p)) puntos += e.nt.startsWith(p) ? 6 : 4;
        else if (e.nd.includes(p)) puntos += 2;
        else if (e.nx.includes(p)) puntos += 1;
        else { todas = false; break; }
      }
      if (todas) res.push([puntos - (ORDEN_TIPO[e.k] ?? 6) * 0.1, e]);
    }
    res.sort((a, b) => b[0] - a[0]);
    estado.textContent = res.length ? `${res.length === 1 ? "1 resultado" : `${res.length} resultados`}${res.length > 40 ? "; se muestran los 40 primeros" : ""}.` : "Sin resultados. Prueba con otra palabra o con menos palabras.";
    for (const [, e] of res.slice(0, 40)) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = e.u;
      const tipo = document.createElement("span");
      tipo.className = "resultado-tipo";
      tipo.textContent = e.k;
      const t = document.createElement("strong");
      conMarcas(t, e.t, palabras);
      a.append(tipo, t);
      li.appendChild(a);
      if (e.d) { const d = document.createElement("p"); conMarcas(d, e.d, palabras); li.appendChild(d); }
      lista.appendChild(li);
    }
  };
  let espera;
  q.addEventListener("input", () => { clearTimeout(espera); espera = setTimeout(() => { buscar(); history.replaceState(null, "", q.value ? `?q=${encodeURIComponent(q.value)}` : location.pathname); }, 120); });
  document.getElementById("buscador").addEventListener("submit", (ev) => { ev.preventDefault(); buscar(); });
  const inicial = new URLSearchParams(location.search).get("q");
  if (inicial) { q.value = inicial; buscar(); }
}
document.addEventListener("DOMContentLoaded", arrancarBuscador);
