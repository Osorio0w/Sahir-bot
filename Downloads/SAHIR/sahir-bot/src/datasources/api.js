// Adaptador de la API de lectura del restaurante: pendiente de su documentación.
// Debe cumplir el contrato descrito en ./index.js y traducir la respuesta real a ese formato.
const notReady = async () => {
  throw new Error('La API de lectura del restaurante aún no está implementada (falta su documentación).');
};

module.exports = {
  getCategories: notReady,
  getItemsByCategory: notReady,
  getItem: notReady,
  getOpeningHours: notReady,
  getInfo: notReady,
};
