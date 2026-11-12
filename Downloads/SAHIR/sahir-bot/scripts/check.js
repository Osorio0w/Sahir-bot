// Revisión previa: comprueba de una vez .env, token, número, suscripción, servidor y túnel.
// Uso: npm run check   (con el servidor corriendo y, si quieres revisar el túnel, PUBLIC_URL en el .env)
require('dotenv').config();

const G = process.env.GRAPH_VERSION || 'v23.0';
const PORT = process.env.PORT || 3000;
const { VERIFY_TOKEN = '', ACCESS_TOKEN = '', PHONE_NUMBER_ID = '', APP_SECRET = '', WABA_ID = '', AGENT_PHONE = '' } = process.env;
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/+$/, '');

let fails = 0;
const ok = (m) => console.log('  [OK]     ' + m);
const warn = (m) => console.log('  [AVISO]  ' + m);
const bad = (m) => { fails++; console.log('  [FALLA]  ' + m); };
const title = (t) => console.log('\n' + t);

async function get(url, headers = {}) {
  try {
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: r.status, json, text };
  } catch (e) {
    return { error: e.message };
  }
}
const graph = (path, token = ACCESS_TOKEN) => get(`https://graph.facebook.com/${G}/${path}`, { Authorization: `Bearer ${token}` });

