-- Paso 3: pedidos. Los precios se guardan en centavos (enteros) para evitar errores de redondeo.
-- Cada ítem guarda nombre y precio del momento de la compra, no solo el ID del plato.

CREATE TABLE orders (
  id             BIGSERIAL PRIMARY KEY,
  customer_phone TEXT NOT NULL,
  customer_name  TEXT NOT NULL,
  type           TEXT NOT NULL CHECK (type IN ('domicilio', 'retiro')),
  status         TEXT NOT NULL DEFAULT 'recibido'
                 CHECK (status IN ('recibido', 'confirmado', 'en_preparacion', 'listo', 'entregado', 'cancelado')),
  address        TEXT NOT NULL DEFAULT '',
  reference      TEXT NOT NULL DEFAULT '',
  notes          TEXT NOT NULL DEFAULT '',
  currency       TEXT NOT NULL DEFAULT 'USD',
  subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
  external_ref   TEXT,  -- para enlazar con el sistema del restaurante cuando se conozca
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX orders_status_idx ON orders (status, created_at DESC);
CREATE INDEX orders_customer_idx ON orders (customer_phone, created_at DESC);

CREATE TABLE order_items (
  id               BIGSERIAL PRIMARY KEY,
  order_id         BIGINT NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  external_item_id TEXT NOT NULL,
  name             TEXT NOT NULL,
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  quantity         INTEGER NOT NULL CHECK (quantity > 0)
);
CREATE INDEX order_items_order_idx ON order_items (order_id);
