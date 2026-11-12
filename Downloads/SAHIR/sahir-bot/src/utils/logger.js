// Logs en ASCII a propósito: el cmd de Windows no dibuja bien los emojis.
const stamp = () => new Date().toISOString();
module.exports = {
  info: (...a) => console.log(stamp(), '[info]', ...a),
  warn: (...a) => console.warn(stamp(), '[aviso]', ...a),
  error: (...a) => console.error(stamp(), '[error]', ...a),
};
