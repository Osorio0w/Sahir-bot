/**
 * Flujo «Reservar una mesa». Es una SOLICITUD: nace «pendiente» y la confirma el personal.
 * Pasos: fecha -> hora -> personas -> nombre -> notas -> confirmacion
 * Los horarios NO están en el código: vienen de datasources.getOpeningHours().
 */
const ds = require('../../datasources');
const config = require('../../config');
const { IDS, showMainMenu } = require('../menus');
const { localParts, dateOptions, formatTime, toMin } = require('../../utils/hours');
const { safe } = require('./shared');
const log = require('../../utils/logger');

const PAGE = 8;
const R = config.reservations;
const go = (ctx, step, data) => ctx.store.saveSession(ctx.msg.from, { flow: 'reserva', step, data });
const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** Fechas y horas disponibles ahora mismo, según los horarios vigentes. */
async function loadOptions(ctx) {
  const r = await safe(ctx, async () => ({ hours: await ds.getOpeningHours() }));
  if (!r) return null;
  if (!r.hours) {
    await ctx.channel.sendButtons('No tengo los horarios del restaurante para ofrecerte reservas ahora. ¿Qué prefieres?', [
      { id: IDS.HUMAN, title: 'Hablar con alguien' },
      { id: IDS.HOME, title: 'Menú principal' },
    ]);
    return null;
  }
  const now = (ctx.clock || (() => new Date()))();
  const parts = localParts(now, r.hours.timezone || config.timezone);
  return dateOptions(r.hours, parts, R);
}

async function askDate(ctx, data) {
  const options = await loadOptions(ctx);
  if (!options) return;
  if (!options.length) {
    await ctx.store.resetSession(ctx.msg.from);
    return ctx.channel.sendButtons('No hay horarios disponibles para reservar en los próximos días. ¿Quieres hablar con una persona?', [
      { id: IDS.HUMAN, title: 'Hablar con alguien' },
      { id: IDS.HOME, title: 'Menú principal' },
    ]);
  }
  const rows = options.slice(0, 9).map((o) => ({ id: 'date:' + o.date, title: o.label }));
  rows.push({ id: 'res:cancel', title: 'Cancelar' });
  await go(ctx, 'fecha', data);
  return ctx.channel.sendList({ body: '¿Para qué día quieres la mesa?', buttonLabel: 'Ver días', sections: [{ title: 'Días', rows }] });
}

async function askTime(ctx, data, page) {
  const options = await loadOptions(ctx);
  if (!options) return;
  const day = options.find((o) => o.date === data.date);
  if (!day) {
    await ctx.channel.sendText('Ese día ya no está disponible. Elige otro.');
    return askDate(ctx, { ...data, date: null });
  }
  data.dateLabel = day.label;
  data.page = page;
  const start = page * PAGE;
  const rows = day.slots.slice(start, start + PAGE).map((t) => ({ id: 'time:' + hhmm(t), title: formatTime(t) }));
  if (start + PAGE < day.slots.length) rows.push({ id: 'more', title: 'Ver más horas' });
  rows.push({ id: 'back', title: 'Cambiar de día' });
  await go(ctx, 'hora', data);
  return ctx.channel.sendList({ body: `¿A qué hora el ${day.label.toLowerCase()}?`, buttonLabel: 'Ver horas', sections: [{ title: 'Horas', rows }] });
}

async function askParty(ctx, data) {
  await go(ctx, 'personas', data);
  return ctx.channel.sendButtons(`¿Para cuántas personas? Toca una opción o escribe un número (máximo ${R.maxParty}).`, [
    { id: 'party:2', title: '2 personas' },
    { id: 'party:4', title: '4 personas' },
    { id: 'party:6', title: '6 personas' },
  ]);
}
async function askName(ctx, data) {
  await go(ctx, 'nombre', data);
  return ctx.channel.sendText('¿A nombre de quién hacemos la reserva?');
}
async function askNotes(ctx, data) {
  await go(ctx, 'notas', data);
  return ctx.channel.sendText('¿Alguna nota, como una celebración o una alergia? (o escribe «no»)');
}

function summaryText(data) {
  const out = [
    '*Solicitud de reserva*', '',
    `Día: ${data.dateLabel} (${data.date})`,
    `Hora: ${formatTime(toMin(data.time))}`,
    `Personas: ${data.party}`,
    `A nombre de: ${data.name}`,
  ];
  if (data.notes) out.push(`Notas: ${data.notes}`);
  out.push('', '_Esto es una solicitud: el restaurante te confirmará por este chat._');
  return out.join('\n');
}

async function showSummary(ctx, data) {
  await go(ctx, 'confirmacion', data);
  return ctx.channel.sendButtons(summaryText(data), [
    { id: 'res:confirm', title: 'Enviar solicitud' },
    { id: 'res:cancel', title: 'Cancelar' },
  ]);
}

