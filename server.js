require('dotenv').config(); // lee .env (si existe) y lo pasa a process.env
const crearApp = require('./src/app');
const { dataSource, FavoritoSchema } = require('./src/database/dataSource');

const PUERTO = process.env.PORT || 3000;

async function arrancar() {
  // Conecta con SQLite y crea la tabla "favoritos" a partir del modelo (synchronize).
  await dataSource.initialize();
  console.log(`Base de datos lista: ${dataSource.options.database}`);

  const app = crearApp({
    repositorioFavoritos: dataSource.getRepository(FavoritoSchema),
    urlApiExterna: process.env.URL_API_EXTERNA,
  });
  app.listen(PUERTO, () => console.log(`Servidor listo en http://localhost:${PUERTO}`));
}

arrancar().catch((error) => {
  console.error('No se pudo iniciar el servidor:', error);
  process.exit(1);
});
