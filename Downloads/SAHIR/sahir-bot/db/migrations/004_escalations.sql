-- Paso 6: cuando un cliente pide hablar con una persona.
CREATE TABLE escalations (
  id             BIGSERIAL PRIMARY KEY,
  customer_phone TEXT NOT NULL,
  customer_name  TEXT NOT NULL DEFAULT '',
  reason         TEXT NOT NULL DEFAULT '',
  context        TEXT NOT NULL DEFAULT '',      -- p. ej. su última pregunta sin respuesta
  staff_notified BOOLEAN NOT NULL DEFAULT false, -- si el aviso al personal llegó a enviarse
  status         TEXT NOT NULL DEFAULT 'abierto' CHECK (status IN ('abierto', 'atendido')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX escalations_status_idx ON escalations (status, created_at DESC);
