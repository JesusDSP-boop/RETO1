require('reflect-metadata');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { DataSource } = require('typeorm');
const FavoritoSchema = require('../entities/favorito.entity');
const CatalogoSchema = require('../entities/catalogo.entity');
const UsuarioSchema = require('../entities/usuario.entity');
const AuditoriaSchema = require('../entities/auditoria.entity');

// La base de datos es un archivo SQLite dentro de la carpeta "data" (no se sube a GitHub).
const carpetaDatos = path.join(__dirname, '..', '..', 'data');
fs.mkdirSync(carpetaDatos, { recursive: true });

const dataSource = new DataSource({
  type: 'better-sqlite3',
  database: path.join(carpetaDatos, 'ritmo.sqlite'),
  entities: [FavoritoSchema, CatalogoSchema, UsuarioSchema, AuditoriaSchema],
  // TypeORM sincroniza los modelos; antes se adapta la tabla usuarios heredada si su esquema es incompatible.
  synchronize: true,
  logging: false,
});

function migrarUsuariosIncompatibles(archivo = dataSource.options.database) {
  if (!archivo || archivo === ':memory:' || !fs.existsSync(archivo)) return null;

  const db = new Database(archivo);
  try {
    const existe = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'usuarios'").get();
    if (!existe) return null;

    const columnas = db.prepare('PRAGMA table_info("usuarios")').all();
    const nombres = new Set(columnas.map((columna) => columna.name));
    const filas = db.prepare('SELECT * FROM "usuarios"').all();
    const nombreColumna = ['nombre', 'usuario', 'username', 'nombreUsuario'].find((campo) => nombres.has(campo));
    const hashColumna = ['passwordHash', 'password_hash', 'hashPassword', 'contrasenaHash'].find((campo) => nombres.has(campo));
    const compatible = nombres.has('nombre') && nombres.has('passwordHash') && nombres.has('rol')
      && filas.every((fila) => typeof fila.nombre === 'string' && fila.nombre.length > 0
        && typeof fila.passwordHash === 'string' && fila.passwordHash.length > 0
        && ['admin', 'cliente'].includes(fila.rol));
    if (compatible) return null;

    let legacy = `usuarios_legacy_${Date.now()}`;
    let sufijo = 1;
    while (db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(legacy)) {
      legacy = `usuarios_legacy_${Date.now()}_${sufijo}`;
      sufijo += 1;
    }
    db.exec(`ALTER TABLE "usuarios" RENAME TO "${legacy}"`);
    const idsVistos = new Set();
    const usuarios = filas
      .filter((fila) => nombreColumna && hashColumna
        && typeof fila[nombreColumna] === 'string' && fila[nombreColumna].trim()
        && typeof fila[hashColumna] === 'string' && fila[hashColumna])
      .map((fila) => {
        const usuario = {
          nombre: fila[nombreColumna].trim(),
          passwordHash: fila[hashColumna],
          rol: fila.rol === 'admin' ? 'admin' : 'cliente',
        };
        if (Number.isSafeInteger(fila.id) && fila.id > 0) usuario.id = fila.id;
        if (idsVistos.has(usuario.nombre)) return null;
        idsVistos.add(usuario.nombre);
        return usuario;
      })
      .filter(Boolean);

    return { legacy, usuarios };
  } finally {
    db.close();
  }
}

