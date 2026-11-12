/**
 * Reconoce, por palabras clave, lo que el cliente quiere hacer cuando escribe en texto libre.
 * Recibe el texto ya normalizado (sin tildes ni signos). Devuelve el nombre del flujo o null.
 * El orden importa: la primera coincidencia gana.
 */
const INTENTS = [
  {
    flow: 'escalado',
    test: (q) =>
      /\b(hablar|comunicar\w*|pasar\w*|pasame|atienda\w*|atender\w*|contactar\w*)\b.*\b(persona|humano|alguien|gerente|encargado|asesor|agente|dueno|duena)\b/.test(q) ||
      /^(humano|persona|asesor|agente|gerente|encargado)$/.test(q),
  },
  { flow: 'reserva', test: (q) => /\b(reserv\w*|mesa)\b/.test(q) },
  { flow: 'pedido', test: (q) => /\b(pedir|ordenar)\b/.test(q) || /\b(quiero|quisiera|necesito|hacer|realizar)\b.*\bun pedido\b/.test(q) },
  { flow: 'menu', test: (q) => /\b(menu|carta)\b/.test(q) },
];

const LEAD = {
  reserva: 'Claro, te ayudo con tu reserva.',
  pedido: 'Claro, vamos a armar tu pedido.',
  menu: 'Con gusto, aquí está el menú.',
  escalado: null,
};

const detectIntent = (q) => INTENTS.find((i) => i.test(q))?.flow || null;

module.exports = { detectIntent, LEAD };
