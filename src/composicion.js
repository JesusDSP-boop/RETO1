const DeezerService = require('./services/deezerService');
const CatalogoService = require('./services/catalogoService');
const CatalogoRepositorio = require('./database/catalogoRepositorio');
const CatalogoSchema = require('./entities/catalogo.entity');

// COMPOSICIÓN del catálogo: aquí se hace `new` y se conectan las piezas.
// La usan el servidor (server.js) y los comandos de terminal (scripts/catalogo.js),
// así ambos comparten exactamente la misma lógica.
function crearCatalogoServicio(dataSource, config) {
  const repositorio = new CatalogoRepositorio(dataSource.getRepository(CatalogoSchema));
  return new CatalogoService(repositorio, new DeezerService(), config);
}

module.exports = { crearCatalogoServicio };
