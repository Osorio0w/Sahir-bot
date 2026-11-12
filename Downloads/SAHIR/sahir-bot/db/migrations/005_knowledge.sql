-- Paso 7: respuestas guardadas por el personal (base de conocimiento propia).
CREATE TABLE knowledge_entries (
  id         BIGSERIAL PRIMARY KEY,
  category   TEXT NOT NULL DEFAULT '',
  answer     TEXT NOT NULL,
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Distintas formas de hacer la misma pregunta.
CREATE TABLE knowledge_variants (
  id       BIGSERIAL PRIMARY KEY,
  entry_id BIGINT NOT NULL REFERENCES knowledge_entries (id) ON DELETE CASCADE,
  text     TEXT NOT NULL
);
CREATE INDEX knowledge_variants_entry_idx ON knowledge_variants (entry_id);

-- Enlaza las preguntas sin respuesta (migración 001) con la respuesta que las resolvió.
ALTER TABLE unanswered_questions
  ADD CONSTRAINT unanswered_questions_entry_fk
  FOREIGN KEY (knowledge_entry_id) REFERENCES knowledge_entries (id) ON DELETE SET NULL;
