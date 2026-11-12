// Conexión a PostgreSQL. Solo se carga cuando hay DATABASE_URL.
const { Pool } = require('pg');
const config = require('../config');
const log = require('../utils/logger');

const pool = new Pool({
  connectionString: config.database.url,
  // Muchos servicios en la nube exigen SSL. Con DATABASE_SSL=true no se verifica el certificado
  // (cómodo para empezar; para producción conviene configurarlo con el certificado del proveedor).
  ssl: config.database.ssl ? { rejectUnauthorized: false } : undefined,
  max: 10,
});
pool.on('error', (err) => log.error('Error en la conexión a la base de datos:', err.message));

module.exports = { pool };
