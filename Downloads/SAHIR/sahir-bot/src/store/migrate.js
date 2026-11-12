const fs = require('fs');
const path = require('path');
const { pool } = require('./db');
const log = require('../utils/logger');

const DIR = path.join(__dirname, '..', '..', 'db', 'migrations');

/** Aplica, en orden, los archivos .sql que aún no se hayan aplicado. */
async function runMigrations() {
  await pool.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())'
  );
  const done = new Set((await pool.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      log.info('Migración aplicada:', file);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Falló la migración ${file}: ${err.message}`);
    } finally {
      client.release();
    }
  }
}

module.exports = { runMigrations };
