# Sahir Bot (paso 1: esqueleto)

Chatbot de WhatsApp para Sahir Resto Bar (WhatsApp Cloud API + Node.js/Express).

## Arrancar

1. `npm install`
2. Copia `.env.example` como `.env` y rellena los valores (tus datos de Meta).
3. `npm run dev`
4. Expón el puerto 3000 con tu túnel (cloudflared) y registra `https://TU-URL/webhook` en Meta.

## Probar sin WhatsApp

Con el servidor corriendo: `npm run simulate -- "hola" 584121234567`
(el bot intentará responder de verdad a ese número).

## Estructura

| Carpeta | Qué hace |
|---|---|
| `src/whatsapp/` | Webhook, firma, mensajes neutros, evitar duplicados, envío |
| `src/conversation/` | Enrutador, menú principal y flujos: menú, pedidos, reservas y escalado a una persona; reconoce frases como «quiero reservar» |
| `src/knowledge/` | Conocimiento: resolutores con datos del restaurante (horario) + modelo opcional (Gemini listo, DeepSeek pendiente) |
| `src/datasources/` | Datos del restaurante, solo lectura (hoy simulados) |
| `src/admin/` | Panel de administración (acciones, acceso y pantallas web) |
| `src/store/` | Datos propios: PostgreSQL con `DATABASE_URL`, o memoria si no hay |
| `db/migrations/` | Esquema de la base (se aplica solo al arrancar, o con `npm run migrate`) |
| `data/mock/` | Menú y datos de ejemplo |

Regla: `conversation/` y `knowledge/` no conocen el formato de Meta ni la API del restaurante.

## Revisión previa

Con el servidor corriendo: `npm run check`. Revisa el .env, el token (vigencia y permisos), el número, la suscripción, el servidor local y el túnel, y dice qué falla.

## Horarios

No están escritos en el código: salen de `datasources.getOpeningHours()`. Hoy los entrega `data/mock/hours.json` (datos de ejemplo);
cuando llegue la API del restaurante solo hay que escribir `src/datasources/api.js`. El horario alimenta las reservas y la respuesta a «¿a qué hora abren?».

## Panel de administración

1. En el `.env`: `ADMIN_PASSWORD` (mínimo 10 caracteres; sin ella el panel queda desactivado) y, si quieres, `ADMIN_USER`.
2. Reinicia el servidor y abre `http://localhost:3000/admin`.
3. Secciones: Pedidos, Reservas (cambian de estado y avisan al cliente por WhatsApp), Sin respuesta (se convierten en respuestas guardadas),
   Respuestas (alta, edición y baja), Probador (qué respondería el bot, sin usar el modelo) y Personas (clientes que pidieron hablar con alguien).

Seguridad: si expones el servidor con un túnel, `/admin` también es accesible desde internet. El acceso exige usuario y contraseña, se bloquea tras
5 intentos fallidos y la sesión dura 12 horas (se pierde al reiniciar). Avisar al cliente solo funciona si escribió en las últimas 24 horas.
