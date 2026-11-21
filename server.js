require('dotenv').config(); // lee .env (si existe) y lo pasa a process.env
const crearApp = require('./src/app');
const { crearLogger } = require('./src/logger');
const { leerConfig, leerConfigSeguridad } = require('./src/config');
const { crearCatalogoServicio } = require('./src/composicion');
const { dataSource, FavoritoSchema, iniciarBaseDeDatos } = require('./src/database/dataSource');

const PUERTO = process.env.PORT || 3000;
const seguridad = leerConfigSeguridad();
const logger = crearLogger({ nivel: seguridad.nivelLogs });

// Cualquier error que no se haya capturado queda registrado (nivel ERROR) con su stacktrace.
process.on('unhandledRejection', (motivo) => logger.error(`Promesa rechazada sin manejar: ${motivo?.stack || motivo}`));
process.on('uncaughtException', (error) => {
  logger.error(`Excepción no capturada: ${error.stack}`);
  process.exit(1);
});

async function arrancar() {
  // HARDENING (credenciales fuera del código): la clave de la API vive en .env; sin ella el servidor no arranca.
  if (seguridad.apiKey.length < 16) {
    throw new Error(
      'Falta API_KEY en el archivo .env (mínimo 16 caracteres). Genera una con: ' +
        `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`,
    );
  }

  // Conecta con SQLite y crea las tablas "favoritos" y "catalogo" a partir de los modelos (synchronize).
  await iniciarBaseDeDatos();
  logger.info(`Base de datos lista: ${dataSource.options.database}`);

  const config = leerConfig();
  const catalogoServicio = crearCatalogoServicio(dataSource, { ...config, logger });
  const app = crearApp({
    repositorioFavoritos: dataSource.getRepository(FavoritoSchema),
    urlApiExterna: process.env.URL_API_EXTERNA,
    catalogoServicio,
    logger,
    config: seguridad,
  });
  const servidor = app.listen(PUERTO, () => logger.info(`Servidor listo en http://localhost:${PUERTO}`));

  // Cierre ordenado con Ctrl+C (SIGINT) o cuando el hosting reinicia el servicio (SIGTERM).
  const apagar = (senal) => {
    logger.info(`Señal ${senal} recibida: cerrando el servidor`);
    servidor.close(async () => {
      await dataSource.destroy();
      process.exit(0);
    });
    servidor.closeAllConnections?.();
  };
  process.on('SIGINT', () => apagar('SIGINT'));
  process.on('SIGTERM', () => apagar('SIGTERM'));

  // Al iniciar: si la tabla "catalogo" está vacía, pide a la API SOLO 100 canciones y las guarda.
  if (config.cargaAlIniciar) {
    catalogoServicio
      .cargarSiVacio()
      .then((r) => r && logger.info(`[catálogo] Carga inicial lista: ${r.nuevas} canciones guardadas en la tabla catalogo.`))
      .catch((error) => logger.warn(`[catálogo] No se pudo hacer la carga inicial: ${error.message}`));
  }
}

arrancar().catch((error) => {
  console.error(`No se pudo iniciar el servidor: ${error.message}`);
  logger.error(`No se pudo iniciar el servidor: ${error.stack}`);
  process.exit(1);
});
