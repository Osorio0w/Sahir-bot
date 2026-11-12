/**
 * Flujo «Hacer un pedido».
 * Pasos (session.step): categoria -> plato -> cantidad -> siguiente -> tipo -> nombre
 *                       -> [direccion -> referencia] -> notas -> confirmacion
 * El estado (carrito y datos) vive en session.data y se guarda en cada paso.
 */
const ds = require('../../datasources');
const { IDS, showMainMenu } = require('../menus');
const { toCents, fmt } = require('../../utils/money');
const { safe } = require('./shared');
const log = require('../../utils/logger');

const PAGE = 8; // filas de platos por página (la lista admite 10 en total)
const MAX_QTY = 20;
const TYPE_LABEL = { domicilio: 'A domicilio', retiro: 'Retiro en el local' };

const total = (cart) => cart.reduce((s, l) => s + l.priceCents * l.qty, 0);
const count = (cart) => cart.reduce((s, l) => s + l.qty, 0);
const money = (data, cents) => fmt(cents, data.currency || 'USD');
const go = (ctx, step, data) => ctx.store.saveSession(ctx.msg.from, { flow: 'pedido', step, data });

// ---------- preguntas de cada paso ----------

async function showCategories(ctx, data) {
  const cats = await safe(ctx, () => ds.getCategories());
  if (!cats) return;
  const rows = cats.slice(0, 8).map((c) => ({ id: 'cat:' + c.id, title: c.name }));
  if (data.cart.length) {
    rows.push({
      id: 'cart:review',
      title: 'Terminar pedido',
      description: `${count(data.cart)} productos · ${money(data, total(data.cart))}`,
    });
  }
  rows.push({ id: 'order:cancel', title: 'Cancelar pedido' });
  await go(ctx, 'categoria', data);
  const body = data.cart.length
    ? `Llevas ${count(data.cart)} productos (${money(data, total(data.cart))}). ¿Quieres agregar algo más?`
    : '¿De qué categoría quieres pedir?';
  return ctx.channel.sendList({ body, buttonLabel: 'Ver categorías', sections: [{ title: 'Categorías', rows }] });
}

async function showItems(ctx, data, categoryId, page) {
  const all = await safe(ctx, () => ds.getItemsByCategory(categoryId));
  if (!all) return;
  const items = all.filter((i) => i.available);
  if (!items.length) {
    await ctx.channel.sendText('Por ahora no hay platos disponibles en esa categoría.');
    return showCategories(ctx, data);
  }
  const start = page * PAGE;
  const rows = items.slice(start, start + PAGE).map((i) => ({
    id: 'item:' + i.id,
    title: i.name,
    description: fmt(toCents(i.price), i.currency),
  }));
  if (start + PAGE < items.length) rows.push({ id: 'more', title: 'Ver más platos' });
  rows.push({ id: 'back', title: 'Volver a categorías' });
  data.category = categoryId;
  data.page = page;
  await go(ctx, 'plato', data);
  return ctx.channel.sendList({ body: '¿Qué plato quieres?', buttonLabel: 'Ver platos', sections: [{ title: 'Platos', rows }] });
}

async function askQty(ctx, data) {
  await go(ctx, 'cantidad', data);
  return ctx.channel.sendButtons(
    `¿Cuántas unidades de *${data.pending.name}*? Toca una opción o escribe un número (máximo ${MAX_QTY}).`,
    [{ id: 'qty:1', title: '1' }, { id: 'qty:2', title: '2' }, { id: 'qty:3', title: '3' }]
  );
}

async function askNext(ctx, data, added) {
  await go(ctx, 'siguiente', data);
  return ctx.channel.sendButtons(
    `Agregué ${added.qty} x ${added.name}. Llevas ${count(data.cart)} productos: ${money(data, total(data.cart))}.`,
    [
      { id: 'add:more', title: 'Agregar más' },
      { id: 'cart:review', title: 'Terminar pedido' },
      { id: 'order:cancel', title: 'Cancelar' },
    ]
  );
}

async function askType(ctx, data) {
  if (!data.cart.length) {
    await ctx.channel.sendText('Tu pedido está vacío. Elige primero algún plato.');
    return showCategories(ctx, data);
  }
  await go(ctx, 'tipo', data);
  return ctx.channel.sendButtons('Perfecto. ¿Cómo quieres recibir tu pedido?', [
    { id: 'type:domicilio', title: 'A domicilio' },
    { id: 'type:retiro', title: 'Retiro en local' },
    { id: 'order:cancel', title: 'Cancelar' },
  ]);
}

