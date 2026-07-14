# Arquitectura

## Webhooks (n8n → dashboard)

| Endpoint | Workflow | Devuelve |
|---|---|---|
| `GET /webhook/get-ventas?date_start&date_end` | dashboard-ventas-siigo | Ventas B2C/B2B/Export, categorías, productos, cartera, pivots |
| `GET /webhook/get-logs` | get-logs | Log de puntos (suma/redención) |
| `GET /webhook/get-surveys` | get-surveys | Respuestas de encuestas GHL |
| `GET /webhook/get-all-contacts`, `get-stats` | (otros) | Contactos y puntos GHL |

## Centros de costo Siigo (clasificación de ventas)

- **166** = B2B · **168** = B2C · **315** = Exportación · 170 = Planta · 172 = Administrativo.
- Override: facturas de 168 que son empresa (NIT / nombre) se cuentan como B2B.
- **Todos los montos = subtotal sin IVA** (suma de `precio × cantidad` por ítem).
- Genéricos `222222222222` / `7777777777777` (Consumidor Final) cuentan en ventas B2C pero se
  excluyen del programa de puntos.

## Caché y rendimiento

- El histórico (meses cerrados) se lee de archivos; solo el **mes actual** se pide en vivo a Siigo.
- El payload calculado se guarda en `staticData.ventasCache` (TTL 60 min).
- `ventas-pre-warm` (cada 20 min) recalcula en segundo plano → el usuario recibe respuesta
  cacheada (~0.5s) en vez de esperar el cálculo pesado (~30-60s).

## Cierre mensual

`ventas-cierre-mensual` (Schedule, día 1 · 03:00): baja el mes recién cerrado desde Siigo, lo
reduce y lo escribe en `/root/.n8n-files/chuculat_ventas_hist_part_YYYYMM.json`. El workflow de
dashboard lee todos los `chuculat_ventas_hist_part*.json` con wildcard, así que el nuevo mes entra
automáticamente y deja de pedirse en vivo.
