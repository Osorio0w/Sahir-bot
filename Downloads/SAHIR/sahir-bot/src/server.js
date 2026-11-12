const express = require('express');
const config = require('./config');
const log = require('./utils/logger');
const store = require('./store');
const webhook = require('./whatsapp/webhook');

const app = express();

// Guardamos el body crudo: hace falta para validar la firma de Meta.
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));

app.use(webhook);
app.use('/admin', require('./admin/routes'));
app.get('/', (_req, res) => res.send('Bot del restaurante activo'));
app.get('/health', (_req, res) => res.json({ ok: true }));

async function main() {
  config.checkConfig();
  try {
    await store.init(); // con PostgreSQL, aplica las migraciones pendientes
  } catch (err) {
    log.error('No se pudo iniciar la base de datos:', err.message);
    process.exit(1);
  }
  app.listen(config.port, () => log.info(`Servidor escuchando en el puerto ${config.port}`));
  setInterval(() => store.maintenance().catch((e) => log.error('Mantenimiento:', e.message)), 60 * 60 * 1000).unref();
}

if (require.main === module) main();

module.exports = app;
