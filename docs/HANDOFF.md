# Handoff — Chuculat (fidelización + ventas + Supabase)
_Para continuar en otro chat. Actualizado: 2026-07-21 (sesiones 3–7)._

## Contexto rápido
Ecosistema de **Chuculat** (cacao) en el n8n de Johan (`https://app.rioagencymarketing.com`, header API `X-N8N-API-KEY`).
- **Siigo** = facturación (fuente de ventas). **GoHighLevel (GHL)** = contactos, puntos, mensajes. **WooCommerce** = tienda.
- **Supabase** (ref `wavqyesyqqmawjfaztvb`) = facturas, logs de puntos, categorías y premios.
- **Dashboard**: `https://jdaviddddddk.github.io/chuculat-dashboard/` · repo `github.com/Jdaviddddddk/chuculat-dashboard` (local en `chuculat-repo/`).

> **⚠️ EL REPO TIENE DOS COPIAS ESPEJO DEL DASHBOARD:** `index.html` en la **raíz** (la que publica GitHub Pages) y `frontend/index.html`. **Hay que actualizar AMBAS** (`cp frontend/index.html index.html`), o el sitio en vivo no cambia. Pages tarda ~20-40s.

## Credenciales / IDs
- **Supabase**: `https://wavqyesyqqmawjfaztvb.supabase.co`. service_role (SECRETA) en los scripts locales y nodos n8n. SQL Editor: `https://supabase.com/dashboard/project/wavqyesyqqmawjfaztvb/sql/new`
- **GHL**: locationId `jzrg6bPH71ccLohGddsN`. **Dos tokens con scopes distintos** (los tokens SÍ funcionan desde cualquier IP; la nota vieja de "IP-locked" era errónea):
  - `pit-6827daee…` = **SUPERSET, usar este**: contactos (RW) + campos personalizados + mensajería. Es el unificado en todos los workflows del sistema.
  - `pit-980a207a…` = SOLO contactos (falla en campos y mensajería). Token de mensajería GWA `pit-b01308b1…` es de OTRA location (solo para enviar SMS).
  - Campos: identificación `4C6TxwNRElYAB1HFkJb4` · saldo `UfFc9GjS1K9az8nactO5` · histórico `ciYvzjlWfz9RcmIlqRkO` · redimidos `jyDAuEv0t1ugBAop1HAQ` · fechas recompra `wdfNkPf305JjwPdTUBwS` · última recompra `4SxhRfKQzstus8dzHsxS` · fecha redención `KK5lI6yJVEB9WhGwdFpa` · detalle redención `xmOqbRfTg5xaE2WCKfzS`
  - Campos de compras (enriquecimiento): Total Gastado `4XeNF2WH8ENigBGp2p3y` · Cantidad `ZgAmsrhK3c9txQDdamoK` · Última Fecha `awOZU9UMdqsEtOzeohst` · Últimos Productos `5kLgbedHcudIHOb4QCYs` · Producto Favorito `M2v7Jx24UrBCKxdULFp0`
- **Siigo**: user `<SIIGO_USERNAME — ver memoria local>`, access_key base64 en scripts. Partner-Id `n8nApp`. Factura: `document.id 30537`, `seller 10857`, `payments.id 13848`, `warehouse 30`, domicilio = SKU `672`.
- **Centros de costo**: 166=B2B, 168=B2C, 315=Exportación, 170=Planta, 172=Admin. **Corte del programa de puntos: `2026-05-11`**.
- **Sitio de redención** (en GHL): login `<REDACTADO>` / `<REDACTADO>`.

## Workflows n8n
| ID | Nombre | Notas |
|---|---|---|
| `b3NqLczq5MzJ3dmb` | SIIGO-GHL FACTURAS (puntos, cada 2 min) | filtro cost_center **por ítem** en `Filtro Natural` |
| `Ya8z4KTp9nTu4oOW` | Dashboard Ventas Siigo (`get-ventas`) | lee Supabase `raw`; caché de mapas |
| `W7ELd8Y2IGy8SAst` | Ventas Cierre Mensual (día 1) | upsert `raw` a Supabase |
| `zxuXGsnxkJWQYzFn` | Ventas Pre-warm (20 min) | mantiene caliente el rango por defecto |
| `5fkAFHxQJXal55hQ` | Redimir Puntos (`redeem-points`) | descuenta, acumula y loguea el **delta** + `items` |
| `GriVDvrNIY6RGDx1` | **Get Premios** (`get-premios`) | catálogo de premios desde Supabase |
| `GKelHhGiTUYu1QzD` | Get Logs (`get-logs`) | lee `puntos_log`; el nodo `Mapear` mapea campo a campo |
| `KebzbxEJltA9a86w` | Stats (`get-stats`) | redimidos = campo GHL `jyDAuEv0t1ugBAop1HAQ` |
| `O1NgZF4VXxdRjSeo` | Enriquecimiento Siigo→GHL (cada 1h) | tags `cat:`/`prod:` + campos de compras + notas 🛒 por cliente B2C |
| `T5vFnAkNZKPmuzv9` | Woocommerce-Siigo | idempotente; timbra DIAN; enlazado al Error Handler |
| `VQKbig1zk65gk3G5` | Confirmar cita (`payment-confirmation`) | experiencias vía ePayco; `/contacts/upsert`; timbra DIAN |
| `iVi686P2BTWp2nFg` | Error Handler | errorTrigger → **SMS por sub-cuenta GWA** (ver abajo) |
| `Pq20DQX58YMzdls2` | **Reconciliar Supabase** (diario 5am) | borra de `ventas_invoices` las facturas anuladas en Siigo (fantasmas). Webhook manual: `/webhook/reconciliar-ahora` |
| `1OioSrAEK6Loun2n` | **Cartera** (cada 6h) | barre Siigo, llena la tabla `cartera` y la sirve en `/webhook/get-cartera`. Refresco manual: `/webhook/refrescar-cartera` |
| `XYo0ijLoVGksTyDx` | **Ventas Cross** (`get-ventas-cross`) | proxy de las RPC de `ventas_items` para las Tablas Dinámicas con cruce |
| `iIGA54Txfw5BfKjN` | TEST Log Activity | insert manual a `puntos_log` |

