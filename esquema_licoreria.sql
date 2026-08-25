-- =====================================================================
--  SISTEMA DE INVENTARIO Y VENTAS PARA LICORERÍA
--  Esquema relacional — PostgreSQL 15+
--  Autor: propuesta de arquitectura · Agosto 2026
--
--  PRINCIPIOS DE DISEÑO
--  1. El stock SIEMPRE se guarda en UNIDAD BASE (1 botella / 1 lata).
--     Cajas, packs y tragos son PRESENTACIONES con un factor de conversión.
--  2. La tabla `movimientos_inventario` (kardex) es APPEND-ONLY y es la
--     única fuente de verdad. `existencias` es una proyección cacheada.
--  3. Todo PK es UUID generado en el cliente => idempotencia offline.
--  4. Precios NUNCA se guardan en el producto: viven en listas con vigencia.
-- =====================================================================

create extension if not exists "pgcrypto";

-- =====================================================================
-- 1. ORGANIZACIÓN, UBICACIONES Y SEGURIDAD
-- =====================================================================

create table sucursales (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  rif         text,
  direccion   text,
  activo      boolean not null default true
);

-- Depósito, sala/anaquel, NEVERA (producto frío), barra, tránsito.
-- Separar la nevera como ubicación es lo que permite cobrar "frío" distinto
-- de "al tiempo" SIN duplicar el producto en el catálogo.
create table ubicaciones (
  id            uuid primary key default gen_random_uuid(),
  sucursal_id   uuid not null references sucursales(id),
  nombre        text not null,
  tipo          text not null check (tipo in ('deposito','sala','refrigerado','barra','transito')),
  refrigerado   boolean not null default false,
  permite_venta boolean not null default true,
  unique (sucursal_id, nombre)
);

create table roles (
  id     serial primary key,
  nombre text unique not null            -- admin, gerente, cajero, almacenista, auditor
);

create table permisos (
  id          serial primary key,
  clave       text unique not null,      -- venta.anular, precio.editar, merma.autorizar, ...
  descripcion text
);

create table rol_permisos (
  rol_id     int not null references roles(id) on delete cascade,
  permiso_id int not null references permisos(id) on delete cascade,
  primary key (rol_id, permiso_id)
);

create table usuarios (
  id          uuid primary key,          -- = auth.users.id del proveedor de identidad
  email       text unique not null,
  nombre      text not null,
  rol_id      int  not null references roles(id),
  sucursal_id uuid references sucursales(id),
  pin_hash    text,                      -- PIN corto para autorizar en caja sin re-login
  activo      boolean not null default true,
  creado_en   timestamptz not null default now()
);

create table auditoria (
  id          bigserial primary key,
  tabla       text not null,
  registro_id text not null,
  accion      text not null check (accion in ('INSERT','UPDATE','DELETE')),
  usuario_id  uuid references usuarios(id),
  antes       jsonb,
  despues     jsonb,
  fecha       timestamptz not null default now()
);
create index ix_auditoria_tabla_fecha on auditoria (tabla, fecha desc);

-- =====================================================================
-- 2. CATÁLOGO — producto, presentaciones y códigos de barras
-- =====================================================================

create table categorias (
  id        uuid primary key default gen_random_uuid(),
  nombre    text not null,               -- Ron, Whisky, Cerveza, Vino, Snacks, Hielo
  parent_id uuid references categorias(id),
  orden     int not null default 999
);

create table marcas (
  id     uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  pais   text
);

create table impuestos (
  id     serial primary key,
  nombre text not null,                  -- IVA 16%, Exento, IGTF 3%
  tasa   numeric(5,4) not null,          -- 0.1600
  tipo   text not null check (tipo in ('iva','igtf','exento'))
);

create table tipos_envase (
  id       uuid primary key default gen_random_uuid(),
  nombre   text not null unique,         -- Casco cerveza 222ml, Retornable 1.25L
  deposito numeric(14,4) not null default 0   -- valor del casco si no lo devuelven
);

