const { Router } = require('express');

// Define los endpoints de favoritos. Recibe el controlador ya construido (inyectado).
module.exports = function crearRutasFavoritos(controlador) {
  const router = Router();
  router.get('/', (req, res) => controlador.listar(req, res));          // GET    /api/favoritos
  router.post('/', (req, res) => controlador.crear(req, res));          // POST   /api/favoritos
  router.get('/:id', (req, res) => controlador.obtener(req, res));      // GET    /api/favoritos/:id
  router.put('/:id', (req, res) => controlador.actualizar(req, res));   // PUT    /api/favoritos/:id
  router.delete('/:id', (req, res) => controlador.eliminar(req, res));  // DELETE /api/favoritos/:id
  return router;
};
