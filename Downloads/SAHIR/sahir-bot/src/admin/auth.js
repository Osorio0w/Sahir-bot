/**
 * Autenticación del panel: un usuario y contraseña definidos en el .env, y una cookie de sesión
 * aleatoria (HttpOnly, SameSite=Strict). Las sesiones viven en memoria: al reiniciar hay que volver a entrar.
 * Bloquea el acceso tras varios intentos fallidos seguidos.
 */
const crypto = require('crypto');
const config = require('../config');

const SESSION_MS = 12 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const sessions = new Map();
const attempts = new Map();

const enabled = () => Boolean(config.admin.password);
const digest = (s) => crypto.createHash('sha256').update(String(s)).digest();
const same = (a, b) => crypto.timingSafeEqual(digest(a), digest(b)); // compara sin filtrar el largo ni el tiempo

function blocked(key) {
  const a = attempts.get(key);
  if (!a) return false;
  if (Date.now() > a.resetAt) { attempts.delete(key); return false; }
  return a.count >= MAX_ATTEMPTS;
}

/** -> { ok: true, token } | { ok: false, reason: 'bloqueado' | 'credenciales' } */
function login(user, password, key = 'global') {
  if (blocked(key)) return { ok: false, reason: 'bloqueado' };
  const userOk = same(user, config.admin.user);
  const passOk = same(password, config.admin.password);
  if (!(userOk && passOk)) {
    const a = attempts.get(key) || { count: 0, resetAt: Date.now() + WINDOW_MS };
    a.count += 1;
    attempts.set(key, a);
    return { ok: false, reason: 'credenciales' };
  }
  attempts.delete(key);
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_MS);
  return { ok: true, token };
}

function validate(token) {
  if (!token) return false;
  const exp = sessions.get(token);
  if (!exp) return false;
  if (Date.now() > exp) { sessions.delete(token); return false; }
  return true;
}

const logout = (token) => sessions.delete(token);

function parseCookie(header, name) {
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return '';
}

module.exports = { enabled, login, validate, logout, parseCookie, SESSION_MS };
