const config = require('../../config');
const log = require('../../utils/logger');

/**
 * Proveedor Gemini. Mismo contrato que los demás proveedores:
 *   rewrite({ question, facts }) -> { ok: true, text } | { ok: false, reason }
 * - Solo redacta usando los datos recibidos: nunca se le pide que "sepa" precios u horarios.
 * - No lanza errores: si falla (saturación, tiempo, clave), devuelve ok:false y el bot usa su texto fijo.
 * - Un solo reintento, y solo ante saturación (5xx). Un 429 es un límite de uso: reintentar lo empeora.
 * - Tras un fallo, deja de consultar al modelo durante LLM_COOLDOWN_SECONDS: así los clientes no esperan
 *   por una respuesta que el bot ya tiene y no se gasta el cupo.
 */
const SYSTEM =
  'Eres el asistente de WhatsApp de Sahir Resto Bar. Responde en español, de forma breve y amable (máximo 3 frases). ' +
  'Usa ÚNICAMENTE los datos que se te entregan. Si no bastan para responder, dilo y sugiere hablar con una persona. ' +
  'No inventes precios, horarios ni políticas.';

const RETRY_STATUS = new Set([500, 502, 503, 504]);
const MAX_ATTEMPTS = 2;
let blockedUntil = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callOnce(question, facts, signal) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.llm.model)}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    signal,
    // La clave va en un encabezado y no en la URL, para que no quede en registros.
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.llm.apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: `Datos:\n${facts}\n\nPregunta del cliente: ${question}` }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 300 },
    }),
  });
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  const data = await res.json();
  const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
  if (!text) throw Object.assign(new Error('respuesta vacía'), { status: 0 });
  return text;
}

const fail = (reason) => {
  blockedUntil = Date.now() + config.llm.cooldownSeconds * 1000;
  return { ok: false, reason };
};

async function rewrite({ question, facts }) {
  if (!config.llm.apiKey) return { ok: false, reason: 'missing-api-key' };
  if (Date.now() < blockedUntil) return { ok: false, reason: 'cooldown' };
  const deadline = AbortSignal.timeout(config.llm.timeoutMs);
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const text = await callOnce(question, facts, deadline);
      blockedUntil = 0;
      return { ok: true, text };
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        log.warn(`Gemini: tiempo de espera agotado (${config.llm.timeoutMs} ms); se usa la respuesta fija`);
        return fail('timeout');
      }
      const retry = RETRY_STATUS.has(err.status) && attempt < MAX_ATTEMPTS;
      log.warn(`Gemini: ${err.message}${retry ? ' (reintentando)' : `; se usa la respuesta fija y no se consulta durante ${config.llm.cooldownSeconds} s`}`);
      if (!retry) return fail(err.message);
      await sleep(400);
    }
  }
  return fail('unavailable');
}

module.exports = { name: 'gemini', rewrite };
