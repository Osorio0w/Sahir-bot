require('dotenv').config();
const log = require('../utils/logger');

const bool = (v, d = false) =>
  v === undefined || v === '' ? d : ['1', 'true', 'si', 'sí', 'yes'].includes(String(v).toLowerCase());

const config = {
  port: Number(process.env.PORT) || 3000,
  whatsapp: {
    verifyToken: process.env.VERIFY_TOKEN || '',
    accessToken: process.env.ACCESS_TOKEN || '',
    phoneNumberId: process.env.PHONE_NUMBER_ID || '',
    appSecret: process.env.APP_SECRET || '',
    graphVersion: process.env.GRAPH_VERSION || 'v23.0',
  },
  datasource: {
    mode: process.env.DATASOURCE || 'mock',
    apiBaseUrl: process.env.RESTAURANT_API_URL || '',
    apiKey: process.env.RESTAURANT_API_KEY || '',
  },
  llm: {
    enabled: bool(process.env.USE_LLM, false),
    provider: process.env.LLM_PROVIDER || 'deepseek',
    apiKey: process.env.LLM_PROVIDER === 'gemini' 
      ? (process.env.GEMINI_API_KEY || '') 
      : (process.env.DEEPSEEK_API_KEY || ''),
    model: process.env.LLM_PROVIDER === 'gemini'
      ? (process.env.GEMINI_MODEL || 'gemini-3.8-flash')
      : (process.env.DEEPSEEK_MODEL || ''),
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS) || 5000,
    // Tras un fallo, no se vuelve a consultar al modelo durante este tiempo (evita esperas y gasto de cupo).
    cooldownSeconds: process.env.LLM_COOLDOWN_SECONDS !== undefined && process.env.LLM_COOLDOWN_SECONDS !== '' ? Number(process.env.LLM_COOLDOWN_SECONDS) : 60,
  },
  database: {
    url: process.env.DATABASE_URL || '',
    ssl: bool(process.env.DATABASE_SSL, false),
  },
  escalation: { agentPhone: process.env.AGENT_PHONE || '' },
  // Panel de administración: sin ADMIN_PASSWORD queda desactivado.
  admin: {
    user: process.env.ADMIN_USER || 'admin',
    password: process.env.ADMIN_PASSWORD || '',
  },
  knowledge: { threshold: Number(process.env.KNOWLEDGE_THRESHOLD) || 0.6 },
  // Zona horaria por defecto; si los horarios del restaurante traen la suya, se usa esa.
  timezone: process.env.TIMEZONE || 'America/Caracas',
  reservations: {
    maxParty: Number(process.env.RESERVATION_MAX_PARTY) || 12,
    daysAhead: Number(process.env.RESERVATION_DAYS_AHEAD) || 7,
    slotMinutes: Number(process.env.RESERVATION_SLOT_MINUTES) || 60,
    leadMinutes: Number(process.env.RESERVATION_LEAD_MINUTES) || 60,
  },
  sessionTtlMinutes: Number(process.env.SESSION_TTL_MINUTES) || 30,
};

/** Avisa al arrancar si falta algo importante. */
function checkConfig() {
  const w = config.whatsapp;
  if (!w.verifyToken) log.warn('Falta VERIFY_TOKEN: Meta no podrá verificar el webhook.');
  if (!w.accessToken) log.warn('Falta ACCESS_TOKEN: el bot no podrá enviar mensajes.');
  if (!w.phoneNumberId) log.warn('Falta PHONE_NUMBER_ID: el bot no podrá enviar mensajes.');
  if (!w.appSecret) log.warn('APP_SECRET vacío: no se valida la firma de Meta (solo para desarrollo).');
  
  if (config.llm.enabled && !config.llm.apiKey) {
    log.warn(`USE_LLM está activo pero falta la API key para el proveedor: ${config.llm.provider}`);
  }

  if (!config.database.url) log.warn('Sin DATABASE_URL: sesiones y preguntas se guardan en memoria y se pierden al reiniciar.');
  if (!config.admin.password) log.warn('Sin ADMIN_PASSWORD: el panel de administración está desactivado.');
  else if (config.admin.password.length < 10) log.warn('ADMIN_PASSWORD es corta: usa al menos 10 caracteres (el panel queda expuesto por el túnel).');
  if (config.datasource.mode === 'api' && !config.datasource.apiBaseUrl)
    log.warn('DATASOURCE=api pero falta RESTAURANT_API_URL.');
}

module.exports = config;
module.exports.checkConfig = checkConfig;
