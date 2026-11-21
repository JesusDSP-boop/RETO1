const ErrorApi = require('../errores');

class CatalogoController {
  // Recibe el servicio ya construido (inyección de dependencias), igual que los demás controladores.
  constructor(servicioCatalogo, logger = console) {
    this.servicio = servicioCatalogo;
    this.logger = logger;
  }

  listar(req, res) {
    return this._responder(res, 200, () => this.servicio.listar(req.query));
  }

  estado(req, res) {
    return this._responder(res, 200, () => this.servicio.estado());
  }

  // 202 Accepted: la carga sigue en segundo plano; el avance se consulta en /estado.
  cargar(req, res) {
    return this._responder(res, 202, async () => this.servicio.iniciarCarga(req.body?.modo));
  }

  vaciar(req, res) {
    return this._responder(res, 200, () => this.servicio.vaciar());
  }

  async _responder(res, codigoExitoso, accion) {
    try {
      return res.status(codigoExitoso).json(await accion());
    } catch (error) {
      if (error instanceof ErrorApi) return res.status(error.status).json({ error: error.message });
      this.logger.error(`Error inesperado: ${error.stack}`);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  }
}

module.exports = CatalogoController;
