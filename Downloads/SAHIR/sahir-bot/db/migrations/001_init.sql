-- Paso 2: clientes, sesiones de conversación, mensajes ya procesados y preguntas sin respuesta.

CREATE TABLE customers (
  id            BIGSERIAL PRIMARY KEY,
  phone         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL DEFAULT '',
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  phone      TEXT PRIMARY KEY,
  flow       TEXT,
  step       TEXT,
  data       JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Evita procesar dos veces un mensaje que Meta reenvía.
CREATE TABLE processed_messages (
  id          TEXT PRIMARY KEY,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX processed_messages_received_at_idx ON processed_messages (received_at);

-- Alimenta la base de conocimiento: lo que el bot no supo responder.
CREATE TABLE unanswered_questions (
  id                 BIGSERIAL PRIMARY KEY,
  customer_phone     TEXT NOT NULL,
  question           TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'nueva' CHECK (status IN ('nueva', 'resuelta', 'descartada')),
  knowledge_entry_id BIGINT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX unanswered_questions_status_idx ON unanswered_questions (status, created_at DESC);
