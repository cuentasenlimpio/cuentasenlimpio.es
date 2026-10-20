"""Lector mínimo de libros .xls antiguos (BIFF8 dentro de un fichero OLE2), sin dependencias.

Solo lee lo que hace falta para tablas de números y textos: hojas, cadenas compartidas, números (NUMBER, RK,
MULRK), textos (LABEL, LABELSST) y el valor guardado de las fórmulas numéricas. Devuelve lo mismo que
xlsx.hojas: {nombre de hoja: [[valor, …], …]} con los huecos como None.
"""
import struct

FIN = 0xFFFFFFFE


def _flujo(datos, nombre):
    """Extrae un flujo (stream) del contenedor OLE2 por su nombre."""
    if datos[:8] != bytes.fromhex("D0CF11E0A1B11AE1"):
        raise ValueError("no es un fichero OLE2")
    sector = 1 << struct.unpack_from("<H", datos, 30)[0]
    mini = 1 << struct.unpack_from("<H", datos, 32)[0]
    n_fat, dir0, corte, mini0, n_mini, difat0, n_difat = struct.unpack_from("<I I 4x I I I I I", datos, 44)
    lee = lambda s: datos[512 + s * sector: 512 + (s + 1) * sector]
    difat = list(struct.unpack_from("<109I", datos, 76))
    s = difat0
    for _ in range(n_difat):
        bloque = struct.unpack(f"<{sector // 4}I", lee(s))
        difat.extend(bloque[:-1])
        s = bloque[-1]
    fat = []
    for s in difat[:n_fat]:
        fat.extend(struct.unpack(f"<{sector // 4}I", lee(s)))

    def cadena(s):
        trozos = []
        while s != FIN and s < len(fat):
            trozos.append(lee(s))
            s = fat[s]
        return b"".join(trozos)

    directorio = cadena(dir0)
    entradas = []
    for i in range(len(directorio) // 128):
        e = directorio[i * 128:(i + 1) * 128]
        largo = struct.unpack_from("<H", e, 64)[0]
        entradas.append((e[:max(0, largo - 2)].decode("utf-16-le"), e[66], struct.unpack_from("<I", e, 116)[0],
                         struct.unpack_from("<I", e, 120)[0]))
    raiz = entradas[0]
    for n, tipo, inicio, tam in entradas:
        if n != nombre:
            continue
        if tam >= corte:
            return cadena(inicio)[:tam]
        # Flujo pequeño: va en el mini-flujo de la entrada raíz, con su propia tabla.
        minifat = []
        if n_mini:
            b = cadena(mini0)
            minifat = list(struct.unpack(f"<{len(b) // 4}I", b))
        contenedor = cadena(raiz[2])
        trozos, s = [], inicio
        while s != FIN and s < len(minifat):
            trozos.append(contenedor[s * mini:(s + 1) * mini])
            s = minifat[s]
        return b"".join(trozos)[:tam]
    raise ValueError(f"no hay flujo {nombre}")


def _rk(v):
    entero = v & 2
    x = (v >> 2) if entero else struct.unpack("<d", struct.pack("<Q", (v & 0xFFFFFFFC) << 32))[0]
    if entero and x & (1 << 29):
        x -= 1 << 30
    return x / 100 if v & 1 else float(x)


def _texto(b, pos, largo=None):
    """Cadena Unicode de BIFF8 (sin los trozos de formato); devuelve (texto, nueva posición)."""
    if largo is None:
        largo = struct.unpack_from("<H", b, pos)[0]
        pos += 2
    opciones = b[pos]
    pos += 1
    rich = struct.unpack_from("<H", b, pos)[0] if opciones & 8 else 0
    pos += 2 if opciones & 8 else 0
    ext = struct.unpack_from("<I", b, pos)[0] if opciones & 4 else 0
    pos += 4 if opciones & 4 else 0
    if opciones & 1:
        t = b[pos:pos + 2 * largo].decode("utf-16-le", errors="replace")
        pos += 2 * largo
    else:
        t = b[pos:pos + largo].decode("latin-1")
        pos += largo
    return t, pos + 4 * rich + ext


def hojas(ruta):
    libro = _flujo(open(ruta, "rb").read(), "Workbook")
    registros, pos = [], 0
    while pos + 4 <= len(libro):
        tipo, largo = struct.unpack_from("<HH", libro, pos)
        registros.append((pos, tipo, libro[pos + 4:pos + 4 + largo]))
        pos += 4 + largo

    # Cadenas compartidas (SST), que pueden seguir en registros CONTINUE.
    sst = []
    for k, (_, tipo, cuerpo) in enumerate(registros):
        if tipo != 0x00FC:
            continue
        trozos = [cuerpo]
        j = k + 1
        while j < len(registros) and registros[j][1] == 0x003C:
            trozos.append(registros[j][2])
            j += 1
        n = struct.unpack_from("<I", cuerpo, 4)[0]
        # Al cruzar de un CONTINUE a otro, el texto lleva un byte nuevo de opciones: se lee pieza a pieza.
        bloque, i, p = 0, 0, 8
        while i < n:
            datos = trozos[bloque]
            if p >= len(datos):
                bloque, p = bloque + 1, 0
                continue
            largo = struct.unpack_from("<H", datos, p)[0]
            opciones = datos[p + 2]
            q = p + 3
            rich = struct.unpack_from("<H", datos, q)[0] if opciones & 8 else 0
            q += 2 if opciones & 8 else 0
            ext = struct.unpack_from("<I", datos, q)[0] if opciones & 4 else 0
            q += 4 if opciones & 4 else 0
            ancho = 2 if opciones & 1 else 1
            texto, faltan = [], largo
            while faltan:
                cabe = min(faltan, (len(datos) - q) // ancho)
                trozo = datos[q:q + cabe * ancho]
                texto.append(trozo.decode("utf-16-le" if ancho == 2 else "latin-1", errors="replace"))
                faltan -= cabe
                q += cabe * ancho
                if faltan:
                    bloque += 1
                    datos = trozos[bloque]
                    ancho = 2 if datos[0] & 1 else 1
                    q = 1
            q += 4 * rich + ext
            while q > len(datos):
                q -= len(datos)
                bloque += 1
                datos = trozos[bloque]
            sst.append("".join(texto))
            p = q
            i += 1
        break

    hojas_ = [(struct.unpack_from("<I", c, 0)[0], _texto(c, 7, c[6])[0]) for _, t, c in registros if t == 0x0085]
    salida = {}
    for inicio, nombre in hojas_:
        celdas = {}
        k = next(i for i, (p, _, _) in enumerate(registros) if p == inicio)
        for _, tipo, c in registros[k + 1:]:
            if tipo == 0x000A:  # EOF de la hoja
                break
            if tipo == 0x00FD:
                f, col, _, i = struct.unpack_from("<HHHI", c)
                celdas[(f, col)] = sst[i] if i < len(sst) else None
            elif tipo == 0x0203:
                f, col, _, v = struct.unpack_from("<HHHd", c)
                celdas[(f, col)] = v
            elif tipo == 0x027E:
                f, col, _, v = struct.unpack_from("<HHHI", c)
                celdas[(f, col)] = _rk(v)
            elif tipo == 0x00BD:
                f, col = struct.unpack_from("<HH", c)
                for j in range((len(c) - 6) // 6):
                    celdas[(f, col + j)] = _rk(struct.unpack_from("<I", c, 4 + 6 * j + 2)[0])
            elif tipo == 0x0204:
                f, col, _ = struct.unpack_from("<HHH", c)
                celdas[(f, col)] = _texto(c, 6)[0]
            elif tipo == 0x0006:
                f, col, _ = struct.unpack_from("<HHH", c)
                if c[12:14] != b"\xff\xff":
                    celdas[(f, col)] = struct.unpack_from("<d", c, 6)[0]
        if celdas:
            filas = max(f for f, _ in celdas) + 1
            cols = max(c_ for _, c_ in celdas) + 1
            salida[nombre] = [[celdas.get((f, c_)) for c_ in range(cols)] for f in range(filas)]
        else:
            salida[nombre] = []
    return salida
