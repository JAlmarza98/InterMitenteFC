---
name: inter-mitente-comunicados
description: Crea las imágenes de comunicación oficial del equipo de fútbol 7 Inter Mitente (Inter Mitente FC) para el grupo de WhatsApp, con el mismo estilo que la app del equipo y su imagen de convocatoria. Úsala siempre que pidan un comunicado, aviso, convocatoria, resultado, cambio de horario, recordatorio o cualquier mensaje "para el equipo", "para el grupo" o "para los jugadores" del Inter Mitente, aunque no mencionen el diseño.
---

# Comunicados del Inter Mitente

Las comunicaciones oficiales del equipo se mandan al grupo de WhatsApp como una imagen PNG con la identidad visual de la app: la misma que la imagen de convocatoria que genera la app al compartir la formación. El resultado tiene que parecer hecho por el club, no una plantilla genérica.

## Proceso

1. **Entiende el mensaje.** Si es una convocatoria o un cambio de partido y falta un dato imprescindible (día, hora o rival), pregúntalo antes de generar nada. Lo demás, no lo preguntes: redacta con lo que haya.
2. **Redacta el texto** con las reglas de "Voz" de abajo.
3. **Genera la imagen** con el script (requiere ejecución de código):

   ```bash
   pip install pillow  # solo si no está
   python scripts/render_card.py --out comunicado.png \
     --kind "Convocatoria" --title "Jornada 5 vs Los Kiurchx" \
     --subtitle "Domingo 22 de noviembre · Liga" \
     --detail "Hora=18:45 (estar a las 18:15)" --detail "Campo=Polideportivo Andrés Torrejón" \
     --body "Partido contra el líder: necesitamos a todo el mundo." \
     --bullet "Traed agua y espinilleras"
   ```

   | Opción | Para qué |
   |---|---|
   | `--kind` | Etiqueta corta en la píldora: Comunicado, Convocatoria, Aviso, Resultado, Recordatorio, Cambio de horario… |
   | `--tone` | Color de acento. `amber` por defecto; `green` para buenas noticias (victoria, confirmación); `red` para malas (suspensión, sanción); `violet` para lo social (cenas, cumpleaños, fotos). |
   | `--title` | Titular, de una o dos líneas. |
   | `--subtitle` | Una línea bajo el titular: fecha, jornada, competición. |
   | `--detail "Etiqueta=Valor"` | Datos clave en filas (Hora, Campo, Equipación, Cuota…). Se puede repetir. |
   | `--body` | Un párrafo. Se puede repetir. |
   | `--bullet` | Un punto de lista. Se puede repetir. |
   | `--footer` | Firma de abajo; por defecto "Inter Mitente FC". |

4. **Entrega la imagen** y, debajo, un texto corto para acompañarla en WhatsApp (una o dos líneas; ahí sí pueden ir emojis).
5. **Revísala** antes de darla por buena: que nada se corte, que el título no ocupe más de dos líneas y que los datos sean los que dio el usuario.

## Voz

- Español de España, cercano, de vestuario: "vosotros", frases cortas y directas.
- El titular dice lo importante en pocas palabras: "Jornada 5 vs Los Kiurchx", "Partido aplazado", "Victoria 3-1 ante el Sparta".
- Los datos concretos (hora, campo, precio) van en filas `--detail`, nunca escondidos en un párrafo.
- **Sin emojis dentro de la imagen**: las fuentes del club no los tienen y saldrían como cuadrados. Úsalos solo en el texto que acompaña.
- Nada de inventarse datos: si no los da el usuario, no aparecen.

## Guía de diseño

Úsala tal cual si no se puede ejecutar el script (por ejemplo, para montar la imagen como un artefacto HTML o SVG de 1080 px de ancho que el usuario captura). Son los valores reales de la app.

**Lienzo:** 1080 px de ancho y como mínimo 1350 de alto (formato 4:5, que WhatsApp enseña entero). El contenido va centrado en vertical si sobra espacio.

**Fondo:**
- Degradado lineal de `#1a202a` a `#0e131d`, de la esquina superior izquierda hacia (30 % del ancho, abajo del todo).
- Encima, dos resplandores radiales:
  - ámbar `rgba(255,157,0,0.16)`, centrado arriba a la derecha (90 % del ancho, arriba) con radio del 90 % del ancho;
  - violeta `rgba(171,117,248,0.12)`, centrado a la izquierda (−5 % del ancho, 35 % del alto) con radio igual al ancho.
- Nunca fotos de césped ni texturas.

**Colores:**

| Uso | Color |
|---|---|
| Ámbar: nombre del club, etiquetas, acento principal | `#ff9d00` |
| Violeta: acento secundario | `#ab75f8` |
| Verde: buenas noticias | `#3ecf8e` |
| Rojo: malas noticias | `#ff6b6b` |
| Texto sobre un acento relleno | `#161c26` (oscuro, nunca blanco) |
| Texto principal | blanco; texto de párrafo al 90 %; secundario al 70 %; firma al 50 % |
| Panel "cristal" | fondo blanco azulado al 5 % (`rgba(219,227,242,0.05)`), borde `rgba(191,199,214,0.18)`, radio 28 px, margen lateral 48 px |

**Tipografías** (incluidas en `assets/fonts`):
- **Titulares:** Bricolage Grotesque ExtraBold (800). "INTER MITENTE" a 30 px en ámbar; titular a 58 px en blanco.
- **Texto:** Manrope.
  - Medium (500) para párrafos, a 32 px.
  - Bold (700) para los valores de datos, a 34 px.
  - ExtraBold (800) en mayúsculas para etiquetas y píldoras, a 24 px.

**Composición, de arriba abajo, todo centrado:**
1. El escudo `assets/crest.png`, a unos 104 px de alto.
2. "INTER MITENTE" en ámbar.
3. La píldora del tipo de comunicado: relleno de color, texto oscuro en mayúsculas y bordes totalmente redondeados.
4. El titular y el subtítulo.
5. El panel cristal con, en este orden, las filas de datos (etiqueta en color de acento y valor en blanco), los párrafos y la lista con puntos de color.
6. La firma, abajo y discreta.

**Reglas:**
- Un solo color de acento por imagen, además del ámbar del nombre.
- Mucho aire.
- Nada de bordes gruesos, sombras duras ni más de dos tipografías.
