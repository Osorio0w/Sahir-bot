/**
 * Almacén de datos propio del bot. Misma interfaz con o sin base de datos:
 *   init(), claimMessage(id), getSession(phone), saveSession(phone, patch), resetSession(phone),
 *   upsertCustomer({phone, name}), logUnanswered({phone, question}), createOrder(order), createReservation(res), createEscalation(e), lastUnanswered(phone), maintenance()
 * Además, lo que usa el panel: listOrders, updateOrderStatus, listReservations, updateReservationStatus, listUnanswered,
 * getUnanswered, setUnansweredStatus, listEscalations, setEscalationStatus, listKnowledge, loadActiveKnowledge,
 * createKnowledge, updateKnowledge, deleteKnowledge, summaryCounts.
 * Con DATABASE_URL usa PostgreSQL; sin ella, memoria (se pierde al reiniciar).
 */
const config = require('../config');

module.exports = config.database.url ? require('./postgres') : require('./memory');
