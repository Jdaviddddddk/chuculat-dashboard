-- Tabla de registros de puntos (sumas y redenciones) — Chuculat
-- Reemplaza el archivo chuculat_activity_log.json (evita condición de carrera)
create table if not exists public.puntos_log (
    id           uuid primary key default gen_random_uuid(),
    created_at   timestamptz not null default now(),
    ext_id       text,                 -- id original del log en archivo (para dedup del backfill)
    "timestamp"  timestamptz,          -- momento del evento
    fecha        date not null,        -- YYYY-MM-DD
    tipo         text not null check (tipo in ('suma_puntos','redencion')),
    contact_id   text,
    contact_name text,
    phone        text,
    points       integer not null default 0,
    source       text,                 -- siigo | siigo_historico | siigo_recuperado | manual | redencion
    invoice_id   text,
    siigo_id     text
);

-- Índices para las consultas del dashboard
create index if not exists puntos_log_fecha_idx   on public.puntos_log (fecha);
create index if not exists puntos_log_tipo_idx    on public.puntos_log (tipo);
create index if not exists puntos_log_contact_idx on public.puntos_log (contact_id);

-- Evita duplicados del backfill si se corre dos veces
create unique index if not exists puntos_log_extid_uidx on public.puntos_log (ext_id) where ext_id is not null;

-- (Opcional) RLS: por ahora las escrituras/lecturas van vía n8n con service_role,
-- así que RLS puede quedar deshabilitado. Si más adelante el dashboard lee directo,
-- habilitar RLS + una policy de solo lectura para el anon key.
