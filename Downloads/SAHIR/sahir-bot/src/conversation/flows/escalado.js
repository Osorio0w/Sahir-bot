/**
 * Escalado a una persona. Avisa al personal (con un enlace para escribirle al cliente) y deja
 * la conversación en modo «humano»: el bot calla para no interrumpir, salvo un aviso la primera vez.
 * Ojo: avisar por WhatsApp solo funciona dentro de la ventana de 24 h (o con una plantilla aprobada).
 * Si no se pudo avisar, se le dice al cliente la verdad.
 */
const { IDS } = require('../menus');
const log = require('../../utils/logger');

async function start(ctx) {
  const { msg, store, channel } = ctx;

  let context = '';
  try {
    context = (await store.lastUnanswered(msg.from)) || '';
  } catch (err) {
    log.error('No se pudo leer la última pregunta del cliente:', err.message);
  }

  const staffText = [
    'Un cliente pide hablar con una persona.',
    `Cliente: ${msg.name || 'sin nombre'} (+${msg.from})`,
    `Escríbele: https://wa.me/${msg.from}`,
    ...(context ? [`Su última pregunta sin respuesta: «${context.slice(0, 300)}»`] : []),
  ].join('\n');

  let notified = false;
  try {
    notified = !!(await ctx.notifyStaff(staffText))?.ok;
  } catch (err) {
    log.error('No se pudo avisar al personal:', err.message);
  }
  try {
    await store.createEscalation({ phone: msg.from, name: msg.name || '', reason: 'solicitud del cliente', context, notified });
  } catch (err) {
    log.error('No se pudo registrar el escalado:', err.message);
  }

  await store.saveSession(msg.from, { flow: 'humano', step: 'esperando', data: {} });
  return channel.sendText(
    notified
      ? 'Listo, avisé a una persona del restaurante. Te contactará por aquí o por llamada. Si quieres volver al inicio, escribe «menú».'
      : 'Registré tu solicitud para hablar con una persona, pero no pude avisarle de inmediato. Te contactarán lo antes posible. Si quieres volver al inicio, escribe «menú».'
  );
}

/** Mensajes del cliente mientras espera: solo se le recuerda una vez; después se guarda silencio. */
async function handle(ctx) {
  if ((ctx.session.data || {}).reminded) return;
  await ctx.store.saveSession(ctx.msg.from, { flow: 'humano', step: 'esperando', data: { reminded: true } });
  return ctx.channel.sendButtons('Ya avisé a una persona; te responderá en cuanto pueda. ¿Quieres volver al menú?', [
    { id: IDS.HOME, title: 'Menú principal' },
  ]);
}

module.exports = { start, handle, acceptsText: () => true, resume: async () => {} };
