/**
 * Resolutor dinámico: horario de atención. Los datos vienen de datasources.getOpeningHours(),
 * así que si el restaurante cambia su horario, la respuesta cambia sola.
 *   matches(q)  -> ¿esta pregunta es sobre horarios?   (q ya viene normalizada)
 *   resolve()   -> { facts, text } | null
 * `text` es la respuesta fija; `facts` son los datos que un modelo puede usar para redactarla.
 */
const ds = require('../../datasources');
const config = require('../../config');
const { localParts, isOpenAt, formatWeekly } = require('../../utils/hours');

const PATTERNS = [/\bhorarios?\b/, /\b(abren|abre|abiertos?|abiertas?|cierran|cierra|cerrados?|atienden|atencion)\b/];

module.exports = {
  name: 'horario',
  matches: (q) => PATTERNS.some((p) => p.test(q)),

  async resolve(clock = () => new Date()) {
    const hours = await ds.getOpeningHours();
    if (!hours || !(hours.weekly || []).length) return null;
    const lines = formatWeekly(hours);
    const open = isOpenAt(hours, localParts(clock(), hours.timezone || config.timezone));
    const state = open ? 'Ahora mismo estamos abiertos.' : 'Ahora mismo estamos cerrados.';
    return {
      facts: `Horario de atención:\n${lines.join('\n')}\n${state}`,
      text: `Nuestro horario de atención:\n${lines.join('\n')}\n\n${state}`,
    };
  },
};
