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
const UsuarioSchema = require('../src/entities/usuario.entity');
const AuditoriaSchema = require('../src/entities/auditoria.entity');
const CatalogoRepositorio = require('../src/database/catalogoRepositorio');
const CatalogoService = require('../src/services/catalogoService');
const crearApp = require('../src/app');

const CLAVE = 'clave-de-pruebas-de-integracion';
const cabecerasApiKey = { 'Content-Type': 'application/json', 'x-api-key': CLAVE };
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

let dataSource;
let servidor;
let base;
let cookieCliente;
let cookieClienteDos;
let cookieAdmin;
let favoritos; // repositorio de TypeORM, para comprobar directamente lo que hay en la base de datos
let usuarios;

before(async () => {
  dataSource = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [FavoritoSchema, CatalogoSchema, UsuarioSchema, AuditoriaSchema],
    synchronize: true,
  });
  await dataSource.initialize();
  favoritos = dataSource.getRepository(FavoritoSchema);
  usuarios = dataSource.getRepository(UsuarioSchema);

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
  const loginInexistente = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: 'no.existe', password: 'clave-segura-123' }),
  });
  assert.equal(loginInexistente.status, 401);
  assert.match((await loginInexistente.json()).error, /no existe una cuenta/i);
  const registroAdmin = await fetch(`${base}/api/auth/registro`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: 'adminTest', password: 'clave-segura-123', apiKey: 'incorrecta' }),
  });
  assert.equal(registroAdmin.status, 401, 'una API key inválida no debe crear una cuenta');
  const registrado = await fetch(`${base}/api/auth/registro`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: 'clienteTest', password: 'clave-segura-123' }),
  });
  assert.equal(registrado.status, 201);
  const duplicado = await fetch(`${base}/api/auth/registro`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: 'clienteTest', password: 'clave-segura-123' }),
  });
  assert.equal(duplicado.status, 409);
  assert.match((await duplicado.json()).error, /ya está registrado/i);
  const soloNumeros = await fetch(`${base}/api/auth/registro`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: '123456789', password: 'clave-segura-123' }),
  });
  assert.equal(soloNumeros.status, 201, 'el nombre puede contener solo números');
  const usuarioEspecial = await fetch(`${base}/api/auth/registro`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: 'cliente_test', password: 'clave-segura-123' }),
  });
  assert.equal(usuarioEspecial.status, 400, 'no se permiten caracteres especiales');
  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: 'clienteTest', password: 'clave-segura-123' }),
  });
  assert.equal(login.status, 200);
  cookieCliente = login.headers.get('set-cookie').split(';')[0];
  const passwordIncorrecta = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: 'clienteTest', password: 'otra-clave-incorrecta' }),
  });
  assert.equal(passwordIncorrecta.status, 401);
  assert.match((await passwordIncorrecta.json()).error, /contraseña es incorrecta/i);

  for (const [usuario, destino] of [['clienteDos', 'clienteDos'], ['adminTest', 'admin']]) {
    const body = { usuario, password: 'clave-segura-123', ...(destino === 'admin' ? { apiKey: CLAVE } : {}) };
    const alta = await fetch(`${base}/api/auth/registro`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.equal(alta.status, 201);
    assert.equal((await alta.json()).rol, destino === 'admin' ? 'admin' : 'cliente');
    const acceso = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, password: 'clave-segura-123' }),
    });
    assert.equal(acceso.status, 200);
    if (destino === 'admin') {
      assert.equal((await acceso.json()).rol, 'admin');
      cookieAdmin = acceso.headers.get('set-cookie').split(';')[0];
    } else {
      cookieClienteDos = acceso.headers.get('set-cookie').split(';')[0];
    }
  }
});

after(async () => {
  servidor.closeAllConnections?.();
  await new Promise((resolver) => servidor.close(resolver));
  await dataSource.destroy();
});

