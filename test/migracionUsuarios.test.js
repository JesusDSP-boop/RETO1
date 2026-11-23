const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { migrarUsuariosIncompatibles } = require('../src/database/dataSource');

test('Migración de usuarios: conserva las cuentas anteriores y mapea usuario a nombre', () => {
  const archivo = path.join(os.tmpdir(), `ritmo-usuarios-${process.pid}-${Date.now()}.sqlite`);
  const db = new Database(archivo);
  db.exec('CREATE TABLE usuarios (id INTEGER PRIMARY KEY, usuario TEXT NOT NULL, passwordHash TEXT NOT NULL)');
  db.prepare('INSERT INTO usuarios (id, usuario, passwordHash) VALUES (?, ?, ?)')
    .run(7, 'cliente.legado', `${'a'.repeat(32)}:${'b'.repeat(128)}`);
  db.close();

  try {
    const migracion = migrarUsuariosIncompatibles(archivo);
    assert.ok(migracion);
    assert.equal(migracion.usuarios.length, 1);
    assert.deepEqual(migracion.usuarios[0], {
      id: 7,
      nombre: 'cliente.legado',
      passwordHash: `${'a'.repeat(32)}:${'b'.repeat(128)}`,
      rol: 'cliente',
    });

    const conservada = new Database(archivo);
    try {
      const tablaAnterior = conservada.prepare(`SELECT usuario, passwordHash FROM "${migracion.legacy}"`).get();
      assert.equal(tablaAnterior.usuario, 'cliente.legado');
    } finally {
      conservada.close();
    }
  } finally {
    if (fs.existsSync(archivo)) fs.unlinkSync(archivo);
  }
});

test('Migración de usuarios: conserva el rol administrador de una tabla antigua', () => {
  const archivo = path.join(os.tmpdir(), `ritmo-admin-legacy-${process.pid}-${Date.now()}.sqlite`);
  const db = new Database(archivo);
  db.exec('CREATE TABLE usuarios (id INTEGER PRIMARY KEY, usuario TEXT NOT NULL, passwordHash TEXT NOT NULL, rol TEXT)');
  db.prepare('INSERT INTO usuarios (id, usuario, passwordHash, rol) VALUES (?, ?, ?, ?)')
    .run(9, 'admin.legado', `${'a'.repeat(32)}:${'b'.repeat(128)}`, 'admin');
  db.close();

  try {
    const migracion = migrarUsuariosIncompatibles(archivo);
    assert.equal(migracion.usuarios[0].rol, 'admin');
    assert.equal(migracion.usuarios[0].id, 9);
  } finally {
    if (fs.existsSync(archivo)) fs.unlinkSync(archivo);
  }
});