async function askName(ctx, data) {
  await go(ctx, 'nombre', data);
  return ctx.channel.sendText('¿A nombre de quién va el pedido? Escribe el nombre.');
}
async function askAddress(ctx, data) {
  await go(ctx, 'direccion', data);
  return ctx.channel.sendText('¿A qué dirección lo enviamos? Incluye calle, sector y número de casa o edificio.');
}
async function askReference(ctx, data) {
  await go(ctx, 'referencia', data);
  return ctx.channel.sendText('¿Alguna referencia para encontrar la dirección? (o escribe «no»)');
}
async function askNotes(ctx, data) {
  await go(ctx, 'notas', data);
  return ctx.channel.sendText('¿Alguna nota para tu pedido, como «sin cebolla»? (o escribe «no»)');
}

/** Revisa de nuevo disponibilidad y precios: los datos del restaurante pueden haber cambiado. */
async function revalidate(data) {
  const changes = [];
  const kept = [];
  for (const line of data.cart) {
    const item = await ds.getItem(line.itemId);
    if (!item || !item.available) {
      changes.push(`• ${line.name} ya no está disponible y se quitó de tu pedido.`);
      continue;
    }
    const price = toCents(item.price);
    if (price !== line.priceCents) {
      changes.push(`• ${line.name} cambió de precio: ahora ${fmt(price, item.currency)}.`);
      kept.push({ ...line, priceCents: price });
    } else kept.push(line);
  }
  data.cart = kept;
  return changes;
}

function summaryText(data) {
  const lines = data.cart.map((l) => `• ${l.qty} x ${l.name} — ${money(data, l.priceCents * l.qty)}`);
  const out = ['*Resumen de tu pedido*', '', ...lines, '', `Subtotal: ${money(data, total(data.cart))}`, `Tipo: ${TYPE_LABEL[data.type]}`, `Nombre: ${data.name}`];
  if (data.type === 'domicilio') {
    out.push(`Dirección: ${data.address}`);
    if (data.reference) out.push(`Referencia: ${data.reference}`);
  }
  if (data.notes) out.push(`Notas: ${data.notes}`);
  if (data.type === 'domicilio') out.push('', '_El costo de envío se confirma por separado._');
  return out.join('\n');
}

async function showSummary(ctx, data) {
  const changes = await safe(ctx, () => revalidate(data));
  if (!changes) return;
  if (changes.length) await ctx.channel.sendText(`Ojo, hubo cambios en el menú:\n${changes.join('\n')}`);
  if (!data.cart.length) {
    await ctx.channel.sendText('Tu pedido quedó vacío. Elige otros platos.');
    return showCategories(ctx, data);
  }
  await go(ctx, 'confirmacion', data);
  return ctx.channel.sendButtons(summaryText(data), [
    { id: 'confirm:yes', title: 'Confirmar pedido' },
    { id: 'order:cancel', title: 'Cancelar' },
  ]);
}

const PROMPTS = {
  categoria: showCategories,
  plato: (ctx, data) => showItems(ctx, data, data.category, data.page || 0),
  cantidad: askQty,
  siguiente: (ctx, data) => askType(ctx, data),
  tipo: askType,
  nombre: askName,
  direccion: askAddress,
  referencia: askReference,
  notas: askNotes,
  confirmacion: showSummary,
};

// ---------- entrada y avance ----------

async function start(ctx) {
  return showCategories(ctx, { cart: [] });
}

async function cancel(ctx) {
  await ctx.store.resetSession(ctx.msg.from);
  await ctx.channel.sendText('Listo, cancelé tu pedido.');
  return showMainMenu(ctx.channel, ctx.msg.name);
}

async function confirm(ctx, data) {
  const order = {
    customerPhone: ctx.msg.from,
    customerName: data.name,
    type: data.type,
    address: data.address || '',
    reference: data.reference || '',
    notes: data.notes || '',
    currency: data.currency || 'USD',
    subtotalCents: total(data.cart),
    items: data.cart,
  };
  let saved;
  try {
    saved = await ctx.store.createOrder(order);
  } catch (err) {
    log.error('No se pudo guardar el pedido:', err.message);
    return ctx.channel.sendButtons('No pude registrar tu pedido por un problema técnico. ¿Qué prefieres?', [
      { id: 'confirm:yes', title: 'Reintentar' },
      { id: IDS.HUMAN, title: 'Hablar con alguien' },
    ]);
  }
  await ctx.store.resetSession(ctx.msg.from);
  await ctx.channel.sendText(
    `¡Listo, ${data.name}! Recibimos tu pedido *#${saved.id}*. El personal lo revisará y te confirmará. Escribe «menú» para volver al inicio.`
  );
  const staff = [
    `Nuevo pedido #${saved.id}`,
    `Cliente: ${data.name} (+${ctx.msg.from})`,
    `Tipo: ${TYPE_LABEL[data.type]}`,
    ...(data.type === 'domicilio' ? [`Dirección: ${data.address}`, ...(data.reference ? [`Referencia: ${data.reference}`] : [])] : []),
    ...(data.notes ? [`Notas: ${data.notes}`] : []),
    'Productos:',
    ...data.cart.map((l) => `- ${l.qty} x ${l.name} (${money(data, l.priceCents * l.qty)})`),
    `Subtotal: ${money(data, total(data.cart))}`,
  ].join('\n');
  try {
    await ctx.notifyStaff(staff);
  } catch (err) {
    log.error('No se pudo avisar al personal del pedido', saved.id, err.message);
  }
}

