const { EntitySchema } = require('typeorm');

// MODELO (Reto 2): los campos vienen del JSON que trajimos de Deezer en el Reto 1.
// TypeORM lee este modelo y crea la tabla "favoritos" automáticamente. No hay SQL manual.
module.exports = new EntitySchema({
  name: 'Favorito',
  tableName: 'favoritos',
  columns: {
    id: { type: 'integer', primary: true, generated: true }, // clave propia, autoincremental
    deezerId: { type: 'integer', unique: true },              // el "id" de Deezer; evita duplicados
    titulo: { type: 'varchar' },
    artista: { type: 'varchar' },
    album: { type: 'varchar', nullable: true },
    portada: { type: 'varchar', nullable: true },
    duracion: { type: 'integer', nullable: true },
    preview: { type: 'varchar', nullable: true },
    enlace: { type: 'varchar', nullable: true },
    notas: { type: 'text', nullable: true },                  // editable con PUT (junto con titulo)
    creadoEn: { type: 'datetime', createDate: true },
    actualizadoEn: { type: 'datetime', updateDate: true },
  },
});
