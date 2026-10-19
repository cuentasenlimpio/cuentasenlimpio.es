# Instrucciones para clasificar las frases de un documento electoral

Estas son las reglas con las que se extraen las promesas de los programas y acuerdos de la XV Legislatura para
cuentasenlimpio.es. Son las mismas para todos los documentos y todos los partidos. Quien clasifique no opina sobre
las promesas: solo decide, con estas reglas, qué frase es una promesa y cuál no, y por qué.

## Lo que recibes

Un fichero `unidades.json`: el documento ya dividido en unidades (frases y elementos de lista), cada una con su número
(`n`), la página donde empieza y el texto literal. Las entradas con `"n": null` son títulos de sección: dan contexto y
no se clasifican.

## Lo que entregas

Un fichero de anotación (JSON) con esta forma:

```json
{"documento": "<id del documento>",
 "correcciones_troceo": [],
 "unidades": {
   "12": {"clase": "valores"},
   "13": {"clase": "promesa", "partes": [{"verbo": "Aprobaremos", "etiqueta": "Ley de transparencia de los partidos"}]},
   "14": {"clase": "vaga", "nota": "Límite: …"}
 }}
```

**Todas** las unidades con número deben tener clase. No se omite ninguna.

## Las clases

Decide en este orden; la primera que encaje es la buena.

1. **`titulo`**: es un título de sección que el troceo tomó por frase («Vivienda», «3. Pensiones»).
2. **`introduce`**: la frase abre una lista y lo prometido está en los elementos («Exigiremos la transferencia de las
   siguientes competencias:»). Los elementos de la lista se clasifican uno a uno.
   Si la frase que abre la lista ya promete por sí sola algo concreto («Derogaremos la Ley X, en concreto:»), es
   `promesa`, y los elementos se clasifican aparte.
3. **`promesa`**: compromete una **acción futura concreta** (aprobar, derogar, crear, subir, bajar, ampliar, reducir,
   construir, transferir, garantizar, prohibir, oponerse a…) sobre **algo identificable**: una ley o un artículo, un
   impuesto, una cifra, un organismo, una prestación, una partida de gasto, una competencia, una infraestructura.
   Identificable quiere decir que un tercero podría buscar más tarde si eso se aprobó, se votó o se publicó.
   Los elementos de una lista sin verbo («Indemnización por despido de 45 días») son promesas si la frase que abre la
   lista promete una acción sobre ellos.
4. **`vaga`**: acción futura, pero sin objeto identificable: no se sabe qué se haría exactamente («trabajaremos por la
   igualdad real», «impulsaremos medidas contra la despoblación», «reforzaremos la lucha contra…»).
5. **`balance`**: cuenta lo ya hecho o conseguido («hemos subido las pensiones», «hemos cumplido»).
6. **`diagnostico`**: describe la situación o da una opinión sobre ella («la vivienda es hoy el principal problema»).
7. **`explica`**: explica o justifica otra frase, sin añadir una acción («el objetivo de esta medida es…», «eso
   permitirá…»).
8. **`critica`**: critica a otros partidos o gobiernos, sin comprometer una acción propia.
9. **`valores`**: declaración de valores, lema o presentación del propio partido («defendemos la igualdad», «somos la
   fuerza útil»).

Las propuestas sobre cómo sería un Estado distinto del actual (por ejemplo, el modelo de una futura república
independiente) son `valores`, aunque traigan cifras: describen otro Estado, no comprometen una acción ante las Cortes en
la legislatura. Las medidas que el mismo documento pide «mientras tanto» al Estado actual sí se clasifican normalmente.

Si una frase mezcla una promesa con una crítica o un diagnóstico («Derogaremos la ley X, que el Gobierno se negó a
cambiar»), es `promesa`.

## Las partes de una promesa

Cada promesa tiene una o varias partes. **Separa en varias partes** cuando la frase trae **acciones distintas sobre
cosas distintas** («subir el salario mínimo a 1.200 € y poder fijar un salario mínimo propio» → dos partes). No separes
cuando la segunda acción es solo el propósito o el modo de la primera («ampliar las plazas MIR para reforzar la
atención primaria» → una parte).

Cada parte lleva:

- **`verbo`**: el verbo del compromiso **tal como aparece** («Exigiremos», «Propondremos», «Rechazo», «Derogar»…). Si
  la promesa es un elemento de lista sin verbo, el verbo de la frase que abre la lista. Si no hay verbo, vacío.
