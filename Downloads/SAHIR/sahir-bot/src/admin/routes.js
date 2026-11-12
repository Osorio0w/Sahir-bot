const express = require('express');
const path = require('path');
const auth = require('./auth');
const createApi = require('./api');
const log = require('../utils/logger');

const COOKIE = 'sahir_admin';
const PUBLIC = path.join(__dirname, 'public');
const api = createApi();
const router = express.Router();

function setCookie(req, res, value, maxAgeSeconds) {
  const secure = req.secure || req.get('x-forwarded-proto') === 'https';
  res.setHeader('Set-Cookie', `${COOKIE}=${value}; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=${maxAgeSeconds}${secure ? '; Secure' : ''}`);
}

router.use((req, res, next) => {
  res.set({
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'",
  });
  if (!auth.enabled()) return res.status(503).type('text/plain').send('Panel desactivado: define ADMIN_PASSWORD en el .env y reinicia el servidor.');
  next();
});

router.get('/', (_req, res) => res.sendFile(path.join(PUBLIC, 'index.html')));
router.use('/assets', express.static(PUBLIC, { index: false }));

// Contra peticiones falsas desde otras páginas: todo lo que cambia datos exige este encabezado.
router.use((req, res, next) => {
  if (req.method !== 'GET' && req.get('x-requested-with') !== 'fetch') return res.status(403).json({ error: 'Petición no permitida' });
  next();
});

router.post('/login', (req, res) => {
  const r = auth.login(req.body?.user, req.body?.password, req.ip);
  if (!r.ok) {
    log.warn(`Panel: intento de acceso fallido (${r.reason})`);
    return res.status(r.reason === 'bloqueado' ? 429 : 401).json({ error: r.reason === 'bloqueado' ? 'Demasiados intentos. Espera unos minutos.' : 'Usuario o contraseña incorrectos.' });
  }
  setCookie(req, res, r.token, Math.floor(auth.SESSION_MS / 1000));
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  auth.logout(auth.parseCookie(req.get('cookie'), COOKIE));
  setCookie(req, res, '', 0);
  res.json({ ok: true });
});

router.use('/api', (req, res, next) => {
  if (auth.validate(auth.parseCookie(req.get('cookie'), COOKIE))) return next();
  res.status(401).json({ error: 'No autorizado' });
});

function route(method, p, action) {
  router[method](`/api${p}`, async (req, res) => {
    try {
      const r = await action({ params: req.params, query: req.query, body: req.body || {} });
      res.status(r.status || 200).json(r.body);
    } catch (err) {
      log.error('Panel:', err.message);
      res.status(500).json({ error: 'Error interno' });
    }
  });
}

route('get', '/summary', api.summary);
route('get', '/orders', api.listOrders);
route('post', '/orders/:id/status', api.setOrderStatus);
route('get', '/reservations', api.listReservations);
route('post', '/reservations/:id/status', api.setReservationStatus);
route('get', '/unanswered', api.listUnanswered);
route('post', '/unanswered/:id/discard', api.discardUnanswered);
route('post', '/unanswered/:id/answer', api.answerUnanswered);
route('get', '/knowledge', api.listKnowledge);
route('post', '/knowledge', api.createKnowledge);
route('put', '/knowledge/:id', api.updateKnowledge);
route('delete', '/knowledge/:id', api.deleteKnowledge);
route('post', '/test', api.testQuestion);
route('get', '/escalations', api.listEscalations);
route('post', '/escalations/:id/close', api.closeEscalation);

module.exports = router;
