require('dotenv').config(); // lee .env (si existe) y lo pasa a process.env
const crearApp = require('./src/app');
const { leerConfig } = require('./src/config');
const { crearCatalogoServicio } = require('./src/composicion');
const { dataSource, FavoritoSchema, iniciarBaseDeDatos } = require('./src/database/dataSource');

const PUERTO = process.env.PORT || 3000;

async function arrancar() {
  // Conecta con SQLite y crea las tablas "favoritos" y "catalogo" a partir de los modelos (synchronize).
  await iniciarBaseDeDatos();
  console.log(`Base de datos lista: ${dataSource.options.database}`);

  const config = leerConfig();
  const catalogoServicio = crearCatalogoServicio(dataSource, config);
  const app = crearApp({
    repositorioFavoritos: dataSource.getRepository(FavoritoSchema),
    urlApiExterna: process.env.URL_API_EXTERNA,
    catalogoServicio,
  });
  app.listen(PUERTO, () => console.log(`Servidor listo en http://localhost:${PUERTO}`));

  // Al iniciar: si la tabla "catalogo" está vacía, pide a la API SOLO 100 canciones y las guarda.
  if (config.cargaAlIniciar) {
    catalogoServicio
      .cargarSiVacio()
      .then((r) => r && console.log(`[catálogo] Carga inicial lista: ${r.nuevas} canciones guardadas en la tabla catalogo.`))
      .catch((error) => console.warn(`[catálogo] No se pudo hacer la carga inicial: ${error.message}`));
  }
}

arrancar().catch((error) => {
  console.error('No se pudo iniciar el servidor:', error);
  process.exit(1);
});
