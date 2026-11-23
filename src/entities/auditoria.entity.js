const { EntitySchema } = require('typeorm');

module.exports = new EntitySchema({
  name: 'Auditoria',
  tableName: 'auditoria',
  columns: {
    id: { type: 'integer', primary: true, generated: true },
    actor: { type: 'varchar', length: 80 },
    rol: { type: 'varchar', length: 20 },
    accion: { type: 'varchar', length: 40 },
    entidad: { type: 'varchar', length: 40 },
    entidadId: { type: 'varchar', nullable: true },
    detalles: { type: 'text', nullable: true },
    creadoEn: { type: 'datetime', createDate: true },
  },
});
