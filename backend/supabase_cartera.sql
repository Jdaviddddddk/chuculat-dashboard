-- CARTERA (cuentas por cobrar) — foto viva de TODAS las facturas con saldo pendiente.
--
-- Por qué una tabla propia y no calcularla en get-ventas:
--   1. El `balance` que hay en `ventas_invoices.raw` es una FOTO del momento del backfill:
--      si el cliente paga después, nunca se actualiza -> cartera inflada.
--   2. La cartera NO es por periodo: es todo lo abierto a hoy (incluye deuda de 2025).
--      Barrer las ~10.6k facturas de Siigo toma minutos -> no cabe en un request del
--      dashboard, sí en un workflow programado que deja el resultado aquí.
--
-- La llena el workflow "CHUCULAT | Cartera" (borra todo e inserta) y la sirve
-- el webhook get-cartera.
create table if not exists public.cartera (
    numero         text primary key,          -- FV-2-1056
    inv_id         text,                      -- id Siigo
    fecha          date not null,             -- fecha de la factura
    cliente        text,
    nit            text,
    canal          text,                      -- b2b | b2c | export | otro (planta/admin)
    moneda         text default 'COP',
    total_cop      numeric not null default 0,-- total de la factura, en COP
    saldo_cop      numeric not null default 0,-- PENDIENTE en COP y CON IVA (= lo que se cobra)
    dias           int     not null default 0,-- días desde la fecha de factura
    bucket         text,                      -- >180 | >120 | >90 | >31 | por_vencer
    actualizado_en timestamptz default now()
);
create index if not exists cartera_bucket on public.cartera(bucket);
create index if not exists cartera_nit    on public.cartera(nit);
create index if not exists cartera_fecha  on public.cartera(fecha);

-- Resumen listo para el dashboard (evita traer las 43 filas solo para sumar).
create or replace function public.cartera_resumen()
returns table(total_deuda numeric, facturas bigint, clientes bigint,
              masde180 numeric, masde120 numeric, masde90 numeric,
              masde31 numeric, por_vencer numeric)
language sql stable as $$
  select
    coalesce(sum(saldo_cop),0),
    count(*),
    count(distinct nit),
    coalesce(sum(saldo_cop) filter (where bucket = '>180'),0),
    coalesce(sum(saldo_cop) filter (where bucket = '>120'),0),
    coalesce(sum(saldo_cop) filter (where bucket = '>90'),0),
    coalesce(sum(saldo_cop) filter (where bucket = '>31'),0),
    coalesce(sum(saldo_cop) filter (where bucket = 'por_vencer'),0)
  from public.cartera;
$$;

-- OJO (trampa de Siigo): en facturas en moneda extranjera, `total` viene en la
-- moneda original pero `balance` a veces viene en COP y a veces en la moneda
-- original. Regla aplicada por el workflow: si exchange_rate<>1 y balance<=total,
-- el balance está en moneda original -> se multiplica por la tasa; si no, ya es COP.
-- (Este era el bug que inflaba la cartera a $4.253 millones: se multiplicaba por
-- la tasa un balance que ya venía en pesos — FV-2-928 sola daba $4.217 millones.)
