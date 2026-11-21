// OBSERVABILIDAD (Reto 3, Parte 1)

// Registra UNA línea por petición: método, ruta, código HTTP y tiempo. Ejemplo:
//   GET /api/catalogo?pagina=1 200 12ms
// Nivel según el resultado: 2xx/3xx = http, 4xx = warn, 5xx = error.
function registrarPeticiones(logger) {
  return (req, res, next) => {
    const inicio = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Math.round(Number(process.hrtime.bigint() - inicio) / 1e6);
      const linea = `${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`;
      if (res.statusCode >= 500) logger.error(linea);
      else if (res.statusCode >= 400) logger.warn(linea);
      else if (logger.http) logger.http(linea);
      else logger.info(linea);
    });
    next();
  };
}

// GET /health -> { status: 'ok', timestamp }. Comprueba también que la base de datos responde.
function crearRutaSalud(verificarBaseDeDatos, logger = console) {
  return async (req, res) => {
    const timestamp = new Date().toISOString();
    try {
      await verificarBaseDeDatos();
      return res.status(200).json({ status: 'ok', timestamp });
    } catch (error) {
      logger.error(`El chequeo de salud falló: ${error.stack}`);
      return res.status(503).json({ status: 'error', timestamp });
    }
  };
}

module.exports = { registrarPeticiones, crearRutaSalud };
