# Qué promesas tienen un dato que mirar

Estas son las reglas con las que se decide si una promesa fija **una meta medible**: un resultado expresado en cifras
que una estadística oficial puede medir. A esas promesas se les añade el paso «Dato»: la meta tal como la dice la
promesa, el valor oficial al empezar la legislatura y el último publicado, con su fecha y su fuente. No se dice si la
meta se ha cumplido. Se publican para que cualquiera pueda rehacer el trabajo y discrepar con datos.

## Qué se te da

Una lista de promesas, cada una con su documento, su etiqueta (en castellano) y su cita literal (en castellano, catalán
o gallego). Todas contienen alguna cifra o una palabra como «duplicar» o «la mitad»: la mayoría **no** serán metas
medibles.

## Qué decides, para cada promesa

`meta: true` o `meta: false`.

Es **meta medible** (`true`) si la promesa fija **el valor que tendrá una magnitud** (un nivel, una proporción, una
cantidad de algo, un número de personas o de cosas), en una fecha o por periodo, y ese valor depende de lo que pase,
no solo de que se apruebe una norma. Por ejemplo:

- «Que en 2030 el 18 % del transporte terrestre de mercancías vaya por ferrocarril.»
- «Rehabilitaremos 500.000 viviendas al año.»
- «Situaremos la inversión en I+D en el 2 % del PIB.»
- «Reduciremos a la mitad la tasa de abandono escolar temprano.»
- «Erradicaremos el sinhogarismo de calle en 2030» (el valor que fija es cero).

**No** es meta medible (`false`):

1. **Un parámetro que fija una norma**: «indemnización de 45 días por año», «jornada de 35 horas», «IVA del 4 %»,
   «jubilación a los 65 años», «permiso de 20 semanas», «hasta 100 % de subvención». Se cumple o no al aprobar la
   norma, y eso ya lo cubren los pasos del BOE.
2. **Una dotación o un gasto anunciado**: «100 millones de euros para…», «un fondo de 1.000 millones». Es una
   decisión presupuestaria, no un resultado.
3. **Una cifra que no es la meta**: la que describe la situación de partida, explica el porqué o cita una ley
   («Ley 7/2021»), un año sin valor que alcanzar, un plazo administrativo («en 15 días»), un horario («24 horas»).
4. **Un umbral de quién tiene derecho**: «jóvenes de 18 a 23 años», «municipios de menos de 10.000 habitantes»,
   «mayores de 52 años». Delimita a quién se aplica una medida, no fija un resultado.
5. **Una meta sin magnitud identificable**: «multiplicar las oportunidades», «cero burocracia».

Ante la duda, `false`: es preferible no poner un dato a ponerlo donde la promesa no lo pide.

## Qué devuelves

Una entrada por promesa del paquete:

```json
{"promesa": "sumar-programa:1234", "meta": true, "metas": [
  {"magnitud": "Cuota del ferrocarril en el transporte terrestre de mercancías (% de las toneladas-km)",
   "valor": "18 %", "fecha": "2030", "ambito": "España"}],
 "motivo": "La promesa fija la proporción del transporte de mercancías por ferrocarril que se alcanzará en 2030."}
```

- `metas`: una por cada meta medible de la promesa (casi siempre una; vacía si `meta` es `false`).
- `magnitud`: qué se mide, en palabras neutras y con su unidad, tal como podría llamarla una estadística oficial.
- `valor` y `fecha`: los que dice la promesa, sin interpretar. `fecha` vacía si no da ninguna; «cada año» si es por
  periodo.
- `ambito`: España, una comunidad autónoma u otro, según la promesa.
- `motivo`: una frase. Si es `true`, qué resultado fija; si es `false`, por qué la cifra no es una meta medible.

## Cómo se comprueba

Cada promesa la deciden dos pasadas independientes, que no ven la decisión de la otra. Los desacuerdos los resuelve
una tercera, a ciegas. Se publica el porcentaje de acuerdo y una muestra al azar revisada por otra pasada.

Después, cada magnitud se empareja con la estadística oficial que la mide (organismo, tabla y definición). Si no
hay ninguna, la promesa lo dice: «sin dato oficial que la mida».
