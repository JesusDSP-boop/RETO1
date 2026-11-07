require('reflect-metadata');
const fs = require('fs');
const path = require('path');
const { DataSource } = require('typeorm');
const FavoritoSchema = require('../entities/favorito.entity');

// La base de datos es un archivo SQLite dentro de la carpeta "data" (no se sube a GitHub).
const carpetaDatos = path.join(__dirname, '..', '..', 'data');
fs.mkdirSync(carpetaDatos, { recursive: true });

const dataSource = new DataSource({
  type: 'better-sqlite3',
  database: path.join(carpetaDatos, 'ritmo.sqlite'),
  entities: [FavoritoSchema],
  // synchronize: TypeORM crea y ajusta las tablas leyendo el modelo. No escribimos SQL a mano.
  // Es suficiente para el curso; en un proyecto real se usan migraciones.
  synchronize: true,
  logging: false,
});

module.exports = { dataSource, FavoritoSchema };
