-- Paso 4: solicitudes de reserva. Nacen "pendiente"; las confirma el personal.
CREATE TABLE reservations (
  id               BIGSERIAL PRIMARY KEY,
  customer_phone   TEXT NOT NULL,
  customer_name    TEXT NOT NULL,
  reservation_date DATE NOT NULL,
  reservation_time TIME NOT NULL,
  party_size       INTEGER NOT NULL CHECK (party_size BETWEEN 1 AND 100),
  notes            TEXT NOT NULL DEFAULT '',
  status           TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'confirmada', 'rechazada', 'cancelada')),
  external_ref     TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX reservations_date_idx ON reservations (reservation_date, reservation_time);
CREATE INDEX reservations_status_idx ON reservations (status, created_at DESC);
