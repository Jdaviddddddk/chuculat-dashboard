# Conciliación B2C — Diseño (etapa 1: C1, C2, C5, C6)

Fecha: 2026-08-26 · Estado: diseño aprobado a alto nivel, pendiente revisión de spec.

## Objetivo

Panel **"Conciliación"** en el dashboard que, para un **mes** dado, compara cada KPI
B2C entre sus **fuentes reales** (Siigo, GHL, dashboard/Supabase, WooCommerce) y marca
**✅ cuadra / ⚠️ no cuadra**, con una **tabla de diferencias** por control. El valor está
en que cada lado sale de un sistema distinto que puede divergir.

Etapa 1: **C1 (ventas netas), C2 (comprobantes), C5 (puntos otorgados), C6 (puntos redimidos)**.
Etapas siguientes: C3, C4, C7, C8, C9, C10.

## Arquitectura

- **Backend:** workflow n8n `get-conciliacion?mes=YYYY-MM`. Para el mes, computa los dos
  lados de cada control desde su fuente y devuelve por control:
  `{ id, nombre, valorA, valorB, diferencia, estado, detalle:[] }`.
- **Frontend:** panel/sección **"Conciliación"** (mismas 2 copias espejo `index.html` +
  `frontend/index.html`). Cada control = fila con semáforo, los dos valores, la diferencia
  y un desplegable con la tabla de detalle (los casos que no cuadran).
- **Método "primero en local":** se prototipa la lógica de cada control con **scripts Node
  contra las APIs en vivo**, se **valida cifra por cifra con datos reales**, y solo entonces
  se lleva al workflow + panel. Revisamos antes de subir.

## Controles — etapa 1

### C1 — Ventas netas
- **Lado A (Siigo, fresco):** subtotal neto B2C del mes computado en vivo desde Siigo con la
  MISMA lógica que compute_stats: `itemSubtotal = price*qty − descuento`, `× fx`; NC netadas
  por fecha de NC; canal `cost_center 168` = B2C (con `isCompany` → B2B). Desglose
  informativo **POS vs Web**, distinguido por la **serie / tipo de documento** de la
  factura: la serie que genera la integración WooCommerce = **Web**; el resto = **POS**.
  (La serie exacta se confirma en el prototipo leyendo el workflow WooCommerce-Siigo.)
- **Lado B (dashboard):** ventas netas B2C que muestra `get-ventas` para ese mes.
- **Cuadra** si `|A−B| ≤ $1` (redondeo). **Detecta:** bug de cómputo del panel,
  `ventas_items` desactualizado, facturas fantasma, fx de exportación.
- **Detalle si no cuadra:** facturas presentes en un lado y no en el otro; diferencia por factura.

### C2 — Comprobantes
- **Lado A (Siigo):** número de **facturas B2C positivas** del mes (POS+Web); NC contadas aparte.
- **Lado B (dashboard):** número de comprobantes B2C que reporta `get-ventas`.
- **Cuadra** si son iguales. **Detecta:** NC contada como factura, facturas duplicadas.
- **Detalle:** lista de documentos en conflicto (id, serie, fecha, tipo).

### C5 — Puntos otorgados
- **Lado A (esperado):** puntos que DEBERÍAN otorgarse por las facturas B2C **elegibles** del
  mes, según la regla del workflow de puntos (`Es Natural?`: cc168, ident no genérica 222/7777,
  no Company/NIT, no keywords empresa, fecha ≥ cutoff) × `ceil(subtotal/1000)`.
- **Lado B (real):** Σ de puntos `suma_puntos` en `puntos_log` del mes (incluye `siigo_recuperado`).
- **Cuadra** si `A = B`. **Detecta:** **puntos perdidos** (PUT rechazado por duplicado/teléfono
  comodín, cascada rota por cédula no-numérica, etc.), duplicados, eventos fuera de periodo.
- **Detalle:** facturas elegibles **sin** registro en `puntos_log` (y viceversa) — exactamente
  los casos Omaira / Juan Carlos / Nicolas de esta semana.

### C6 — Puntos redimidos
- **Lado A:** eventos de **redención** en `puntos_log` del periodo (tipo resta/redención).
- **Lado B:** los puntos redimidos **tal como ya los computa el dashboard** para su KPI
  "Redimidos" (misma fuente/lógica que hoy alimenta esa tarjeta), acotado al periodo.
- **Cuadra** si coinciden. **Detecta:** histórico mezclado con el periodo.
- **Detalle:** redenciones no conciliadas.

## Semáforo / tolerancia
- **✅ cuadra:** diferencia ≤ tolerancia. **⚠️ no cuadra:** muestra diferencia + detalle.
- Tolerancia: **$1** en montos (redondeo), **0** en conteos y puntos.

## Fuentes de datos
- **Siigo:** `/v1/invoices` (FV-4 estándar + FV-2 `document_id=30537`), `/v1/credit-notes`, `/v1/customers`.
- **Dashboard:** webhook `get-ventas`.
- **Supabase:** `puntos_log`.
- **GHL:** contacts (histórico/saldo), workflows de puntos/redención.

## Decisiones confirmadas
1. **POS vs Web (C1):** se distingue por la **serie / tipo de documento** de la factura
   (serie de WooCommerce = Web; el resto = POS). Solo afecta el desglose informativo de C1.
2. **C6 redimidos:** el lado B usa **la misma fuente/lógica que el dashboard ya usa** para el
   KPI "Redimidos".

## Método de entrega
Local primero: prototipo/validación con Node → revisar cifras contigo → montar
`get-conciliacion` (n8n) → panel frontend (2 copias espejo) → subir a GitHub Pages.