**Alertas SMS:** el Error Handler está enlazado (`settings.errorWorkflow`) a los críticos: Redimir Puntos, SIIGO-GHL FACTURAS, Dashboard Ventas, Enriquecimiento, Cierre Mensual, **Confirmar cita, Woocommerce, Reconciliar Supabase**. SMS por la **sub-cuenta GWA** (location `fPuvVoCK3e5wQQVtSujb`, número Twilio **+16619908570**, token `pit-b01308b1…`) porque la location Chuculat NO tiene número SMS ni WhatsApp proactivo. Destino: contacto `Vjg9EwykevCwzxbZA4hA` (+573123408459) en GWA.

## Tablas Supabase
- **`ventas_invoices`** — 10.470 facturas. **`raw` (jsonb) = factura Siigo completa; es la que usa el dashboard** (las otras columnas son lossy: sin identification/discount). SQL: `backend/supabase_ventas.sql`.
- **`puntos_log`** — logs de puntos. **`items` (jsonb)** = detalle de redención `[{sku,nombre,puntos,precio_cop,qty}]`.
- **`productos_categorias`** — 218 productos, 23 categorías propias. SQL: `backend/supabase_productos_categorias.sql`.
- **`premios_puntos`** — 60 premios (sku, nombre, precio_cop, puntos, imagen). SQL: `backend/supabase_premios.sql`.
- **`ventas_items`** — 45.816 ítems aplanados (inv_id, fecha, canal, categoria, code, producto, subtotal, qty) + RPC `ventas_opciones()` y `ventas_pivot()`. Alimenta las **Tablas Dinámicas con cruce**. SQL: `backend/supabase_ventas_items.sql`. **Es un backfill de una sola vez**: se re-arma corriendo `flatten_items.py` + `backfill_items.py`.
- **`cartera`** — foto viva de las facturas con saldo (numero, fecha, cliente, nit, canal, moneda, total_cop, **saldo_cop = CON IVA**, dias, bucket) + RPC `cartera_resumen()`. La llena el workflow Cartera. SQL: `backend/supabase_cartera.sql`.

---

## HECHO en la sesión 3 (16-jul-2026)

### Dashboard
- Meta por centro de costo **60% B2C / 20% B2B / 20% Export**.
- **Meta, barra de avance, exportación y cartera salieron del filtro de fechas**: se renderizan una vez desde `ventasFull`. **Tendencia Mensual** muestra todos los meses (carga aparte `loadVentasAllTime`, en segundo plano).
- **Destacadas**: botón unidades/precio; tabla nueva **"Qué ha comprado un cliente"** (busca por cédula/nombre e invierte `clientesPorProducto`).
- **B2C**: sección nueva **"Compras con puntos"** (`sec-redenciones` / `renderRedenciones()`).

### Categorías de producto — 100% cubierto
`productos_categorias` pisa la categoría de Siigo (que es demasiado gruesa). **"Sin categoría" quedó en $0.** Categorías nuevas: **GRAGEAS GR** ($80M), **MAQUILA** ($10M), **COMBOS** (730/731/732).
**⚠️ `Build Product Map` cachea el productMap ya construido (TTL 1h)**: al cambiar la lógica hay que **subir `MAPS_V`** (va en 5), o el test "pasa" con datos viejos.

### Redención con carrito (NUEVO)
- Sitio: `frontend/redencion.html` (copia local `redencion-carrito.html`) — **falta pegarlo en GHL**.
- Busca al cliente → carrito → **solo deja agregar lo que alcanza con los puntos RESTANTES** (descuenta en vivo, la grilla se recalcula). Nada se transacciona hasta Redimir.
- Catálogo en `premios_puntos` vía `get-premios`. Las tarjetas-grupo del PDF se **desglosaron por variante** (bebidas 652/653/591/589; bombones 185/189/513/514/515; grageas 120g 700/701/702; minibarras 703/704/705/706; grageas 50g 330/335/356; tabletas 80g 360/362/363/367; **Trilogía = 369/358/359**, NO el 732).
- **Tabletas 30g (366/368) cargadas a $15.000 / 105 pts**: el PDF decía $24.000/168 pero copió la fila de las 80g (la tasa es ~0,7% del precio). **Confirmar con Johan.**

