# Handoff — Chuculat (fidelización + ventas + Supabase)
_Para continuar en otro chat. Actualizado: 2026-07-18 (sesiones 3–6)._

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
| `Pq20DQX58YMzdls2` | **Reconciliar Supabase** (diario 5am) | borra de `ventas_invoices` las facturas anuladas en Siigo (fantasmas) |
| `iIGA54Txfw5BfKjN` | TEST Log Activity | insert manual a `puntos_log` |

**Alertas SMS:** el Error Handler está enlazado (`settings.errorWorkflow`) a los críticos: Redimir Puntos, SIIGO-GHL FACTURAS, Dashboard Ventas, Enriquecimiento, Cierre Mensual, **Confirmar cita, Woocommerce, Reconciliar Supabase**. SMS por la **sub-cuenta GWA** (location `fPuvVoCK3e5wQQVtSujb`, número Twilio **+16619908570**, token `pit-b01308b1…`) porque la location Chuculat NO tiene número SMS ni WhatsApp proactivo. Destino: contacto `Vjg9EwykevCwzxbZA4hA` (+573123408459) en GWA.

## Tablas Supabase
- **`ventas_invoices`** — 10.470 facturas. **`raw` (jsonb) = factura Siigo completa; es la que usa el dashboard** (las otras columnas son lossy: sin identification/discount). SQL: `backend/supabase_ventas.sql`.
- **`puntos_log`** — logs de puntos. **`items` (jsonb)** = detalle de redención `[{sku,nombre,puntos,precio_cop,qty}]`.
- **`productos_categorias`** — 218 productos, 23 categorías propias. SQL: `backend/supabase_productos_categorias.sql`.
- **`premios_puntos`** — 60 premios (sku, nombre, precio_cop, puntos, imagen). SQL: `backend/supabase_premios.sql`.

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

## PENDIENTE

1. **[Johan] Pegar `frontend/redencion.html` en GHL** y hacer **una redención de prueba con pocos puntos**: es el único eslabón sin ejercitar (no lo probé porque descontaría puntos reales). Verificar que `items` llegue a `puntos_log`.
2. **[Johan] Confirmar tabletas 30g** (366/368): ¿$15.000/105 pts como las cargué, o $24.000/168 como decía el PDF?
3. **[Johan] SKU a los combos en WooCommerce** (product_id **4120** "Combo para la casa" y **4118** "Combo Amateur"): ya existen en Siigo (730/731/732) pero Woo manda `sku:""` → **cada venta con combo seguirá fallando**. No son bundles (`meta_data:[]`), son productos simples.
4. **[Johan] Timbrar a mano 3 facturas en `Draft`** (Siigo rechaza timbrarlas por API: `invalid_date` por la fecha retroactiva) — **$305.352**:
   | Factura | Fecha | Cliente | Total |
   |---|---|---|---|
   | FV-2-1157 | 02-jul | Manuel Vicente Tejada (94460233) | $58.920 |
   | FV-2-1159 | 03-jul | juan rodriguez (1024489707) | $75.999 |
   | FV-2-1177 | 09-jul | Aura Edilma Velandia (40046714) | $170.033 |
   (FV-2-1127 ya se re-fechó al 17-jul y quedó `Accepted`. Las 6 del 16-jul —FV-2-1183..1188— también.)
5. **Venta de Silvia sin facturar** ($184.000, "Chocolates" por link de pago ePayco, doc 39569600) — Johan la dejó por fuera.
5. Barrer `puntos_log` completo contra `ventas_invoices` por si hay más casos tipo Tejada (puntos de facturas que no son cc=168).
6. (Opcional) `Get FV2` del dashboard baja TODAS las FV-2 en cada llamada y **oscila entre 2,5s y 17,6s** (API de Siigo) — es el mayor cuello de botella restante. Cachearlo requiere cuidado (ver abajo).

## Trampas conocidas (leer antes de tocar algo)
- **NO cachear payloads grandes en staticData de n8n.** Se intentó consolidar la rama en vivo del dashboard en un `Live Siigo` cacheado: números idénticos pero **más lento** (9,8s → 14s) porque staticData creció a 2,78 MB y n8n lo reescribe en cada ejecución. **Revertido.** Baseline de verificación en `baseline_ventas.json` (rango 2025-06-01→2026-06-30: totalGeneral 978.608.844, B2C 483.443.359, B2B 270.097.602, Export 225.067.883, 9.940 facturas) — usarlo para validar cualquier refactor.
- **El PUT de un workflow limpia el staticData** → la 1ª llamada tras un PUT es fría.
- **Al editar jsCode desde Python: usar raw strings** (`r'''...'''`). Un `\b` en string normal se vuelve backspace `\x08` y mata la regex en silencio. El jsCode usa saltos `\r\n`.
- **Siigo rechaza fechas retroactivas** (`invalid_date`) → las facturas de recuperación van con fecha de hoy.
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
