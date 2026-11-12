// Atiende un mensaje a la vez por cliente: evita carreras (p. ej. dos toques seguidos en «Confirmar»).
// Funciona dentro de un solo proceso; si algún día hay varios servidores, se cambia por un bloqueo en la base.
const tails = new Map();

function runExclusive(key, fn) {
  const prev = tails.get(key) || Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  const tail = next.catch(() => {});
  tails.set(key, tail);
  tail.then(() => {
    if (tails.get(key) === tail) tails.delete(key);
  });
  return next;
}

module.exports = { runExclusive };
