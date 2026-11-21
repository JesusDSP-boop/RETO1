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
const CatalogoController = require('./controllers/catalogoController');
const crearRutasCatalogo = require('./routes/catalogoRoutes');

// Reto 3
const { registrarPeticiones, crearRutaSalud } = require('./middleware/observabilidad');
const { cabecerasSeguridad, politicaCors, requerirApiKey } = require('./middleware/seguridad');
const { rutaNoEncontrada, manejadorErrores } = require('./middleware/errores');

/**
 * COMPOSICIÓN de la API web: aquí se hace `new` de los controladores y servicios y se arma la cadena de
 * middleware. El servicio del catálogo llega ya construido desde src/composicion.js, porque el servidor y
 * los comandos de terminal lo comparten. El logger y la configuración de seguridad también llegan de afuera.
 */
function crearApp({ repositorioFavoritos, urlApiExterna, catalogoServicio, logger = console, config = {} }) {
  const musica = new MusicController(new DeezerService(), logger);
  const notificador = new NotificacionService({ urlDestino: urlApiExterna, logger });
  const favoritos = new FavoritosController(new FavoritosService(repositorioFavoritos, notificador), logger);
  const catalogo = new CatalogoController(catalogoServicio, logger);
  const exigirClave = requerirApiKey({ apiKey: config.apiKey, logger });

  const app = express();
  app.disable('x-powered-by'); // HARDENING: no revelar que el servidor usa Express
  app.use(registrarPeticiones(logger)); // OBSERVABILIDAD: una línea de log por cada petición
  app.use(cabecerasSeguridad()); // HARDENING: cabeceras de seguridad
  app.use(politicaCors(config.origenesPermitidos)); // HARDENING: CORS con lista blanca (nunca "*")
  app.use(express.json({ limit: '10kb' })); // HARDENING: tamaño máximo del cuerpo

  app.get('/health', crearRutaSalud(() => repositorioFavoritos.count(), logger)); // OBSERVABILIDAD
  app.use(express.static(path.join(__dirname, '..', 'public'))); // la página web

  app.use('/api', crearRutas(musica)); // Reto 1: Deezer en vivo
  app.use('/api/favoritos', exigirClave, crearRutasFavoritos(favoritos)); // Reto 2 + autenticación
  app.use('/api/catalogo', exigirClave, crearRutasCatalogo(catalogo)); // Reto 2 + autenticación

  app.use(rutaNoEncontrada); // cualquier otra ruta: 404 en JSON
  app.use(manejadorErrores(logger)); // último: errores inesperados -> 500 genérico + log con stacktrace
  return app;
}

module.exports = crearApp;
