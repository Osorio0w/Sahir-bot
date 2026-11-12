const config = require('../../config');

/**
 * Proveedor DeepSeek: SOLO ESQUELETO.
 * Falta implementar la llamada. Antes hay que revisar la documentación oficial
 * (endpoint, nombres de modelo, formato) porque estos datos cambian.
 *
 * Contrato:
 *   rewrite({ question, facts }) -> Promise<{ ok: true, text } | { ok: false, reason }>
 *   - question: texto de la pregunta del cliente
 *   - facts: datos del restaurante necesarios para responder (menú, horarios)
 *   - NUNCA incluir nombre, teléfono ni dirección del cliente.
 *   - Debe respetar config.llm.timeoutMs y fallar sin lanzar errores.
 */
module.exports = {
  name: 'deepseek',
  async rewrite(_input) {
    if (!config.llm.apiKey) return { ok: false, reason: 'missing-api-key' };
    return { ok: false, reason: 'not-implemented' };
  },
};
