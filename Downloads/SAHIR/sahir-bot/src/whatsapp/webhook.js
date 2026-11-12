const express = require('express');
const config = require('../config');
const log = require('../utils/logger');
const store = require('../store');
const { isValidSignature } = require('./signature');
const { extractMessages } = require('./normalize');
const { channelFor, sendText } = require('./client');
const { runExclusive } = require('../utils/keyedQueue');
const { handleIncoming } = require('../conversation/router');

const router = express.Router();

/** Avisa al personal por WhatsApp. Ojo: WhatsApp solo deja escribir libremente a quien te escribió en las últimas 24 h. */
async function notifyStaff(text) {
  const to = config.escalation.agentPhone;
  if (!to) {
    log.warn('AGENT_PHONE vacío: no se avisó al personal.');
    return { ok: false };
  }
  const r = await sendText(to, text);
  if (!r.ok) log.warn('No se pudo avisar al personal. Si pasaron más de 24 h desde que ese número escribió al bot, hace falta una plantilla aprobada.');
  return r;
}

// Verificación inicial (Meta la llama una vez al registrar el webhook)
router.get('/webhook', (req, res) => {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
  if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
    log.info('Webhook verificado');
    return res.status(200).send(challenge);
  }
  log.warn('Verificación fallida: el token no coincide');
  return res.sendStatus(403);
});

// Recepción de eventos
router.post('/webhook', (req, res) => {
  if (!isValidSignature(req.rawBody, req.get('x-hub-signature-256'), config.whatsapp.appSecret)) {
    log.warn('Firma inválida, petición ignorada');
    return res.sendStatus(401);
  }
  res.sendStatus(200); // responder ya: Meta reintenta si tardamos
  processBody(req.body).catch((err) => log.error('Error procesando el evento:', err));
});

async function processBody(body) {
  for (const msg of extractMessages(body)) {
    // Si la base falla, igual atendemos al cliente (con riesgo de duplicado) en vez de dejarlo sin respuesta.
    let first = true;
    try {
      first = await store.claimMessage(msg.id);
    } catch (err) {
      log.error('No se pudo comprobar si el mensaje era duplicado:', err.message);
    }
    if (!first) {
      log.info('Mensaje duplicado ignorado', msg.id);
      continue;
    }

    log.info(`Mensaje de ${msg.from} (tipo: ${msg.type})`); // no se registra el contenido
    store.upsertCustomer({ phone: msg.from, name: msg.name }).catch((err) => log.error('No se pudo guardar el cliente:', err.message));

    const channel = channelFor(msg.from);
    try {
      await runExclusive(msg.from, () => handleIncoming(msg, channel, { notifyStaff }));
    } catch (err) {
      log.error('Falló la atención del mensaje', msg.id, err);
      await channel.sendText('Tuvimos un problema al procesar tu mensaje. Intenta de nuevo en un momento.').catch(() => {});
    }
  }
}

module.exports = router;