async function handle(ctx) {
  const { msg, session } = ctx;
  const data = { cart: [], ...(session.data || {}) };
  const opt = msg.optionId || '';
  const isText = msg.type === 'text';
  const text = (msg.text || '').trim();
  const reprompt = async (hint) => {
    if (hint) await ctx.channel.sendText(hint);
    return (PROMPTS[session.step] || showCategories)(ctx, data);
  };

  if (opt === 'order:cancel') return cancel(ctx);
  if (!PROMPTS[session.step]) return start(ctx);

  switch (session.step) {
    case 'categoria':
      if (opt.startsWith('cat:')) return showItems(ctx, data, opt.slice(4), 0);
      if (opt === 'cart:review') return askType(ctx, data);
      return reprompt('Elige una opción de la lista.');

    case 'plato': {
      if (opt === 'back') return showCategories(ctx, data);
      if (opt === 'more') return showItems(ctx, data, data.category, (data.page || 0) + 1);
      if (opt.startsWith('item:')) {
        const r = await safe(ctx, async () => ({ item: await ds.getItem(opt.slice(5)) }));
        if (!r) return;
        const item = r.item;
        if (!item || !item.available) {
          await ctx.channel.sendText('Ese plato ya no está disponible.');
          return showItems(ctx, data, data.category, data.page || 0);
        }
        data.pending = { itemId: item.id, name: item.name, priceCents: toCents(item.price), currency: item.currency };
        return askQty(ctx, data);
      }
      return reprompt('Elige un plato de la lista.');
    }

    case 'cantidad': {
      const m = opt.match(/^qty:(\d+)$/) || (isText ? text.match(/^\d{1,2}$/) : null);
      const qty = m ? Number(m[1] ?? m[0]) : 0;
      if (!data.pending) return showCategories(ctx, data);
      if (qty < 1 || qty > MAX_QTY) return reprompt(`Escribe un número entre 1 y ${MAX_QTY}.`);
      const p = data.pending;
      const line = data.cart.find((l) => l.itemId === p.itemId);
      if (line) line.qty += qty;
      else data.cart.push({ itemId: p.itemId, name: p.name, priceCents: p.priceCents, qty });
      data.currency = p.currency || data.currency;
      data.pending = null;
      return askNext(ctx, data, { name: p.name, qty });
    }

    case 'siguiente':
      if (opt === 'add:more') return showCategories(ctx, data);
      if (opt === 'cart:review') return askType(ctx, data);
      return reprompt('Toca una de las opciones.');

    case 'tipo':
      if (opt === 'type:domicilio' || opt === 'type:retiro') {
        data.type = opt.slice(5);
        return askName(ctx, data);
      }
      return reprompt('Toca una de las opciones.');

    case 'nombre':
      if (!isText || text.length < 2 || text.length > 60) return reprompt('Escribe tu nombre (entre 2 y 60 letras).');
      data.name = text;
      return data.type === 'domicilio' ? askAddress(ctx, data) : askNotes(ctx, data);

    case 'direccion':
      if (!isText || text.length < 8 || text.length > 200) return reprompt('La dirección parece incompleta. Incluye calle, sector y número.');
      data.address = text;
      return askReference(ctx, data);

    case 'referencia':
      if (!isText) return reprompt('Escribe una referencia o «no».');
      data.reference = /^(no|ninguna|n\/a)$/i.test(text) ? '' : text.slice(0, 200);
      return askNotes(ctx, data);

    case 'notas':
      if (!isText) return reprompt('Escribe una nota o «no».');
      data.notes = /^(no|ninguna|n\/a)$/i.test(text) ? '' : text.slice(0, 300);
      return showSummary(ctx, data);

    case 'confirmacion':
      if (opt === 'confirm:yes') return confirm(ctx, data);
      return reprompt('Toca «Confirmar pedido» o «Cancelar».');
  }
}

// Pasos en los que el cliente escribe texto libre: ahí no se interpreta nada como pregunta.
const TEXT_STEPS = new Set(['cantidad', 'nombre', 'direccion', 'referencia', 'notas']);

module.exports = {
  start,
  handle,
  acceptsText: (session) => TEXT_STEPS.has(session.step),
  /** Vuelve a mostrar el paso actual (p. ej. tras responder una pregunta suelta). */
  resume: (ctx) => (PROMPTS[ctx.session.step] || showCategories)(ctx, { cart: [], ...(ctx.session.data || {}) }),
};