### Bugs arreglados
1. **Puntos a facturas B2B** (`b3NqLczq5MzJ3dmb`): `If1` miraba solo `new_invoices[0].cost_center` y `Split Out` repartía TODAS → colaba cc=166 (caso Tejada: 1.181 pts) **y**, si la primera no era 168, rechazaba el lote entero marcándolo procesado (puntos perdidos). Ahora `If1` solo verifica `new_count > 0` y el filtro real es **por ítem** en `Filtro Natural`.
2. **WooCommerce, cliente nuevo** (`T5vFnAkNZKPmuzv9`): `HTTP Request4` leía la cédula de la búsqueda **vacía** → **toda venta de cliente nuevo fallaba**. Ahora usa `$('Code in JavaScript').item.json.identificacion`.
3. **WooCommerce, teléfono**: el nodo de crear cliente leía `shipping.phone` (vacío en Woo) → clientes sin teléfono. Ahora `shipping?.phone || billing?.phone` + normaliza `+57`.
4. **GHL sin enriquecer** (`b3NqLczq5MzJ3dmb`): el PUT de contacto existente solo tocaba puntos. Ahora rellena teléfono/email/nombre **solo si faltan** (idempotente, nunca pisa).
5. **`Confirmar cita`**: rama sin slot ahora alerta (stopAndError + `errorWorkflow`); crea el cliente en Siigo en ambas ramas; token de `Crear Factura1` corregido.

### Facturas recuperadas (4 pedidos, $409.302)
`FV-2-1185` #4176 Andres Lopez · `FV-2-1186` #4173 ginna cruz · `FV-2-1187` #4174 Juan Carlos Gómez · `FV-2-1188` #4175 Jorge Mejia. Más `FV-2-1183` LEON DARIO y `FV-2-1184` Dana (experiencias).

---

## HECHO en la sesión 4 (otra sesión, en paralelo — commits `cf70f90`..`c0347b7`)
- **Timbrado automático DIAN** (`stamp: {send: true}`) en `Confirmar cita` (Crear Factura y Crear Factura1) y `Woocommerce-Siigo` (Crear Factura). Antes toda factura nacía en `Draft`.
- **FIX `Confirmar cita`**: `HTTP Request1` usaba `POST /contacts/` y moría con *"This location does not allow duplicated contacts"* cuando el contacto ya existía por teléfono/email pero **sin cédula** (la búsqueda es por cédula → daba 0 → intentaba crear → chocaba). Caso real: Sergio Guerrero pagó $250.000 y quedó sin cita ni factura. Ahora usa **`POST /contacts/upsert`**: si existe lo devuelve y le graba la cédula. Recuperado: cita 29-jul + `FV-2-1189`.
- **Encuestas**: nota 1-5 con 3 preguntas (Recomendación/Satisfacción/Servicio) + gráfica de barras; el desglose queda colapsado (tarjeta de 1802px → 572px).
- **Cross-sell limpio**: se descartan de `parejas` los cruces triviales (categoría BOMBONES, CH/CH DE MESA, código 304 "Caja bom pre"). Ojo: el filtro usa `/^CH(\s|$)/` y NO `startsWith('CH')` porque CHUNKS también empieza con CH.
- Ambos workflows enlazados al Error Handler.


## HECHO en la sesión 5 (16-jul-2026, misma sesión — filtro rápido)
- **Filtro de Ventas por meses completos: instantáneo (client-side), sin llamar al backend.** Si `[b2bDateFrom,b2bDateTo]` es una racha de meses enteros y `ventasAllTime` ya cargó, `applyB2BFilter()`/`clearB2BFilter()` suman los meses desde el histórico en el navegador (`fullMonthsInRange` + `buildClientSideVentas`) en vez de pedir `get-ventas`: **10-25s → ~11ms**. Si el rango son días sueltos, o el histórico no ha cargado, o el rango no está cubierto → cae intacto al fetch de siempre (sin riesgo). Verificado cifra por cifra contra el backend real (KPIs, categorías, 162-207 productos: exacto ±$1 de redondeo).
- **Tablas Dinámicas y Clientes B2B salieron del filtro superior**: se renderizan una sola vez (como Meta/Cartera/Exportación) y muestran siempre el histórico completo. Tablas usa la nueva variable `pivotSource` (`ventasAllTime` con fallback a `ventasFull`).
- **Backend** (`Compute Stats`): se agregó `facturas` por mes a `pivot.productos` (aditivo) para que el Top10 client-side muestre la columna de facturas correcta en cualquier sub-rango.
- **Simplificación conocida**: la etiqueta "N empresas · N consumidores" (y el badge de nav junto a B2B) usa el conteo de clientes únicos de `ventasFull` (año en curso), no el del sub-rango exacto filtrado — no hay desglose de clientes únicos por mes en los datos precalculados. Mismo criterio que Clientes B2B, que tampoco se filtra.


## HECHO en la sesión 6 (17-18 jul, esta rama — commits `678c9cd`..`73c82bf`)

