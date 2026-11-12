// Mensajes que se le envían al cliente cuando el personal cambia el estado de su pedido o reserva.
const { formatTime, toMin, addDays, DAYS, MONTHS } = require('../utils/hours');

const prettyDate = (iso) => {
  const d = addDays(iso, 0);
  return `${DAYS[d.dow]} ${d.day} ${MONTHS[d.month]}`;
};

const ORDER = {
  confirmado: (o) => `Tu pedido #${o.id} fue confirmado. Pronto empezamos a prepararlo.`,
  en_preparacion: (o) => `Tu pedido #${o.id} está en preparación.`,
  listo: (o) => (o.type === 'retiro' ? `Tu pedido #${o.id} está listo para retirar en el local.` : `Tu pedido #${o.id} está listo y va en camino.`),
  entregado: (o) => `Tu pedido #${o.id} fue entregado. ¡Gracias por elegirnos!`,
  cancelado: (o) => `Lamentamos avisarte que tu pedido #${o.id} fue cancelado. Si tienes dudas, escribe «humano» y te atenderá una persona.`,
};

const RESERVATION = {
  confirmada: (r) => `Tu reserva #${r.id} para el ${prettyDate(r.date)} a las ${formatTime(toMin(r.time))} (${r.partySize} personas) está confirmada. ¡Te esperamos!`,
  rechazada: (r) => `No pudimos confirmar tu reserva #${r.id} para el ${prettyDate(r.date)} a las ${formatTime(toMin(r.time))}. Si quieres, escribe «reservar» para elegir otro horario.`,
  cancelada: (r) => `Tu reserva #${r.id} fue cancelada.`,
};

module.exports = {
  orderMessage: (order, status) => ORDER[status]?.(order) || null,
  reservationMessage: (res, status) => RESERVATION[status]?.(res) || null,
};