- **`etiqueta`**: un resumen breve y neutro de lo prometido, en castellano aunque el documento esté en catalán,
  gallego o euskera, de unas 4 a 15 palabras. Reglas:
  - Usa los **nombres oficiales** de leyes, organismos y prestaciones, nunca los apodos o los nombres del partido
    («Ley Orgánica 4/2015, de protección de la seguridad ciudadana», no «Ley Mordaza»). Si no conoces con seguridad
    el nombre oficial, usa una descripción neutra, no inventes un número de ley.
  - Conserva las **cifras** exactas del documento (1.200 €, 15 %, 2040).
  - **No añadas nada** que el documento no diga y no uses adjetivos valorativos («justo», «necesario», «histórico»).
  - Empieza preferiblemente por un verbo en infinitivo o un sustantivo («Subir…», «Derogar…», «Transferencia de…»).
- **`nota`** (opcional): solo para avisar de algo que el lector debe saber al leer la promesa, y solo si se deduce sin
  duda del propio texto (no añadas interpretaciones jurídicas propias): que la decisión no es
  del Gobierno español («La decisión es del Banco Central Europeo»), que exige reformar la Constitución, que es un
  compromiso de oponerse a algo («Compromiso de oponerse a una medida»), o que el documento usa un apodo («El documento
  la llama «Ley Mordaza»; la etiqueta usa su nombre oficial»).
- **`repite`** (opcional): si **esa misma promesa** ya apareció antes en el documento, el id de la primera aparición
  (el número de unidad, más la letra de la parte si la frase tenía varias: `"27b"`). Una promesa parecida pero con otra
  cifra u otro alcance **no** repite: es otra promesa.

Los ids de las partes son el número de unidad si hay una sola parte («42»), o el número más una letra si hay varias
(«27a», «27b»), en el orden en que las escribes.

## Casos límite

Cuando dudes entre `promesa` y `vaga`, decide con la regla de la clase 3 (¿podría un tercero comprobar después si se
hizo?) y añade a la unidad una **`nota` que empiece por «Límite:»** con el motivo en una frase. Ejemplos (inventados):

- «Impulsaremos medidas específicas para reducir la brecha de género» → `vaga`, nota «Límite: no dice qué medidas».
- «Reforzaremos la inversión en energías renovables» → `promesa` («Nuevas inversiones en energías renovables»), nota
  en la parte «Límite: sin cifra; se mantiene porque es una inversión identificable».

## Correcciones del troceo

El troceo es automático y a veces falla. Puedes corregir dos cosas, anotándolas en `correcciones_troceo`:

- `{"tipo": "separar_titulo", "unidad": "20", "titulo": "<texto exacto del título>"}` cuando una unidad empieza con un
  título pegado (el texto de la unidad debe empezar exactamente por ese título seguido de un espacio). Clasifica la
  unidad por el texto que queda.
- `{"tipo": "partir", "unidad": "136", "antes_de": "<inicio exacto de la segunda frase>"}` cuando una unidad junta dos
  frases que deberían ir separadas; la segunda pasa a ser la unidad «136-2» y también debe clasificarse.

No corrijas nada más: las frases largas o las listas separadas por punto y coma se quedan como están.

**Frases partidas en dos unidades** (por un salto de página, un pie pegado o un titular en mayúsculas cortado a media
línea), que no se pueden unir con las correcciones anteriores: la clase y las partes van en la unidad donde **empieza**
la frase, juzgando la frase completa (lee la unidad siguiente para saber cómo acaba) y con la etiqueta de la frase
completa; la unidad con la continuación es `explica`, con nota «Continuación de la unidad N». Que una frase esté cortada
no la convierte en `introduce`.

## Ejemplos (inventados)

| Unidad | Clase | Partes |
|---|---|---|
| «Somos el partido que nunca ha fallado a los vecinos.» | `valores` | |
| «En estos cuatro años hemos bajado el IBI un 10 %.» | `balance` | |
| «El paro juvenil duplica la media europea.» | `diagnostico` | |
| «Aprobaremos una ley de cuidados y crearemos una agencia estatal de cuidados.» | `promesa` | «Aprobaremos» / «Ley de cuidados»; «crearemos» / «Agencia estatal de cuidados» |
| «Exigiremos al Gobierno que rebaje el IVA de la luz al 5 %.» | `promesa` | «Exigiremos» / «Bajar el IVA de la electricidad al 5 %» |
| «Rechazamos cualquier subida del impuesto de sucesiones.» | `promesa` | «Rechazamos» / «No subir el impuesto de sucesiones», nota «Compromiso de oponerse a una medida.» |
| «Trabajaremos por un país más cohesionado.» | `vaga` | |
| «Esta medida permitirá ahorrar a las familias 300 euros al año.» | `explica` | |

## Antes de entregar

Ejecuta `python3 aplicar.py <unidades.json> <tu_anotacion.json> <salida.json>`: comprueba que todas las unidades están
clasificadas, que las clases existen y que cada `repite` apunta a una promesa anterior. Si da errores, corrígelos.
