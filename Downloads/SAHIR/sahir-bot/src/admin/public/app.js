'use strict';

// ---------- utilidades ----------
const SETTABLE = new Set(['value', 'checked', 'disabled', 'selected']);

/** Crea un elemento. Todo el texto entra como texto (nunca como HTML): así no hay inyección. */
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (SETTABLE.has(k)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const app = document.getElementById('app');
const money = (cents, cur) => `${cur === 'USD' || !cur ? '$' : cur + ' '}${(cents / 100).toFixed(2)}`;
const when = (x) => new Date(x).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' });
const wa = (phone) => h('a', { href: `https://wa.me/${encodeURIComponent(phone)}`, target: '_blank', rel: 'noopener noreferrer' }, `+${phone}`);

function toast(msg, kind) {
  const t = h('div', { class: 'toast' + (kind === 'error' ? ' error' : '') }, msg);
  document.getElementById('toasts').append(t);
  setTimeout(() => t.remove(), 5000);
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch('/admin/api' + path, {
    method,
    credentials: 'same-origin',
    headers: { 'X-Requested-With': 'fetch', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) { showLogin(); throw new Error('unauth'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error inesperado');
  return data;
}

const fail = (e) => { if (e.message !== 'unauth') toast(e.message, 'error'); };
const notifyText = (n) => (n === null ? 'Actualizado.' : n ? 'Actualizado y cliente avisado.' : 'Actualizado, pero no se pudo avisar al cliente (¿pasaron más de 24 h desde su último mensaje?).');
const empty = (t) => h('div', { class: 'empty' }, t);
const opt = (v, l, sel) => h('option', { value: v, selected: sel }, l);
const toolbar = (title, ...rest) => h('div', { class: 'toolbar' }, h('h2', {}, title), ...rest);

// ---------- acceso ----------
function showLogin() {
  const user = h('input', { type: 'text', autocomplete: 'username', value: 'admin' });
  const pass = h('input', { type: 'password', autocomplete: 'current-password' });
  const form = h('form', { class: 'stack', onsubmit: async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/admin/login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' }, body: JSON.stringify({ user: user.value, password: pass.value }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast(data.error || 'No se pudo entrar', 'error');
      boot();
    } catch { toast('No se pudo conectar con el servidor', 'error'); }
  } },
  h('label', {}, 'Usuario', user), h('label', {}, 'Contraseña', pass), h('button', { class: 'primary', type: 'submit' }, 'Entrar'));
  app.replaceChildren(h('div', { class: 'login' }, h('h1', {}, 'Sahir Resto Bar'), h('p', { class: 'muted' }, 'Panel de administración'), form));
}

// ---------- pedidos y reservas ----------
const ORDER_STATUS = { recibido: 'Recibido', confirmado: 'Confirmado', en_preparacion: 'En preparación', listo: 'Listo', entregado: 'Entregado', cancelado: 'Cancelado' };
const RES_STATUS = { pendiente: 'Pendiente', confirmada: 'Confirmada', rechazada: 'Rechazada', cancelada: 'Cancelada' };
const chipFor = (st) => h('span', { class: 'chip ' + (['recibido', 'pendiente'].includes(st) ? 'warn' : ['cancelado', 'rechazada', 'cancelada'].includes(st) ? 'bad' : 'good') }, ORDER_STATUS[st] || RES_STATUS[st] || st);

function statusActions(statuses, current, send) {
  const sel = h('select', {}, Object.entries(statuses).map(([v, l]) => opt(v, l, v === current)));
  const notify = h('input', { type: 'checkbox', checked: true });
  const btn = h('button', { class: 'primary', onclick: async () => {
    btn.disabled = true;
    try { const r = await send(sel.value, notify.checked); toast(notifyText(r.notified)); refresh(); } catch (e) { fail(e); btn.disabled = false; }
  } }, 'Actualizar');
  return h('div', { class: 'actions' }, sel, h('label', {}, notify, 'Avisar al cliente'), btn);
}

function orderCard(o) {
  return h('div', { class: 'card' },
    h('div', { class: 'head' }, h('h3', {}, `#${o.id} · ${o.customerName}`), chipFor(o.status)),
    h('div', { class: 'muted' }, `${o.type === 'domicilio' ? 'A domicilio' : 'Retiro en el local'} · ${money(o.subtotalCents, o.currency)} · ${when(o.createdAt)} · `, wa(o.customerPhone)),
    h('ul', { class: 'items' }, o.items.map((i) => h('li', {}, `${i.qty} x ${i.name} — ${money(i.priceCents * i.qty, o.currency)}`))),
    o.type === 'domicilio' ? h('div', {}, `Dirección: ${o.address}${o.reference ? ` (${o.reference})` : ''}`) : null,
    o.notes ? h('div', {}, `Notas: ${o.notes}`) : null,
    statusActions(ORDER_STATUS, o.status, (status, notify) => api(`/orders/${o.id}/status`, { method: 'POST', body: { status, notify } })));
}

function reservationCard(r) {
  return h('div', { class: 'card' },
    h('div', { class: 'head' }, h('h3', {}, `#${r.id} · ${r.customerName}`), chipFor(r.status)),
    h('div', { class: 'muted' }, `${r.date} a las ${r.time} · ${r.partySize} personas · `, wa(r.customerPhone)),
    r.notes ? h('div', {}, `Notas: ${r.notes}`) : null,
    statusActions(RES_STATUS, r.status, (status, notify) => api(`/reservations/${r.id}/status`, { method: 'POST', body: { status, notify } })));
}

function listView(title, path, key, card, filters, emptyText) {
  const filter = h('select', { onchange: () => load() }, filters.map(([v, l]) => opt(v, l)));
  const list = h('div', { class: 'list' });
  async function load() {
    try {
      const data = await api(`${path}?status=${encodeURIComponent(filter.value)}`);
      list.replaceChildren(...(data[key].length ? data[key].map(card) : [empty(emptyText)]));
    } catch (e) { fail(e); }
  }
  view.replaceChildren(toolbar(title, filter, h('button', { onclick: refresh }, 'Actualizar')), list);
  return load();
}

const ordersView = () => listView('Pedidos', '/orders', 'orders', orderCard, [['activos', 'Activos'], ...Object.entries(ORDER_STATUS), ['todos', 'Todos']], 'No hay pedidos con este filtro.');
const reservationsView = () => listView('Reservas', '/reservations', 'reservations', reservationCard, [['activos', 'Pendientes y confirmadas'], ...Object.entries(RES_STATUS), ['todos', 'Todas']], 'No hay reservas con este filtro.');

// ---------- preguntas sin respuesta ----------
function unansweredCard(q) {
  const slot = h('div', {});
  const answer = h('textarea', { rows: 4 });
  const more = h('textarea', { rows: 3, placeholder: 'Una por línea' });
  const category = h('input', { type: 'text', maxlength: 40 });
  const notify = h('input', { type: 'checkbox', checked: true });
  const form = h('form', { class: 'stack', onsubmit: async (e) => {
    e.preventDefault();
    try {
      const r = await api(`/unanswered/${q.id}/answer`, { method: 'POST', body: { answer: answer.value, category: category.value, variants: more.value.split('\n'), notifyCustomer: notify.checked } });
      toast(r.notified === null ? 'Respuesta guardada.' : r.notified ? 'Respuesta guardada y enviada al cliente.' : 'Respuesta guardada, pero no se pudo enviar al cliente (¿pasaron más de 24 h?).');
      refresh();
    } catch (err) { fail(err); }
  } },
  h('label', {}, 'Respuesta', answer), h('label', {}, 'Otras formas de preguntarlo', more), h('label', {}, 'Categoría (opcional)', category),
  h('label', {}, h('span', {}, notify, ' Enviar esta respuesta también al cliente que preguntó')),
  h('div', { class: 'actions' }, h('button', { class: 'primary', type: 'submit' }, 'Guardar respuesta'), h('button', { type: 'button', onclick: () => slot.replaceChildren() }, 'Cerrar')));
  return h('div', { class: 'card' },
    h('div', { class: 'head' }, h('h3', {}, `«${q.question}»`), h('span', { class: 'chip ' + (q.status === 'nueva' ? 'warn' : 'good') }, q.status)),
    h('div', { class: 'muted' }, `${when(q.createdAt)} · `, wa(q.phone)),
    h('div', { class: 'actions' },
      h('button', { class: 'primary', onclick: () => slot.replaceChildren(form) }, 'Responder'),
      h('button', { class: 'danger', onclick: async () => { try { await api(`/unanswered/${q.id}/discard`, { method: 'POST' }); refresh(); } catch (e) { fail(e); } } }, 'Descartar')),
    slot);
}
const unansweredView = () => listView('Preguntas sin respuesta', '/unanswered', 'questions', unansweredCard, [['nueva', 'Nuevas'], ['resuelta', 'Resueltas'], ['descartada', 'Descartadas'], ['todos', 'Todas']], 'No hay preguntas pendientes.');

// ---------- respuestas guardadas ----------
function entryForm(entry, done) {
  const variants = h('textarea', { rows: 4, placeholder: 'Una por línea, p. ej.: ¿tienen estacionamiento?', value: entry ? entry.variants.join('\n') : '' });
  const answer = h('textarea', { rows: 5, value: entry ? entry.answer : '' });
  const category = h('input', { type: 'text', maxlength: 40, value: entry ? entry.category : '' });
  const active = h('input', { type: 'checkbox', checked: entry ? entry.active : true });
  return h('form', { class: 'stack card', onsubmit: async (e) => {
    e.preventDefault();
    const body = { variants: variants.value.split('\n'), answer: answer.value, category: category.value, active: active.checked };
    try {
      await (entry ? api(`/knowledge/${entry.id}`, { method: 'PUT', body }) : api('/knowledge', { method: 'POST', body }));
      toast('Guardado.'); done();
    } catch (err) { fail(err); }
  } },
  h('label', {}, 'Formas de hacer la pregunta', variants), h('label', {}, 'Respuesta', answer), h('label', {}, 'Categoría (opcional)', category),
  entry ? h('label', {}, h('span', {}, active, ' Activa')) : null,
  h('div', { class: 'actions' }, h('button', { class: 'primary', type: 'submit' }, 'Guardar'), h('button', { type: 'button', onclick: done }, 'Cancelar')));
}

async function knowledgeView() {
  const box = h('div', { class: 'list' });
  const list = h('div', { class: 'list' });
  const add = h('button', { class: 'primary', onclick: () => box.replaceChildren(entryForm(null, () => { box.replaceChildren(); load(); })) }, 'Nueva respuesta');
  view.replaceChildren(toolbar('Respuestas guardadas', add), box, list);
  async function load() {
    try {
      const { entries } = await api('/knowledge');
      list.replaceChildren(...(entries.length ? entries.map((e) => h('div', { class: 'card' },
        h('div', { class: 'head' }, h('h3', {}, e.variants[0] || '(sin preguntas)'), h('span', { class: 'chip ' + (e.active ? 'good' : 'bad') }, e.active ? 'Activa' : 'Inactiva')),
        h('div', { class: 'muted' }, [e.category, ...e.variants.slice(1)].filter(Boolean).join(' · ')),
        h('div', { class: 'answer' }, e.answer),
        h('div', { class: 'actions' },
          h('button', { onclick: () => { box.replaceChildren(entryForm(e, () => { box.replaceChildren(); load(); })); window.scrollTo(0, 0); } }, 'Editar'),
          h('button', { class: 'danger', onclick: async () => { if (confirm('¿Borrar esta respuesta?')) { try { await api(`/knowledge/${e.id}`, { method: 'DELETE' }); load(); } catch (err) { fail(err); } } } }, 'Borrar')))) : [empty('Aún no hay respuestas guardadas.')]));
    } catch (e) { fail(e); }
  }
  await load();
}

// ---------- probador ----------
function testerView() {
  const input = h('input', { type: 'text', maxlength: 500, placeholder: 'Escribe como lo haría un cliente…' });
  const result = h('div', {});
  const run = async (e) => {
    e.preventDefault();
    try {
      const r = await api('/test', { method: 'POST', body: { text: input.value } });
      result.replaceChildren(h('div', { class: 'card' },
        h('div', { class: 'head' }, h('h3', {}, r.found ? 'El bot respondería' : 'El bot no tiene respuesta'), r.found ? h('span', { class: 'chip good' }, `fuente: ${r.source}${r.score != null ? ` · parecido ${r.score}` : ''}`) : h('span', { class: 'chip warn' }, 'sin respuesta')),
        r.text ? h('div', { class: 'answer' }, r.text) : null,
        !r.found && r.intent ? h('div', { class: 'muted' }, `Pero reconocería que quiere: ${r.intent}.`) : null,
        h('div', { class: 'muted' }, 'El probador no consulta el modelo de lenguaje.')));
    } catch (err) { fail(err); }
  };
  view.replaceChildren(toolbar('Probador'), h('form', { class: 'card stack', onsubmit: run }, input, h('div', { class: 'actions' }, h('button', { class: 'primary', type: 'submit' }, 'Probar'))), result);
}

// ---------- personas (escalados) ----------
function escalationCard(e) {
  return h('div', { class: 'card' },
    h('div', { class: 'head' }, h('h3', {}, e.name || 'Sin nombre'), h('span', { class: 'chip ' + (e.status === 'abierto' ? 'warn' : 'good') }, e.status)),
    h('div', { class: 'muted' }, `${when(e.createdAt)} · `, wa(e.phone), e.notified ? ' · el personal fue avisado' : ' · no se pudo avisar al personal'),
    e.context ? h('div', { class: 'answer' }, `Su última pregunta: «${e.context}»`) : null,
    e.status === 'abierto' ? h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: async () => { try { await api(`/escalations/${e.id}/close`, { method: 'POST' }); refresh(); } catch (err) { fail(err); } } }, 'Marcar como atendido')) : null);
}
const escalationsView = () => listView('Clientes que piden a una persona', '/escalations', 'escalations', escalationCard, [['abierto', 'Abiertos'], ['atendido', 'Atendidos'], ['todos', 'Todos']], 'No hay casos abiertos.');