### Puntos y redención
- **`puntos_log` reconstruido** desde Siigo: estaba sucio (le faltaban 117 compras y tenía ~8k pts de más del histórico) → se rehízo con 247 sumas canónicas (1 por factura elegible desde el corte, pts=floor(subtotal/1000), invoice_id correcto) + 2 redenciones. Script `reconstruir_puntos.js`.
- **Redimir Puntos** ahora escribe también **Última Redención** (fecha, campo `KK5lI6yJVEB9WhGwdFpa`) y **Última Redención (detalle)** (texto `xmOqbRfTg5xaE2WCKfzS` = "DD/MM/YYYY · N pts"). Probado end-to-end (contacto Miguel, revertido).
- **Bug invoice_id** en SIIGO-GHL FACTURAS (`Log: Preparar Entrada`): guardaba el nombre del cliente en vez del № de factura (`invoice.name` era el array del Cliente). Corregido a `$('Factura').first().json.results[0].name` + usa la fecha real de la factura.
- **Juanita** (1193434596, redimió 131) y **Adriana** (51941843, redimió 164) registradas; fecha de redención = 1 día después de su última compra. Nota: Adriana redimió más de lo que ganó (127) → saldo quedó -37 (decisión explícita de Johan).
- **Borrados a pedido**: registros de puntos/compras/redención de Jhonnatan Arenas (1000992852) y Camilo Restrepo (1233692073) — puntos_log + campos/tags/notas GHL a 0. NO se tocaron sus facturas en Siigo. (Cuidado: filtrar por **cédula**, no por nombre — "camilo" matchea 6 personas.)

### Facturación (timbrado)
- **Timbrado automático DIAN** (`stamp:{send:true}`) en Confirmar cita (ambas ramas) y Woocommerce-Siigo. Antes toda factura nacía en `Draft`.
- **Fix Confirmar cita**: usaba `POST /contacts/` y moría con "duplicated contacts" cuando el contacto existía por tel/email pero sin cédula. Ahora `POST /contacts/upsert`. Recuperado Sergio Guerrero ($250k, FV-2-1189 timbrada).

### Alertas de error por SMS
- **Error Handler** (`iVi686P2BTWp2nFg`) enlazado a los 8 críticos. Envía SMS por la sub-cuenta GWA (ver tabla de workflows arriba). Probado: entrega `delivered`.

### Encuestas
- **Nota 1-5** con 3 preguntas (Recomendación/Satisfacción/Servicio, `5 - índice`), gráfica de barras verticales arriba, resto colapsado tras "Ver resumen completo". Se resuelven **por texto de la pregunta, NO por id** (Chuculatología reutiliza ids con otro significado). "No había expectativas previas" = 1.

### Ventas / Destacadas
- **Cross-sell limpio**: descarta de `parejas` los cruces triviales (categoría BOMBONES, `/^CH(\s|$)/` — no `startsWith` porque CHUNKS también empieza con CH — y código 304 "Caja bom pre").
- **Etiquetas verde/roja por sección** (pestaña que asoma arriba-derecha): verde "Por fechas" = responde al filtro (`renderB2BFiltered`); rojo "Consolidada" = histórico fijo (bloque `fullRendered` + Tablas). Mapa `FILTER_TAGS`, inyectado en `DOMContentLoaded`.

### Facturas fantasma (desfase de ventas) — CAUSA RAÍZ + ARREGLO DURABLE
- **Síntoma**: julio salía **+$80.000** vs Siigo. Causa: **FV-2-1158** ($80k) se anuló en Siigo pero su copia quedó en `ventas_invoices` (el cierre solo hace upsert, nunca borra) → el dashboard (Supabase + Siigo vivo, dedup por id) la seguía contando. Fila borrada.
- **Arreglo durable**: workflow **`Pq20DQX58YMzdls2` "Reconciliar Supabase"** (diario 5am). Ventana 75 días: compara ids Supabase vs Siigo vivo (estándar + pasada `document_id=30537` para exportación) y **borra solo tras confirmar 404 con GET directo a Siigo** (no por ausencia en la lista → no mata exportación). Tope 60 candidatas. Ver [[facturas-fantasma-supabase]] en memoria.

---

## HECHO en la sesión 7 (21-jul-2026 — commits `082c737`..`6861565`)

### Tablas Dinámicas con filtros CRUZADOS (`082c737`)
- El `pivot` viejo traía cada dimensión pre-agregada por separado → **no se podían cruzar**. Se aplanó todo a **`ventas_items`** (45.816 ítems) + 2 RPC en Postgres (`ventas_opciones` para la cascada, `ventas_pivot` para el cruce) + proxy n8n **`get-ventas-cross`** (mantiene la service_role del lado del servidor).
- Frontend: 3 filtros que **se acotan entre sí** (Centro → Categoría → Producto), selector "Ver por (filas)" y checkboxes de meses. Celda = valor + cantidad.
- **BUG de categorías (mismo día):** `ventas_items.categoria` se había llenado con el `account_group` de **Siigo**, no con la taxonomía propia de Johan → las Tablas mostraban "Producto Empacado / Bases y Subrecetas…" en vez de SEL/TABLETAS/BOMBONES. Se remapeó la columna desde `productos_categorias` (los 208 codes están todos ahí → **23 categorías propias**) y se corrigió la causa raíz en `flatten_items.py`.

