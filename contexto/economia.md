# Economía: empleo, paro, precios, pensiones, deuda en el mercado y población

Parte de la zona de contexto de Cuentas en limpio (https://cuentasenlimpio.es). Índice: https://cuentasenlimpio.es/llms.txt. Generado el 31 de octubre de 2026 con los mismos datos que la página https://cuentasenlimpio.es/economia.html.

**Cómo citar:** «Cuentas en limpio (https://cuentasenlimpio.es)», con enlace a https://cuentasenlimpio.es/economia.html y la fecha de consulta, y además la fuente oficial que figura junto a cada dato.

Últimos datos de cada serie. Cada una tiene su calendario: por eso las fechas no coinciden.

| Indicador | Último valor | Periodo |
|---|---|---|
| Afiliados a la Seguridad Social (media, sin estacionalidad) | 22.480.796 | septiembre de 2026 |
| Paro registrado (SEPE) | 2.379.505 | septiembre de 2026 |
| Tasa de paro (EPA, %) | 10,18 | 2026T3 |
| Ocupados (EPA, miles) | 22.852,6 | 2026T3 |
| IPC general, variación anual (%) | 4,9 | octubre de 2026 |
| IPC subyacente, variación anual (%) | 3,1 | octubre de 2026 |
| PIB real, variación interanual (%) | 2,66 | 2026T3 |
| Pensiones contributivas en vigor | 10.565.782 | octubre de 2026 |
| Nómina mensual de pensiones contributivas (millones de €) | 14.540 | octubre de 2026 |
| Pensión contributiva media (€/mes) | 1.376,14 | octubre de 2026 |
| Afiliados por pensión | — | octubre de 2026 |
| Rentabilidad del bono a 10 años (%) | 3,927 | septiembre de 2026 |
| Prima de riesgo frente a Alemania (puntos básicos) | 45 | septiembre de 2026 |
| Tipo de interés medio de la deuda del Estado en circulación (%) | 2,453 | septiembre de 2026 |
| Vida media de la deuda del Estado (años) | 7,85 | septiembre de 2026 |
| Mayores de 64 por cada 100 personas de 16 a 64 (dependencia) | 31,7 | 2025 |

Proyección del INE de la dependencia de mayores: 53,5 en 2076 (serie año a año en https://cuentasenlimpio.es/economia.html).

Cuál usar para el paro: la EPA (encuesta del INE, trimestral) es la cifra internacional; el paro registrado (SEPE) cuenta a quien se apunta en las oficinas de empleo; la afiliación cuenta empleos dados de alta en la Seguridad Social. Miden cosas distintas y no deben mezclarse.

## Fuentes

- Seguridad Social, Afiliados medios desestacionalizados (PX-Web, 10mb25, desde enero de 2021): https://w6.seg-social.es/PXWeb/Resources/PX/Databases/Afiliados%20en%20alta%20laboral/Afiliados%20Medios/10mb25.%20Afiliados%20medios%20DESESTACIONALIZADOS%20por%20dependencia%20laboral%20y%20sector%20de%20actividad%20CNAE%2025%20(desde%20ene-21).px
- SEPE, Paro registrado por sectores, últimos diez años (datos de avance): https://www.sepe.es/SiteSepe/contenidos/que_es_el_sepe/estadisticas/datos_avance/xls/empleo/evolparoseries.xls
- INE, EPA: ocupados (miles): https://servicios.ine.es/wstempus/js/ES/DATOS_SERIE/EPA387796?nult=5000
- INE, IPC: índice general, variación anual (%): https://servicios.ine.es/wstempus/js/ES/DATOS_SERIE/IPC290750?nult=5000
- Seguridad Social, Evolución mensual de las pensiones del sistema (avance mensual del INSS): https://www.seg-social.es/wps/wcm/connect/wss/d8a9c4fd-04ac-4814-9bae-6971cdb35250/202610_Avance+mensual.xlsx?MOD=AJPERES
- BCE, Rentabilidad de la deuda pública a 10 años, España y Alemania (criterio de convergencia, media mensual): https://data-api.ecb.europa.eu/service/data/IRS/M.ES+DE.L.L40.CI.0000.EUR.N.Z?format=csvdata&detail=dataonly
- Tesoro Público, Tipo de interés medio de la deuda del Estado en circulación (último año): https://www.tesoro.es/documents/d/tesoro/03-xlsx
- Tesoro Público, Vida media de la deuda del Estado: https://www.tesoro.es/documents/d/tesoro/02-xlsx
- INE, Proyección de la tasa de dependencia (%): https://servicios.ine.es/wstempus/js/ES/DATOS_SERIE/PROP7465?nult=5000

## Comprobaciones automáticas de esta construcción

- Sí: ¿Los regímenes de la Seguridad Social suman el total de afiliados? Sí
- Sí: ¿Las dos series desestacionalizadas de la Seguridad Social enlazan bien? Diferencia máxima de 44 657 afiliados en los 60 meses comunes; usamos la nueva desde 2021
- Sí: ¿Los sectores del paro registrado suman el total de cada mes? Sí desde mayo de 2005; antes, en 25 meses de la serie que el SEPE reconstruyó, difieren en 2 parados como mucho
- Sí: ¿Número de pensiones × pensión media da la nómina mensual? Sí, en todos los meses (diferencia por redondeo menor del 0,01 %)
