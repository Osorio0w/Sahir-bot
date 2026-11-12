// Consultas que usa el panel de administración (PostgreSQL). Se suman a las de postgres.js.
const { pool } = require('./db');

const statusFilter = (statuses) => (statuses && statuses.length ? statuses : null);

// ---- pedidos
const mapOrder = (r) => ({
  id: Number(r.id), customerPhone: r.customer_phone, customerName: r.customer_name, type: r.type, status: r.status,
  address: r.address, reference: r.reference, notes: r.notes, currency: r.currency, subtotalCents: r.subtotal_cents,
  createdAt: r.created_at, items: [],
});

async function attachItems(list) {
  if (!list.length) return list;
  const { rows } = await pool.query(
    'SELECT order_id, external_item_id, name, unit_price_cents, quantity FROM order_items WHERE order_id = ANY($1::bigint[]) ORDER BY id',
    [list.map((o) => o.id)]
  );
  const byId = new Map(list.map((o) => [o.id, o]));
  for (const r of rows) byId.get(Number(r.order_id))?.items.push({ itemId: r.external_item_id, name: r.name, priceCents: r.unit_price_cents, qty: r.quantity });
  return list;
}

// ---- reservas
const RES_COLS = `id, customer_phone, customer_name, to_char(reservation_date, 'YYYY-MM-DD') AS date,
  to_char(reservation_time, 'HH24:MI') AS time, party_size, notes, status, created_at`;
const mapRes = (r) => ({
  id: Number(r.id), customerPhone: r.customer_phone, customerName: r.customer_name, date: r.date, time: r.time,
  partySize: r.party_size, notes: r.notes, status: r.status, createdAt: r.created_at,
});

// ---- conocimiento
async function withVariants(rows) {
  const entries = rows.map((r) => ({ id: Number(r.id), category: r.category, answer: r.answer, active: r.active, updatedAt: r.updated_at, variants: [] }));
  if (!entries.length) return entries;
  const { rows: vs } = await pool.query('SELECT entry_id, text FROM knowledge_variants WHERE entry_id = ANY($1::bigint[]) ORDER BY id', [entries.map((e) => e.id)]);
  const byId = new Map(entries.map((e) => [e.id, e]));
  for (const v of vs) byId.get(Number(v.entry_id))?.variants.push(v.text);
  return entries;
}

async function inTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function getKnowledge(id) {
  const { rows } = await pool.query('SELECT id, category, answer, active, updated_at FROM knowledge_entries WHERE id = $1', [id]);
  return (await withVariants(rows))[0] || null;
}