### Panel Ventas rediseñado (`5ecb06c`, `e9d2c41`, `95da83b`, `1f30173`)
- **Orden nuevo** (de general a específico) y agrupado en **4 grupos**: `grp-general` FIJO arriba (Progreso · Resumen · Meta por Centro) y 3 desplegables — `grp-metas` (Cumplimiento + Tendencia), `grp-productos` (Categorías + Ranking + Clientes B2B), `grp-export` (Exportación + Cartera). Estado por grupo en `localStorage['chuculat.group.'+id]`.
- **Filtro de fecha flotante** (botón abajo-derecha, visible en Ventas y Destacadas). Reemplaza las barras fijas; los inputs canónicos (`b2bDateFrom/To`, `destDateFrom/To`) quedaron **ocultos dentro de `#floatFilter`**. Recarga solo lo filtrable (`renderB2BFiltered` + clientes de exportación), **preserva el scroll** y no oculta el contenido.
- **Meta por Centro pasó a MENSUAL**: meta del mes ajustada × 60/20/20 vs el real del mes, **con fila TOTAL** al final.
- **Cumplimiento mes a mes**: columna "Desglose por centro" (B2C · B2B · Export del real de cada mes).
- **Comparativo vs año anterior** bajo la barra de meta: acumulado del año vs mismo periodo de 2025. ⚠️ Las ventas 2025 van **fijas** en `VENTAS_ANIO_PREV` (fuente: PDF oficial, total $967.434.175) porque **el histórico del dashboard NO tiene ene–jun 2025** (todo en $0; arranca en jul-2025 incompleto y solo cuadra desde sep). Reglas de Johan: **solo meses cerrados** y **% = diferencia / año ACTUAL** (no la fórmula contable estándar; se le advirtió). Verificado: ene–jun 2025 $439.134.970 vs 2026 $486.891.834 = **+9,81%**.
- `fmtCOP` **redondea al mostrar** (las sumas siguen con decimales). Se eliminó la sección **"Ventas por Canal"** (duplicaba el Resumen); la línea que actualiza `navBadgeB2B` se rescató a `renderB2BKPIs`.
- **Destacadas**: al buscar un cliente, ahora hay un **selector** para elegir uno entre las coincidencias en vez de sumarlas todas.

### Puntos: floor → ceil
`Math.floor(valorCompra/1000)` → **`Math.ceil`** en `Code in JavaScript1` de `b3NqLczq5MzJ3dmb` (25.560 → 26 pts). **Solo hacia adelante**: no se recalculó lo ya otorgado (el `puntos_log` reconstruido en la sesión 6 usó `floor`, así que histórico y nuevo conviven con reglas distintas — decisión explícita de Johan).

### CARTERA rehecha (`7b779ad`, `6861565`) — mostraba $4.253 MILLONES
- **Bug raíz:** en facturas en EUR, Siigo devuelve el `total` en la moneda original pero el **`balance` SIEMPRE en COP**. La fórmula vieja (`balance × sub/total`, con `sub` ya multiplicado por la tasa) volvía a multiplicar por la tasa: **FV-2-928** pasaba de ~$966.899 a **$4.217.027.041** (99% del error).
- Otros 3 defectos: prorrateaba a subtotal (**sin IVA**), solo miraba el **rango de fechas** filtrado (ocultaba $13,1M de deuda de 2025) y excluía planta/admin.
- **Decisión de Johan:** saldo real **CON IVA**, **todas** las facturas abiertas sin filtro de fecha, mismo alcance que Siigo (sin filtrar centro de costo).
- **Arquitectura nueva:** tabla `cartera` + workflow `1OioSrAEK6Loun2n` (cada 6h) + `get-cartera`. Se sacó de `get-ventas` porque el `balance` guardado en `ventas_invoices.raw` es una **foto vieja** (si el cliente paga, nunca se actualiza) y barrer 10.6k facturas no cabe en un request.
- Se agregó el bucket **>120d** al frontend, que faltaba y dejaba $4,18M invisibles.
- **Segunda corrección (`6861565`):** mi primer arreglo usó una heurística falsa ("si el balance cabe en el total está en moneda original") que le sumaba **$3,1M de más** a FV-2-974 (saldo real: 720 pesos). **Regla definitiva: el saldo NUNCA se convierte.** Total final **$50.435.018**, que cuadra **al peso** con la suma cruda de balances de Siigo (43 facturas de 10.691).

### Los 5 errores del Error Handler (`57981e2`)
- **🔴 `skuMap` CORRUPTO en Confirmar cita:** las llaves tenían un **`?` literal** (`"Wonka por un D?a"`) desde antes de la sesión 6 → **las dos experiencias con tilde NUNCA pudieron facturarse** (solo servían Cacao Maestro y Camino del chocolate). Encima ePayco manda a veces el texto en **mojibake**. Fix: llaves con escapes `í` (ASCII puro) + `repararMojibake()` + match sin tildes/mayúsculas. Probado 10/10.
- **Recuperada FV-2-1193** (Mariana Carolina, CC 1000179575, $250.000, Wonka por un Día ×2, DIAN Accepted).
- **Reintentos**: los nodos HTTP de Siigo de Enriquecimiento y Dashboard Ventas no tenían `retryOnFail` → se agregó (4 intentos, 4s). *(A los POST de facturas NO se les puso, a propósito: reintentar un POST no idempotente duplica facturas.)*
- **Reconciliar Supabase**: moría por **timeout a los 300s** (paginaba ~30 páginas en serie) → **paralelizado de a 5: 17,8s**. El 404 sin capturar se resolvió pasando todas las llamadas por `safe()` (nunca lanza) + **fail-safe: si falla alguna página NO borra nada**.

