/**
 * Acciones del panel, sin depender de Express (así se pueden probar solas).
 * Cada acción recibe { params, query, body } y devuelve { status?, body }.
 */
const defaultStore = require('../store');
const { orderMessage, reservationMessage } = require('./notify');
const { norm } = require('../utils/text');

const ORDER_STATUS = ['recibido', 'confirmado', 'en_preparacion', 'listo', 'entregado', 'cancelado'];
const RESERVATION_STATUS = ['pendiente', 'confirmada', 'rechazada', 'cancelada'];
const ESCALATION_STATUS = ['abierto', 'atendido'];
const UNANSWERED_STATUS = ['nueva', 'resuelta', 'descartada'];

const ok = (body) => ({ body });
const fail = (status, error) => ({ status, body: { error } });
const toId = (v) => (/^\d{1,15}$/.test(String(v)) ? Number(v) : null);

/** ?status=todos -> sin filtro | un estado válido -> ese | otra cosa -> los de `fallback`. */
function statuses(query, valid, fallback) {
  const s = query?.status;
  if (s === 'todos') return null;
  return valid.includes(s) ? [s] : fallback;
}

/** Valida y limpia una respuesta guardada. -> { value } | { error } */
function cleanEntry(body) {
  const answer = String(body?.answer ?? '').trim();
  if (!answer) return { error: 'Escribe la respuesta.' };
  if (answer.length > 1500) return { error: 'La respuesta es demasiado larga (máximo 1500 caracteres).' };
  const raw = Array.isArray(body?.variants) ? body.variants : [];
  const variants = [...new Set(raw.map((v) => String(v).trim()).filter(Boolean))];
  if (!variants.length) return { error: 'Escribe al menos una forma de hacer la pregunta.' };
  if (variants.length > 20) return { error: 'Máximo 20 formas de preguntar.' };
  if (variants.some((v) => v.length > 200)) return { error: 'Cada pregunta puede tener hasta 200 caracteres.' };
  return { value: { category: String(body?.category ?? '').trim().slice(0, 40), answer, variants } };
}

function createApi(deps = {}) {
  const store = deps.store || defaultStore;
  const knowledge = deps.knowledge || require('../knowledge');
  const matcher = deps.matcher || require('../knowledge/matcher');
  const { detectIntent } = deps.intents || require('../conversation/intents');
  const sendText = deps.sendText || require('../whatsapp/client').sendText;

  /** Avisa al cliente por WhatsApp. -> true | false (false: pasaron más de 24 h, o falló el envío). */
  async function tellCustomer(phone, text) {
    if (!text) return null;
    try {
      return !!(await sendText(phone, text)).ok;
    } catch {
      return false;
    }
  }

  return {
    summary: async () => ok({ counts: await store.summaryCounts() }),

    // ---- pedidos
    listOrders: async ({ query }) =>
      ok({ orders: await store.listOrders({ statuses: statuses(query, ORDER_STATUS, ['recibido', 'confirmado', 'en_preparacion', 'listo']) }) }),
    setOrderStatus: async ({ params, body }) => {
      const id = toId(params.id);
      if (!id || !ORDER_STATUS.includes(body.status)) return fail(400, 'Datos no válidos.');
      const order = await store.updateOrderStatus(id, body.status);
      if (!order) return fail(404, 'No existe ese pedido.');
      const notified = body.notify === false ? null : await tellCustomer(order.customerPhone, orderMessage(order, body.status));
      return ok({ order, notified });
    },

    // ---- reservas
    listReservations: async ({ query }) =>
      ok({ reservations: await store.listReservations({ statuses: statuses(query, RESERVATION_STATUS, ['pendiente', 'confirmada']) }) }),
    setReservationStatus: async ({ params, body }) => {
      const id = toId(params.id);
      if (!id || !RESERVATION_STATUS.includes(body.status)) return fail(400, 'Datos no válidos.');
      const reservation = await store.updateReservationStatus(id, body.status);
      if (!reservation) return fail(404, 'No existe esa reserva.');
      const notified = body.notify === false ? null : await tellCustomer(reservation.customerPhone, reservationMessage(reservation, body.status));
      return ok({ reservation, notified });
    },

    // ---- preguntas sin respuesta
    listUnanswered: async ({ query }) => ok({ questions: await store.listUnanswered({ statuses: statuses(query, UNANSWERED_STATUS, ['nueva']) }) }),
    discardUnanswered: async ({ params }) => {
      const id = toId(params.id);
      if (!id) return fail(400, 'Datos no válidos.');
      return (await store.setUnansweredStatus(id, 'descartada')) ? ok({ ok: true }) : fail(404, 'No existe esa pregunta.');
    },
    answerUnanswered: async ({ params, body }) => {
      const id = toId(params.id);
      if (!id) return fail(400, 'Datos no válidos.');
      const q = await store.getUnanswered(id);
      if (!q) return fail(404, 'No existe esa pregunta.');
      const extra = Array.isArray(body.variants) ? body.variants : [];
      const clean = cleanEntry({ ...body, variants: [q.question, ...extra] });
      if (clean.error) return fail(400, clean.error);
      const entry = await store.createKnowledge(clean.value);
      await store.setUnansweredStatus(id, 'resuelta', entry.id);
      matcher.invalidate();
      const notified = body.notifyCustomer ? await tellCustomer(q.phone, clean.value.answer) : null;
      return ok({ entry, notified });
    },

    // ---- respuestas guardadas
    listKnowledge: async () => ok({ entries: await store.listKnowledge() }),
    createKnowledge: async ({ body }) => {
      const clean = cleanEntry(body);
      if (clean.error) return fail(400, clean.error);
      const entry = await store.createKnowledge(clean.value);
      matcher.invalidate();
      return { status: 201, body: { entry } };
    },
    updateKnowledge: async ({ params, body }) => {
      const id = toId(params.id);
      const clean = cleanEntry(body);
      if (!id) return fail(400, 'Datos no válidos.');
      if (clean.error) return fail(400, clean.error);
      const entry = await store.updateKnowledge(id, { ...clean.value, active: body.active !== false });
      if (!entry) return fail(404, 'No existe esa respuesta.');
      matcher.invalidate();
      return ok({ entry });
    },
    deleteKnowledge: async ({ params }) => {
      const id = toId(params.id);
      if (!id) return fail(400, 'Datos no válidos.');
      if (!(await store.deleteKnowledge(id))) return fail(404, 'No existe esa respuesta.');
      matcher.invalidate();
      return ok({ ok: true });
    },

    // ---- probador: muestra qué respondería el bot (sin usar el modelo de lenguaje)
    testQuestion: async ({ body }) => {
      const text = String(body.text ?? '').trim().slice(0, 500);
      if (!text) return fail(400, 'Escribe una frase.');
      const r = await knowledge.answer(text, { skipLlm: true });
      return ok({ found: r.found, source: r.source, text: r.text || null, score: r.score ?? null, entryId: r.entryId ?? null, intent: detectIntent(norm(text)) });
    },

    // ---- escalados
    listEscalations: async ({ query }) => ok({ escalations: await store.listEscalations({ statuses: statuses(query, ESCALATION_STATUS, ['abierto']) }) }),
    closeEscalation: async ({ params }) => {
      const id = toId(params.id);
      if (!id) return fail(400, 'Datos no válidos.');
      return (await store.setEscalationStatus(id, 'atendido')) ? ok({ ok: true }) : fail(404, 'No existe ese caso.');
    },
  };
}

module.exports = createApi;
module.exports.ORDER_STATUS = ORDER_STATUS;
module.exports.RESERVATION_STATUS = RESERVATION_STATUS;