// ---------- estructura ----------
const TABS = [
  { id: 'orders', label: 'Pedidos', badge: 'ordersNew', render: ordersView },
  { id: 'reservations', label: 'Reservas', badge: 'reservationsPending', render: reservationsView },
  { id: 'unanswered', label: 'Sin respuesta', badge: 'unansweredNew', render: unansweredView },
  { id: 'knowledge', label: 'Respuestas', render: knowledgeView },
  { id: 'tester', label: 'Probador', render: testerView },
  { id: 'escalations', label: 'Personas', badge: 'escalationsOpen', render: escalationsView },
];
let view; let current = 'orders'; let timer;

function setBadges(counts) {
  for (const t of TABS) {
    if (!t.badge) continue;
    const el = document.querySelector(`[data-badge="${t.badge}"]`);
    if (!el) continue;
    el.textContent = counts[t.badge] || 0;
    el.className = 'badge' + (counts[t.badge] ? '' : ' zero');
  }
}

async function refreshCounts() {
  try { setBadges((await api('/summary')).counts); } catch (e) { fail(e); }
}

function go(id) {
  current = id;
  document.querySelectorAll('nav.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === id));
  Promise.resolve(TABS.find((t) => t.id === id).render()).catch(fail);
  refreshCounts();
}
const refresh = () => go(current);

function showPanel() {
  view = h('main', {});
  const nav = h('nav', { class: 'tabs' }, TABS.map((t) => h('button', { 'data-tab': t.id, onclick: () => go(t.id) }, t.label, t.badge ? h('span', { class: 'badge zero', 'data-badge': t.badge }, '0') : null)));
  const logout = h('button', { onclick: async () => { await fetch('/admin/logout', { method: 'POST', credentials: 'same-origin', headers: { 'X-Requested-With': 'fetch' } }); showLogin(); } }, 'Salir');
  app.replaceChildren(h('header', { class: 'top' }, h('h1', {}, 'Sahir Resto Bar · Panel'), logout), nav, view);
  go(current);
  clearInterval(timer);
  timer = setInterval(refreshCounts, 30000);
}

async function boot() {
  try { await api('/summary'); showPanel(); } catch (e) { if (e.message !== 'unauth') showLogin(); }
}
boot();
