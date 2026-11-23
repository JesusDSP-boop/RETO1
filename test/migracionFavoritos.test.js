const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { migrarFavoritosCompartidos } = require('../src/database/dataSource');

test('Migración de favoritos: reemplaza unicidad global por unicidad por cuenta y conserva canciones', () => {
  const archivo = path.join(os.tmpdir(), `ritmo-favoritos-${process.pid}-${Date.now()}.sqlite`);
  const db = new Database(archivo);
  db.exec(`CREATE TABLE favoritos (
    id INTEGER PRIMARY KEY,
    deezerId INTEGER NOT NULL UNIQUE,
    usuarioId INTEGER,
    titulo TEXT NOT NULL,
    artista TEXT NOT NULL,
    album TEXT,
    portada TEXT,
    duracion INTEGER,
    preview TEXT,
    enlace TEXT,
    notas TEXT,
    creadoEn TEXT,
    actualizadoEn TEXT
  )`);
  db.prepare('INSERT INTO favoritos (id, deezerId, usuarioId, titulo, artista, notas) VALUES (?, ?, ?, ?, ?, ?)')
    .run(7, 3135556, null, 'Canción conservada', 'Artista', 'Nota anterior');
  db.close();

  try {
    assert.equal(migrarFavoritosCompartidos(archivo), true);
    assert.equal(migrarFavoritosCompartidos(archivo), false, 'la migración debe ser idempotente');

    const migrada = new Database(archivo);
    try {
      const favoritaAnterior = migrada.prepare('SELECT * FROM favoritos WHERE id = 7').get();
      assert.equal(favoritaAnterior.deezerId, 3135556);
      assert.equal(favoritaAnterior.usuarioId, null);
      assert.equal(favoritaAnterior.titulo, 'Canción conservada');
      assert.equal(favoritaAnterior.notas, 'Nota anterior');

      migrada.prepare('INSERT INTO favoritos (deezerId, usuarioId, titulo, artista) VALUES (?, ?, ?, ?)')
        .run(3135556, 1, 'Mismo track', 'Artista');
      migrada.prepare('INSERT INTO favoritos (deezerId, usuarioId, titulo, artista) VALUES (?, ?, ?, ?)')
        .run(3135556, 2, 'Mismo track', 'Artista');
      assert.throws(() => migrada.prepare(
        'INSERT INTO favoritos (deezerId, usuarioId, titulo, artista) VALUES (?, ?, ?, ?)',
      ).run(3135556, 1, 'Duplicado', 'Artista'), /UNIQUE constraint failed/);
    } finally {
      migrada.close();
    }
  } finally {
    if (fs.existsSync(archivo)) fs.unlinkSync(archivo);
  }
});
