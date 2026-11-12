/**
 * Módulo de conocimiento. Contrato (no cambia aunque cambie la implementación):
 *   answer(question: string) -> Promise<{ found: boolean, text?: string, source?: string }>
 *
 * Orden:
 *   1. Resolutores dinámicos (resolvers/): consultan datos reales del restaurante.
 *   2. Respuestas guardadas por el personal desde el panel (matcher.js), devueltas tal cual.
 *   3. Si hay datos, el modelo de lenguaje (si está activado) los REDACTA; si falla o tarda,
 *      se usa el texto fijo del resolutor. El modelo nunca responde sin datos: así no inventa.
 *   4. Nada -> found:false (el router lo registra y ofrece una persona).
 *
 * Privacidad: a este módulo solo llega el texto de la pregunta.
 */
const llm = require('./llm');
const log = require('../utils/logger');
const { norm } = require('../utils/text');

const matcher = require('./matcher');

const resolvers = [require('./resolvers/hours')];

async function answer(question, { clock, skipLlm = false } = {}) {
  const q = norm(question);
  for (const r of resolvers) {
    if (!r.matches(q)) continue;
    let res;
    try {
      res = await r.resolve(clock);
    } catch (err) {
      log.error(`Resolutor «${r.name}» falló:`, err.message);
      continue;
    }
    if (!res) continue;

    let phrased = { ok: false };
    try {
      if (!skipLlm) phrased = await llm.rewrite({ question, facts: res.facts });
    } catch (err) {
      log.error('El proveedor de modelo lanzó un error:', err.message);
    }
    const source = r.name + (phrased.ok ? '+llm' : '');
    log.info(`Respuesta de conocimiento: ${source}`); // solo la fuente, no el contenido
    return { found: true, text: phrased.ok ? phrased.text : res.text, source };
  }

  // Respuestas guardadas por el personal (se devuelven tal cual, sin modelo)
  try {
    const hit = await matcher.find(question);
    if (hit) {
      log.info('Respuesta de conocimiento: guardada');
      return { found: true, text: hit.entry.answer, source: 'guardada', entryId: hit.entry.id, score: Number(hit.score.toFixed(2)) };
    }
  } catch (err) {
    log.error('No se pudieron consultar las respuestas guardadas:', err.message);
  }
  return { found: false, source: null };
}

module.exports = { answer };
