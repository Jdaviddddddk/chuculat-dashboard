# Chuculat · Dashboard de Fidelización y Ventas

Panel de control para Chuculat (cacao criollo): programa de puntos B2C + reportes de ventas (B2C / B2B / Exportación) con datos de **Siigo** y **GoHighLevel**, orquestado en **n8n**.

## Estructura del repositorio

```
/frontend      → Dashboard web (HTML/JS/Chart.js). Un solo archivo autocontenido.
    index.html
/backend       → Automatizaciones n8n (SANITIZADAS, sin secretos)
    /workflows  → Exports JSON de cada workflow n8n
    /code       → Nodos de código clave en .js legible (compute_stats.js)
/data          → Snapshot de la base histórica (meses cerrados)
    ventas_historico_hasta_2026-06-30.json
/docs          → Documentación de arquitectura y lógica de negocio
```

## Arquitectura en una línea

Siigo (facturación) → n8n (orquestación + caché) → webhooks → Dashboard. GoHighLevel guarda contactos, puntos y encuestas. Ver [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).

## Bases de datos (dónde vive la información)

- **Meses cerrados** (histórico, hasta el último mes cerrado): archivos en el servidor n8n
  `/root/.n8n-files/chuculat_ventas_hist_part*.json`. Un snapshot está en `/data`.
- **Mes actual**: se consulta **en vivo** a Siigo en cada cálculo.
- **Cierre mensual**: el 1° de cada mes, el workflow `ventas-cierre-mensual` baja el mes recién
  cerrado y lo agrega como un nuevo archivo-parte. Así el histórico crece y solo el mes en curso
  es "en vivo".
- **Log de puntos**: `/root/.n8n-files/chuculat_activity_log.json`.

## Secretos (NO están en el repo)

Los tokens viven solo en n8n. Para reconstruir, define en n8n:
`GHL_PRIVATE_TOKEN`, `SIIGO_USERNAME`, `SIIGO_ACCESS_KEY`, `N8N_API_KEY`. Ver `.env.example`.
Los JSON de `/backend/workflows` tienen esos valores reemplazados por placeholders `<...>`.

## Cómo desplegar el frontend

`frontend/index.html` es autocontenido. Se pega en un bloque HTML de GHL o se sirve estático.
Consume los webhooks públicos del n8n (ver ARQUITECTURA).
