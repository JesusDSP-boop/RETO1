const { Router } = require('express');

module.exports = function crearRutasAuditoria(servicio, logger = console) {
  const router = Router();
  router.get('/', async (req, res) => {
    try {
      const limite = Number(req.query.limite) || 200;
      return res.json(await servicio.listar(limite));
    } catch (error) {
      logger.error(`No se pudo consultar la auditoría: ${error.stack}`);
      return res.status(500).json({ error: 'No se pudo consultar el historial' });
    }
  });
  return router;
};
