// Respaldo sin base de datos: todo vive en memoria y se pierde al reiniciar.
// Tiene exactamente la misma interfaz que postgres.js.
const config = require('../config');

const TTL_MS = config.sessionTtlMinutes * 60 * 1000;
const DEDUPE_TTL_MS = 10 * 60 * 1000;
const sessions = new Map();
const processed = new Map();
const customers = new Map();
const unanswered = [];
const orders = [];
const reservations = [];
const escalations = [];
const knowledge = [];
const seq = { unanswered: 0, orders: 0, reservations: 0, escalations: 0, knowledge: 0 };

const empty = () => ({ flow: null, step: null, data: {}, updatedAt: Date.now() });
const newestFirst = (list) => [...list].sort((a, b) => b.id - a.id);
const byStatus = (list, statuses) => (statuses && statuses.length ? list.filter((x) => statuses.includes(x.status)) : list);
const copyEntry = (e) => ({ ...e, variants: [...e.variants] });

module.exports = {
  async init() {},

  // ---- duplicados, sesiones, clientes
  async claimMessage(id) {
    const now = Date.now();
    for (const [key, at] of processed) if (now - at > DEDUPE_TTL_MS) processed.delete(key);
    if (processed.has(id)) return false;
    processed.set(id, now);
    return true;
  },

  async getSession(phone) {
    let s = sessions.get(phone);
    if (!s || Date.now() - s.updatedAt > TTL_MS) {
      s = empty();
      sessions.set(phone, s);
    }
    s.updatedAt = Date.now();
    return { flow: s.flow, step: s.step, data: s.data };
  },

  async saveSession(phone, patch) {
    const cur = await this.getSession(phone);
    const next = { ...cur, ...patch, updatedAt: Date.now() };
    sessions.set(phone, next);
    return { flow: next.flow, step: next.step, data: next.data };
  },

  async resetSession(phone) {
    sessions.set(phone, empty());
  },

  async upsertCustomer({ phone, name }) {
    const cur = customers.get(phone);
    customers.set(phone, { phone, name: name || cur?.name || '', lastSeenAt: Date.now() });
  },

  // ---- preguntas sin respuesta
  async logUnanswered({ phone, question }) {
    unanswered.push({ id: ++seq.unanswered, phone, question: String(question).slice(0, 1000), status: 'nueva', entryId: null, createdAt: Date.now() });
    if (unanswered.length > 1000) unanswered.shift();
  },
  /** Última pregunta sin respuesta de este cliente en los últimos 30 minutos, o null. */
  async lastUnanswered(phone) {
    const recent = unanswered.filter((u) => u.phone === phone && Date.now() - u.createdAt < 30 * 60 * 1000);
    return recent.length ? recent[recent.length - 1].question : null;
  },
  async listUnanswered({ statuses, limit = 200 } = {}) {
    return newestFirst(byStatus(unanswered, statuses)).slice(0, limit).map((u) => ({ ...u }));
  },
  async getUnanswered(id) {
    const u = unanswered.find((x) => x.id === id);
    return u ? { ...u } : null;
  },
  async setUnansweredStatus(id, status, entryId = null) {
    const u = unanswered.find((x) => x.id === id);
    if (!u) return null;
    u.status = status;
    u.entryId = entryId;
    return { ...u };
  },

  // ---- pedidos
  async createOrder(order) {
    const id = ++seq.orders;
    orders.push({ id, status: 'recibido', createdAt: Date.now(), ...order });
    return { id };
  },
  async listOrders({ statuses, limit = 100 } = {}) {
    return newestFirst(byStatus(orders, statuses)).slice(0, limit).map((o) => ({ ...o, items: o.items.map((i) => ({ ...i })) }));
  },
  async updateOrderStatus(id, status) {
    const o = orders.find((x) => x.id === id);
    if (!o) return null;
    o.status = status;
    return { ...o, items: o.items.map((i) => ({ ...i })) };
  },

  // ---- reservas
  async createReservation(r) {
    const id = ++seq.reservations;
    reservations.push({ id, status: 'pendiente', createdAt: Date.now(), ...r });
    return { id };
  },
  async listReservations({ statuses, limit = 100 } = {}) {
    return newestFirst(byStatus(reservations, statuses)).slice(0, limit).map((r) => ({ ...r }));
  },
  async updateReservationStatus(id, status) {
    const r = reservations.find((x) => x.id === id);
    if (!r) return null;
    r.status = status;
    return { ...r };
  },

  // ---- escalados
  async createEscalation(e) {
    const id = ++seq.escalations;
    escalations.push({ id, status: 'abierto', createdAt: Date.now(), ...e });
    return { id };
  },
  async listEscalations({ statuses, limit = 100 } = {}) {
    return newestFirst(byStatus(escalations, statuses)).slice(0, limit).map((e) => ({ ...e }));
  },
  async setEscalationStatus(id, status) {
    const e = escalations.find((x) => x.id === id);
    if (!e) return null;
    e.status = status;
    return { ...e };
  },

  // ---- conocimiento (respuestas guardadas por el personal)
  async listKnowledge() {
    return newestFirst(knowledge).map(copyEntry);
  },
  async loadActiveKnowledge() {
    return knowledge.filter((e) => e.active).map(copyEntry);
  },
  async createKnowledge({ category = '', answer, variants }) {
    const e = { id: ++seq.knowledge, category, answer, active: true, variants: [...variants], updatedAt: Date.now() };
    knowledge.push(e);
    return copyEntry(e);
  },
  async updateKnowledge(id, { category, answer, active, variants }) {
    const e = knowledge.find((x) => x.id === id);
    if (!e) return null;
    Object.assign(e, { category, answer, active, variants: [...variants], updatedAt: Date.now() });
    return copyEntry(e);
  },
  async deleteKnowledge(id) {
    const i = knowledge.findIndex((x) => x.id === id);
    if (i < 0) return false;
    knowledge.splice(i, 1);
    for (const u of unanswered) if (u.entryId === id) u.entryId = null;
    return true;
  },

  async summaryCounts() {
    const n = (list, st) => list.filter((x) => x.status === st).length;
    return {
      ordersNew: n(orders, 'recibido'),
      reservationsPending: n(reservations, 'pendiente'),
      unansweredNew: n(unanswered, 'nueva'),
      escalationsOpen: n(escalations, 'abierto'),
    };
  },

  async maintenance() {},
};
