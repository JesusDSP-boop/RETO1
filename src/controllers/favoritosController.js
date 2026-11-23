const ErrorApi = require('../errores');

class FavoritosController {
  /**
   * INYECCIÓN DE DEPENDENCIAS (Reto 2)
   * El controlador recibe el servicio de favoritos ya construido; no lo crea con `new`.
   * Así las pruebas pueden pasarle un servicio con repositorio simulado.
   */
  constructor(servicioFavoritos, logger = console) {
    this.servicio = servicioFavoritos;
    this.logger = logger;
  }

  listar(req, res) {
    return this._responder(res, 200, () => this.servicio.listar(req.usuario));
  }

  obtener(req, res) {
    return this._responder(res, 200, () => this.servicio.obtener(req.params.id, req.usuario));
  }

  crear(req, res) {
    return this._responder(res, 201, () => this.servicio.crear(req.body, req.usuario));
  }

  actualizar(req, res) {
    return this._responder(res, 200, () => this.servicio.actualizar(req.params.id, req.body, req.usuario));
  }

  eliminar(req, res) {
    return this._responder(res, 200, () => this.servicio.eliminar(req.params.id, req.usuario));
  }

  // Ejecuta la acción y convierte el resultado (o el error) en una respuesta HTTP.
  async _responder(res, codigoExitoso, accion) {
    try {
      const resultado = await accion();
      return res.status(codigoExitoso).json(resultado);
    } catch (error) {
      if (error instanceof ErrorApi) {
        return res.status(error.status).json({ error: error.message });
      }
      this.logger.error(`Error inesperado: ${error.stack}`);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  }
}

module.exports = FavoritosController;