create table productos (
  id                   uuid primary key default gen_random_uuid(),
  sku                  text unique not null,
  nombre               text not null,
  categoria_id         uuid not null references categorias(id),
  marca_id             uuid references marcas(id),
  contenido_ml         integer,               -- 750, 1000, 355
  grado_alcohol        numeric(4,2),          -- 40.00
  impuesto_id          int  not null references impuestos(id),
  unidad_base          text not null default 'botella',
  controla_lote        boolean not null default false,
  controla_vencimiento boolean not null default false,
  fraccionable         boolean not null default false,   -- se sirve por trago/copa
  ml_por_servicio      integer,                          -- 45 ml
  retornable           boolean not null default false,
  tipo_envase_id       uuid references tipos_envase(id),
  stock_min            numeric(14,3) not null default 0,
  stock_max            numeric(14,3),
  costo_promedio       numeric(14,4) not null default 0, -- costo promedio ponderado
  activo               boolean not null default true,
  creado_en            timestamptz not null default now()
);
create index ix_productos_nombre on productos using gin (to_tsvector('spanish', nombre));

-- ---------------------------------------------------------------------
-- PIEZA CLAVE DEL SISTEMA: la conversión caja <-> unidad <-> trago.
-- `factor` expresa cuántas UNIDADES BASE representa la presentación.
--   Botella .......... 1
--   Six-pack ......... 6
--   Caja x24 ......... 24
--   Trago 45ml ....... 0.060000   (45 / 750)
-- Nunca se "desglosa" una caja: entra como 24 unidades base y se vende
-- como 1, 6 o 24. El desglose es aritmética, no un movimiento de stock.
-- ---------------------------------------------------------------------
create table presentaciones (
  id              uuid primary key default gen_random_uuid(),
  producto_id     uuid not null references productos(id) on delete cascade,
  nombre          text not null,
  factor          numeric(14,6) not null check (factor > 0),
  es_base         boolean not null default false,
  permite_venta   boolean not null default true,
  permite_compra  boolean not null default false,
  activo          boolean not null default true,
  unique (producto_id, nombre)
);
-- Exactamente una presentación base por producto
create unique index ux_presentacion_base on presentaciones (producto_id) where es_base;

-- Un producto tiene varios códigos: EAN-13 de la botella, DUN-14 de la caja,
-- código interno impreso. Cada código apunta a UNA presentación.
create table codigos_barras (
  codigo          text primary key,
  presentacion_id uuid not null references presentaciones(id) on delete cascade,
  tipo            text not null default 'EAN13' check (tipo in ('EAN13','EAN8','UPC','DUN14','interno'))
);

-- =====================================================================
-- 3. PRECIOS — listas, vigencias, promociones y multimoneda
-- =====================================================================

create table monedas (
  codigo    text primary key,            -- USD, VES, COP
  nombre    text not null,
  decimales int not null default 2
);

create table tasas_cambio (
  id     bigserial primary key,
  moneda text not null references monedas(codigo),
  fecha  date not null,
  tasa   numeric(18,6) not null,
  fuente text not null default 'manual', -- BCV, paralelo, manual
  unique (moneda, fecha, fuente)
);

-- Detal, Mayor (>= N unidades), Frío (ligada a la nevera), Delivery, Empleado
create table listas_precio (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null,
  moneda       text not null references monedas(codigo) default 'USD',
  prioridad    int  not null default 100,     -- menor número gana
  cantidad_min numeric(14,3),                 -- se activa desde N unidades base
  ubicacion_id uuid references ubicaciones(id), -- lista "Frío" -> ubicación nevera
  tipo_cliente text check (tipo_cliente in ('detal','mayor')),
  activo       boolean not null default true
);

create table precios (
  id              uuid primary key default gen_random_uuid(),
  lista_id        uuid not null references listas_precio(id) on delete cascade,
  presentacion_id uuid not null references presentaciones(id) on delete cascade,
  precio          numeric(14,4) not null check (precio >= 0),
  vigente_desde   timestamptz not null default now(),
  vigente_hasta   timestamptz,
  unique (lista_id, presentacion_id, vigente_desde)
);
create index ix_precios_lookup on precios (presentacion_id, vigente_desde desc);

