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
const FavoritoSchema = require('./entities/favorito.entity');
const UsuarioSchema = require('./entities/usuario.entity');
const AuditoriaSchema = require('./entities/auditoria.entity');
const AuthService = require('./services/authService');
const AuditoriaService = require('./services/auditoriaService');
const { crearAutenticacion } = require('./middleware/autenticacion');
const crearRutasAuth = require('./routes/authRoutes');
const crearRutasAuditoria = require('./routes/auditoriaRoutes');

/**
 * COMPOSICIÓN de la API web: aquí se hace `new` de los controladores y servicios y se arma la cadena de
 * middleware. El servicio del catálogo llega ya construido desde src/composicion.js, porque el servidor y
 * los comandos de terminal lo comparten. El logger y la configuración de seguridad también llegan de afuera.
 */
function crearApp({ repositorioFavoritos, urlApiExterna, catalogoServicio, auditoriaService: auditoriaInyectada, logger = console, config = {} }) {
  const musica = new MusicController(new DeezerService(), logger);
  const notificador = new NotificacionService({ urlDestino: urlApiExterna, logger });
  const manager = repositorioFavoritos.manager;
  const auditoriaService = auditoriaInyectada || new AuditoriaService(manager.getRepository(AuditoriaSchema));
  const authService = new AuthService(manager.getRepository(UsuarioSchema), {
    apiKey: config.apiKey,
    repositorioFavoritos,
    auditoriaService,
    esquemas: { usuario: UsuarioSchema, favorito: FavoritoSchema, auditoria: AuditoriaSchema },
  });
  const favoritos = new FavoritosController(new FavoritosService(repositorioFavoritos, notificador, auditoriaService), logger);
  const catalogo = new CatalogoController(catalogoServicio, logger);
  if (!catalogoServicio.auditoriaService) catalogoServicio.auditoriaService = auditoriaService;
  const exigirClave = requerirApiKey({ apiKey: config.apiKey, logger });
  const autenticacion = crearAutenticacion(authService);
  const requerirAdminOCodigo = (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.usuario?.rol === 'admin') return next();
    return exigirClave(req, res, next);
  };
  const requerirAdminOCodigoSiempre = (req, res, next) => {
    if (req.usuario?.rol === 'admin') return next();
    return exigirClave.exigirSiempre(req, res, next);
  };

  const app = express();
  app.disable('x-powered-by'); // HARDENING: no revelar que el servidor usa Express
  app.use(registrarPeticiones(logger)); // OBSERVABILIDAD: una línea de log por cada petición
  app.use(cabecerasSeguridad()); // HARDENING: cabeceras de seguridad
  app.use(politicaCors(config.origenesPermitidos)); // HARDENING: CORS con lista blanca (nunca "*")
  app.use(express.json({ limit: '10kb' })); // HARDENING: tamaño máximo del cuerpo

  app.get('/health', crearRutaSalud(() => repositorioFavoritos.count(), logger)); // OBSERVABILIDAD
  app.use(express.static(path.join(__dirname, '..', 'public'))); // la página web
  app.use(autenticacion.cargarSesion);

  app.use('/api', crearRutas(musica)); // Reto 1: Deezer en vivo
  app.use('/api/auth', crearRutasAuth(authService, auditoriaService, logger, requerirAdminOCodigoSiempre));
  app.use('/api/favoritos', autenticacion.requiereCliente, crearRutasFavoritos(favoritos));
  app.use('/api/catalogo', requerirAdminOCodigo, crearRutasCatalogo(catalogo));
  app.use('/api/auditoria', requerirAdminOCodigoSiempre, crearRutasAuditoria(auditoriaService, logger));

  app.use(rutaNoEncontrada); // cualquier otra ruta: 404 en JSON
  app.use(manejadorErrores(logger)); // último: errores inesperados -> 500 genérico + log con stacktrace
  return app;
}

module.exports = crearApp;