### WooCommerce → Siigo (`5e52b10`, `b4f6b47`)
- El flujo tiene **DOS nodos que crean factura** y solo uno estaba completo. `HTTP Request4` (**cliente nuevo**) creaba la factura **sin `stamp`** (nacía en Draft, nunca iba a la DIAN), **sin la línea de domicilio** (código 672 → no se cobraba el envío), **sin warehouse** y con el pago = suma de ítems en vez de `body.total`. Se copió el cuerpo de la rama buena.
- La **línea de domicilio no llevaba bodega** en ninguna de las dos ramas (29 de 56 facturas FV-2 con ítems sin bodega) → se agregó `warehouse: 30` (**"PRINCIPAL VENTAS"**; las otras son ALMACENAMIENTO 31, Cacao Factory 32, D Y G 33).

---

## PENDIENTE

0. **🔴 [Johan] ROTAR CREDENCIALES — hay secretos en el historial de git.** El commit **`cc6d57c`** (22-jul-2026) subió `backend/code/auditar_puntos.py` **sin sanitizar**, con el **`access_key` de Siigo** y el **`service_role` de Supabase** en texto plano. Se sanitizó en `67bf10b` (HEAD limpio) pero **siguen en el historial de un repo PÚBLICO**. Johan decidió posponerlo.
   - **Rotar Siigo `access_key`** y actualizarla en: puntos (`b3NqLczq5MzJ3dmb`), Dashboard Ventas (`Ya8z4KTp9nTu4oOW`), Cartera (`1OioSrAEK6Loun2n`), Confirmar cita (`VQKbig1zk65gk3G5`), Woocommerce (`T5vFnAkNZKPmuzv9`), Reconciliar (`Pq20DQX58YMzdls2`), Cierre Mensual (`W7ELd8Y2IGy8SAst`).
   - **Rotar Supabase `service_role`** y actualizarlo en todos los que escriben a Supabase.
   - Opcional (secundario): reescribir el historial + force-push. Reduce pero no elimina la exposición.
   - **Causa del error:** la auditoría de secretos se corría en la misma línea del `git commit`, así que imprimía el resultado *después* de haber commiteado. **Debe correr y BLOQUEAR antes.** Y los scripts `.py`/`.js` que se copian al repo hay que sanitizarlos igual que los exports de workflows.

1. **[Johan] Pegar `frontend/redencion.html` en GHL** y hacer **una redención de prueba con pocos puntos**: es el único eslabón sin ejercitar (no lo probé porque descontaría puntos reales). Verificar que `items` llegue a `puntos_log`.
2. **[Johan] Confirmar tabletas 30g** (366/368): ¿$15.000/105 pts como las cargué, o $24.000/168 como decía el PDF?
3. **[Johan] SKU a los combos en WooCommerce** (product_id **4120** "Combo para la casa" y **4118** "Combo Amateur"): ya existen en Siigo (730/731/732) pero Woo manda `sku:""` → **cada venta con combo seguirá fallando**. No son bundles (`meta_data:[]`), son productos simples.
4. **[Johan] Timbrar a mano las facturas en `Draft`** (Siigo rechaza timbrarlas por API: `invalid_date` por la fecha retroactiva). Al 21-jul quedan **3** (las de julio ya las timbró Johan) — **$155.999**:
   | Factura | Fecha | Total |
   |---|---|---|
   | FV-2-1042 | 13-may | $0 (revisar, parece basura) |
   | FV-2-1143 | 30-jun | $40.000 |
   | FV-2-1144 | 30-jun | $115.999 |
   Verificar con: FV-2 de los últimos meses con `stamp.status != 'Accepted'`.
