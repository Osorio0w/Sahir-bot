const store = require('../store');
const flows = require('./flows');
const knowledge = require('../knowledge');
const { IDS, showMainMenu } = require('./menus');
const { detectIntent, LEAD } = require('./intents');
const { norm } = require('../utils/text');
const log = require('../utils/logger');

// Aquí no se importa nada de whatsapp/: el router recibe un "channel" para responder.

const SALUDOS = new Set(['hola', 'buenas', 'buenos dias', 'buenas tardes', 'buenas noches', 'menu', 'inicio', 'ayuda']);
const OPTION_TO_FLOW = {
  [IDS.VIEW_MENU]: 'menu',
  [IDS.ORDER]: 'pedido',
  [IDS.BOOKING]: 'reserva',
  [IDS.HUMAN]: 'escalado',
};

async function handleIncoming(msg, channel, services = {}) {
  const session = await store.getSession(msg.from);
  const text = norm(msg.text);
  const notifyStaff = services.notifyStaff || (async () => ({ ok: false }));
  const ctx = { msg, session, channel, store, notifyStaff, clock: services.clock };

  // 1) Salidas globales: siempre disponibles
  if (msg.optionId === IDS.HOME || text === 'cancelar' || SALUDOS.has(text)) {
    await store.resetSession(msg.from);
    return showMainMenu(channel, msg.name);
  }

  // 2) Opciones del menú principal: cambian de flujo aunque haya otro en curso
  const flowName = OPTION_TO_FLOW[msg.optionId];
  if (flowName) return startFlow(flowName, ctx);

  // 2b) Pedir una persona con palabras: también vale a mitad de un pedido o una reserva
  if (msg.type === 'text' && detectIntent(text) === 'escalado') return startFlow('escalado', ctx);

  // 3) Si hay un flujo activo (pedido, reserva, espera de una persona...), él decide
  if (session.flow && flows[session.flow]) {
    const flow = flows[session.flow];
    // En pasos donde se elige con botones o listas, una frase suelta puede ser una pregunta o un cambio de rumbo.
    if (msg.type === 'text' && !flow.acceptsText(session) && (await interrupt(ctx, flow, text))) return;
    return flow.handle(ctx);
  }

  // 4) Pregunta desde el menú
  if (msg.optionId === IDS.FAQ) return channel.sendText('Claro, escribe tu pregunta y te respondo.');

  // 5) Texto libre: se trata como una pregunta
  if (msg.type === 'text') return answerQuestion(ctx);

  // 6) Tipos de mensaje no soportados (imagen, audio...)
  return channel.sendText('Por ahora solo entiendo texto y las opciones del menú. Escribe «menú» para ver qué puedo hacer.');
}

/** Atiende una frase suelta en mitad de un flujo. Devuelve true si la resolvió. */
async function interrupt(ctx, flow, text) {
  const result = await knowledge.answer(ctx.msg.text, { clock: ctx.clock });
  if (result.found) {
    await ctx.channel.sendText(result.text);
    await flow.resume(ctx);
    return true;
  }
  const intent = detectIntent(text);
  if (intent && intent !== ctx.session.flow) {
    if (LEAD[intent]) await ctx.channel.sendText(LEAD[intent]);
    await startFlow(intent, ctx);
    return true;
  }
  return false;
}

async function startFlow(name, ctx) {
  // Si ya está esperando a una persona, no se avisa de nuevo al personal.
  if (name === 'escalado' && ctx.session.flow === 'humano') return flows.humano.handle(ctx);
  await store.resetSession(ctx.msg.from);
  return flows[name].start({ ...ctx, session: { flow: null, step: null, data: {} } });
}

async function answerQuestion(ctx) {
  const { msg, channel } = ctx;
  // Al módulo de conocimiento solo se le pasa el texto de la pregunta: nunca nombre, teléfono ni dirección.
  const result = await knowledge.answer(msg.text, { clock: ctx.clock });
  if (result.found) return channel.sendText(result.text);

  // Sin respuesta guardada: ¿quiere hacer algo que el bot sabe hacer?
  const intent = detectIntent(norm(msg.text));
  if (intent) {
    if (LEAD[intent]) await channel.sendText(LEAD[intent]);
    return startFlow(intent, ctx);
  }

  try {
    await store.logUnanswered({ phone: msg.from, question: msg.text });
  } catch (err) {
    log.error('No se pudo registrar la pregunta sin respuesta:', err.message);
  }
  return channel.sendButtons('Todavía no tengo una respuesta para eso. ¿Quieres que te atienda una persona?', [
    { id: IDS.HUMAN, title: 'Hablar con alguien' },
    { id: IDS.HOME, title: 'Menú principal' },
  ]);
}

module.exports = { handleIncoming };
