const IDS = {
  HOME: 'inicio',
  VIEW_MENU: 'ver_menu',
  ORDER: 'pedido',
  BOOKING: 'reserva',
  FAQ: 'preguntas',
  HUMAN: 'humano',
};

function showMainMenu(channel, name) {
  return channel.sendList({
    body: `¡Hola${name ? ' ' + name : ''}! Soy el asistente de Sahir Resto Bar. ¿En qué te ayudo?`,
    buttonLabel: 'Ver opciones',
    sections: [
      {
        title: 'Opciones',
        rows: [
          { id: IDS.VIEW_MENU, title: 'Ver el menú', description: 'Platos y precios' },
          { id: IDS.ORDER, title: 'Hacer un pedido', description: 'A domicilio o para retirar' },
          { id: IDS.BOOKING, title: 'Reservar una mesa' },
          { id: IDS.FAQ, title: 'Hacer una pregunta', description: 'Horarios, ubicación, pagos' },
          { id: IDS.HUMAN, title: 'Hablar con una persona' },
        ],
      },
    ],
  });
}

module.exports = { IDS, showMainMenu };
