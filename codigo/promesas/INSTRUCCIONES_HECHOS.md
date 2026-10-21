# Cómo se relaciona un hecho con una promesa

Estas son las reglas con las que se decide si un hecho oficial (una norma del BOE, una iniciativa del Congreso…) trata
**la misma medida** que una promesa. Se publican para que cualquiera pueda rehacer el trabajo y discrepar con datos.

## Qué se te da

- Un **hecho**, de uno de estos tipos, con su fecha:
  - una **norma** publicada en el BOE (ley orgánica `LO`, ley `L`, real decreto-ley `RDL`): número, título, materias y
    el comienzo de su texto (normalmente el preámbulo);
  - una **iniciativa del Congreso que no llegó a ley** (`INI`: proposición de ley de un grupo, del Senado o de una
    comunidad autónoma, o proyecto de ley del Gobierno), rechazada, retirada o caducada: título, autor y el comienzo
    del texto que se presentó (la exposición de motivos);
  - un **anteproyecto o proyecto de ley aprobado por el Consejo de Ministros** que no consta en el Congreso (`CM`): lo
    que dice de él la referencia del Consejo.
  - un **real decreto** publicado en el BOE (`RD`): número, título, materias y el comienzo de su texto;
  - una **iniciativa del Plan Anual Normativo** del Gobierno que no consta aprobada (`PAN`): el título y el objetivo
    que da el plan.
- Una lista de **promesas candidatas**, cada una con su documento, su etiqueta (en castellano) y su cita literal (en el
  idioma original del documento: castellano, catalán o gallego). Las candidatas salen de una búsqueda automática por
  palabras: la mayoría **no** tendrán relación.

## Qué decides, para cada par hecho–promesa

Una de tres clases:

- **`misma`**: el hecho regula, aprueba o pone en marcha **la medida concreta** que dice la promesa (o, si es una
  iniciativa o un anteproyecto, **la propone**), aunque sea solo en parte. Si es solo una parte, marca `parcial: true` y di cuál en el motivo.
- **`contraria`**: el hecho regula (o propone) **la misma medida en sentido contrario** a la promesa (por ejemplo, la promesa pide
  derogar algo y la norma lo mantiene o lo amplía expresamente; o la promesa pide bajar un impuesto y la norma lo sube).
- **`no`**: no trata la misma medida. Incluye compartir solo el tema («vivienda», «energía», «pensiones») sin regular lo
  que la promesa dice.

### Reglas

1. **Misma medida, no mismo tema.** Una ley de vivienda no se relaciona con cualquier promesa de vivienda: solo con las
   que prometen lo que esa ley regula (por ejemplo, un índice de precios del alquiler, si la ley lo crea).
2. **Lee la cita, no solo la etiqueta.** La etiqueta ayuda a orientarse; lo que cuenta es lo que dice la cita.
   Y del hecho, lo que dice su texto (el que se te da o su texto completo publicado), no lo que se recuerde de él: si
   el texto no permite saber si trata la medida, es `no`.
3. **Basta con una parte.** Si la norma recoge una parte concreta de la promesa, es `misma` con `parcial: true`. Si solo
   la menciona de pasada (en el preámbulo, como objetivo general) sin regularla, es `no`.
4. **Ni a favor ni en contra del partido.** No valoras si la norma «cumple» la promesa, ni si es buena: solo si trata la
   misma medida. Las promesas de la oposición se relacionan igual que las del Gobierno.
5. **Prorrogar o convalidar.** Un real decreto-ley que prorroga una medida ya existente es `misma` con una promesa que
   pida mantener o prorrogar esa medida; con una que pida crearla, solo si la crea.
6. **Transposiciones de la UE.** Si la norma traspone una directiva y la promesa pide transponerla o regular lo mismo,
   es `misma`.
7. **Da igual quién la presentó y cómo acabó.** Una proposición de un grupo se relaciona con las promesas de cualquier
   partido, y una iniciativa rechazada o caducada cuenta igual que una que siguió adelante: solo importa qué propone.
8. **Reales decretos y Plan.** Un real decreto que solo regula subvenciones, nombramientos o la estructura interna de
   un ministerio casi nunca es la misma medida que una promesa; puede serlo si la promesa pide exactamente eso. Una
   iniciativa del Plan es solo una intención del Gobierno: es `misma` si lo que planea es la medida de la promesa.
9. **Ante la duda, `no`.** Es preferible no enlazar a enlazar mal. El objetivo es que cada enlace publicado se pueda
   defender leyendo la norma y la promesa.

## Qué devuelves

Un JSON con una entrada por cada par que **no** sea `no`:

```json
{"hecho": "LO 1/2024", "relaciones": [
  {"promesa": "erc-programa:123", "clase": "misma", "parcial": false,
   "motivo": "La ley concede la amnistía que la promesa reclama para los hechos del proceso independentista."}
]}
```

- `motivo`: **una frase** que diga qué regula la norma que coincide (o contradice) con lo que dice la promesa. Sin
  adjetivos ni valoraciones.
- Los pares `no` no se devuelven: se entiende que todos los demás candidatos son `no`.

## Cómo se comprueba

Con los reales decretos y las iniciativas del Plan, que dan muchos más pares, antes hay una **criba**: una pasada
rápida que solo aparta los pares que claramente no tratan la misma medida (ante la duda, el par sigue). Una muestra al
azar de lo apartado se revisa después para medir cuántos enlaces se pierden en ella.

Cada par lo deciden dos pasadas independientes, que no ven la decisión de la otra. Los desacuerdos los resuelve una
tercera, a ciegas (sin saber qué pasada dijo qué). Se publica el porcentaje de acuerdo y una muestra al azar revisada
por otra pasada para estimar cuántos enlaces sobran o faltan.