-- Happy hour, 2x1, combos, descuento por categoría
create table promociones (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  tipo          text not null check (tipo in ('descuento_pct','descuento_monto','precio_fijo','n_x_m','combo')),
  valor         numeric(14,4),
  dias_semana   int[],                   -- {4,5,6} = jue/vie/sáb
  hora_inicio   time,
  hora_fin      time,
  vigente_desde date,
  vigente_hasta date,
  prioridad     int not null default 100,
  acumulable    boolean not null default false,
  activo        boolean not null default true
);

create table promocion_items (
  id              uuid primary key default gen_random_uuid(),
  promocion_id    uuid not null references promociones(id) on delete cascade,
  presentacion_id uuid references presentaciones(id),
  categoria_id    uuid references categorias(id),
  cantidad_req    numeric(14,3) not null default 1,   -- el "n" de n x m
  cantidad_bonif  numeric(14,3) not null default 0,   -- el "m" de n x m
  check (presentacion_id is not null or categoria_id is not null)
);

-- =====================================================================
-- 4. INVENTARIO — lotes, existencias, kardex, mermas y conteos
-- =====================================================================

create table proveedores (
  id             uuid primary key default gen_random_uuid(),
  razon_social   text not null,
  rif            text unique,
  contacto       text,
  telefono       text,
  email          text,
  condicion_pago text check (condicion_pago in ('contado','credito')),
  dias_credito   int not null default 0,
  activo         boolean not null default true
);

create table lotes (
  id                 uuid primary key default gen_random_uuid(),
  producto_id        uuid not null references productos(id),
  codigo             text not null,
  fecha_vencimiento  date,
  costo_unitario     numeric(14,4) not null default 0,
  proveedor_id       uuid references proveedores(id),
  recibido_en        timestamptz not null default now(),
  unique (producto_id, codigo)
);
create index ix_lotes_venc on lotes (fecha_vencimiento) where fecha_vencimiento is not null;