function migrarFavoritosCompartidos(archivo = dataSource.options.database) {
  if (!archivo || archivo === ':memory:' || !fs.existsSync(archivo)) return false;

  const db = new Database(archivo);
  try {
    const existe = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'favoritos'").get();
    if (!existe) return false;

    const columnas = new Set(db.prepare('PRAGMA table_info("favoritos")').all().map((columna) => columna.name));
    const indices = db.prepare('PRAGMA index_list("favoritos")').all();
    const columnasDeIndice = (indice) => db.prepare(`PRAGMA index_info("${indice.name.replace(/"/g, '""')}")`)
      .all().map((columna) => columna.name);
    const tieneUnicidadGlobal = indices.some((indice) => indice.unique && columnasDeIndice(indice).join(',') === 'deezerId');
    const tieneUnicidadPorCuenta = indices.some((indice) => indice.unique
      && columnasDeIndice(indice).join(',') === 'usuarioId,deezerId');
    if (columnas.has('usuarioId') && !tieneUnicidadGlobal && tieneUnicidadPorCuenta) return false;

    for (const requerida of ['id', 'deezerId', 'titulo', 'artista']) {
      if (!columnas.has(requerida)) {
        throw new Error(`No se puede migrar la tabla favoritos: falta la columna ${requerida}`);
      }
    }

    const existentes = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'favoritos_legacy_%'").all();
    let legado = `favoritos_legacy_${Date.now()}`;
    let sufijo = 1;
    while (existentes.some((tabla) => tabla.name === legado)) {
      legado = `favoritos_legacy_${Date.now()}_${sufijo}`;
      sufijo += 1;
    }

    const destinos = [
      'id', 'deezerId', 'usuarioId', 'titulo', 'artista', 'album', 'portada',
      'duracion', 'preview', 'enlace', 'notas', 'creadoEn', 'actualizadoEn',
    ];
    const valores = {
      id: '"id"',
      deezerId: '"deezerId"',
      usuarioId: columnas.has('usuarioId') ? '"usuarioId"' : 'NULL',
      titulo: '"titulo"',
      artista: '"artista"',
      album: columnas.has('album') ? '"album"' : 'NULL',
      portada: columnas.has('portada') ? '"portada"' : 'NULL',
      duracion: columnas.has('duracion') ? '"duracion"' : 'NULL',
      preview: columnas.has('preview') ? '"preview"' : 'NULL',
      enlace: columnas.has('enlace') ? '"enlace"' : 'NULL',
      notas: columnas.has('notas') ? '"notas"' : 'NULL',
      creadoEn: columnas.has('creadoEn') ? `COALESCE("creadoEn", datetime('now'))` : "datetime('now')",
      actualizadoEn: columnas.has('actualizadoEn') ? `COALESCE("actualizadoEn", datetime('now'))` : "datetime('now')",
    };

    db.transaction(() => {
      db.exec(`ALTER TABLE "favoritos" RENAME TO "${legado}"`);
      db.exec(`CREATE TABLE "favoritos" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "deezerId" integer NOT NULL,
        "usuarioId" integer,
        "titulo" varchar NOT NULL,
        "artista" varchar NOT NULL,
        "album" varchar,
        "portada" varchar,
        "duracion" integer,
        "preview" varchar,
        "enlace" varchar,
        "notas" text,
        "creadoEn" datetime NOT NULL DEFAULT (datetime('now')),
        "actualizadoEn" datetime NOT NULL DEFAULT (datetime('now'))
      )`);
      db.exec(`INSERT INTO "favoritos" (${destinos.map((columna) => `"${columna}"`).join(', ')})
        SELECT ${destinos.map((columna) => valores[columna]).join(', ')} FROM "${legado}"`);
      db.exec('DROP TABLE "' + legado.replace(/"/g, '""') + '"');
      db.exec('CREATE UNIQUE INDEX "UQ_favoritos_usuario_deezer" ON "favoritos" ("usuarioId", "deezerId")');
    })();

    return true;
  } finally {
    db.close();
  }
}

// Conecta con la base de datos y crea las tablas "favoritos" y "catalogo" a partir de los modelos.
async function iniciarBaseDeDatos() {
  const migracionUsuarios = migrarUsuariosIncompatibles();
  const migracionFavoritos = migrarFavoritosCompartidos();
  await dataSource.initialize();
  if (migracionUsuarios?.usuarios.length) {
    await dataSource.getRepository(UsuarioSchema).save(migracionUsuarios.usuarios);
    console.info(`Se migraron ${migracionUsuarios.usuarios.length} cuentas desde ${migracionUsuarios.legacy}.`);
  }
  if (migracionUsuarios) {
    const auditoria = dataSource.getRepository(AuditoriaSchema);
    await auditoria.save(auditoria.create({
      actor: 'sistema',
      rol: 'sistema',
      accion: migracionUsuarios.usuarios.length ? 'migracion_usuarios' : 'migracion_usuarios_retenida',
      entidad: 'usuario',
      detalles: JSON.stringify({ tablaAnterior: migracionUsuarios.legacy, cuentasMigradas: migracionUsuarios.usuarios.length }),
    }));
  }
  if (migracionUsuarios && !migracionUsuarios.usuarios.length) {
    console.warn(`Se conservó la tabla anterior ${migracionUsuarios.legacy}; no se reconoció un formato de cuenta compatible.`);
  }
  if (migracionFavoritos) {
    console.info('Se migró la tabla favoritos para separar las canciones por cuenta.');
    const auditoria = dataSource.getRepository(AuditoriaSchema);
    await auditoria.save(auditoria.create({
      actor: 'sistema',
      rol: 'sistema',
      accion: 'migracion_favoritos',
      entidad: 'favorito',
      detalles: JSON.stringify({ unicidad: ['usuarioId', 'deezerId'], cancionesConservadas: true }),
    }));
  }
  const primerCliente = await dataSource.getRepository(UsuarioSchema).findOne({
    where: { rol: 'cliente' },
    select: { id: true },
    order: { id: 'ASC' },
  });
  if (primerCliente) {
    const favoritosLegados = await dataSource.getRepository(FavoritoSchema).createQueryBuilder()
      .update()
      .set({ usuarioId: primerCliente.id })
      .where('usuarioId IS NULL')
      .execute();
    if (favoritosLegados.affected) {
      const auditoria = dataSource.getRepository(AuditoriaSchema);
      await auditoria.save(auditoria.create({
        actor: 'sistema',
        rol: 'sistema',
        accion: 'asignacion_favoritos_legados',
        entidad: 'favorito',
        detalles: JSON.stringify({ usuarioId: primerCliente.id, cantidad: favoritosLegados.affected }),
      }));
    }
  }
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

module.exports = {
  dataSource,
  FavoritoSchema,
  CatalogoSchema,
  UsuarioSchema,
  AuditoriaSchema,
  iniciarBaseDeDatos,
  migrarUsuariosIncompatibles,
  migrarFavoritosCompartidos,
};
