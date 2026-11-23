const { EntitySchema } = require('typeorm');

// MODELO de la tabla "catalogo": las canciones que se descargan de la API de Deezer.
// TypeORM crea la tabla a partir de este modelo (sin SQL manual).
// Es independiente de "favoritos": borrar o reiniciar el catálogo no toca los favoritos.
module.exports = new EntitySchema({
  name: 'Catalogo',
  tableName: 'catalogo',
  columns: {
    id: { type: 'integer', primary: true, generated: true },
    deezerId: { type: 'integer', unique: true }, // id de Deezer; evita guardar la misma canción dos veces
    titulo: { type: 'varchar' },
    artista: { type: 'varchar' },
    notas: { type: 'text', nullable: true },
    album: { type: 'varchar', nullable: true },
    portada: { type: 'varchar', nullable: true },
    duracion: { type: 'integer', nullable: true },
    preview: { type: 'varchar', nullable: true },
    enlace: { type: 'varchar', nullable: true },
    creadoEn: { type: 'datetime', createDate: true },
  },
});
