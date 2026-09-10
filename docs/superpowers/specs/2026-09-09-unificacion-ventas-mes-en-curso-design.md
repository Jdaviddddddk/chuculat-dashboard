# Unificación de ventas: mes en curso desde una sola fuente

**Fecha:** 2026-09-09
**Objetivo:** que las **Tablas Dinámicas** (pivot) y el **resumen** de ventas cuadren **al peso** para el mes en curso, siempre. Hoy divergen ~$1.5M en el mes abierto.

## Problema (verificado)

El dashboard tiene dos cálculos de ventas independientes:

| Vista | Endpoint | Fuente | Frescura |
|---|---|---|---|
| Resumen (tarjetas, meses) | `get-ventas` (`Dashboard Ventas Siigo`, Ya8z4KTp9nTu4oOW) | **Siigo en vivo** (con caché ≤20min + prewarm) | ✅ exacto vs Siigo |
| Tablas Dinámicas (pivot) | `get-ventas-cross` (`Ventas Cross`, XYo0ijLoVGksTyDx) → RPC | tabla materializada **`ventas_items`** | ❌ mes en curso corto |

**Verificación 2026-09 (barrido directo a Siigo con `conciliacion.js`):**
- Siigo real = **$26.155.307** (B2C 15.647.300 + B2B 10.508.008 + Export 0).
- Resumen (`get-ventas`) = **$26.155.307** → exacto.
- Tablas Dinámicas (`ventas_items`) = **$24.677.321** → faltan **$1.477.986**, incluso recién refrescado.

**Causa raíz:** `ventas_items` lo arma el nodo **"Reconstruir Items"** (workflow `Refrescar ventas_items`, E6hioRumFdruvTCq) que:
1. Hace **DELETE-ALL + INSERT-ALL** en cada corrida (rebuild completo).
2. Barre en vivo **solo los últimos 60 días** por **fecha de registro**, con **corte por tiempo** a los 200s (`sinTiempo()` → bota páginas) y **fail-safe** que aborta la escritura si algo falla (por eso queda viejo).
3. **No** usa la ventana con colchón + filtro por fecha de documento + barrido `document_id=30537` que sí usa la conciliación (la que cuadra al peso).
4. Corría **1×/día**. (Ya se subió a cada 4h y se arregló el webhook manual `onReceived` en esta sesión — parche previo, no resuelve la exactitud.)

Los **meses cerrados sí cuadran** (salen de `ventas_invoices.raw`). El descuadre es exclusivo del **mes abierto**.

## Diseño

Principio: **una sola lógica de clasificación produce el mes en curso, y ambas vistas lo leen del mismo lugar.**

### Parte A — Job liviano del mes en curso (autoritativo del mes abierto)

Nuevo workflow **`CHUCULAT | Ventas Items — Mes en curso`**:

- **Schedule** cada ~30min (alineado con el prewarm del resumen).
- **Auth Siigo** + carga de `custMap` (clientes) y `prodMap` (productos + `productos_categorias` de Supabase) — idéntico a "Reconstruir Items".
- **Barrido del mes en curso con la ventana probada de la conciliación:** `date_start = inicioMes − 5d`, `date_end = HOY + 2d`, dos pasadas (`''` y `&document_id=30537`), y luego **filtrar por fecha de DOCUMENTO** dentro del mes. Volumen ~300-400 facturas → segundos, sin riesgo de los 300s ni de botar páginas.
- **NCs** del mes (clasificadas, restan).
- **Reparación fx** de exportación cc315 EUR (re-fetch por ID) — igual que hoy.
- **Clasificación idéntica** (`channelOf`, `itemSub`, `fxOf`, `catOf`, `isCompany`, `isNIT`, OVERRIDE) — copiada verbatim de "Reconstruir Items"/`conciliacion.js`.
- **Escritura acotada al mes en curso** (no DELETE-ALL): `DELETE ventas_items?fecha=gte.{inicioMes}` → `INSERT` las filas nuevas del mes. Esquema exacto: `{ inv_id, fecha, canal, categoria, code, producto, subtotal (2 dec), qty }`; `canal ∈ {B2C, B2B, Exportacion}`.
- **Fail-safe:** si hay `sweepFallos`/`fxFallos` o el total del mes queda sospechosamente por debajo de la corrida anterior, **no tocar la tabla** (mejor el dato de hace 30min que uno a medias).

### Parte B — El rebuild diario deja de tocar el mes en curso

Modificar **"Reconstruir Items"** (E6hioRumFdruvTCq) para que sea dueño **solo de meses cerrados** y no pise a la Parte A:
- Emitir filas solo con `fecha < inicioMes` (excluir mes en curso).
- Cambiar el borrado de `DELETE id=gte.0` (todo) a **`DELETE ventas_items?fecha=lt.{inicioMes}`** (solo cerrados).
- Mantener su fail-safe. Frecuencia: puede volver a 1×/día (ya no urge, la Parte A cubre lo vivo). El barrido de 60 días se puede recortar a lo aún-no-cerrado.

Resultado: `ventas_items` queda partido limpio — **cerrados** (job diario, desde `raw`) + **mes en curso** (job 30min, desde Siigo con lógica de conciliación). Sin colisión, cada parte completa.

### Parte C — Garantía "al peso siempre" (lectura unificada)

Con A+B, `ventas_items` del mes en curso = Siigo exacto (≤30min). El resumen sigue leyendo Siigo en vivo (≤20min). Coinciden salvo las facturas que entren en el hueco de minutos entre ambos cortes.

Para garantizar cuadre **al peso al 100%** (no “casi siempre”), el **total de ventas del mes en curso del resumen** debe leerse de `ventas_items` (mismo snapshot que el pivot), no de Siigo en vivo. Alcance mínimo: en `get-ventas`, los agregados de ventas del mes abierto (meses/total/categorías/productos/pivot) se derivan de `ventas_items`; las partes que no son ventas-por-ítem (cartera, clientes, destacadas/puntos) quedan igual. El dashboard muestra “datos al corte HH:MM”.

> Decisión pendiente para el usuario: **A+B** (cuadre a ≤30min, casi siempre exacto, cambio chico y de bajo riesgo) vs **A+B+C** (exacto al peso garantizado, toca también `get-ventas`, más obra). Recomendación: empezar por **A+B** (resuelve el 99%), y hacer **C** solo si se ve un descuadre residual molesto.

## No incluido (YAGNI)
- No se reescribe el pipeline completo de `get-ventas` ni se materializa cartera/clientes/destacadas.
- No se toca el frontend salvo, en C, la etiqueta de “datos al corte”.
- No DDL en Supabase (se reusa `ventas_items` tal cual; PostgREST no hace DDL).

## Riesgos
- **Colisión A vs B:** mitigada partiendo por `fecha` (gte/lt inicioMes).
- **Ventana de escritura DELETE→INSERT** deja el mes en curso vacío ~1s por corrida. Aceptable (30min de cadencia); si molesta, insertar a staging y swap — no en v1.
- **Límite 300s:** la Parte A procesa solo ~1 mes → holgado. La Parte B se recorta a cerrados → sigue bajo el límite.

## Verificación de aceptación
- Para 2026-09: `SUM(subtotal)` de `ventas_items` (todos los canales, mes en curso) = total del resumen = barrido directo Siigo (`conciliacion.js`), a ≤ $1.
- Repetir el chequeo tras dos corridas del job y tras un rebuild diario (confirmar que B no pisa el mes en curso).
- Meses cerrados: sin cambios (siguen exactos).