test('Integración 1: flujo Create completo (POST responde 201 y el dato ya existe en la base de datos)', async () => {
  const respuesta = await fetch(`${base}/api/favoritos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieCliente },
    body: JSON.stringify(cancion),
  });
  assert.equal(respuesta.status, 201);
  const creado = await respuesta.json();
  assert.ok(creado.id, 'la respuesta debe traer el id del registro creado');

  const enBaseDeDatos = await favoritos.findOneBy({ id: creado.id });
  assert.ok(enBaseDeDatos, 'el favorito debe existir en la base de datos');
  assert.equal(enBaseDeDatos.deezerId, cancion.id);
  assert.equal(enBaseDeDatos.titulo, cancion.titulo);
  assert.equal(enBaseDeDatos.artista, cancion.artista);
  assert.equal(enBaseDeDatos.usuarioId, 1);
});

test('Las favoritas pertenecen a cada cuenta y el mismo track puede guardarse por dos clientes', async () => {
  const listaVacia = await fetch(`${base}/api/favoritos`, { headers: { Cookie: cookieClienteDos } });
  assert.equal(listaVacia.status, 200);
  assert.deepEqual(await listaVacia.json(), []);

  const creado = await fetch(`${base}/api/favoritos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieClienteDos },
    body: JSON.stringify(cancion),
  });
  assert.equal(creado.status, 201);
  const segundo = await creado.json();
  assert.equal(segundo.usuarioId, 3);

  const favoritoDeOtro = await fetch(`${base}/api/favoritos/${segundo.id}`, { headers: { Cookie: cookieCliente } });
  assert.equal(favoritoDeOtro.status, 404);
  const editarAjeno = await fetch(`${base}/api/favoritos/${segundo.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookieCliente },
    body: JSON.stringify({ notas: 'No autorizado' }),
  });
  assert.equal(editarAjeno.status, 404);
  const borrarAjeno = await fetch(`${base}/api/favoritos/${segundo.id}`, {
    method: 'DELETE',
    headers: { Cookie: cookieCliente },
  });
  assert.equal(borrarAjeno.status, 404);
  assert.ok(await favoritos.findOneBy({ id: segundo.id }), 'la canción debe seguir perteneciendo a su dueña');
  const listaClienteDos = await fetch(`${base}/api/favoritos`, { headers: { Cookie: cookieClienteDos } });
  assert.equal((await listaClienteDos.json()).length, 1);
});

test('Integración 2: flujo Read con dato real (guarda en la base de datos y GET /:id devuelve exactamente ese dato)', async () => {
  const insertado = await favoritos.save(
    favoritos.create({
      deezerId: 222,
      titulo: 'Dato real',
      artista: 'Artista real',
      usuarioId: 1,
      album: 'Álbum real',
      portada: null,
      duracion: 180,
      preview: 'https://cdn.ejemplo.com/2.mp3',
      enlace: 'https://www.deezer.com/track/222',
      notas: 'Una nota',
    }),
  );

  const respuesta = await fetch(`${base}/api/favoritos/${insertado.id}`, { headers: { Cookie: cookieCliente } });
  assert.equal(respuesta.status, 200);
  const recibido = await respuesta.json();
  for (const campo of ['id', 'deezerId', 'titulo', 'artista', 'album', 'portada', 'duracion', 'preview', 'enlace', 'notas']) {
    assert.deepEqual(recibido[campo], insertado[campo], `el campo "${campo}" debe ser idéntico al guardado`);
  }
});

test('Integración 3: flujo Delete (crea, borra y un GET posterior del mismo id responde 404)', async () => {
  const creado = await (
    await fetch(`${base}/api/favoritos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieCliente },
      body: JSON.stringify({ ...cancion, id: 333 }),
    })
  ).json();

  const borrado = await fetch(`${base}/api/favoritos/${creado.id}`, { method: 'DELETE', headers: { Cookie: cookieCliente } });
  assert.equal(borrado.status, 200);

  const despues = await fetch(`${base}/api/favoritos/${creado.id}`, { headers: { Cookie: cookieCliente } });
  assert.equal(despues.status, 404);
  assert.equal(await favoritos.findOneBy({ id: creado.id }), null, 'el registro ya no debe estar en la base de datos');
});

test('Roles y auditoría: la sesión admin y la API key autorizan catálogo, no favoritos', async () => {
  const sinSesion = await fetch(`${base}/api/favoritos`, { headers: { 'x-api-key': CLAVE } });
  assert.equal(sinSesion.status, 401);
  assert.equal((await fetch(`${base}/api/auditoria`)).status, 401);
  assert.equal((await fetch(`${base}/api/catalogo/555`, { method: 'DELETE' })).status, 401);
  assert.equal((await fetch(`${base}/api/favoritos`, { headers: { Cookie: cookieAdmin } })).status, 401);
  assert.equal((await fetch(`${base}/api/auth/usuarios`, { headers: { Cookie: cookieCliente } })).status, 401);

  const totalFavoritos = await favoritos.count();
  const catalogo = dataSource.getRepository(CatalogoSchema);
  const fila = await catalogo.save(catalogo.create({
    deezerId: 555,
    titulo: 'Original',
    artista: 'Artista',
    notas: null,
  }));
  const editar = await fetch(`${base}/api/catalogo/555`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ titulo: 'Editada', notas: 'Nota admin' }),
  });
  assert.equal(editar.status, 200);
  assert.deepEqual((await editar.json()).notas, 'Nota admin');

  const eliminar = await fetch(`${base}/api/catalogo/seleccion`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ ids: [555] }),
  });
  assert.equal(eliminar.status, 200);
  assert.equal(await catalogo.findOneBy({ id: fila.id }), null);
  assert.equal(await favoritos.count(), totalFavoritos, 'las acciones del catálogo no deben tocar la tabla favoritos');

  const filaApiKey = await catalogo.save(catalogo.create({
    deezerId: 556,
    titulo: 'Original API key',
    artista: 'Artista',
  }));
  const editarApiKey = await fetch(`${base}/api/catalogo/556`, {
    method: 'PUT',
    headers: cabecerasApiKey,
    body: JSON.stringify({ notas: 'Cambio por terminal' }),
  });
  assert.equal(editarApiKey.status, 200);
  const eliminarApiKey = await fetch(`${base}/api/catalogo/556`, {
    method: 'DELETE',
    headers: { 'x-api-key': CLAVE },
  });
  assert.equal(eliminarApiKey.status, 200);
  assert.equal(await catalogo.findOneBy({ id: filaApiKey.id }), null);

  const historial = await fetch(`${base}/api/auditoria`, { headers: { Cookie: cookieAdmin } });
  assert.equal(historial.status, 200);
  const registros = await historial.json();
  assert.ok(registros.some((r) => r.actor === 'clienteTest' && r.accion === 'crear' && r.entidad === 'favorito'));
  assert.ok(registros.some((r) => r.actor === 'adminTest' && r.rol === 'admin' && r.accion === 'actualizar' && r.entidad === 'catalogo'));
  assert.ok(registros.some((r) => r.actor === 'admin (API key)' && r.accion === 'actualizar' && r.entidad === 'catalogo'));
  assert.ok(registros.every((r) => r.creadoEn));
});

