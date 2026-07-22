-- CARTERA ANTERIOR A JUNIO-2025 (deuda "legacy")
--
-- POR QUE EXISTE ESTA TABLA:
-- La API de Siigo tiene un PISO DURO: /v1/invoices devuelve 10.701 facturas y la
-- mas antigua es del 2025-06-03, sin importar el filtro de fechas (probado hasta
-- date_start=2020). Toda la deuda anterior a esa fecha aparece en el reporte de
-- cartera de Siigo pero NO se puede traer por API.
--
-- Ejemplos verificados (21-jul-2026):
--   GRUPO BIZ COLOMBIA (900103545): Siigo $12.017.571,66 = $11.692.913,80 viejo
--     (invisible por API) + $324.657,86 que si trae la API.
--   AZIMOS SAS (900274382): $299.250 y CERO facturas en la API.
--   BIRKSHOPPER SAS (901831558): saldo A FAVOR de -$730.000 (no es una factura).
-- Total del hueco: ~$16,5M ($50.435.018 por API vs $66.970.592,22 en Siigo).
--
-- COMO SE LLENA: a mano, desde la exportacion a Excel del reporte de cartera de
-- Siigo (boton de Excel arriba a la derecha). El script `cargar_cartera_legacy.py`
-- toma ese archivo, le RESTA lo que ya trae la API por cliente (para no contar
-- doble) y deja aqui solo el remanente viejo.
--
-- MANTENIMIENTO: esta parte solo cambia cuando esos clientes paguen su deuda
-- vieja. Cuando pase, volver a exportar de Siigo y recargar.
create table if not exists public.cartera_legacy (
    nit            text primary key,
    cliente        text,
    saldo_cop      numeric not null default 0,  -- puede ser NEGATIVO (saldo a favor)
    bucket         text,                        -- >180 | >120 | >90 | >31 | por_vencer | saldo_favor
    fecha_corte    date,                        -- fecha del reporte de Siigo del que salio
    nota           text,
    actualizado_en timestamptz default now()
);

-- Resumen combinado: cartera viva (API) + cartera vieja (este archivo).
create or replace function public.cartera_resumen_total()
returns table(total_deuda numeric, total_vivo numeric, total_legacy numeric,
              facturas bigint, clientes_legacy bigint)
language sql stable as $$
  select
    coalesce((select sum(saldo_cop) from public.cartera),0)
      + coalesce((select sum(saldo_cop) from public.cartera_legacy),0),
    coalesce((select sum(saldo_cop) from public.cartera),0),
    coalesce((select sum(saldo_cop) from public.cartera_legacy),0),
    (select count(*) from public.cartera),
    (select count(*) from public.cartera_legacy);
$$;
