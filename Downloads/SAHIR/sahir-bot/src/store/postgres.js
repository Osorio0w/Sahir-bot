const { pool } = require('./db');
const config = require('../config');
const { runMigrations } = require('./migrate');

const TTL_MS = config.sessionTtlMinutes * 60 * 1000;
const empty = () => ({ flow: null, step: null, data: {} });

async function writeSession(phone, s) {
  await pool.query(
    `INSERT INTO sessions (phone, flow, step, data) VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (phone) DO UPDATE
       SET flow = EXCLUDED.flow, step = EXCLUDED.step, data = EXCLUDED.data, updated_at = now()`,
    [phone, s.flow, s.step, JSON.stringify(s.data || {})]
  );
}

async function getSession(phone) {
  const { rows } = await pool.query('SELECT flow, step, data, updated_at FROM sessions WHERE phone = $1', [phone]);
  const row = rows[0];
  if (!row || Date.now() - new Date(row.updated_at).getTime() > TTL_MS) {
    const fresh = empty();
    await writeSession(phone, fresh);
    return fresh;
  }
  await pool.query('UPDATE sessions SET updated_at = now() WHERE phone = $1', [phone]);
  return { flow: row.flow, step: row.step, data: row.data || {} };
}

async function saveSession(phone, patch) {
  const next = { ...(await getSession(phone)), ...patch };
  await writeSession(phone, next);
  return next;
}

module.exports = {
  ...require('./adminPostgres'),
  init: runMigrations,

  /** true si es la primera vez que vemos este mensaje. */
  async claimMessage(id) {
    const r = await pool.query('INSERT INTO processed_messages (id) VALUES ($1) ON CONFLICT (id) DO NOTHING', [id]);
    return r.rowCount === 1;
  },

  getSession,
  saveSession,

  async resetSession(phone) {
    await writeSession(phone, empty());
  },

  async upsertCustomer({ phone, name }) {
    await pool.query(
      `INSERT INTO customers (phone, name) VALUES ($1, $2)
       ON CONFLICT (phone) DO UPDATE
         SET name = CASE WHEN EXCLUDED.name <> '' THEN EXCLUDED.name ELSE customers.name END,
             last_seen_at = now()`,
      [phone, name || '']
    );
  },

  async logUnanswered({ phone, question }) {
    await pool.query('INSERT INTO unanswered_questions (customer_phone, question) VALUES ($1, $2)', [
      phone,
      String(question).slice(0, 1000),
    ]);
  },

  /** Guarda el pedido y sus ítems en una sola transacción. */
  async createOrder(o) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO orders (customer_phone, customer_name, type, address, reference, notes, currency, subtotal_cents)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [o.customerPhone, o.customerName, o.type, o.address, o.reference, o.notes, o.currency, o.subtotalCents]
      );
      const id = rows[0].id;
      for (const it of o.items) {
        await client.query(
          'INSERT INTO order_items (order_id, external_item_id, name, unit_price_cents, quantity) VALUES ($1, $2, $3, $4, $5)',
          [id, it.itemId, it.name, it.priceCents, it.qty]
        );
      }
      await client.query('COMMIT');
      return { id: Number(id) };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async createReservation(r) {
    const { rows } = await pool.query(
      `INSERT INTO reservations (customer_phone, customer_name, reservation_date, reservation_time, party_size, notes)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [r.customerPhone, r.customerName, r.date, r.time, r.partySize, r.notes]
    );
    return { id: Number(rows[0].id) };
  },

  async createEscalation(e) {
    const { rows } = await pool.query(
      'INSERT INTO escalations (customer_phone, customer_name, reason, context, staff_notified) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [e.phone, e.name || '', e.reason || '', e.context || '', !!e.notified]
    );
    return { id: Number(rows[0].id) };
  },

  /** Última pregunta sin respuesta de este cliente en los últimos 30 minutos, o null. */
  async lastUnanswered(phone) {
    const { rows } = await pool.query(
      "SELECT question FROM unanswered_questions WHERE customer_phone = $1 AND created_at > now() - interval '30 minutes' ORDER BY created_at DESC LIMIT 1",
      [phone]
    );
    return rows[0]?.question || null;
  },

  /** Limpieza periódica: los IDs de mensajes solo hacen falta unos días. */
  async maintenance() {
    await pool.query("DELETE FROM processed_messages WHERE received_at < now() - interval '2 days'");
  },
};
