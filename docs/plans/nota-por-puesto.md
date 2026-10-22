# Plan: nota de jugador justa por puesto

**Estado:** implementado el 22/10/2026 (commit `3eec201`). Se aplican las tres opciones (A, B y C) y todo el paso 0. Las preguntas abiertas quedaron resueltas (ver [Decisiones](#decisiones)).

## Principio

No se trata de que todos los puestos tengan la misma media, sino de que cada jugador se juzgue por su trabajo:

- Quien juega bien sube y quien juega mal baja, en cualquier puesto.
- Todos parten de 5. El puesto solo cambia qué cuenta como jugar bien.
- No se castiga a portero y defensas por no aparecer en ataque, ni al delantero por los goles que se encajan.

## Lo que dicen los partidos reales (2026/27, 3 partidos)

Datos leídos de producción, solo lectura, el 22/10:

1. **Los partidos duran unos 50'** (dos partes de ~25'), aunque la duración configurada es de 30' por parte. La nota calcula todo sobre 60' fijos, así que quien juega el partido entero ya recibe un ×1,2.
2. **Hay 17–18 cambios por partido**, con 9–12 convocados. Los jugadores de campo hacen 2–4 tramos y juegan entre 17' y 45'; solo el portero juega entero. El multiplicador por minutos afecta a casi todos, no solo a quien sale al final.
3. **El portero de ficha jugó 1 de los 3 partidos.** En los otros dos estuvo en la portería un central de ficha (jugó los 50' sin salir), y la nota lo trató como defensa. Ningún partido tiene alineación guardada.
4. **El historial no cuadra con los totales en 2 de 3 partidos:**
   - un gol tocado dos veces con 29 segundos de diferencia;
   - un gol de penalti que luego se quitó de los totales;
   - una amarilla anotada a un jugador y corregida a otro.

   Se corrigieron los totales, pero no el historial. La nota usa el historial para saber qué goles hubo con cada jugador en el campo, así que con tanta rotación esto mueve notas. No existe forma de deshacer un toque.
5. **Los rivales casan con la clasificación:** los 13 nombres de rival del calendario coinciden con los de la clasificación (ignorando mayúsculas, acentos y signos), y todos los partidos son de Liga.
6. **La posición de ficha puede no ser real:** 9 de los 16 jugadores son defensas de ficha, y los centrales han marcado 5 de los 9 goles. Ver pregunta abierta 5.

## Paso 0: datos fiables (antes de tocar la fórmula)

Arreglan errores que existen también con la fórmula actual:

- **Deshacer en el partido en vivo.** Botón para deshacer la última acción, que borra el evento y revierte el contador y el marcador. Además, el admin puede borrar un evento erróneo desde el historial del partido, con la misma reversión. Hoy un mal toque solo se arregla en los totales y el historial queda mal para siempre.
- **Red de seguridad en la nota:**
  - por jugador, se cuentan como mucho tantos eventos de gol como goles tenga en los totales corregidos (cubre dobles toques y goles fantasma);
  - si aun así los goles con minuto no suman el marcador, se reparte el marcador entero como hoy.
- **Duración real del partido:** suma de lo jugado en cada parte, en vez de 60' fijos.
- **Portero del partido:** el del hueco `gk` de la alineación. Si no hay alineación, el portero de ficha si jugó; si no, quien jugó el partido entero sin salir. Esta regla acierta en los 3 partidos reales.
- **Tarjetas fuera del campo, duras como hoy:**
  - sin haber jugado: amarilla → 1,4, roja → 0;
  - novedad: también se castigan igual si el jugador sí jugó pero estaba en el banquillo cuando le sacaron la tarjeta (por ejemplo, juega 40' en un 3-1 y le sacan amarilla en el banquillo: 2,0 en vez del 4,5 de hoy). Se detecta porque el minuto de la tarjeta cae fuera de sus tramos en el campo;
  - una tarjeta sin evento (corrección del admin) se considera fuera del campo solo si el jugador no tiene minutos.

## Opción A: nota por puesto (sin datos nuevos durante el partido)

```
nota = 5
     + factor_minutos × acciones personales
     + contexto del equipo con él en el campo   (premia entero, culpa a medias, entre −1,5 y +3)
     + top 3 del admin                           (Opción B)
     + tarjetas fuera del campo                  (fijas)
```

**Acciones personales, mismo valor en todos los puestos:** gol +1,2, gol de penalti +0,9, asistencia +0,7, penalti provocado +0,5, amarilla −0,6, roja −2, autogol −1,5, ⭐ +0,8, ⚠️ −0,8.

**Factor de minutos:** raíz cuadrada de (duración real ÷ minutos jugados), con máximo ×2.

- Hoy es 60' ÷ minutos, hasta ×6.
- Partido entero ×1; medio partido ×1,4 (hoy ×2,4 en un partido de 50'); un cuarto o menos ×2.
- Se aplica también al contexto del equipo, para que un buen tramo defensivo cuente igual que un gol.

**Contexto del equipo:** goles a favor y en contra mientras el jugador estaba en el campo, comparados con lo esperable contra ese rival:

| | Portero | Defensa | Medio | Delantero |
|---|---|---|---|---|
| Por cada gol encajado de menos (o de más) | ±0,8 | ±0,5 | ±0,25 | ±0,05 |
| Por cada gol marcado de más (o de menos) | 0 | ±0,05 | ±0,25 | ±0,4 |

- **Qué es "lo esperable" contra cada rival:** sale de la clasificación, con los goles que ese rival marca y encaja en sus otros partidos.
  - Se quita nuestro propio partido contra él (con nuestra fila de la clasificación se comprueba si ya está contado).
  - Mientras el rival tenga pocos partidos, se mezcla con la media de la liga (2,9 goles por equipo), como si tuviera 2 partidos de media.
  - Si no hay clasificación, se usa la media.
- **La parte negativa cuenta la mitad, y el contexto queda entre −1,5 y +3.** En fútbol 7 se encaja mucho y el mismo gol lo comparten portero y defensas. Sin esta suavización, en la simulación el portero suspendía el 32 % de los partidos y los defensas el 24 % solo por el equipo (con ella, 21 % y 12 %). Lo que sí cuenta entero es lo individual: tarjetas, autogoles y ⚠️.
- **Con 17–18 cambios, cada jugador tiene su propio marcador en el campo.** En el 3-6, los laterales que estuvieron en el 1-5 no salen igual que el central que estuvo en el 2-2.

**Partidos reales: nota actual → nota revisada** (sin top 3 ni ⭐/⚠️, que aún no existen):

| Partido | Jugador | Actual | Revisada |
|---|---|---|---|
| 3-1 al Sparta (6,5 goles por partido en sus otros encuentros) | Central de ficha jugando de portero, 51' | 5,6 | 8,0 |
| | Lateral 25', en el campo 2-0 | 5,4 | 6,7 |
| | Central 41' con gol, en el campo 3-0 | 7,6 | 8,5 |
| | Lateral que marca en 20' | 8,7 | 7,6 |
| | Centrocampista con 2 asistencias | 7,8 | 7,7 |
| 3-6 contra Manzanitas | Portero (central de ficha) | 4,6 | 3,8 |
| | Laterales (en el campo 1-5 o 2-4) | 4,2–4,6 | 3,5–4,1 |
| | Extremo con gol y asistencia | 8,7 | 7,7 |
| 3-3 contra Bonbon420 (ataque flojo) | Portero | 5,0 | 4,7 |
| | Extremo con 2 goles | 8,3 | 7,5 |
| | Amarilla desde el banquillo sin jugar | 1,4 | 1,4 |

**Ejemplos con B y C** (partido de 50' contra un rival de media):

| Situación | Nota |
|---|---|
| Portero, gana 3-1 | 6,5 |
| … con 2 paradones ⭐ | 8,1 |
| … con 2 paradones ⭐ y 🥇 | 9,6 |
| Portero, pierde 1-6 | 3,8 |
| … con una cantada ⚠️ | 3,0 |
| Lateral 25', en el campo 2-0 | 6,1 |
| Lateral 25', en el campo 0-3 | 4,4 |
| Delantero, 1 gol en un 3-2 | 6,3 |
| Delantero sin marcar, pierde 0-2 | 4,5 |
| Delantero entra 10' y marca | 7,8 (hoy 10,0) |

**Simulación** (`nota-por-puesto.sim.ts`): 300 temporadas de 22 partidos de 50' con rotación, solo con A.

| Puesto | ≥ 7,5 actual → revisada | < 4,5 actual → revisada |
|---|---|---|
| Portero | 4 % → 5 % | 23 % → 21 % |
| Defensa | 6 % → 3 % | 14 % → 12 % |
| Medio | 18 % → 11 % | 11 % → 6 % |
| Delantero | 29 % → 22 % | 12 % → 5 % |

Con solo A, el portero y los defensas que rotan siguen teniendo pocas notas altas. Su camino a la nota alta es el contexto del equipo más ⭐ y el top 3, y por eso tiene sentido aplicar las tres opciones. El delantero simulado marca casi un gol por partido, más que el vuestro, así que su ventaja en la simulación está exagerada respecto a vuestro equipo.

Para reproducirlo o ajustar pesos:

```bash
cd backend && npx tsx ../docs/plans/nota-por-puesto.sim.ts
R_OVERRIDE='{"defense":{"GK":1,"DEF":0.6,"MID":0.3,"FWD":0.05}}' npx tsx ../docs/plans/nota-por-puesto.sim.ts
```

**Implementación:**

- `playerRating.ts` recibe el puesto, la duración real, lo esperable a favor y en contra, el top 3, ⭐/⚠️ y las tarjetas fuera del campo.
- Los dos controladores calculan el portero del partido, el contexto con los eventos ya reconciliados y lo esperable a partir de la clasificación (`getStandings`, con su caché).
- Hay que reescribir los tests con valores exactos y actualizar el README.
- La nota se calcula al leer, así que el histórico se recalcula solo. Las notas de partidos pasados se moverán un poco a medida que la clasificación de los rivales se complete.

## Opción B: top 3 del admin (después del partido)

- **Quién:** solo admins. Un único top 3 por partido, compartido por todos los admins: cualquiera lo edita y vale lo último guardado.
- **Valor:** 🥇 +1,5, 🥈 +1, 🥉 +0,5, sin depender de los minutos. Solo pueden estar jugadores que jugaron ese partido, y no pueden repetirse.
- **Sin desglose:** el jugador solo ve su nota final (se puede desglosar más adelante).
- **Cambio de modelo (implementado):** tabla `MatchTopPlayer` (partido, puesto 1–3, jugador), con un puesto por partido y un jugador por partido. Se descartaron las tres columnas en `Match` porque viajarían en los datos del partido que lee todo el mundo, y el top 3 debe ser invisible. Se lee y guarda con `GET`/`PUT /api/matches/:id/top-players`, solo para admins.

## Opción C: acciones en vivo ⭐ y ⚠️ (por jugador)

- **⭐ Acción clave:** paradón, cruce o despeje que evita un gol, o recuperación que acaba en ocasión. +0,8 en cualquier puesto, por el factor de minutos.
- **⚠️ Error grave:** es **por jugador**. Solo resta al que lo comete, nunca al equipo, y vale −0,8 en cualquier puesto.
  - Cuenta: fallo individual que regala al rival un gol o una ocasión clarísima, como una pérdida en salida que acaba en gol o mano a mano, una cantada del portero, un despeje fallido que acaba en gol o un penalti cometido.
  - No cuenta: un mal pase en el centro del campo, un tiro fallado, ni un gol encajado sin un culpable claro.
  - **Por qué hace falta:** como la culpa colectiva ahora cuenta a medias y con tope, ⚠️ es lo que permite que un mal partido individual saque mala nota sin culpar a toda la línea.
- **Cambio de modelo:** `MatchEventType` += `key_action`, `key_error`; `MatchPlayerStat` += `keyActions`, `keyErrors`.
  - **Por qué:** el evento da el minuto y el historial; el contador alimenta la nota, la tabla de temporada y las correcciones. Mismo patrón que `penalty_won`.
- **El deshacer del paso 0 cubre también estos botones.** El partido en vivo se sincroniza entre móviles, así que puede apuntarlos otra persona con rol coach.

## Orden de implementación

1. **Paso 0:** deshacer, reconciliación, duración real, portero del partido, tarjetas fuera del campo.
2. **A:** fórmula y clasificación.
3. **B:** top 3.
4. **C:** ⭐ y ⚠️.

Cada paso deja la nota coherente por sí solo.

## Decisiones

1. **Multiplicador de minutos:** suavizado (raíz cuadrada, máximo ×2).
2. **Portero del partido:** regla automática de momento; si falla, se añade un campo explícito.
3. **Top 3:** invisible; solo lo ven y editan los admins.
4. **⚠️ Error grave:** vale la definición y el −0,8.
5. **Posiciones de ficha:** son reales; los centrales juegan de centrales.
6. **Tarjeta desde el banquillo habiendo jugado:** igual de dura que sin haber jugado.

## Descartado

- **Nota base distinta por puesto para igualar medias:** no se trata de que todos tengan la misma media (revisión del 22/10).
- **Calcular la nota base de cada puesto con los partidos del propio equipo:** con un solo portero se le compara consigo mismo.
- **Ajuste del míster con −1,5…+1,5:** sustituido por el top 3 del admin.
- **Desglose de la nota en pantalla:** de momento no.
- **Votación de MVP entre la plantilla:** premia la popularidad, que suele recaer en el goleador.
- **Campo manual de "dificultad del rival":** sustituido por la clasificación.

## De paso

- La medalla de "mejor nota" de la temporada no exige un mínimo de partidos (`frontend/src/app/features/stats/season-stats/season-stats.component.ts:108`). Propuesta: al menos un tercio de los partidos.