-- Proyección del kardex. Se reconstruye con un SUM sobre movimientos.
create table existencias (
  id              uuid primary key default gen_random_uuid(),
  producto_id     uuid not null references productos(id),
  ubicacion_id    uuid not null references ubicaciones(id),
  lote_id         uuid references lotes(id),
  cantidad_base   numeric(14,3) not null default 0,
  reservado       numeric(14,3) not null default 0,
  actualizado_en  timestamptz not null default now()
);
create unique index ux_existencia on existencias
  (producto_id, ubicacion_id, coalesce(lote_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ---------------------------------------------------------------------
-- KARDEX: append-only, nunca se actualiza ni se borra. Toda corrección
-- es un movimiento nuevo. cantidad_base lleva signo (+ entra / - sale).
-- ---------------------------------------------------------------------
create table movimientos_inventario (
  id                    uuid primary key default gen_random_uuid(),
  fecha                 timestamptz not null default now(),
  tipo                  text not null check (tipo in (
                          'compra','venta','devolucion_cliente','devolucion_proveedor',
                          'merma','traslado','ajuste','apertura_botella','obsequio','conteo')),
  producto_id           uuid not null references productos(id),
  presentacion_id       uuid references presentaciones(id),
  cantidad_presentacion numeric(14,3) not null,
  cantidad_base         numeric(14,3) not null,
  ubicacion_id          uuid not null references ubicaciones(id),
  ubicacion_destino_id  uuid references ubicaciones(id),
  lote_id               uuid references lotes(id),
  costo_unitario        numeric(14,4),
  documento_tipo        text,           -- venta, recepcion, merma, conteo
  documento_id          uuid,
  usuario_id            uuid not null references usuarios(id),
  motivo                text
);
create index ix_mov_prod_fecha on movimientos_inventario (producto_id, fecha desc);
create index ix_mov_doc on movimientos_inventario (documento_tipo, documento_id);

create table mermas (
  id             uuid primary key default gen_random_uuid(),
  fecha          timestamptz not null default now(),
  tipo           text not null check (tipo in ('rotura','vencimiento','robo','autoconsumo','degustacion','deterioro','error_conteo')),
  producto_id    uuid not null references productos(id),
  lote_id        uuid references lotes(id),
  ubicacion_id   uuid not null references ubicaciones(id),
  cantidad_base  numeric(14,3) not null check (cantidad_base > 0),
  costo_total    numeric(14,4) not null default 0,
  usuario_id     uuid not null references usuarios(id),
  autorizado_por uuid references usuarios(id),
  evidencia_url  text,
  motivo         text
);

create table conteos (
  id           uuid primary key default gen_random_uuid(),
  ubicacion_id uuid not null references ubicaciones(id),
  fecha        timestamptz not null default now(),
  estado       text not null default 'abierto' check (estado in ('abierto','cerrado','anulado')),
  usuario_id   uuid not null references usuarios(id)
);

create table conteo_lineas (
  id               uuid primary key default gen_random_uuid(),
  conteo_id        uuid not null references conteos(id) on delete cascade,
  producto_id      uuid not null references productos(id),
  lote_id          uuid references lotes(id),
  cantidad_sistema numeric(14,3) not null,
  cantidad_contada numeric(14,3) not null,
  diferencia       numeric(14,3) generated always as (cantidad_contada - cantidad_sistema) stored
);

-- =====================================================================
-- 5. COMPRAS — órdenes y recepción de mercancía
-- =====================================================================

create table producto_proveedor (
  producto_id            uuid not null references productos(id) on delete cascade,
  proveedor_id           uuid not null references proveedores(id) on delete cascade,
  codigo_proveedor       text,
  presentacion_compra_id uuid references presentaciones(id),
  costo                  numeric(14,4),
  moneda                 text references monedas(codigo),
  lead_time_dias         int not null default 0,
  primary key (producto_id, proveedor_id)
);

create table ordenes_compra (
  id           uuid primary key default gen_random_uuid(),
  numero       bigserial,
  proveedor_id uuid not null references proveedores(id),
  fecha        date not null default current_date,
  estado       text not null default 'borrador' check (estado in ('borrador','enviada','parcial','recibida','anulada')),
  moneda       text not null references monedas(codigo),
  tasa_cambio  numeric(18,6) not null default 1,
  total        numeric(14,4) not null default 0,
  usuario_id   uuid not null references usuarios(id)
);

create table orden_compra_lineas (
  id                 uuid primary key default gen_random_uuid(),
  orden_id           uuid not null references ordenes_compra(id) on delete cascade,
  producto_id        uuid not null references productos(id),
  presentacion_id    uuid not null references presentaciones(id),
  cantidad           numeric(14,3) not null,
  costo_unitario     numeric(14,4) not null,
  cantidad_recibida  numeric(14,3) not null default 0
);

create table recepciones (
  id           uuid primary key default gen_random_uuid(),
  numero       bigserial,
  orden_id     uuid references ordenes_compra(id),
  proveedor_id uuid not null references proveedores(id),
  fecha        timestamptz not null default now(),
  factura_nro  text,
  moneda       text not null references monedas(codigo),
  tasa_cambio  numeric(18,6) not null default 1,
  subtotal     numeric(14,4) not null default 0,
  impuesto     numeric(14,4) not null default 0,
  flete        numeric(14,4) not null default 0,   -- se prorratea al costo
  total        numeric(14,4) not null default 0,
  ubicacion_id uuid not null references ubicaciones(id),
  usuario_id   uuid not null references usuarios(id),
  estado       text not null default 'borrador' check (estado in ('borrador','confirmada','anulada'))
);

create table recepcion_lineas (
  id                    uuid primary key default gen_random_uuid(),
  recepcion_id          uuid not null references recepciones(id) on delete cascade,
  producto_id           uuid not null references productos(id),
  presentacion_id       uuid not null references presentaciones(id),  -- normalmente "Caja x24"
  cantidad_presentacion numeric(14,3) not null,                       -- 10 cajas
  cantidad_base         numeric(14,3) not null,                       -- 240 botellas
  costo_presentacion    numeric(14,4) not null,                       -- costo de la caja
  costo_unitario        numeric(14,4) not null,                       -- costo/botella (derivado + flete)
  lote_id               uuid references lotes(id),
  fecha_vencimiento     date
);

-- =====================================================================
-- 6. VENTAS — turno de caja, documento, pago mixto y envases
-- =====================================================================

create table clientes (
  id               uuid primary key default gen_random_uuid(),
  tipo_documento   text check (tipo_documento in ('V','E','J','G','P')),
  documento        text,
  nombre           text not null,
  telefono         text,
  tipo             text not null default 'detal' check (tipo in ('detal','mayor')),
  lista_precio_id  uuid references listas_precio(id),
  limite_credito   numeric(14,4) not null default 0,
  saldo            numeric(14,4) not null default 0,
  activo           boolean not null default true,
  unique (tipo_documento, documento)
);

create table cajas (
  id          uuid primary key default gen_random_uuid(),
  sucursal_id uuid not null references sucursales(id),
  nombre      text not null,
  activo      boolean not null default true
);

create table turnos_caja (
  id            uuid primary key default gen_random_uuid(),
  caja_id       uuid not null references cajas(id),
  usuario_id    uuid not null references usuarios(id),
  abierto_en    timestamptz not null default now(),
  cerrado_en    timestamptz,
  fondo_inicial jsonb not null default '{}',  -- {"USD":50,"VES":2000}
  arqueo_final  jsonb,
  estado        text not null default 'abierto' check (estado in ('abierto','cerrado'))
);
create unique index ux_turno_abierto on turnos_caja (caja_id) where estado = 'abierto';

create table metodos_pago (
  id                  serial primary key,
  nombre              text not null,       -- Efectivo USD, Efectivo Bs, Pago Móvil, Punto, Zelle, Crédito
  moneda              text not null references monedas(codigo),
  aplica_igtf         boolean not null default false,
  requiere_referencia boolean not null default false,
  afecta_arqueo       boolean not null default true,
  activo              boolean not null default true
);

create table ventas (
  id               uuid primary key,       -- generado en el CLIENTE => idempotencia offline
  numero           bigint,                 -- correlativo asignado al sincronizar
  turno_id         uuid not null references turnos_caja(id),
  cliente_id       uuid references clientes(id),
  fecha            timestamptz not null,
  moneda           text not null references monedas(codigo) default 'USD',
  tasa_cambio      numeric(18,6) not null,
  subtotal         numeric(14,4) not null,
  descuento        numeric(14,4) not null default 0,
  iva              numeric(14,4) not null default 0,
  igtf             numeric(14,4) not null default 0,
  total            numeric(14,4) not null,
  costo_total      numeric(14,4) not null default 0,   -- para margen inmediato
  estado           text not null default 'pagada' check (estado in ('borrador','pagada','credito','anulada')),
  usuario_id       uuid not null references usuarios(id),
  creada_offline   boolean not null default false,
  sincronizada_en  timestamptz
);
create index ix_ventas_fecha on ventas (fecha desc);
create index ix_ventas_turno on ventas (turno_id);

create table venta_lineas (
  id              uuid primary key,
  venta_id        uuid not null references ventas(id) on delete cascade,
  producto_id     uuid not null references productos(id),
  presentacion_id uuid not null references presentaciones(id),
  lote_id         uuid references lotes(id),
  ubicacion_id    uuid not null references ubicaciones(id),   -- de dónde salió (nevera vs sala)
  cantidad        numeric(14,3) not null,        -- 2 (cajas)
  cantidad_base   numeric(14,3) not null,        -- 48 (botellas)
  precio_unitario numeric(14,4) not null,
  descuento       numeric(14,4) not null default 0,
  lista_precio_id uuid references listas_precio(id),
  promocion_id    uuid references promociones(id),
  impuesto_pct    numeric(5,4) not null default 0,
  importe         numeric(14,4) not null,
  costo_unitario  numeric(14,4) not null default 0
);

-- N filas por venta = pago mixto (mitad efectivo USD, mitad pago móvil Bs)
create table pagos_venta (
  id               uuid primary key,
  venta_id         uuid not null references ventas(id) on delete cascade,
  metodo_pago_id   int  not null references metodos_pago(id),
  moneda           text not null references monedas(codigo),
  monto            numeric(14,4) not null,
  tasa_cambio      numeric(18,6) not null default 1,
  monto_referencia numeric(14,4) not null,   -- convertido a moneda base del sistema
  referencia       text,                     -- últimos dígitos del pago móvil / lote del punto
  vuelto           numeric(14,4) not null default 0
);

-- Cascos y envases retornables por cliente
create table movimientos_envase (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid references clientes(id),
  tipo_envase_id uuid not null references tipos_envase(id),
  venta_id       uuid references ventas(id),
  cantidad       int not null,
  tipo           text not null check (tipo in ('entregado','devuelto')),
  fecha          timestamptz not null default now()
);

-- =====================================================================
-- 7. VISTAS Y FUNCIONES DE APOYO
-- =====================================================================

-- Stock consolidado por producto, con desglose sala / nevera
create view v_stock as
select p.id                       as producto_id,
       p.sku,
       p.nombre,
       sum(e.cantidad_base)                                               as total_base,
       sum(e.cantidad_base) filter (where u.refrigerado)                  as frio,
       sum(e.cantidad_base) filter (where not u.refrigerado)              as al_tiempo,
       p.stock_min,
       (sum(e.cantidad_base) <= p.stock_min)                              as bajo_minimo
from productos p
join existencias e on e.producto_id = p.id
join ubicaciones u on u.id = e.ubicacion_id
where p.activo
group by p.id;

-- Traduce el stock base a lenguaje de almacén:
-- 306 botellas = 8 cajas + 3 six-packs + 0 sueltas
create function desglosar(p_producto uuid, p_cantidad_base numeric)
returns table (presentacion text, cantidad numeric) language plpgsql stable as $$
declare
  r     record;
  resto numeric := p_cantidad_base;
begin
  for r in
    select nombre, factor from presentaciones
    where producto_id = p_producto and activo and factor >= 1
    order by factor desc
  loop
    presentacion := r.nombre;
    cantidad     := floor(resto / r.factor);
    resto        := resto - cantidad * r.factor;
    return next;
  end loop;
end;
$$;

-- Resolución de precio: gana la lista de menor `prioridad` que cumpla
-- ubicación, tipo de cliente y cantidad mínima, con vigencia activa.
create function resolver_precio(
  p_presentacion uuid,
  p_cantidad_base numeric,
  p_ubicacion uuid,
  p_cliente uuid default null,
  p_momento timestamptz default now()
) returns numeric language sql stable as $$
  select pr.precio
  from precios pr
  join listas_precio l on l.id = pr.lista_id
  left join clientes c on c.id = p_cliente
  where pr.presentacion_id = p_presentacion
    and l.activo
    and pr.vigente_desde <= p_momento
    and (pr.vigente_hasta is null or pr.vigente_hasta > p_momento)
    and (l.cantidad_min is null or p_cantidad_base >= l.cantidad_min)
    and (l.ubicacion_id is null or l.ubicacion_id = p_ubicacion)
    and (l.tipo_cliente is null or l.tipo_cliente = coalesce(c.tipo,'detal'))
  order by l.prioridad asc, pr.vigente_desde desc
  limit 1;
$$;

-- =====================================================================
-- 8. DATOS SEMILLA MÍNIMOS
-- =====================================================================

insert into monedas (codigo, nombre) values
  ('USD','Dólar'), ('VES','Bolívar'), ('COP','Peso colombiano');

insert into impuestos (nombre, tasa, tipo) values
  ('IVA 16%', 0.1600, 'iva'),
  ('Exento',  0.0000, 'exento'),
  ('IGTF 3%', 0.0300, 'igtf');

insert into roles (nombre) values
  ('admin'), ('gerente'), ('cajero'), ('almacenista'), ('auditor');

insert into metodos_pago (nombre, moneda, aplica_igtf, requiere_referencia) values
  ('Efectivo USD','USD', true,  false),
  ('Efectivo Bs', 'VES', false, false),
  ('Pago Móvil',  'VES', false, true),
  ('Punto de venta','VES', false, true),
  ('Zelle',       'USD', true,  true),
  ('Crédito',     'USD', false, false);
