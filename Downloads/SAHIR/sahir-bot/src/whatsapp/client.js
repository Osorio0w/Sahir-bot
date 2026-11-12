const config = require('../config');
const log = require('../utils/logger');

const { phoneNumberId, accessToken, graphVersion } = config.whatsapp;
const URL = `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`;

const clip = (s, n) => String(s).slice(0, n); // WhatsApp rechaza textos más largos que sus límites

async function send(payload) {
  try {
    const res = await fetch(URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      log.error('API de WhatsApp respondió', res.status, JSON.stringify(data));
      return { ok: false, error: data };
    }
    return { ok: true, data };
  } catch (err) {
    log.error('No se pudo contactar a la API de WhatsApp:', err.message);
    return { ok: false, error: err.message };
  }
}

const sendText = (to, body) => send({ to, type: 'text', text: { body: clip(body, 4096) } });

/** Hasta 3 botones; el título admite 20 caracteres. */
const sendButtons = (to, body, buttons) =>
  send({
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: clip(body, 1024) },
      action: {
        buttons: buttons.slice(0, 3).map((b) => ({
          type: 'reply',
          reply: { id: clip(b.id, 256), title: clip(b.title, 20) },
        })),
      },
    },
  });

/** Lista: máximo 10 filas en total; título de fila 24 caracteres, descripción 72. */
function sendList(to, { body, buttonLabel = 'Ver opciones', sections }) {
  let left = 10;
  const out = [];
  for (const s of sections) {
    if (left <= 0) break;
    const rows = s.rows.slice(0, left).map((r) => ({
      id: clip(r.id, 200),
      title: clip(r.title, 24),
      ...(r.description ? { description: clip(r.description, 72) } : {}),
    }));
    left -= rows.length;
    out.push({ title: clip(s.title || 'Opciones', 24), rows });
  }
  return send({
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: clip(body, 1024) },
      action: { button: clip(buttonLabel, 20), sections: out },
    },
  });
}

/** "Canal" ligado a un cliente: es lo único que conversation/ necesita para responder. */
function channelFor(to) {
  return {
    sendText: (text) => sendText(to, text),
    sendButtons: (body, buttons) => sendButtons(to, body, buttons),
    sendList: (opts) => sendList(to, opts),
  };
}

module.exports = { sendText, sendButtons, sendList, channelFor };
