# Conciliación B2C — Plan de Implementación (etapa 1: C1, C2, C5, C6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Panel "Conciliación" que compara por mes 4 KPIs B2C entre sus fuentes reales (Siigo, dashboard, Supabase, GHL) y marca ✅/⚠️ con tabla de diferencias.

**Architecture:** Se prototipa la lógica de cada control en **Node local** contra las APIs en vivo y se valida cifra por cifra; tras un **checkpoint con el usuario**, la lógica validada se lleva a un workflow n8n `get-conciliacion?mes=YYYY-MM` y a un panel nuevo en el dashboard (2 copias espejo). Se sube a GitHub Pages al final.

**Tech Stack:** Node (prototipo, `https` nativo), n8n (workflow backend), HTML/JS del dashboard (frontend). APIs: Siigo, GHL (LeadConnector), Supabase REST, webhooks `get-ventas`/`get-stats`.

## Global Constraints

- **Secretos NUNCA al repo.** Los scripts de prototipo con llaves (Siigo access_key, Supabase service_role, tokens) se quedan **locales** (raíz `C:\Users\jhonn\Bots IA\CHUCULAT\`), fuera de `repo-github/`. Solo el panel (sin secretos) y specs/plans van al repo.
- **Dos copias espejo** del dashboard: `repo-github/index.html` y `repo-github/frontend/index.html` deben quedar **idénticas** (`diff -q` = sin diferencias) tras cada cambio.
- **Lógica de clasificación B2C idéntica a compute_stats:** `itemSubtotal = price*qty − discount.value`, `× fx` (`currency.exchange_rate||1`); NC netadas por **fecha de la NC**; `channelOf`: cc315→export, cc166→b2b, cc168→(isCompany?b2b:b2c). `isCompany`: NIT / id_type 31 / person_type Company / keywords empresa / OVERRIDE `1007703532`. Genéricos bloqueados: `222222222222`, `7777777777777`.
- **Puntos:** elegible = `Es Natural?` (cc168, ident no genérica, no Company/NIT, no keywords, no Laura, fecha ≥ `2026-05-11`); `puntosGanados = Math.ceil(subtotalSinDescuento/1000)` donde subtotal = Σ `price*qty` (SIN descuento, como el nodo "Code in JavaScript" del workflow de puntos).
- **Siigo barrido:** estándar + pasada `document_id=30537` (exportación FV-2), dedup por `id`. Filtro de fecha por rango funciona; el de `identification` NO (barrer y filtrar en memoria).
- **Subir solo cuando el usuario lo pida** ("primero en local"). Antes de cada push: `git fetch` + rebase (Johan empuja en paralelo).

---

## File Structure

- `conciliacion.js` (LOCAL, raíz del proyecto, NO al repo) — prototipo: auth Siigo, barrido de un mes, y las 4 funciones de control. Imprime por control `{valorA, valorB, diferencia, estado, detalle}`.
- `backend/workflows/get-conciliacion.json` (repo, **sanitizado**) — export del workflow n8n `get-conciliacion` una vez montado.
- `crear_conciliacion.js` (LOCAL, NO al repo) — script que crea/actualiza el workflow n8n vía API (contiene N8N_KEY + secretos embebidos en el Code node).
- `repo-github/index.html` + `repo-github/frontend/index.html` (repo) — panel "Conciliación" (CSS + sección + JS `renderConciliacion`).

---

## Fase A — Prototipo local (validar antes de construir)

### Task 1: Scaffold del prototipo + barrido de un mes

**Files:**
- Create: `conciliacion.js` (raíz local)

**Interfaces:**
- Produces: `async function mesData(mesYYYYMM)` → `{ invs:[], ncs:[], custMap:{} }` (facturas B2C del mes ya clasificadas, NCs del mes, mapa de clientes). Reutilizado por C1–C5.

- [ ] **Step 1: Escribir el scaffold** con helpers `req`, `siigo`, `sb`, auth Siigo, y las funciones de clasificación (`isNIT`, `isCompany`, `channelOf`, `itemSub`, `fxOf`) copiadas VERBATIM de `validar_items_merge.js` (ya validado que cuadra al peso). Añadir `mesData(mes)`: barre `/v1/invoices?date_start=<mes-01>&date_end=<mes-fin>` (estándar + `document_id=30537`), dedup por id, filtra `channelOf==='b2c'`; barre `/v1/credit-notes` (2 páginas) y filtra NCs del mes.

- [ ] **Step 2: Correr contra un mes cerrado** (`node conciliacion.js 2026-06`) e imprimir conteos.
Run: `node conciliacion.js 2026-06`
Expected: imprime `facturas B2C: N | NCs: M` con N>0 (junio tuvo ventas). Verifica que el barrido funciona.

- [ ] **Step 3: Determinar la serie Web vs POS.** Leer el workflow `CHUCULAT | Woocommerce - Siigo` (`T5vFnAkNZKPmuzv9`, nodo "Crear Factura") para ver qué `document.id`/serie usa al facturar pedidos web. Anotar en un comentario del script: `WEB_DOC_IDS = new Set([...])`. Imprimir el desglose de facturas del mes por `document.id` para confirmar cuál es Web.

- [ ] **Step 4: Commit local** (fuera del repo, solo respaldo):
```bash
cd "C:/Users/jhonn/Bots IA/CHUCULAT" && git add conciliacion.js 2>/dev/null; echo "(script local, no se sube al repo del dashboard)"
```
*(Nota: `conciliacion.js` vive en la raíz, que NO es el repo del dashboard. No se commitea a repo-github.)*

### Task 2: C1 — Ventas netas

**Files:**
- Modify: `conciliacion.js`

**Interfaces:**
- Consumes: `mesData(mes)`.
- Produces: `function c1(mes)` → `{ id:'C1', valorA, valorB, diferencia, estado, detalle:[], desglose:{pos, web} }`.

- [ ] **Step 1: Implementar el lado A** (Siigo fresco): `valorA = Σ (itemSub(it)*fxOf(inv))` de las facturas B2C del mes menos `Σ (itemSub*fx)` de las NCs B2C del mes (netado por fecha de NC). Desglose `pos/web` por `WEB_DOC_IDS`.

- [ ] **Step 2: Implementar el lado B** (dashboard): `fetch get-ventas?date_start=<mes-01>&date_end=<mes-fin>` y tomar el neto B2C del mes (`meses[].b2c` o el total B2C del payload; usar el mismo campo que muestra el panel).

- [ ] **Step 3: Validar contra meses cerrados.**
Run: `node conciliacion.js c1 2026-06` (y 2026-03, 2026-05)
Expected: `estado: ✅` con `|diferencia| ≤ 1` en los meses cerrados (ya sabemos que la lógica merge cuadra al peso). Si un mes NO cuadra, el `detalle` lista las facturas divergentes — eso es un hallazgo real, reportarlo.

- [ ] **Step 4: Probar que DETECTA un descuadre real.** Correr C1 para un mes donde `ventas_items` estuvo mal (si aplica) o inyectar mentalmente: confirmar que cuando A≠B el `detalle` no está vacío.

### Task 3: C2 — Comprobantes

**Files:**
- Modify: `conciliacion.js`

**Interfaces:**
- Produces: `function c2(mes)` → `{ id:'C2', valorA, valorB, diferencia, estado, detalle:[] }`.

- [ ] **Step 1: Lado A** = `invs.length` (facturas B2C positivas del mes; NC NO cuentan). Lado B = # comprobantes B2C que reporta `get-ventas` para el mes (campo `b2c_fac` de `meses[]`, ya existe en el payload).

- [ ] **Step 2: Validar.**
Run: `node conciliacion.js c2 2026-06`
Expected: `✅` (conteos iguales). Si difieren, `detalle` = ids presentes en un lado y no en el otro.

### Task 4: C5 — Puntos otorgados (el de mayor valor)

**Files:**
- Modify: `conciliacion.js`

**Interfaces:**
- Consumes: `mesData(mes)`, reglas de elegibilidad.
- Produces: `function c5(mes)` → `{ id:'C5', valorA, valorB, diferencia, estado, detalle:[] }` donde `detalle` = facturas elegibles SIN puntos en `puntos_log`.

- [ ] **Step 1: Lado A (esperado).** Para cada factura B2C del mes que pase `esNatural` (cc168, ident no genérica, no Company/NIT, no keywords, no Laura, fecha ≥ cutoff), `pts = Math.ceil((Σ price*qty)/1000)`. `valorA = Σ pts`. Guardar `{ factura, ident, ptsEsperados }`.

- [ ] **Step 2: Lado B (real).** `sb GET /rest/v1/puntos_log?tipo=eq.suma_puntos&fecha=gte.<mes-01>&fecha=lte.<mes-fin>&select=invoice_id,points,siigo_id` (paginar). `valorB = Σ points`.

- [ ] **Step 3: Detalle = elegibles sin log.** Cruzar por `invoice_id` (= nombre de factura FV-x). `detalle` = facturas elegibles cuyo `name` NO está en el set de `invoice_id` logueados. Cada fila: `{ factura, ident, ptsEsperados }`.

- [ ] **Step 4: Validar contra agosto (mes con incidentes conocidos).**
Run: `node conciliacion.js c5 2026-08`
Expected: como ya recuperamos a Omaira/Juan Carlos/Nicolas, el `detalle` debe estar **vacío o mínimo**; `valorA ≈ valorB`. Correr también `2026-07` (debe cuadrar). Si aparece una factura elegible sin puntos, es un cliente que perdió puntos → reportarlo (candidato a recuperación).

### Task 5: C6 — Puntos redimidos

**Files:**
- Modify: `conciliacion.js`

**Interfaces:**
- Produces: `function c6(mes)` → `{ id:'C6', valorA, valorB, diferencia, estado, detalle:[] }`.

- [ ] **Step 1: Lado A** = eventos de redención en `puntos_log` del periodo. Leer el workflow `CHUCULAT | Redimir Puntos` (`5fkAFHxQJXal55hQ`) para confirmar el `tipo` que escribe (p.ej. `redencion`/`resta_puntos`) y el signo. `valorA = Σ |points|` de esos eventos del mes.

- [ ] **Step 2: Lado B** = redimidos **tal como los computa el dashboard** para su KPI "Redimidos". Leer `renderKPIsFromStats`/`get-stats` en `index.html` + workflow `CHUCULAT | Stats` para ver de dónde sale `redeemedPoints`. Acotar al periodo con la misma lógica.

- [ ] **Step 3: Validar.**
Run: `node conciliacion.js c6 2026-08`
Expected: A≈B. Diferencias → `detalle` con las redenciones no conciliadas.

### Task 6: Runner unificado + CHECKPOINT con el usuario

**Files:**
- Modify: `conciliacion.js`

- [ ] **Step 1: `main(mes)`** que corre C1–C6 y arma el JSON `{ mes, controles:[c1,c2,c5,c6], generadoEn }`. `node conciliacion.js all 2026-07` imprime la tabla resumen (id, A, B, dif, estado).

- [ ] **Step 2: PARAR y revisar con el usuario.** Presentar la tabla resumen de 2-3 meses (uno cerrado, julio, agosto). El usuario confirma que las cifras y los ✅/⚠️ tienen sentido **antes** de montar backend/panel. No avanzar sin visto bueno.

---

## Fase B — Backend + Panel (tras el checkpoint)

### Task 7: Workflow `get-conciliacion` en n8n

**Files:**
- Create: `crear_conciliacion.js` (LOCAL, con secretos) — crea el workflow.
- Create: `backend/workflows/get-conciliacion.json` (repo, **sanitizado**: sin llaves).

**Interfaces:**
- Produces: webhook `GET /webhook/get-conciliacion?mes=YYYY-MM` → mismo JSON que `main(mes)`.

- [ ] **Step 1:** Portar la lógica validada de `conciliacion.js` a un Code node (usar `this.helpers.httpRequest`, patrón de `crear_refrescar_items.js`). Trigger: webhook `get-conciliacion`. Enlazar al Error Handler `iVi686P2BTWp2nFg`.

- [ ] **Step 2:** Crear el workflow (`node crear_conciliacion.js`), probar `GET /webhook/get-conciliacion?mes=2026-07` y confirmar que el JSON coincide con el prototipo local (mismas cifras).

- [ ] **Step 3:** Exportar el workflow **sanitizado** a `backend/workflows/get-conciliacion.json` (reemplazar llaves por placeholders) y commit al repo.

### Task 8: Panel "Conciliación" en el dashboard

**Files:**
- Modify: `repo-github/index.html` (+ espejo `frontend/index.html`)

**Interfaces:**
- Consumes: `GET /webhook/get-conciliacion?mes=YYYY-MM`.

- [ ] **Step 1: CSS + estructura.** Añadir sección/segmento "Conciliación" con selector de mes y una tabla: por control una fila con semáforo (✅ verde / ⚠️ rojo), nombre, valorA, valorB, diferencia, y un `<details>` con la tabla de `detalle`. Seguir los estilos existentes (`.survey-*`, `.aging-*`).

- [ ] **Step 2: JS `renderConciliacion(mes)`** que hace fetch al webhook y pinta la tabla. Cargar bajo demanda al abrir el segmento (patrón `b2bLoaded`), con selector de mes (default: mes actual).

- [ ] **Step 3: Verificar en local** (server http + navegador): abrir Conciliación, elegir julio, confirmar que se pinta con los ✅/⚠️ correctos y el detalle se despliega. Sin errores de consola.

- [ ] **Step 4: Espejo idéntico** (`diff -q index.html frontend/index.html`) y **checkpoint visual** con el usuario antes de subir.

### Task 9: Subir

- [ ] **Step 1:** `git fetch` + rebase sobre Johan. Commit del panel + el JSON sanitizado. Push a `main`. Verificar despliegue en GitHub Pages (hard refresh).

---

## Self-Review (cobertura del spec)

- C1 → Task 2 ✓ · C2 → Task 3 ✓ · C5 → Task 4 ✓ · C6 → Task 5 ✓
- Arquitectura backend+frontend → Tasks 7-8 ✓ · Método "local primero + checkpoint" → Tasks 1-6 ✓
- Decisiones: C1 POS/Web por serie → Task 1 Step 3 + Task 2 Step 1 ✓ · C6 = fuente del dashboard → Task 5 Step 2 ✓
- Secretos locales / espejo / clasificación idéntica → Global Constraints ✓