const PROMPTS = {
  fecha: askDate,
  hora: (ctx, data) => askTime(ctx, data, data.page || 0),
  personas: askParty,
  nombre: askName,
  notas: askNotes,
  confirmacion: showSummary,
};

async function start(ctx) {
  return askDate(ctx, {});
}

async function cancel(ctx) {
  await ctx.store.resetSession(ctx.msg.from);
  await ctx.channel.sendText('Listo, cancelé la solicitud de reserva.');
  return showMainMenu(ctx.channel, ctx.msg.name);
}

async function confirm(ctx, data) {
  // Los horarios pudieron cambiar mientras el cliente decidía: se vuelve a validar.
  const options = await loadOptions(ctx);
  if (!options) return;
  const day = options.find((o) => o.date === data.date);
  if (!day || !day.slots.some((t) => hhmm(t) === data.time)) {
    await ctx.channel.sendText('Ese horario ya no está disponible. Elige otro.');
    return askDate(ctx, { ...data, date: null, time: null });
  }
  let saved;
  try {
    saved = await ctx.store.createReservation({
      customerPhone: ctx.msg.from, customerName: data.name, date: data.date, time: data.time, partySize: data.party, notes: data.notes || '',
    });
  } catch (err) {
    log.error('No se pudo guardar la reserva:', err.message);
    return ctx.channel.sendButtons('No pude registrar tu solicitud por un problema técnico. ¿Qué prefieres?', [
      { id: 'res:confirm', title: 'Reintentar' },
      { id: IDS.HUMAN, title: 'Hablar con alguien' },
    ]);
  }
  await ctx.store.resetSession(ctx.msg.from);
  await ctx.channel.sendText(
    `¡Listo, ${data.name}! Recibimos tu solicitud *#${saved.id}* para ${data.dateLabel.toLowerCase()} a las ${formatTime(toMin(data.time))} (${data.party} personas). El personal te confirmará por este chat.`
  );
  const staff = [
    `Nueva solicitud de reserva #${saved.id}`,
    `Cliente: ${data.name} (+${ctx.msg.from})`,
    `Día: ${data.dateLabel} (${data.date})`,
    `Hora: ${formatTime(toMin(data.time))}`,
    `Personas: ${data.party}`,
    ...(data.notes ? [`Notas: ${data.notes}`] : []),
  ].join('\n');
  try {
    await ctx.notifyStaff(staff);
  } catch (err) {
    log.error('No se pudo avisar al personal de la reserva', saved.id, err.message);
  }
}

async function handle(ctx) {
  const { msg, session } = ctx;
  const data = { ...(session.data || {}) };
  const opt = msg.optionId || '';
  const isText = msg.type === 'text';
  const text = (msg.text || '').trim();
  const reprompt = async (hint) => {
    if (hint) await ctx.channel.sendText(hint);
    return (PROMPTS[session.step] || askDate)(ctx, data);
  };

  if (opt === 'res:cancel') return cancel(ctx);
  if (!PROMPTS[session.step]) return start(ctx);

  switch (session.step) {
    case 'fecha':
      if (opt.startsWith('date:')) {
        data.date = opt.slice(5);
        return askTime(ctx, data, 0);
      }
      return reprompt('Elige un día de la lista.');

    case 'hora':
      if (opt === 'back') return askDate(ctx, { ...data, date: null });
      if (opt === 'more') return askTime(ctx, data, (data.page || 0) + 1);
      if (opt.startsWith('time:')) {
        data.time = opt.slice(5);
        return askParty(ctx, data);
      }
      return reprompt('Elige una hora de la lista.');

    case 'personas': {
      const m = opt.match(/^party:(\d+)$/) || (isText ? text.match(/^\d{1,3}$/) : null);
      const n = m ? Number(m[1] ?? m[0]) : 0;
      if (n < 1 || n > R.maxParty) return reprompt(`Escribe un número entre 1 y ${R.maxParty}. Para grupos más grandes, habla con una persona.`);
      data.party = n;
      return askName(ctx, data);
    }

    case 'nombre':
      if (!isText || text.length < 2 || text.length > 60) return reprompt('Escribe tu nombre (entre 2 y 60 letras).');
      data.name = text;
      return askNotes(ctx, data);

    case 'notas':
      if (!isText) return reprompt('Escribe una nota o «no».');
      data.notes = /^(no|ninguna|n\/a)$/i.test(text) ? '' : text.slice(0, 300);
      return showSummary(ctx, data);

    case 'confirmacion':
      if (opt === 'res:confirm') return confirm(ctx, data);
      return reprompt('Toca «Enviar solicitud» o «Cancelar».');
  }
}

const TEXT_STEPS = new Set(['personas', 'nombre', 'notas']);

module.exports = {
  start,
  handle,
  acceptsText: (session) => TEXT_STEPS.has(session.step),
  resume: (ctx) => (PROMPTS[ctx.session.step] || askDate)(ctx, { ...(ctx.session.data || {}) }),
};
