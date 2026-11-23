const { Router } = require('express');

module.exports = function crearRutasCatalogo(controlador) {
  const router = Router();
  router.get('/', (req, res) => controlador.listar(req, res));          // GET    /api/catalogo?q=&pagina=&limite=
  router.get('/estado', (req, res) => controlador.estado(req, res));    // GET    /api/catalogo/estado
  router.post('/cargar', (req, res) => controlador.cargar(req, res));   // POST   /api/catalogo/cargar  {"modo":"inicial"|"completo"}
  router.delete('/seleccion', (req, res) => controlador.eliminarSeleccion(req, res));
  router.put('/:id', (req, res) => controlador.actualizar(req, res));
  router.delete('/:id', (req, res) => controlador.eliminar(req, res));
  router.delete('/', (req, res) => controlador.vaciar(req, res));       // DELETE /api/catalogo  (vacía el catálogo)
  return router;
};