module.exports = {
  async listUnanswered({ statuses, limit = 200 } = {}) {
    const { rows } = await pool.query(
      'SELECT id, customer_phone, question, status, knowledge_entry_id, created_at FROM unanswered_questions WHERE ($1::text[] IS NULL OR status = ANY($1)) ORDER BY id DESC LIMIT $2',
      [statusFilter(statuses), limit]
    );
    return rows.map((r) => ({ id: Number(r.id), phone: r.customer_phone, question: r.question, status: r.status, entryId: r.knowledge_entry_id ? Number(r.knowledge_entry_id) : null, createdAt: r.created_at }));
  },
  async getUnanswered(id) {
    const { rows } = await pool.query('SELECT id, customer_phone, question, status, knowledge_entry_id, created_at FROM unanswered_questions WHERE id = $1', [id]);
    const r = rows[0];
    return r ? { id: Number(r.id), phone: r.customer_phone, question: r.question, status: r.status, entryId: r.knowledge_entry_id ? Number(r.knowledge_entry_id) : null, createdAt: r.created_at } : null;
  },
  async setUnansweredStatus(id, status, entryId = null) {
    const r = await pool.query('UPDATE unanswered_questions SET status = $2, knowledge_entry_id = $3 WHERE id = $1', [id, status, entryId]);
    return r.rowCount ? this.getUnanswered(id) : null;
  },

  async listOrders({ statuses, limit = 100 } = {}) {
    const { rows } = await pool.query('SELECT * FROM orders WHERE ($1::text[] IS NULL OR status = ANY($1)) ORDER BY id DESC LIMIT $2', [statusFilter(statuses), limit]);
    return attachItems(rows.map(mapOrder));
  },
  async updateOrderStatus(id, status) {
    const { rows } = await pool.query('UPDATE orders SET status = $2, updated_at = now() WHERE id = $1 RETURNING *', [id, status]);
    return rows[0] ? (await attachItems([mapOrder(rows[0])]))[0] : null;
  },

  async listReservations({ statuses, limit = 100 } = {}) {
    const { rows } = await pool.query(`SELECT ${RES_COLS} FROM reservations WHERE ($1::text[] IS NULL OR status = ANY($1)) ORDER BY id DESC LIMIT $2`, [statusFilter(statuses), limit]);
    return rows.map(mapRes);
  },
  async updateReservationStatus(id, status) {
    const r = await pool.query('UPDATE reservations SET status = $2, updated_at = now() WHERE id = $1', [id, status]);
    if (!r.rowCount) return null;
    const { rows } = await pool.query(`SELECT ${RES_COLS} FROM reservations WHERE id = $1`, [id]);
    return mapRes(rows[0]);
  },

  async listEscalations({ statuses, limit = 100 } = {}) {
    const { rows } = await pool.query('SELECT * FROM escalations WHERE ($1::text[] IS NULL OR status = ANY($1)) ORDER BY id DESC LIMIT $2', [statusFilter(statuses), limit]);
    return rows.map((r) => ({ id: Number(r.id), phone: r.customer_phone, name: r.customer_name, reason: r.reason, context: r.context, notified: r.staff_notified, status: r.status, createdAt: r.created_at }));
  },
  async setEscalationStatus(id, status) {
    const { rows } = await pool.query('UPDATE escalations SET status = $2 WHERE id = $1 RETURNING *', [id, status]);
    const r = rows[0];
    return r ? { id: Number(r.id), phone: r.customer_phone, name: r.customer_name, reason: r.reason, context: r.context, notified: r.staff_notified, status: r.status, createdAt: r.created_at } : null;
  },

  async listKnowledge() {
    const { rows } = await pool.query('SELECT id, category, answer, active, updated_at FROM knowledge_entries ORDER BY id DESC');
    return withVariants(rows);
  },
  async loadActiveKnowledge() {
    const { rows } = await pool.query('SELECT id, category, answer, active, updated_at FROM knowledge_entries WHERE active ORDER BY id');
    return withVariants(rows);
  },
  async createKnowledge({ category = '', answer, variants }) {
    const id = await inTransaction(async (c) => {
      const { rows } = await c.query('INSERT INTO knowledge_entries (category, answer) VALUES ($1, $2) RETURNING id', [category, answer]);
      for (const v of variants) await c.query('INSERT INTO knowledge_variants (entry_id, text) VALUES ($1, $2)', [rows[0].id, v]);
      return rows[0].id;
    });
    return getKnowledge(id);
  },
  async updateKnowledge(id, { category, answer, active, variants }) {
    const found = await inTransaction(async (c) => {
      const r = await c.query('UPDATE knowledge_entries SET category = $2, answer = $3, active = $4, updated_at = now() WHERE id = $1', [id, category, answer, active]);
      if (!r.rowCount) return false;
      await c.query('DELETE FROM knowledge_variants WHERE entry_id = $1', [id]);
      for (const v of variants) await c.query('INSERT INTO knowledge_variants (entry_id, text) VALUES ($1, $2)', [id, v]);
      return true;
    });
    return found ? getKnowledge(id) : null;
  },
  async deleteKnowledge(id) {
    const r = await pool.query('DELETE FROM knowledge_entries WHERE id = $1', [id]);
    return r.rowCount > 0;
  },

  async summaryCounts() {
    const { rows } = await pool.query(`SELECT
      (SELECT count(*) FROM orders WHERE status = 'recibido')::int AS orders_new,
      (SELECT count(*) FROM reservations WHERE status = 'pendiente')::int AS reservations_pending,
      (SELECT count(*) FROM unanswered_questions WHERE status = 'nueva')::int AS unanswered_new,
      (SELECT count(*) FROM escalations WHERE status = 'abierto')::int AS escalations_open`);
    const r = rows[0];
    return { ordersNew: r.orders_new, reservationsPending: r.reservations_pending, unansweredNew: r.unanswered_new, escalationsOpen: r.escalations_open };
  },
};
