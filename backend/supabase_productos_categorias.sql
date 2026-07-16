-- Categorías propias de producto para el dashboard de ventas.
--
-- POR QUÉ EXISTE: las categorías venían del `account_group` de Siigo, que es
-- demasiado grueso (mete BOMBONES y CHUNKS juntos en "Confecciones"). Esta
-- taxonomía es la de Chuculat y NO existe en la API de Siigo.
--
-- QUIÉN LA USA: el nodo `Build Product Map` del workflow `Dashboard Ventas
-- Siigo` (Ya8z4KTp9nTu4oOW) baja esta tabla y PISA la categoría de Siigo.
-- Lo que no esté aquí cae en "Sin categoría" (así se detecta un producto nuevo
-- sin clasificar apenas vende).
--
-- CÓMO MANTENERLA: se agregan/editan filas y listo, no hay que tocar el
-- workflow. OJO: `Build Product Map` cachea el mapa en staticData con TTL 1h,
-- así que un cambio tarda hasta una hora en verse. Para verlo ya, subir la
-- constante MAPS_V dentro de ese nodo (invalida el caché).
create table if not exists public.productos_categorias (
    code      text primary key,   -- código del producto en Siigo
    name      text,
    categoria text not null       -- MAYÚSCULAS: TABLETAS, BEBIDAS, COMBOS, MAQUILA...
);

-- Estado a 16-jul-2026: 218 productos, 23 categorías, "Sin categoría" en $0.
-- Categorías: AD, BASICO, BEBIDAS, BOMBONES, CH, CH DE MESA GR, CH DE MESA UND,
-- CHUNKS, COBERTURAS, COMBOS, CONFECCIONES, DERIVADOS CACAO, EXPERIENCIAS,
-- GRAGEAS GR, GRAGEAS UND, INNOVACIONES, MAQUILA, MERCH, OTRAS MARCAS, OTROS,
-- REPOSTERIA, SEL, TABLETAS.
