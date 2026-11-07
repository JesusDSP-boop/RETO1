const path = require('path');
const express = require('express');

// Reto 1
const DeezerService = require('./services/deezerService');
const MusicController = require('./controllers/musicController');
const crearRutas = require('./routes/musicRoutes');

// Reto 2
const NotificacionService = require('./services/notificacionService');
const FavoritosService = require('./services/favoritosService');
const FavoritosController = require('./controllers/favoritosController');
const crearRutasFavoritos = require('./routes/favoritosRoutes');

/**
 * COMPOSICIÓN: este es el ÚNICO lugar donde se hace `new` y se conectan las piezas.
 * server.js entrega el repositorio ya inicializado con la base de datos.
 */
function crearApp({ repositorioFavoritos, urlApiExterna }) {
  const musica = new MusicController(new DeezerService());

  const notificador = new NotificacionService({ urlDestino: urlApiExterna });
  const favoritos = new FavoritosController(new FavoritosService(repositorioFavoritos, notificador));

  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use('/api', crearRutas(musica));
  app.use('/api/favoritos', crearRutasFavoritos(favoritos));

  // Cualquier otra ruta de /api responde JSON, no HTML.
  app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

  // JSON mal escrito en la petición, o un error inesperado.
  app.use((error, req, res, next) => {
    if (error.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'El cuerpo de la petición no es JSON válido' });
    }
    return res.status(500).json({ error: 'Error interno del servidor' });
  });

  return app;
}

module.exports = crearApp;