(async () => {
  title('1. Variables del .env');
  if (!VERIFY_TOKEN) bad('VERIFY_TOKEN está vacío.');
  else if (VERIFY_TOKEN.startsWith('EAA') || VERIFY_TOKEN.length > 40) bad('VERIFY_TOKEN parece un token de Meta. Debe ser un texto corto que inventas tú (ej. sahir2026).');
  else if (VERIFY_TOKEN === 'inventa_un_texto_largo') bad('VERIFY_TOKEN sigue con el valor de ejemplo.');
  else ok('VERIFY_TOKEN tiene formato razonable.');
  if (!ACCESS_TOKEN) bad('ACCESS_TOKEN está vacío.');
  else if (!ACCESS_TOKEN.startsWith('EAA')) warn('ACCESS_TOKEN no empieza por EAA; revisa que lo copiaste completo.');
  else ok('ACCESS_TOKEN presente.');
  if (!/^\d{10,}$/.test(PHONE_NUMBER_ID)) bad('PHONE_NUMBER_ID debe ser solo dígitos (viene de Configuración de la API).');
  else ok('PHONE_NUMBER_ID presente.');
  if (!APP_SECRET) warn('APP_SECRET vacío: no se valida la firma de Meta.');
  else if (!/^[0-9a-f]{32}$/i.test(APP_SECRET)) bad('APP_SECRET no tiene el formato de la clave secreta (32 caracteres). ¿Pegaste un token de acceso?');
  else ok('APP_SECRET tiene el formato correcto.');
  if (!AGENT_PHONE) warn('AGENT_PHONE vacío (aún no se usa).'); else ok('AGENT_PHONE presente.');

  title('2. Token de acceso (Meta)');
  let appId = process.env.APP_ID || '';
  if (ACCESS_TOKEN) {
    const r = await get(`https://graph.facebook.com/${G}/debug_token?input_token=${encodeURIComponent(ACCESS_TOKEN)}&access_token=${encodeURIComponent(ACCESS_TOKEN)}`);
    if (r.error) bad('No se pudo contactar a Meta: ' + r.error + ' (¿internet o VPN?).');
    else if (r.json?.error) bad(`Meta rechazó el token (${r.json.error.code}): ${r.json.error.message}. Genera uno nuevo.`);
    else if (r.json?.data) {
      const d = r.json.data;
      appId = appId || d.app_id || '';
      if (!d.is_valid) bad('El token no es válido o caducó. Genera uno nuevo.');
      else {
        ok('Token válido.');
        if (d.expires_at === 0) ok('No caduca (token permanente).');
        else if (d.expires_at) {
          const h = (d.expires_at * 1000 - Date.now()) / 36e5;
          if (h < 6) warn(`Caduca en ${h.toFixed(1)} horas.`); else ok(`Caduca en ${h.toFixed(1)} horas.`);
        }
        const scopes = d.scopes || [];
        if (scopes.includes('whatsapp_business_messaging')) ok('Tiene el permiso whatsapp_business_messaging.');
        else bad('Falta el permiso whatsapp_business_messaging (el envío dará error 131005).');
      }
    } else warn('Respuesta inesperada de Meta al revisar el token.');
  }

  title('3. Número de WhatsApp');
  if (ACCESS_TOKEN && PHONE_NUMBER_ID) {
    const r = await graph(`${PHONE_NUMBER_ID}?fields=display_phone_number,verified_name`);
    if (r.error) bad('No se pudo contactar a Meta: ' + r.error);
    else if (r.json?.error) bad(`No se pudo leer el número (${r.json.error.code}): ${r.json.error.message}`);
    else ok(`Número ${r.json.display_phone_number || '?'} accesible con este token.`);
  }

  title('4. Suscripción de la app a la cuenta de WhatsApp Business');
  if (!WABA_ID) warn('Agrega WABA_ID al .env (Identificador de la cuenta de mensajes) para comprobarla.');
  else {
    const r = await graph(`${WABA_ID}/subscribed_apps`);
    if (r.error) bad('No se pudo contactar a Meta: ' + r.error);
    else if (r.json?.error) bad(`No se pudo leer la suscripción (${r.json.error.code}): ${r.json.error.message}`);
    else {
      const ids = (r.json.data || []).map((x) => x.whatsapp_business_api_data?.id);
      if (!appId) warn('No pude saber el ID de tu app; agrega APP_ID al .env.');
      else if (ids.includes(appId)) ok('Tu app está suscrita a la cuenta.');
      else bad('Tu app NO está suscrita: los mensajes reales no llegarán. POST a /' + WABA_ID + '/subscribed_apps.');
    }
  }

  title('5. Servidor local');
  const h = await get(`http://localhost:${PORT}/health`);
  if (h.error || h.status !== 200) bad(`El servidor no responde en el puerto ${PORT}. Arranca con npm run dev.`);
  else {
    ok('El servidor responde.');
    const v = await get(`http://localhost:${PORT}/webhook?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(VERIFY_TOKEN)}&hub.challenge=check123`);
    if (v.text === 'check123') ok('El servidor usa el mismo VERIFY_TOKEN del .env.');
    else bad('El servidor corriendo no coincide con el VERIFY_TOKEN del .env. Reinícialo (Ctrl + C y npm run dev).');
  }

  title('6. Túnel y webhook guardado en Meta');
  if (!PUBLIC_URL) warn('Pon PUBLIC_URL en el .env (la URL que muestra cloudflared) para revisar el túnel.');
  else {
    const t = await get(`${PUBLIC_URL}/health`);
    if (t.error || t.status !== 200) bad('La URL pública no responde. El túnel está caído o la URL cambió.');
    else {
      ok('La URL pública llega a tu servidor.');
      const v = await get(`${PUBLIC_URL}/webhook?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(VERIFY_TOKEN)}&hub.challenge=check123`);
      if (v.text === 'check123') ok('El webhook verifica a través del túnel.'); else bad('El webhook no verifica a través del túnel.');
    }
    if (appId && APP_SECRET) {
      const s = await get(`https://graph.facebook.com/${G}/${appId}/subscriptions?access_token=${appId}|${APP_SECRET}`);
      const w = s.json?.data?.find((x) => x.object === 'whatsapp_business_account');
      if (!w) warn('No pude leer el webhook guardado en Meta.');
      else {
        if (w.callback_url === `${PUBLIC_URL}/webhook`) ok('Meta tiene guardada esta misma URL.');
        else bad(`Meta tiene guardada otra URL: ${w.callback_url}. Actualízala en WhatsApp > Configuración > Webhook.`);
        if (!(w.fields || []).some((f) => f.name === 'messages')) bad('El campo messages no está suscrito.');
      }
    } else warn('Para comparar con la URL guardada en Meta hacen falta APP_ID (o un token válido) y APP_SECRET.');
  }

  title('7. Base de datos');
  if (!process.env.DATABASE_URL) warn('DATABASE_URL vacío: el bot usa memoria y pierde las sesiones al reiniciar.');
  else {
    try {
      const { pool } = require('../src/store/db');
      await pool.query('SELECT 1');
      ok('Conexión a PostgreSQL correcta.');
      const t = await pool.query("SELECT to_regclass('public.schema_migrations') AS t");
      if (t.rows[0].t) ok('Las migraciones están aplicadas.'); else warn('Aún no se aplicaron las migraciones (se aplican al arrancar el servidor o con npm run migrate).');
      await pool.end();
    } catch (e) {
      bad('No se pudo conectar a la base de datos: ' + e.message);
    }
  }

  console.log('\n' + (fails ? `Hay ${fails} problema(s) por resolver.` : 'Todo en orden.'));
  process.exit(fails ? 1 : 0);
})();
