const { IDS } = require('../menus');
const log = require('../../utils/logger');

/** Ejecuta una consulta a los datos del restaurante; si falla, avisa al cliente y devuelve null. */
async function safe(ctx, fn) {
  try {
    return await fn();
  } catch (err) {
    log.error('Fallo al consultar los datos del restaurante:', err.message);
    await ctx.channel.sendButtons('No pude consultar el menú en este momento. ¿Qué prefieres?', [
      { id: IDS.HUMAN, title: 'Hablar con alguien' },
      { id: IDS.HOME, title: 'Menú principal' },
    ]);
    return null;
  }
}

module.exports = { safe };
