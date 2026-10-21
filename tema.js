// Cuentas en limpio: tema claro u oscuro. Se carga en <head> sin «defer» para que la página no destelle al abrir.
// Por defecto, siempre claro (aunque el dispositivo esté en oscuro); oscuro solo si quien lee lo elige y se recuerda.
"use strict";
(function () {
  let guardado = null;
  try { guardado = localStorage.getItem("cuentas-tema"); } catch { /* sin almacenamiento: tema claro */ }
  if (guardado === "dark" || guardado === "light") document.documentElement.dataset.theme = guardado;
  const oscuro = () => document.documentElement.dataset.theme === "dark";
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
