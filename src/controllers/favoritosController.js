const ErrorApi = require('../errores');

class FavoritosController {
  /**
   * INYECCIÓN DE DEPENDENCIAS (Reto 2)
   * El controlador recibe el servicio de favoritos ya construido; no lo crea con `new`.
   * Así las pruebas pueden pasarle un servicio con repositorio simulado.
   */
  constructor(servicioFavoritos) {
    this.servicio = servicioFavoritos;
  }

  listar(req, res) {
    return this._responder(res, 200, () => this.servicio.listar());
  }

  obtener(req, res) {
    return this._responder(res, 200, () => this.servicio.obtener(req.params.id));
  }

  crear(req, res) {
    return this._responder(res, 201, () => this.servicio.crear(req.body));
  }

  actualizar(req, res) {
    return this._responder(res, 200, () => this.servicio.actualizar(req.params.id, req.body));
  }

  eliminar(req, res) {
    return this._responder(res, 200, () => this.servicio.eliminar(req.params.id));
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
      console.error(error);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  }
}

module.exports = FavoritosController;
