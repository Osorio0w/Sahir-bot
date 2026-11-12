/**
 * Fuente de datos del restaurante (SOLO LECTURA). Contrato:
 *   getCategories()            -> [{ id, name }]
 *   getItemsByCategory(id)     -> [{ id, name, description, price, currency, categoryId, available }]
 *   getItem(id)                -> item | null
 *   getOpeningHours()          -> { timezone?, weekly: [{ days: [0..6], open: 'HH:MM', close: 'HH:MM' }] } | null
 *   getInfo()                  -> { name, address, paymentMethods, ... }
 * Cuando llegue la documentación de la API, solo se escribe api.js para que cumpla este contrato.
 */
const config = require('../config');

module.exports = config.datasource.mode === 'api' ? require('./api') : require('./mock');
