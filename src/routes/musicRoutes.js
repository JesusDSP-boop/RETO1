const { Router } = require('express');

// Recibe el controlador ya construido (inyectado) y define los endpoints.
module.exports = function crearRutas(controlador) {
  const router = Router();
  router.get('/canciones/top', (req, res) => controlador.top(req, res)); // GET /api/canciones/top
  router.get('/canciones', (req, res) => controlador.buscar(req, res)); // GET /api/canciones?q=texto
  return router;
};
