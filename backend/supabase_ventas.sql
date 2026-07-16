-- Tabla de facturas para el dashboard de ventas (todo en Supabase)
create table if not exists public.ventas_invoices (
    id            text primary key,           -- id de Siigo
    name          text,                        -- FV-x-xxxx
    fecha         date,
    created       timestamptz,
    cost_center   integer,                     -- 166 B2B, 168 B2C, 315 Export, etc.
    total         numeric,                     -- con impuestos
    subtotal      numeric,                     -- sin IVA (suma items price*qty)
    balance       numeric,                     -- saldo cartera
    stamp_status  text,
    cust_id       text,
    cust_name     text,
    items         jsonb,                        -- [{code,description,price,quantity,taxes}] (LOSSY: sin discount)
    raw           jsonb                         -- factura Siigo COMPLETA. Es la que usa el dashboard:
                                                -- preserva customer.identification (clasificacion B2B/B2C),
                                                -- items[].discount y currency. Las columnas de arriba
                                                -- quedan para consultas ad-hoc.
);
create index if not exists ventas_fecha_idx  on public.ventas_invoices (fecha);
create index if not exists ventas_cc_idx     on public.ventas_invoices (cost_center);
create index if not exists ventas_cust_idx   on public.ventas_invoices (cust_id);

-- Columna raw agregada despues (jul 2026): el backfill original era lossy.
alter table public.ventas_invoices add column if not exists raw jsonb;

-- ventas_fecha_idx sostiene el filtro por rango de Parse Hist:
--   GET /rest/v1/ventas_invoices?select=raw&fecha=gte.X&fecha=lte.Y
