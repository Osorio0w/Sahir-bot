// Simula un mensaje entrante de Meta contra tu servidor local (sin usar WhatsApp).
// Uso: npm run simulate -- "hola" 584121234567
// Ojo: el bot intentará responder de verdad a ese número por la API de WhatsApp.
require('dotenv').config();
const crypto = require('crypto');

const port = process.env.PORT || 3000;
const text = process.argv[2] || 'hola';
const from = process.argv[3] || '584120000000';

const body = {
  object: 'whatsapp_business_account',
  entry: [{ id: '0', changes: [{ field: 'messages', value: {
    messaging_product: 'whatsapp',
    metadata: { display_phone_number: '0', phone_number_id: process.env.PHONE_NUMBER_ID || '0' },
    contacts: [{ profile: { name: 'Prueba Local' }, wa_id: from }],
    messages: [{ from, id: 'wamid.SIM' + Date.now(), timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: text } }],
  } }] }],
};

const raw = JSON.stringify(body);
const headers = { 'Content-Type': 'application/json' };
if (process.env.APP_SECRET) {
  headers['x-hub-signature-256'] = 'sha256=' + crypto.createHmac('sha256', process.env.APP_SECRET).update(raw).digest('hex');
}

fetch(`http://localhost:${port}/webhook`, { method: 'POST', headers, body: raw })
  .then((r) => console.log('Respuesta del servidor:', r.status))
  .catch((e) => console.error('No se pudo conectar:', e.message));