5. **Venta de Silvia sin facturar** ($184.000, "Chocolates" por link de pago ePayco, doc 39569600) — Johan la dejó por fuera.
5. Barrer `puntos_log` completo contra `ventas_invoices` por si hay más casos tipo Tejada (puntos de facturas que no son cc=168).
6. (Opcional) `Get FV2` del dashboard baja TODAS las FV-2 en cada llamada y **oscila entre 2,5s y 17,6s** (API de Siigo) — es el mayor cuello de botella restante. Cachearlo requiere cuidado (ver abajo).
7. **Buscar más ventas de experiencias sin facturar.** Como "Wonka por un Día" y "Un Día como Oompa Loompa" **nunca** pudieron facturarse (skuMap corrupto), es probable que haya ventas viejas sin factura. n8n ya purgó esas ejecuciones → hay que **cruzar los pagos aprobados de ePayco contra las facturas de Siigo**. Solo se recuperó la de Mariana (FV-2-1193), que estaba en las ejecuciones vivas.
8. **`ventas_items` es un backfill de una sola vez** — ningún workflow lo alimenta, así que las Tablas Dinámicas no incluyen ventas posteriores al último backfill. O se re-corre `flatten_items.py` + `backfill_items.py` periódicamente, o se arma un workflow que lo mantenga (pendiente de decidir).
9. **Cartera: Siigo NO devuelve `due_date`** (0 de 43 facturas) → el aging cuenta **días desde la fecha de factura**, no desde el vencimiento pactado. Si Chuculat maneja plazos 30/60 días, los buckets se ven más vencidos de lo real. Falta definir de dónde sacar el plazo.
10. **Las 29 facturas FV-2 ya emitidas con ítems sin bodega no se pueden corregir** (timbradas y aceptadas por la DIAN). Si contabilidad las necesita corregidas: nota crédito + reemisión.
11. **[Riesgo latente, decidido dejarlo así por ahora] El nodo `Factura` del workflow de puntos pide `page_size=1`** (`/v1/invoices?page=1&page_size=1`) → solo ve la factura **más reciente**. Con el volumen actual (~35 facturas/día contra una corrida por minuto) casi nunca colisiona, pero si entran 2+ en el mismo minuto, las que no sean la más nueva **no se vuelven a ver nunca** (Siigo devuelve en orden DESC).
    **Si algún día se sube, hay que hacer TRES cosas juntas o se rompe:**
    1. **Sembrar `/root/.n8n-files/processed_invoices.json`** con las facturas ya procesadas. Si no, en la primera corrida vería ~100 facturas no marcadas y **volvería a acreditarlas todas** (duplicando saldos). Formato `[{name,id,date}]`, recortado a 2000; se lee/escribe con el nodo `Read/Write Files from Disk` — **`require('fs')` está bloqueado en los Code nodes**.
    2. **Cambiar `Code in JavaScript`**: calcula el subtotal con `$('Factura').first().json.results[0].items` = siempre la primera del lote. Debe usar `$('Loop Over Items').item.json`. Sin esto, todas las facturas del lote recibirían los puntos de la primera.
    3. Verificar con `auditar_puntos.py` antes y después.

