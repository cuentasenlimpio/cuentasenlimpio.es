// Cuentas en limpio: tema claro u oscuro. Se carga en <head> sin «defer» para que la página no destelle al abrir.
// Sin elección guardada, manda el dispositivo (prefers-color-scheme); con ella, la elección de quien lee.
"use strict";
(function () {
  let guardado = null;
  try { guardado = localStorage.getItem("cuentas-tema"); } catch { /* sin almacenamiento: manda el dispositivo */ }
  if (guardado === "dark" || guardado === "light") document.documentElement.dataset.theme = guardado;
  const oscuro = () => document.documentElement.dataset.theme === "dark"
    || (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
  function pintarBoton(b) {
    const o = oscuro();
    b.setAttribute("aria-pressed", String(o));
    b.setAttribute("aria-label", o ? "Cambiar a tema claro" : "Cambiar a tema oscuro");
    b.querySelector(".boton-tema-texto").textContent = o ? "Claro" : "Oscuro";
  }
  document.addEventListener("DOMContentLoaded", () => {
    const b = document.querySelector(".boton-tema");
    if (!b) return;
    pintarBoton(b);
    b.addEventListener("click", () => {
      const nuevo = oscuro() ? "light" : "dark";
      document.documentElement.dataset.theme = nuevo;
      try { localStorage.setItem("cuentas-tema", nuevo); } catch { /* sigue funcionando en esta visita */ }
      pintarBoton(b);
      // Los gráficos leen los colores al dibujarse: si la página tiene, se vuelve a dibujar entera.
      if (document.querySelector(".lienzo, .multiples, .visual-recorrido svg, .figura-escenario svg")) location.reload();
    });
  });
})();
