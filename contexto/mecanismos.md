# Mecanismos y órdenes de magnitud para razonar escenarios

Parte de la zona de contexto de Cuentas en limpio (https://cuentasenlimpio.es). Índice: https://cuentasenlimpio.es/llms.txt. Generado el 22 de octubre de 2026 con los mismos datos que la página https://cuentasenlimpio.es/cuentas.html.

**Cómo citar:** «Cuentas en limpio (https://cuentasenlimpio.es)», con enlace a https://cuentasenlimpio.es/cuentas.html y la fecha de consulta, y además la fuente oficial que figura junto a cada dato.

Valores de partida y reglas aritméticas para estimar el efecto de un cambio («¿qué pasaría si…?»), las mismas de las calculadoras de https://cuentasenlimpio.es/escenarios.html. Todo lo de este fichero que no es un dato copiado es una aproximación nuestra, con sus supuestos a la vista. No son previsiones: una estimación seria debe decir siempre sus supuestos y que la realidad cambia más cosas a la vez.

## Valores de partida

| Magnitud | Valor | Fuente |
|---|---|---|
| PIB nominal 2025 | 1.690.012 millones de € | Eurostat, nama_10_gdp |
| Población media 2025 | 49.362.340 | Eurostat, nama_10_pe |
| 1 punto del PIB | 16.900 millones de € (342 € por habitante) | cálculo nuestro |
| Deuda de las administraciones, final de 2025 | 1.698.355 millones de € (100,5 % del PIB) | Eurostat, gov_10dd_edpt1 |
| Intereses pagados 2025 | 40.391 millones de € (2,39 % del PIB) | Eurostat |
| Saldo 2025 | -40.641 millones de € (-2,4 % del PIB) | Eurostat, gov_10a_main |
| Ingresos totales 2025 | 725.655 millones de € | Eurostat, gov_10a_main |
| Tipo medio de la deuda del Estado en circulación | 2,453 % (septiembre de 2026) | Tesoro Público |
| Vida media de la deuda del Estado | 7,85 años (septiembre de 2026) | Tesoro Público |
| Interés implícito 2025 (intereses ÷ deuda del año anterior) | 2,49 % | cálculo nuestro |
| Crecimiento del PIB nominal 2025 | 5,7 % | cálculo nuestro sobre Eurostat |
| Nómina mensual de pensiones contributivas (diciembre de 2025) | 13.750 millones de €; con 14 pagas, unos 192.501 millones al año | Seguridad Social; el ×14 es cálculo nuestro |

## Reglas aproximadas

**Subida de los tipos de interés (aproximación de esta web, con estos supuestos).** Toda la deuda de las administraciones con la vida media de la del Estado, que es la mayor parte; vencimientos repartidos por igual a lo largo del tiempo; deuda constante; todo lo que se renueva se paga 1 punto más caro. Cada año vence en torno a 1/vida media de la deuda, así que el coste extra crece poco a poco:

| Momento | Coste extra al año en ese momento | Coste extra pagado durante ese año |
|---|---|---|
| Al acabar el primer año | 2.164 millones de € | 1.082 millones de € (la mitad: lo renovado entra a lo largo del año) |
| Al acabar el tercer año | 6.491 millones de € | 5.409 millones de € |
| Cuando se ha renovado toda (a los 7,85 años) | 16.984 millones de € (1,00 % del PIB) | — |

Acumulado en los diez primeros años: unos 103.199 millones de €. Las letras (a menos de un año) se renuevan antes y aceleran el efecto; si la deuda crece, el efecto es mayor. Cita estas cifras como aproximación de esta web, con enlace a https://cuentasenlimpio.es/contexto/mecanismos.md y sus supuestos.

**Dinámica de la deuda en % del PIB.** Variación de la deuda/PIB ≈ −saldo primario/PIB + (r − g)/(1 + g) × deuda/PIB anterior + ajustes, con r = interés implícito y g = crecimiento nominal. Si el tipo de interés implícito es menor que el crecimiento nominal, la deuda/PIB baja aunque haya un pequeño déficit primario; si es mayor, sube aunque haya un pequeño superávit primario. En 2025: r ≈ 2,49 %, g ≈ 5,7 %. La descomposición oficial año a año está en cuentas.md.

**Inflación y pensiones.** Las pensiones contributivas se revalorizan cada enero con la inflación media de diciembre a noviembre (Ley 21/2021). Un punto más de inflación media sube la nómina anual en torno a un 1 %: unos 1.925 millones de € al año con la nómina de diciembre de 2025 por 14 pagas. La inflación también sube la recaudación nominal (más precio → más IVA; sueldos más altos → más IRPF y cotizaciones), pero cuánto depende de cómo se muevan sueldos y consumo: no hay una regla fija.

**Peso de cada ingreso.** De cada 100 € de ingresos de 2025: IVA (incluye el IGIC canario), 15,8; Otros impuestos sobre productos (especiales, actos jurídicos, primas de seguros…), 7,2; Otros impuestos sobre la producción (sobre inmuebles de empresas, licencias de actividad, contaminación…), 3,4; Impuestos sobre la renta de los hogares, 22,2; Impuestos sobre los beneficios de las empresas, 7,4; Otros impuestos corrientes (sobre el capital y el patrimonio, premios de juego, licencias…), 0,8; Impuestos sobre el capital (sucesiones, donaciones…), 0,8; Cotizaciones sociales, 30,8; Otros ingresos (ventas, rentas de la propiedad, transferencias…), 11,6. Un cambio del X % en la recaudación de un impuesto mueve los ingresos totales en X × su peso / 100 %, si lo demás no cambia (1 % de ingresos totales ≈ 7.257 millones de €).

**Lo que estas reglas no recogen.** Efectos de segunda vuelta (un cambio de impuestos cambia el consumo, el empleo y la recaudación de otros impuestos), reacciones de los mercados y decisiones de política. Para escenarios oficiales completos: AIReF (https://www.airef.es/), Comisión Europea (Debt Sustainability Monitor) y Banco de España.
