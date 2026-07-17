-- Tabla plana item-level para las TABLAS DINÁMICAS con cruce (Centro × Categoría × Producto × Mes)
create table if not exists public.ventas_items (
    id        bigint generated always as identity primary key,
    inv_id    text,
    fecha     date not null,
    canal     text not null,          -- B2C | B2B | Exportacion (centro de costo clasificado)
    categoria text not null,
    code      text,
    producto  text,
    subtotal  numeric not null default 0,   -- sin IVA (price*qty)
    qty       numeric not null default 0
);
create index if not exists vi_fecha on public.ventas_items(fecha);
create index if not exists vi_canal on public.ventas_items(canal);
create index if not exists vi_cat   on public.ventas_items(categoria);
create index if not exists vi_code  on public.ventas_items(code);

-- Opciones EN CASCADA: dado lo ya seleccionado (canales/categorias), devuelve las
-- categorías y productos que existen en ese cruce (para recortar las listas).
create or replace function public.ventas_opciones(
    p_canales    text[] default null,
    p_categorias text[] default null
) returns table(tipo text, valor text, label text)
language sql stable as $$
  select 'categoria'::text, categoria, categoria
    from public.ventas_items
   where (p_canales is null or canal = any(p_canales))
   group by categoria
  union all
  select 'producto'::text, code, max(producto)
    from public.ventas_items
   where (p_canales is null or canal = any(p_canales))
     and (p_categorias is null or categoria = any(p_categorias))
   group by code;
$$;

-- PIVOT: filas = dimensión "ver por", columnas = mes. Aplica los tres filtros (AND).
-- Devuelve formato largo (fila, extra, mes, subtotal, qty) — el frontend lo pivotea.
create or replace function public.ventas_pivot(
    p_ver_por    text   default 'categoria',   -- 'canal' | 'categoria' | 'producto'
    p_canales    text[] default null,
    p_categorias text[] default null,
    p_productos  text[] default null,
    p_meses      text[] default null            -- ['2026-01', '2026-02', ...]
) returns table(fila text, extra text, mes text, subtotal numeric, qty numeric)
language sql stable as $$
  select
    case p_ver_por when 'canal' then canal
                   when 'producto' then code
                   else categoria end,
    case p_ver_por when 'producto' then max(producto) else '' end,
    to_char(fecha,'YYYY-MM'),
    sum(subtotal), sum(qty)
  from public.ventas_items
  where (p_canales    is null or canal     = any(p_canales))
    and (p_categorias is null or categoria = any(p_categorias))
    and (p_productos  is null or code      = any(p_productos))
    and (p_meses      is null or to_char(fecha,'YYYY-MM') = any(p_meses))
  group by 1, 3;
$$;