test('Eliminar cuenta: requiere contraseña, borra sus favoritos y conserva el registro de auditoría', async () => {
  const usuario = 'eliminarUno';
  const password = 'clave-segura-123';
  const alta = await fetch(`${base}/api/auth/registro`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario, password }),
  });
  assert.equal(alta.status, 201);
  const acceso = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario, password }),
  });
  const cookie = acceso.headers.get('set-cookie').split(';')[0];
  const favorito = await fetch(`${base}/api/favoritos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ ...cancion, id: 888 }),
  });
  const favoritoCreado = await favorito.json();

  const intentoIncorrecto = await fetch(`${base}/api/auth/cuenta`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ password: 'incorrecta' }),
  });
  assert.equal(intentoIncorrecto.status, 401);
  assert.ok(await usuarios.findOneBy({ nombre: usuario }));
  assert.ok(await favoritos.findOneBy({ id: favoritoCreado.id }));

  const borrado = await fetch(`${base}/api/auth/cuenta`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ password }),
  });
  assert.equal(borrado.status, 200);
  assert.equal(await usuarios.findOneBy({ nombre: usuario }), null);
  assert.equal(await favoritos.findOneBy({ id: favoritoCreado.id }), null);
  const sesionCerrada = await fetch(`${base}/api/auth/me`, { headers: { Cookie: cookie } });
  assert.equal(sesionCerrada.status, 401);

  const historial = await fetch(`${base}/api/auditoria`, { headers: { Cookie: cookieAdmin } });
  const registros = await historial.json();
  assert.ok(registros.some((r) => r.actor === usuario && r.accion === 'eliminar_cuenta' && r.entidad === 'usuario'));
});

test('Administración de cuentas por terminal: lista sin hashes y elimina una cuenta con API key', async () => {
  const usuario = 'borrarCliente';
  const password = 'clave-segura-123';
  const alta = await fetch(`${base}/api/auth/registro`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario, password }),
  });
  assert.equal(alta.status, 201);
  const acceso = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario, password }),
  });
  const cookie = acceso.headers.get('set-cookie').split(';')[0];
  const usuarioGuardado = await acceso.json();
  const favorito = await fetch(`${base}/api/favoritos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ ...cancion, id: 889 }),
  });
  const favoritoCreado = await favorito.json();

  const lista = await fetch(`${base}/api/auth/usuarios`, { headers: { 'x-api-key': CLAVE } });
  assert.equal(lista.status, 200);
  const cuentas = await lista.json();
  const cuenta = cuentas.find((fila) => fila.id === usuarioGuardado.id);
  assert.equal(cuenta.nombre, usuario);
  assert.equal(Object.prototype.hasOwnProperty.call(cuenta, 'passwordHash'), false);

  const borrado = await fetch(`${base}/api/auth/usuarios/${cuenta.id}`, {
    method: 'DELETE',
    headers: { 'x-api-key': CLAVE },
  });
  assert.equal(borrado.status, 200);
  assert.equal(await usuarios.findOneBy({ id: cuenta.id }), null);
  assert.equal(await favoritos.findOneBy({ id: favoritoCreado.id }), null);
  assert.equal((await fetch(`${base}/api/auth/me`, { headers: { Cookie: cookie } })).status, 401);
  const historial = await fetch(`${base}/api/auditoria`, { headers: { Cookie: cookieAdmin } });
  const registros = await historial.json();
  assert.ok(registros.some((r) => r.actor === 'admin (API key)'
    && r.accion === 'eliminar_cuenta' && r.entidadId === String(cuenta.id)));
});
