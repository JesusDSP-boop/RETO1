const { EntitySchema } = require('typeorm');

// MODELO del catálogo: copia local de canciones descargadas de Deezer.
// TypeORM crea la tabla "canciones" a partir de este modelo (sin SQL manual).
// Es independiente de "favoritos": vaciar el catálogo no borra los favoritos.
module.exports = new EntitySchema({
  name: 'Cancion',
  tableName: 'canciones',
  columns: {
    id: { type: 'integer', primary: true, generated: true },
    deezerId: { type: 'integer', unique: true }, // id de Deezer; evita guardar la misma canción dos veces
    titulo: { type: 'varchar' },
    artista: { type: 'varchar' },
    album: { type: 'varchar', nullable: true },
    portada: { type: 'varchar', nullable: true },
    duracion: { type: 'integer', nullable: true },
    preview: { type: 'varchar', nullable: true },
    enlace: { type: 'varchar', nullable: true },
    creadoEn: { type: 'datetime', createDate: true },
  },
});
