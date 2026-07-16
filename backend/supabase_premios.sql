-- Catálogo de premios del programa de puntos.
-- Lo lee el webhook n8n `get-premios` (workflow GriVDvrNIY6RGDx1), que a su vez
-- alimenta el sitio de redención. Así no hay llaves de Supabase en el frontend.
--
-- Para agregar/cambiar un premio basta con insertar o editar su fila: no hay que
-- tocar el workflow ni el HTML.
create table if not exists public.premios_puntos (
    sku        text primary key,   -- código del producto en Siigo
    nombre     text not null,      -- nombre tal como está en Siigo
    precio_cop numeric not null,   -- precio real del premio (del esquema de puntos)
    puntos     integer not null,   -- cuesta ~0,7% del precio (ej. $15.000 -> 105 pts)
    imagen     text,
    activo     boolean not null default true,
    orden      integer
);

-- Detalle de lo redimido en cada log de redención:
--   [{sku, nombre, puntos, precio_cop, qty}]
-- Lo manda el sitio de redención -> redeem-points (nodo `Log: Preparar Entrada`)
-- -> get-logs (nodo `Mapear`) -> tabla "Compras con puntos" del dashboard B2C.
-- Las redenciones anteriores al carrito tienen items = null.
alter table public.puntos_log add column if not exists items jsonb;

-- NOTA sobre el catálogo: el esquema de premios en PDF trae "tarjetas" que en
-- realidad son grupos de elección (una tarjeta = varios SKU). En la tabla van
-- DESGLOSADAS por variante, para poder registrar el SKU real que se llevó el
-- cliente. Ejemplos:
--   Bebidas $13.000 / 91 pts -> 652 Caliente, 653 Frío, 591 Chai, 589 Leche Dorada
--   Bombones $4.000 / 28 pts -> 185, 189, 513, 514, 515
--   Trilogía Amazónica       -> 369 Copoazú, 358 Açaí, 359 Sacha Inchi
