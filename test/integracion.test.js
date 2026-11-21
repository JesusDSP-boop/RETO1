// PRUEBAS DE INTEGRACIÓN (Reto 3, Parte 3)
// A diferencia de las unitarias, aquí NO hay simulaciones en el camino: se levanta el servidor Express
// real, se hacen peticiones HTTP reales y se usa una base de datos SQLite real (en memoria, para no tocar
// data/ritmo.sqlite). Recorre: ruta -> middleware -> controlador -> servicio -> TypeORM -> base de datos.
require('reflect-metadata');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { DataSource } = require('typeorm');
const FavoritoSchema = require('../src/entities/favorito.entity');
const CatalogoSchema = require('../src/entities/catalogo.entity');
const CatalogoRepositorio = require('../src/database/catalogoRepositorio');
const CatalogoService = require('../src/services/catalogoService');
const crearApp = require('../src/app');

const CLAVE = 'clave-de-pruebas-de-integracion';
const silencio = { http() {}, info() {}, warn() {}, error() {} };
const cancion = {
  id: 3135556,
  titulo: 'Harder, Better, Faster, Stronger',
  artista: 'Daft Punk',
  album: 'Discovery',
  portada: 'https://cdn.ejemplo.com/portada.jpg',
  duracion: 224,
  preview: 'https://cdn.ejemplo.com/preview.mp3',
  enlace: 'https://www.deezer.com/track/3135556',
};
const cabeceras = { 'Content-Type': 'application/json', 'x-api-key': CLAVE };

let dataSource;
let servidor;
let base;
let favoritos; // repositorio de TypeORM, para comprobar directamente lo que hay en la base de datos

before(async () => {
  dataSource = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [FavoritoSchema, CatalogoSchema],
    synchronize: true,
  });
  await dataSource.initialize();
  favoritos = dataSource.getRepository(FavoritoSchema);

  const deezerFalso = { obtenerTop: async () => [], listarGeneros: async () => [] }; // sin internet
  const catalogo = new CatalogoService(new CatalogoRepositorio(dataSource.getRepository(CatalogoSchema)), deezerFalso, { logger: silencio });
  const app = crearApp({
    repositorioFavoritos: favoritos,
    urlApiExterna: '',
    catalogoServicio: catalogo,
    logger: silencio,
    config: { apiKey: CLAVE, origenesPermitidos: [] },
  });
  await new Promise((resolver) => { servidor = app.listen(0, '127.0.0.1', resolver); });
  base = `http://127.0.0.1:${servidor.address().port}`;
});

after(async () => {
  servidor.closeAllConnections?.();
  await new Promise((resolver) => servidor.close(resolver));
  await dataSource.destroy();
});

test('Integración 1: flujo Create completo (POST responde 201 y el dato ya existe en la base de datos)', async () => {
  const respuesta = await fetch(`${base}/api/favoritos`, { method: 'POST', headers: cabeceras, body: JSON.stringify(cancion) });
  assert.equal(respuesta.status, 201);
  const creado = await respuesta.json();
  assert.ok(creado.id, 'la respuesta debe traer el id del registro creado');

  const enBaseDeDatos = await favoritos.findOneBy({ id: creado.id });
  assert.ok(enBaseDeDatos, 'el favorito debe existir en la base de datos');
  assert.equal(enBaseDeDatos.deezerId, cancion.id);
  assert.equal(enBaseDeDatos.titulo, cancion.titulo);
  assert.equal(enBaseDeDatos.artista, cancion.artista);
});

test('Integración 2: flujo Read con dato real (guarda en la base de datos y GET /:id devuelve exactamente ese dato)', async () => {
  const insertado = await favoritos.save(
    favoritos.create({
      deezerId: 222,
      titulo: 'Dato real',
      artista: 'Artista real',
      album: 'Álbum real',
      portada: null,
      duracion: 180,
      preview: 'https://cdn.ejemplo.com/2.mp3',
      enlace: 'https://www.deezer.com/track/222',
      notas: 'Una nota',
    }),
  );

  const respuesta = await fetch(`${base}/api/favoritos/${insertado.id}`);
  assert.equal(respuesta.status, 200);
  const recibido = await respuesta.json();
  for (const campo of ['id', 'deezerId', 'titulo', 'artista', 'album', 'portada', 'duracion', 'preview', 'enlace', 'notas']) {
    assert.deepEqual(recibido[campo], insertado[campo], `el campo "${campo}" debe ser idéntico al guardado`);
  }
});

test('Integración 3: flujo Delete (crea, borra y un GET posterior del mismo id responde 404)', async () => {
  const creado = await (
    await fetch(`${base}/api/favoritos`, { method: 'POST', headers: cabeceras, body: JSON.stringify({ ...cancion, id: 333 }) })
  ).json();

  const borrado = await fetch(`${base}/api/favoritos/${creado.id}`, { method: 'DELETE', headers: { 'x-api-key': CLAVE } });
  assert.equal(borrado.status, 200);

  const despues = await fetch(`${base}/api/favoritos/${creado.id}`);
  assert.equal(despues.status, 404);
  assert.equal(await favoritos.findOneBy({ id: creado.id }), null, 'el registro ya no debe estar en la base de datos');
});
