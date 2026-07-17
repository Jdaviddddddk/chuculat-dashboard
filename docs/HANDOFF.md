# Handoff — Chuculat (fidelización + ventas + Supabase)
_Para continuar en otro chat. Actualizado: 2026-07-16 (sesiones 3 y 4)._

## Contexto rápido
Ecosistema de **Chuculat** (cacao) en el n8n de Johan (`https://app.rioagencymarketing.com`, header API `X-N8N-API-KEY`).
- **Siigo** = facturación (fuente de ventas). **GoHighLevel (GHL)** = contactos, puntos, mensajes. **WooCommerce** = tienda.
- **Supabase** (ref `wavqyesyqqmawjfaztvb`) = facturas, logs de puntos, categorías y premios.
- **Dashboard**: `https://jdaviddddddk.github.io/chuculat-dashboard/` · repo `github.com/Jdaviddddddk/chuculat-dashboard` (local en `chuculat-repo/`).

> **⚠️ EL REPO TIENE DOS COPIAS ESPEJO DEL DASHBOARD:** `index.html` en la **raíz** (la que publica GitHub Pages) y `frontend/index.html`. **Hay que actualizar AMBAS** (`cp frontend/index.html index.html`), o el sitio en vivo no cambia. Pages tarda ~20-40s.

## Credenciales / IDs
- **Supabase**: `https://wavqyesyqqmawjfaztvb.supabase.co`. service_role (SECRETA) en los scripts locales y nodos n8n. SQL Editor: `https://supabase.com/dashboard/project/wavqyesyqqmawjfaztvb/sql/new`
- **GHL**: locationId `jzrg6bPH71ccLohGddsN`; token `<GHL_PRIVATE_TOKEN — ver memoria local>` (**solo funciona desde la IP del server n8n** → usar workflows temporales como proxy; patrón en `write_ghl.py`; borrarlos al terminar).
  - Campos: identificación `4C6TxwNRElYAB1HFkJb4` · saldo `UfFc9GjS1K9az8nactO5` · histórico `ciYvzjlWfz9RcmIlqRkO` · redimidos `jyDAuEv0t1ugBAop1HAQ` · fechas recompra `wdfNkPf305JjwPdTUBwS` · última recompra `4SxhRfKQzstus8dzHsxS` · fecha redención `KK5lI6yJVEB9WhGwdFpa` · detalle redención `xmOqbRfTg5xaE2WCKfzS`
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
| `T5vFnAkNZKPmuzv9` | Woocommerce-Siigo | idempotente; 3 bugs arreglados (ver abajo) |
| `VQKbig1zk65gk3G5` | Confirmar cita (`payment-confirmation`) | experiencias vía ePayco |
| `iVi686P2BTWp2nFg` | Error Handler | errorTrigger → SMS |
| `iIGA54Txfw5BfKjN` | TEST Log Activity | insert manual a `puntos_log` |

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


## PENDIENTE

1. **[Johan] Pegar `frontend/redencion.html` en GHL** y hacer **una redención de prueba con pocos puntos**: es el único eslabón sin ejercitar (no lo probé porque descontaría puntos reales). Verificar que `items` llegue a `puntos_log`.
2. **[Johan] Confirmar tabletas 30g** (366/368): ¿$15.000/105 pts como las cargué, o $24.000/168 como decía el PDF?
3. **[Johan] SKU a los combos en WooCommerce** (product_id **4120** "Combo para la casa" y **4118** "Combo Amateur"): ya existen en Siigo (730/731/732) pero Woo manda `sku:""` → **cada venta con combo seguirá fallando**. No son bundles (`meta_data:[]`), son productos simples.
4. **[Johan] Timbrar a mano 4 facturas en `Draft`** (Siigo rechaza timbrarlas por API: `invalid_date` por la fecha retroactiva) — **$356.451**:
   | Factura | Fecha | Cliente | Total |
   |---|---|---|---|
   | FV-2-1127 | 23-jun | Diego Lopez (1014240198) | $51.499 |
   | FV-2-1157 | 02-jul | Manuel Vicente Tejada (94460233) | $58.920 |
   | FV-2-1159 | 03-jul | juan rodriguez (1024489707) | $75.999 |
   | FV-2-1177 | 09-jul | Aura Edilma Velandia (40046714) | $170.033 |
   (Las 6 creadas a mano el 16-jul —FV-2-1183..1188— **ya quedaron timbradas** `Accepted` con CUFE.)
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
- **PUT workflow n8n**: enviar solo `{name,nodes,connections,settings}`.

## Archivos locales (`C:\Users\johan\Documents\Claude\Botcito`)
- `redencion-carrito.html` — sitio de redención con carrito (copia en el repo).
- `load_categorias.py`, `backfill_raw.py`, `write_ghl.py` (patrón proxy GHL), `check_pts.py`.
- `premios_final.json` (60 premios), `cat_map_excel.json`, `baseline_ventas.json`, `reporte_data.json`.
- `.claude/launch.json` — sirve el dashboard en :8777 y la redención en :8778 (el navegador no abre `file://`).
- Memoria persistente: `C:\Users\johan\.claude\projects\C--Users-johan-Documents-Claude-Botcito\memory\chuculat-fidelizacion.md`
