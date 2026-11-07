// Error con código HTTP. El controlador lo convierte en la respuesta JSON correspondiente.
class ErrorApi extends Error {
  constructor(status, mensaje) {
    super(mensaje);
    this.name = 'ErrorApi';
    this.status = status;
  }
}

module.exports = ErrorApi;
