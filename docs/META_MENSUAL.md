# Meta mensual con redistribución

## Meta anual
**$1.600.000.000** (subtotal sin IVA), repartida por mes según % de participación
(fuente: hoja `COMP VENTAS`, columna "% PAR"):

| Mes | % | Meta base |
|---|---|---|
| Enero | 6.30% | $100.8M |
| Febrero | 6.41% | $102.5M |
| Marzo | 7.55% | $120.8M |
| Abril | 6.37% | $101.9M |
| Mayo | 12.63% | $202.0M |
| Junio | 6.14% | $98.2M |
| Julio | 5.93% | $94.9M |
| Agosto | 6.41% | $102.5M |
| Septiembre | 8.95% | $143.2M |
| Octubre | 10.85% | $173.5M |
| Noviembre | 11.86% | $189.8M |
| Diciembre | 10.61% | $169.8M |

(los % suman 100%)

## Redistribución (proporcional a meses restantes)

Al cerrar un mes, el faltante frente a la meta anual se reparte entre los meses que aún no cierran,
proporcional a su % original:

```
faltanteAnual   = META_ANUAL − Σ(ventas reales de meses cerrados)
%abiertos        = Σ(%mes  para meses abiertos: actual + futuros)
metaAjustada(m)  = faltanteAnual × (%mes(m) / %abiertos)     // para meses abiertos
metaAjustada(m)  = %mes(m) × META_ANUAL                       // para meses cerrados (meta base)
cumplimiento(m)  = real(m) / metaAjustada(m)
```

Efecto: si los meses cerrados venden por debajo de su meta, el mes en curso y los siguientes ven su
meta **subir** (absorben el faltante). Si venden por encima, las metas restantes **bajan**.

La lógica está implementada en el **frontend** (`renderMeta()` en `frontend/index.html`), usando los
totales reales por mes que entrega `get-ventas`. No requiere recálculo en el backend.
