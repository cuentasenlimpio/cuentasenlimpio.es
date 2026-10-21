# Desigualdad: renta, pobreza y riqueza

Parte de la zona de contexto de Cuentas en limpio (https://cuentasenlimpio.es). Índice: https://cuentasenlimpio.es/llms.txt. Generado el 22 de octubre de 2026 con los mismos datos que la página https://cuentasenlimpio.es/desigualdad.html.

**Cómo citar:** «Cuentas en limpio (https://cuentasenlimpio.es)», con enlace a https://cuentasenlimpio.es/desigualdad.html y la fecha de consulta, y además la fuente oficial que figura junto a cada dato.

Encuesta de Condiciones de Vida (INE/Eurostat): el año de la encuesta mide la renta del año anterior. «Antes de transferencias» es lo que habría sin pensiones ni ayudas, a igualdad de todo lo demás: es una referencia contable, no lo que pasaría si se quitaran.

| Indicador | Año de la encuesta | España | Media UE |
|---|---|---|---|
| Gini de la renta disponible (0 = todos igual, 100 = uno lo tiene todo) | 2025 | 30,8 | 29,2 |
| Gini antes de pensiones y demás transferencias | 2025 | 44,6 | 47,8 |
| Gini contando solo las pensiones | 2025 | 34,1 | 34,1 |
| Riesgo de pobreza (% bajo el 60 % de la mediana) | 2025 | 19,5 | 16,3 |
| Riesgo de pobreza antes de transferencias | 2025 | 41,9 | 42,8 |
| Riesgo de pobreza contando solo pensiones | 2025 | 25,4 | 24,4 |
| Renta del 20 % más rico ÷ 20 % más pobre | 2025 | 5,2 | 4,6 |
| Riesgo de pobreza o exclusión social (AROPE, %) | 2025 | 25,7 | 20,9 |
| Carencia material y social severa (%) | 2025 | 8,1 | 6,3 |
| Umbral de pobreza, una persona (€/año) | 2025 | 12.220 | — |

Riqueza (cuentas distributivas del BCE, experimentales), 2026T1: Gini de la riqueza neta 68,9; el 10 % más rico tiene el 54,9 % y la mitad con menos, el 7,6 %.

En 2025, las ayudas distintas de las pensiones bajaron el riesgo de pobreza del 25,4 % (contando solo pensiones) al 19,5 %: un 23,2 % menos.

## Fuentes

- Eurostat, ilc_di12, ilc_li02 y relacionadas (encuesta de condiciones de vida): https://ec.europa.eu/eurostat/databrowser/view/ilc_di12/default/table?lang=es
- BCE, cuentas distributivas de la riqueza (DWA): https://data.ecb.europa.eu/data/datasets/DWA

## Comprobaciones automáticas de esta construcción

- Sí: ¿El índice de Gini del INE y el de Eurostat son el mismo? Sí, en los 12 años comunes; por eso usamos el del INE para 2008-2013
- Sí: ¿Las partes de la riqueza son coherentes (el 10 % más rico más el 50 % menos rico no pasan de 100)? Sí
