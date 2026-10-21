// Cuentas en limpio: «Lo que no cuadra». Casos de datos/descuadres.json (los escribe construir.py cada día).
"use strict";

const PAGINAS_DESCUADRE = { "avales.html": "Avales y otros riesgos", "gasto.html": "En qué se gasta", "deuda-local.html": "La deuda de los ayuntamientos",
  "cuentas.html": "Cuentas", "ingresos.html": "Ingresos", "territorio.html": "Comunidades" };

async function arrancarDescuadres() {
  const caja = document.getElementById("casos");
  const { casos } = await leerDescuadres();
  caja.textContent = "";
  if (!casos.length) { caja.textContent = "Ahora mismo no hay ningún caso abierto: todas las cifras cuadran."; return; }
  const parrafo = (padre, texto) => { const p = document.createElement("p"); p.textContent = texto; padre.appendChild(p); };
  const bloque = (padre, titulo, lineas) => {
    if (!lineas || !lineas.length) return;
    const h = document.createElement("h3"); h.textContent = titulo; padre.appendChild(h);
    if (lineas.length === 1) { parrafo(padre, lineas[0]); return; }
    const ul = document.createElement("ul");
    for (const l of lineas) { const li = document.createElement("li"); li.textContent = l; ul.appendChild(li); }
    padre.appendChild(ul);
  };
  for (const c of casos) {
    const art = document.createElement("article");
    art.className = "caso";
    art.id = c.id;
    const marca = document.createElement("span");
    marca.className = `aviso-descuadre ${c.estado}`;
    marca.textContent = `${c.estado === "explicado" ? "ⓘ" : "⚠"} ${ETIQUETA_DESCUADRE[c.estado]}`;
    const h = document.createElement("h2"); h.textContent = c.titulo;
    art.append(marca, h);
    bloque(art, "Las cifras", c.cifras);
    bloque(art, "Lo que está explicado", c.explicado);
    bloque(art, "Lo que falta", c.falta ? [c.falta] : []);
    bloque(art, "Qué hace la web", [c.en_la_web]);
    const donde = document.createElement("p");
    donde.className = "donde";
    const paginas = [...new Set((c.marcas || []).map((m) => m.pagina))];
    donde.append(paginas.length ? "Dónde se ve: " : "");
    for (const pg of paginas) { const a = document.createElement("a"); a.href = pg; a.textContent = PAGINAS_DESCUADRE[pg] || pg; donde.appendChild(a); }
    const cuando = document.createElement("span");
    cuando.className = "detalle";
    cuando.textContent = c.automatico ? " Este caso lo detecta sola la comprobación diaria." : c.anotado ? ` Anotado el ${fecha(c.anotado)}.` : "";
    donde.appendChild(cuando);
    art.appendChild(donde);
    caja.appendChild(art);
  }
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
}
document.addEventListener("DOMContentLoaded", arrancarDescuadres);
