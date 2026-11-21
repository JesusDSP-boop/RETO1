require('reflect-metadata');
const fs = require('fs');
const path = require('path');
const { DataSource } = require('typeorm');
const FavoritoSchema = require('../entities/favorito.entity');
const CatalogoSchema = require('../entities/catalogo.entity');

// La base de datos es un archivo SQLite dentro de la carpeta "data" (no se sube a GitHub).
const carpetaDatos = path.join(__dirname, '..', '..', 'data');
fs.mkdirSync(carpetaDatos, { recursive: true });

const dataSource = new DataSource({
  type: 'better-sqlite3',
  database: path.join(carpetaDatos, 'ritmo.sqlite'),
  entities: [FavoritoSchema, CatalogoSchema],
  // synchronize: TypeORM crea y ajusta las tablas leyendo los modelos. No escribimos SQL a mano.
  // Es suficiente para el curso; en un proyecto real se usan migraciones.
  synchronize: true,
  logging: false,
});

// Conecta con la base de datos y crea las tablas "favoritos" y "catalogo" a partir de los modelos.
async function iniciarBaseDeDatos() {
  await dataSource.initialize();
  // Limpieza: "canciones" era el nombre anterior de la tabla del catálogo y ya no se usa.
  const ejecutor = dataSource.createQueryRunner();
  try {
    if (await ejecutor.hasTable('canciones')) {
      await ejecutor.dropTable('canciones');
      console.log('Se eliminó la tabla antigua "canciones" (ahora el catálogo se llama "catalogo").');
    }
  } finally {
    await ejecutor.release();
  }
}

module.exports = { dataSource, FavoritoSchema, CatalogoSchema, iniciarBaseDeDatos };