## Trampas conocidas (leer antes de tocar algo)
- **NO cachear payloads grandes en staticData de n8n.** Se intentó consolidar la rama en vivo del dashboard en un `Live Siigo` cacheado: números idénticos pero **más lento** (9,8s → 14s) porque staticData creció a 2,78 MB y n8n lo reescribe en cada ejecución. **Revertido.** Baseline de verificación en `baseline_ventas.json` (rango 2025-06-01→2026-06-30: totalGeneral 978.608.844, B2C 483.443.359, B2B 270.097.602, Export 225.067.883, 9.940 facturas) — usarlo para validar cualquier refactor.
- **El PUT de un workflow limpia el staticData** → la 1ª llamada tras un PUT es fría.
- **Al editar jsCode desde Python: usar raw strings** (`r'''...'''`). Un `\b` en string normal se vuelve backspace `\x08` y mata la regex en silencio. El jsCode usa saltos `\r\n`.
- **Siigo rechaza fechas retroactivas** (`invalid_date`) → las facturas de recuperación van con fecha de hoy.
- **⚠️ Siigo: el `balance` viene SIEMPRE en COP, aunque el `total` esté en la moneda original.** NUNCA multiplicar el saldo por `exchange_rate`. Prueba: FV-2-928 tiene total 2.522,47 EUR y balance 966.899,01 (383× el total). Esto costó dos correcciones: primero se inflaba la cartera a $4.253 millones, y luego una heurística intermedia ("si el saldo cabe en el total está en moneda original") le sumaba $3,1M de más a FV-2-974, cuyo saldo real son 720 pesos.
- **⚠️ Límite de 300s en los Code node.** Cualquier barrido de Siigo en serie (~30+ páginas a 2-18s c/u) muere por timeout. **Paginar en paralelo con `Promise.all` de a 5.** Le pasó a Reconciliar (300s → 17,8s) y a Cartera (300s → 88s). Si un workflow que reescribe una tabla puede quedar a medias, ponerle **fail-safe: si falla alguna página, no tocar la tabla**.
- **`page_size` de Siigo está topado en 100** — pide 200/500/1000 y devuelve 100 igual. No se puede reducir el número de páginas por ahí.
- **El filtro `date_start`/`date_end` de `/v1/invoices` SÍ funciona** (2.610 resultados en 75 días, no 10.652). La nota vieja de que estaba roto no aplica a ese endpoint.
- **⚠️ Cliente con `saldo > 0` e `histórico = 0` = contacto creado por la rama "cliente nuevo".** Esa firma delató que el POST de creación mandaba el histórico hardcodeado en `"0"` y que esa rama **no estaba conectada al log** (arreglado 22-jul, commit `02c059a`). Si vuelve a aparecer esa combinación, mirar ahí.
- **⚠️ Antes de acreditar puntos en masa, SIMULAR SIEMPRE.** Auditando aparecieron 17 facturas elegibles sin registro en `puntos_log` (~1.145 pts) y casi se acreditan todas: la simulación mostró que **15 de 17 YA tenían los puntos en GHL** y solo faltaba el log. Acreditarlas habría duplicado saldos. Método: comparar por cédula la suma de puntos de TODAS sus facturas elegibles (floor y ceil) contra su `saldo`/`histórico` reales. Y poner siempre **guarda de idempotencia** (saltar si el `invoice_id` ya está en `puntos_log`): salvó la operación cuando la respuesta del webhook se cortó y hubo que reintentar.
- **⚠️ Cuando un workflow tiene ramas paralelas que hacen lo mismo, revisarlas TODAS.** El timbrado de la sesión 6 se aplicó solo a una de las dos ramas de Woocommerce; la otra siguió creando facturas en Draft y sin cobrar el domicilio durante días.
- **Texto no-ASCII en jsCode: usar escapes `\uXXXX`.** El `skuMap` de Confirmar cita tenía `"Wonka por un D?a"` con un `?` literal (alguien lo escribió con una codificación que reemplaza lo no-ASCII) → esa experiencia nunca facturó. Lo mismo aplica a los regex: poner caracteres combinantes literales (para quitar tildes) **no funciona**, hay que usar `/[̀-ͯ]/g`.
- **ePayco manda `x_description` en mojibake a veces** ("Wonka por un DÃ­a" = UTF-8 leído como Latin-1). Reparar con `decodeURIComponent(escape(s))` antes de comparar.
- **El listado `/v1/invoices` NO trae `customer.name`** (solo `identification`) → cruzar con `/v1/customers`. Y preferir `name` sobre `commercial_name`, que suele venir como **"No aplica"**.
- **El histórico del dashboard NO tiene ene–jun 2025** (todo en $0; jul-2025 incompleto; cuadra desde sep-2025). Cualquier comparativo con 2025 debe usar los valores fijos de `VENTAS_ANIO_PREV`, no los datos del sistema.
- **Siigo PUT /v1/customers/{id}**: el GET devuelve `id_type`/`fiscal_responsibilities`/`city` como objetos, pero el PUT exige `id_type` como **string code** → hay que aplanar.
- **GHL rechaza teléfono duplicado con HTTP 200 y body vacío** (silencioso). Si otro contacto ya tiene el número, el PUT no hace nada.
- **En el payload de get-ventas: `categorias[]` usa la clave `categoria`, NO `name`** (en `todosProductos[]` sí es `category`).
- **DNS intermitente** al server → siempre reintentos (2-8 con sleep 3-4s).
- **Supabase REST**: paginación con `Range: 0-999` + `Range-Unit: items`. Upsert: `?on_conflict=<col>` + `Prefer: resolution=merge-duplicates`.
- **PUT workflow n8n**: enviar solo `{name,nodes,connections,settings}`, y `settings` **solo** `{executionOrder:'v1'[, errorWorkflow:'<id>']}` — cualquier otra propiedad → 400 "must NOT have additional properties".
- **Facturas anuladas quedan fantasma en Supabase** (el cierre solo upsertea) e inflan el dashboard. Lo limpia el workflow `Reconciliar Supabase` (diario). Si notas un desfase de ventas vs Siigo, casi seguro es esto — o el caché de 60 min. Cubre solo últimos 75 días; para meses viejos hay que barrer a mano.
- **En `ventas_invoices`: la columna `id` ES el id de factura Siigo (= `raw.id`).** El dashboard filtra por `raw->>date` (fecha de factura); el cierre fetchea por `created_start/created_end` (fecha de creación) — no confundir.
- **Filtros de Siigo `?identification=` y `?date_start=` en `/v1/invoices` y `/v1/credit-notes` están ROTOS** (ignoran el filtro y devuelven todo/lo más reciente). Hay que traer y filtrar en código. La serie **FV-2 exportación (CC315) NO sale en el listado estándar** → pasada aparte con `document_id=30537`.
- **Regex `\w` NO matchea tildes** (la "í" de "calificarías"). Rompió el score de "Servicio" en silencio. Usar clases explícitas o matchear por substring sin acentos.
- **Los Code node de ESTE n8n SÍ pueden hacer `this.helpers.httpRequest`** (Parse Hist, Build Product Map, Upsert Supabase, Reconciliar lo usan) — no aplica la restricción del task-runner.
- **GHL: la location Chuculat NO tiene número → no envía SMS ni WhatsApp proactivo** (WhatsApp solo dentro de la ventana de 24h). Las alertas van por la sub-cuenta GWA. **`?identification=` en search de contactos: usar filtro por campo `customFields.4C6TxwNRElYAB1HFkJb4`.**

## Archivos locales (`C:\Users\johan\Documents\Claude\Botcito`)
- `redencion-carrito.html` — sitio de redención con carrito (copia en el repo).
- `load_categorias.py`, `backfill_raw.py`, `write_ghl.py` (patrón proxy GHL), `check_pts.py`.
- `premios_final.json` (60 premios), `cat_map_excel.json`, `baseline_ventas.json`, `reporte_data.json`.
- `.claude/launch.json` — sirve el dashboard en :8777 y la redención en :8778 (el navegador no abre `file://`).
- Memoria persistente: `C:\Users\johan\.claude\projects\C--Users-johan-Documents-Claude-Botcito\memory\chuculat-fidelizacion.md`
