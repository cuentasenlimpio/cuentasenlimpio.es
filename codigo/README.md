# El código que calcula las cifras

Estos son los programas que descargan las fuentes oficiales, calculan cada cifra de la web y la comprueban contra
otras fuentes. Son exactamente los que han construido la versión publicada en este mismo commit.

| Fichero | Qué hace |
|---|---|
| `descargar.py` | Descarga cada fuente oficial (Eurostat, IGAE, Banco de España, INE, Hacienda, Congreso) tal como se publica, y apunta en un manifiesto la dirección, la fecha y la huella sha256 de cada fichero. |
| `construir.py` | Lee esas descargas, calcula las cifras de cada página, hace las comprobaciones cruzadas y escribe los JSON y CSV de `datos/`. |
| `xlsx.py` | Lee las hojas de cálculo de la IGAE y de Hacienda solo con la biblioteca estándar de Python. |
| `descargar_documentos.py` | Descarga los programas y acuerdos de la página de promesas desde su copia en el Internet Archive y comprueba que su huella sha256 es la verificada. |
| `promesas/documentos.json` | El catálogo de esos documentos: partido, título, páginas, dirección original, copia del archivo, huella y notas. |
| `promesas/INSTRUCCIONES.md` | Las reglas exactas con las que se clasifican las frases de esos documentos (promesa o no, y por qué). |
| `xls.py` | Lector de los libros .xls antiguos del SEPE (paro registrado), sin dependencias. |
| `px.py` | Lector de los ficheros PC-Axis de la Seguridad Social (afiliación), sin dependencias. |
| `acontecimientos.json` | Los acontecimientos que se marcan en los gráficos, con su fuente y el criterio para elegirlos. |
| `previsiones.json` | De qué publicación sale cada previsión (AIReF, Banco de España, Comisión Europea, FMI) y cada objetivo del Gobierno, con su fichero y su página. Las que vienen de hojas de cálculo se comprueban solas contra el fichero. |
| `explicaciones.json` | Los textos de los botones (i): qué implica cada indicador y cuánto tarda en notarse, con la fuente de cada afirmación. |
| `certificados/` | El certificado intermedio de la FNMT que los servidores de la AIReF y del Tesoro no envían; sin él, las descargas fallan. Es público. |
| `gobiernos.json` | Fechas de nombramiento de cada Presidente del Gobierno, con su Real Decreto en el BOE. Es una capa opcional de los gráficos: sitúa en el tiempo, no atribuye resultados. |

Solo usan la biblioteca estándar de Python 3.12 o posterior: no hay que instalar nada.

## Rehacer los cálculos

Desde una copia de este repositorio:

```sh
mkdir -p /tmp/cuentas/datos && cp -r . /tmp/cuentas/web
CUENTAS_DATOS=/tmp/cuentas/datos python3 codigo/descargar.py
CUENTAS_DATOS=/tmp/cuentas/datos CUENTAS_WEB=/tmp/cuentas/web python3 codigo/construir.py
```

`descargar.py` baja las fuentes de hoy. Si alguna ha publicado datos nuevos desde la fecha de este commit, los números
pueden cambiar; los ficheros exactos que se usaron están en `crudo/`, con su dirección, su fecha de descarga y su huella sha256 en el
apartado `fuentes` de `datos/aapp.json`.

El método, explicado sin código, está en la [metodología](https://cuentasenlimpio.es/metodologia.html).
