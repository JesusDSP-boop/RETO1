// Rutas que no existen: siempre JSON (nunca la página de error de Express).
function rutaNoEncontrada(req, res) {
  res.status(404).json({ error: 'Ruta no encontrada' });
}

// HARDENING (errores técnicos expuestos): el stacktrace completo se registra en los logs con nivel
// ERROR, pero el cliente solo recibe un mensaje genérico.
function manejadorErrores(logger) {
  // Express reconoce un manejador de errores por tener 4 parámetros.
  return (error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'El cuerpo de la petición no es JSON válido' });
    }
    if (error.type === 'entity.too.large') {
      return res.status(413).json({ error: 'El cuerpo de la petición es demasiado grande' });
    }
    logger.error(`Error no controlado en ${req.method} ${req.originalUrl}: ${error.stack || error}`);
    return res.status(500).json({ error: 'Error interno del servidor' });
  };
}

module.exports = { rutaNoEncontrada, manejadorErrores };
