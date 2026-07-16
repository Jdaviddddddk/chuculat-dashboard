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
    items         jsonb                         -- [{code,description,price,quantity,taxes}]
);
create index if not exists ventas_fecha_idx  on public.ventas_invoices (fecha);
create index if not exists ventas_cc_idx     on public.ventas_invoices (cost_center);
create index if not exists ventas_cust_idx   on public.ventas_invoices (cust_id);
