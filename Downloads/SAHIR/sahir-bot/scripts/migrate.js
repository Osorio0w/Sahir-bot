// Aplica las migraciones sin arrancar el servidor: npm run migrate
const config = require('../src/config');
if (!config.database.url) {
  console.error('Falta DATABASE_URL en el .env.');
  process.exit(1);
}
const { runMigrations } = require('../src/store/migrate');
const { pool } = require('../src/store/db');
runMigrations()
  .then(() => console.log('Migraciones al día.'))
  .catch((e) => { console.error(e.message); process.exitCode = 1; })
  .finally(() => pool.end());
