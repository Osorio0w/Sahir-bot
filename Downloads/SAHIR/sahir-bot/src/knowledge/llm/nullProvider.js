// Modo sin modelo: se usa cuando USE_LLM=false y como respaldo si el proveedor falla.
module.exports = {
  name: 'none',
  async rewrite() {
    return { ok: false, reason: 'llm-disabled' };
  },
};
