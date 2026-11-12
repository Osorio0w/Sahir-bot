const crypto = require('crypto');

/** Comprueba la firma X-Hub-Signature-256 que Meta añade a cada POST. */
function isValidSignature(rawBody, header, secret) {
  if (!secret) return true; // sin clave configurada (solo desarrollo)
  if (!rawBody || !header) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { isValidSignature };
