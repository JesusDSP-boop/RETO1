// Controlador: recibe la petición HTTP, pide los datos al servicio y responde en JSON.
class MusicController {
  /**
   * INYECCIÓN DE DEPENDENCIAS
   * El controlador NO crea su propio servicio (no hace `new DeezerService()`);
   * lo recibe desde afuera por el constructor. Lo apliqué porque:
   *  1. Desacopla: el controlador solo conoce "algo que busca canciones"; no sabe
   *     si detrás hay Deezer, otra API o datos de prueba.
   *  2. Facilita las pruebas: en los tests le paso un servicio simulado (mock) y
   *     no dependo de internet ni de que Deezer esté disponible.
   *  3. Permite cambiar de API (por ejemplo a Jamendo) sin editar este archivo.
   */
  constructor(servicioMusica) {
    this.servicio = servicioMusica;
  }

  async buscar(req, res) {
    const q = String(req.query.q || '').trim();
    if (!q) {
      return res.status(400).json({ error: 'Falta el parámetro "q". Ejemplo: /api/canciones?q=queen' });
    }
    return this._responder(res, () => this.servicio.buscarCanciones(q));
  }

  async top(req, res) {
    return this._responder(res, () => this.servicio.obtenerTop());
  }

  // Si la API externa falla o no responde, devolvemos un error claro en JSON (502).
  async _responder(res, accion) {
    try {
      return res.status(200).json(await accion());
    } catch (error) {
      return res.status(502).json({
        error: 'No se pudo obtener datos de la API de música',
        detalle: error.message,
      });
    }
  }
}

module.exports = MusicController;
