const config = require('../../config');

function createProvider() {
  if (!config.llm.enabled) return require('./nullProvider');
  if (config.llm.provider === 'deepseek') return require('./deepseekProvider');
  if (config.llm.provider === 'gemini') return require('./geminiProvider');
  throw new Error(`Proveedor de LLM desconocido: ${config.llm.provider}`);
}

module.exports = createProvider();
