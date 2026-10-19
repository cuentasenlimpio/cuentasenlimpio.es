# Cuentas en limpio

La web [cuentasenlimpio.es](https://cuentasenlimpio.es): las cuentas públicas de España, con la fuente oficial de cada
cifra. Hecha por Sendoa Sola.

Este repositorio contiene la web publicada, tal como se sirve, y el código que calcula sus cifras. No se edita a mano: lo actualiza
automáticamente el proceso que cada día descarga las fuentes oficiales, construye la web y la comprueba. Cada commit es
una publicación, así que el historial muestra qué decía la web en cada fecha.

- Cómo se obtiene cada cifra: [metodología](https://cuentasenlimpio.es/metodologia.html).
- Los ficheros oficiales tal como se descargaron están en `crudo/`; los números de cada página, en `datos/` (JSON y CSV).
- Los errores corregidos quedan en el [registro de correcciones](https://cuentasenlimpio.es/correcciones.html).

El código que descarga, calcula y comprueba los datos está en [`codigo/`](codigo/): el mismo que ha construido cada
publicación, con instrucciones para rehacer los cálculos.

## Licencia

El código y la web, bajo [licencia MIT](LICENSE): se pueden reutilizar citando la autoría. Los ficheros oficiales de
`crudo/` son de cada organismo y siguen sus propias condiciones de reutilización.

Web independiente: ninguna de las instituciones cuyos datos usa la patrocina ni la respalda.
