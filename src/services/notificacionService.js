// Parte 3 (Reto 2): envía datos a una API externa con POST.
// Regla: NUNCA lanza error. Si la API externa falla, solo lo registra en consola,
// para que el favorito que ya quedó guardado no se pierda.
class NotificacionService {
  // INYECCIÓN DE DEPENDENCIAS: la URL y el cliente HTTP llegan desde afuera.
  constructor({ urlDestino, http = require('axios'), logger = console } = {}) {
    this.urlDestino = urlDestino;
    this.http = http;
    this.logger = logger;
  }

  async notificar(datos) {
    if (!this.urlDestino) {
      this.logger.warn('[API externa] URL_API_EXTERNA no configurada: no se envió nada.');
      return false;
    }
    try {
      const respuesta = await this.http.post(this.urlDestino, datos, { timeout: 5000 });
      this.logger.info(`[API externa] Enviado correctamente (HTTP ${respuesta.status}).`);
      return true;
    } catch (error) {
      this.logger.error(`[API externa] No se pudo enviar: ${error.message}`);
      return false;
    }
  }
}

module.exports = NotificacionService;
