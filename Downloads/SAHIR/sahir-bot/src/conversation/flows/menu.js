// Flujo «Ver el menú»: categorías -> platos con precio. Los datos vienen de datasources/ (solo lectura).
const ds = require('../../datasources');
const { IDS } = require('../menus');
const { toCents, fmt } = require('../../utils/money');
const { safe } = require('./shared');

async function start(ctx) {
  const cats = await safe(ctx, () => ds.getCategories());
  if (!cats) return;
  await ctx.store.saveSession(ctx.msg.from, { flow: 'menu', step: 'categoria', data: {} });
  const rows = cats.slice(0, 9).map((c) => ({ id: 'cat:' + c.id, title: c.name }));
  rows.push({ id: IDS.HOME, title: 'Volver al menú' });
  return ctx.channel.sendList({
    body: '¿Qué categoría quieres ver?',
    buttonLabel: 'Ver categorías',
    sections: [{ title: 'Categorías', rows }],
  });
}

async function handle(ctx) {
  const opt = ctx.msg.optionId || '';
  if (opt.startsWith('cat:')) return showCategory(ctx, opt.slice(4));
  if (opt === 'menu:cats') return start(ctx);
  await ctx.channel.sendText('Elige una categoría de la lista para ver sus platos.');
  return start(ctx);
}

async function showCategory(ctx, id) {
  const r = await safe(ctx, async () => ({ cats: await ds.getCategories(), items: await ds.getItemsByCategory(id) }));
  if (!r) return;
  const name = r.cats.find((c) => c.id === id)?.name || 'Menú';
  const lines = r.items.map((i) => {
    const price = fmt(toCents(i.price), i.currency);
    const tag = i.available ? '' : ' (agotado)';
    return `• ${i.name} — ${price}${tag}` + (i.description ? `\n   ${i.description}` : '');
  });
  const text = lines.length ? `*${name}*\n\n${lines.join('\n')}` : `*${name}*\n\nPor ahora no hay platos en esta categoría.`;
  await ctx.channel.sendText(text);
  return ctx.channel.sendButtons('¿Qué quieres hacer ahora?', [
    { id: IDS.ORDER, title: 'Hacer un pedido' },
    { id: 'menu:cats', title: 'Otra categoría' },
    { id: IDS.HOME, title: 'Menú principal' },
  ]);
}

module.exports = { start, handle, acceptsText: () => false, resume: (ctx) => start(ctx) };
