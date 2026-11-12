/**
 * Respuestas guardadas por el personal. Compara la pregunta del cliente con las «variantes» de cada
 * respuesta usando las palabras que comparten (coeficiente de Dice). No usa modelo ni red.
 * Limitación: entiende palabras, no sentido; por eso el panel permite añadir varias variantes.
 */
const store = require('../store');
const config = require('../config');
const { norm } = require('../utils/text');

const STOP = new Set(['de', 'la', 'el', 'en', 'un', 'una', 'que', 'es', 'a', 'y', 'o', 'por', 'para', 'con', 'los', 'las', 'del', 'al', 'mi', 'me', 'se', 'lo', 'su', 'sus', 'si', 'no', 'hay', 'como', 'cual', 'cuales', 'tienen', 'tiene', 'tengan', 'puedo', 'pueden', 'quiero', 'quisiera', 'saber', 'hola', 'buenas', 'favor', 'gracias']);
const CACHE_MS = 30 * 1000;

// Quita la «s» final para que «postres» y «postre» cuenten como la misma palabra.
const stem = (w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w);
const tokens = (text) => new Set(norm(text).split(' ').filter((w) => w.length > 1 && !STOP.has(w)).map(stem));

let cache = { at: 0, entries: [] };

async function load() {
  if (Date.now() - cache.at > CACHE_MS) {
    const entries = await store.loadActiveKnowledge();
    cache = { at: Date.now(), entries: entries.map((e) => ({ ...e, parsed: e.variants.map((v) => tokens(v)) })) };
  }
  return cache.entries;
}

/** Hay que llamarla después de crear, editar o borrar respuestas desde el panel. */
const invalidate = () => { cache.at = 0; };

/** Devuelve { entry, score } con la mejor coincidencia por encima del umbral, o null. */
async function find(question) {
  const q = tokens(question);
  if (!q.size) return null;
  let best = null;
  for (const entry of await load()) {
    for (const vt of entry.parsed) {
      if (!vt.size) continue;
      let shared = 0;
      for (const t of vt) if (q.has(t)) shared++;
      const score = (2 * shared) / (vt.size + q.size);
      if (!best || score > best.score) best = { entry, score };
    }
  }
  return best && best.score >= config.knowledge.threshold ? best : null;
}

module.exports = { find, invalidate, tokens };
