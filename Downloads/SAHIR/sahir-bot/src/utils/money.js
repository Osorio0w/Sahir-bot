// Los precios se manejan en centavos (enteros) dentro del bot.
const toCents = (n) => Math.round(Number(n) * 100);
const fmt = (cents, currency = 'USD') =>
  `${currency === 'USD' ? '$' : currency + ' '}${(cents / 100).toFixed(2)}`;

module.exports = { toCents, fmt };
