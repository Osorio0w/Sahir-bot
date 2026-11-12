/**
 * Convierte el payload de Meta en mensajes "neutros".
 * El resto del bot (conversation/, knowledge/) solo conoce este formato:
 *   { id, from, name, timestamp, type: 'text'|'option'|'unsupported', text, optionId }
 */
function extractMessages(body) {
  const out = [];
  if (body?.object !== 'whatsapp_business_account') return out;

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      if (!value.messages) continue; // p. ej. "statuses" (enviado/leído): se ignoran
      const names = Object.fromEntries((value.contacts || []).map((c) => [c.wa_id, c.profile?.name]));
      for (const m of value.messages) out.push(toNeutral(m, names[m.from]));
    }
  }
  return out;
}

function toNeutral(m, name) {
  const base = {
    id: m.id,
    from: m.from,
    name: name || '',
    timestamp: Number(m.timestamp) || null,
    type: 'unsupported',
    text: '',
    optionId: null,
  };

  switch (m.type) {
    case 'text':
      return { ...base, type: 'text', text: m.text?.body || '' };
    case 'interactive': {
      const reply = m.interactive?.button_reply || m.interactive?.list_reply;
      return reply ? { ...base, type: 'option', text: reply.title || '', optionId: reply.id } : base;
    }
    case 'button': // respuesta rápida de una plantilla
      return { ...base, type: 'option', text: m.button?.text || '', optionId: m.button?.payload || null };
    default:
      return base;
  }
}

module.exports = { extractMessages };
