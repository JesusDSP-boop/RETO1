const { EntitySchema } = require('typeorm');

module.exports = new EntitySchema({
  name: 'Usuario',
  tableName: 'usuarios',
  columns: {
    id: { type: 'integer', primary: true, generated: true },
    nombre: { type: 'varchar', unique: true, length: 40 },
    passwordHash: { type: 'varchar', length: 256 },
    rol: { type: 'varchar', length: 20, default: 'cliente' },
    creadoEn: { type: 'datetime', createDate: true },
  },
});