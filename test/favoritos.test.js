const test = require('node:test');
const assert = require('node:assert/strict');
const FavoritosService = require('../src/services/favoritosService');
const FavoritosController = require('../src/controllers/favoritosController');
const NotificacionService = require('../src/services/notificacionService');

// Repositorio simulado: imita los métodos de TypeORM que usa el servicio.
// Así las pruebas no necesitan base de datos ni internet.
function crearRepositorioFalso() {
  const filas = [];
  let siguienteId = 1;
  const coincide = (fila, condicion) => Object.entries(condicion).every(([k, v]) => fila[k] === v);
  return {
    filas,
    find: async () => [...filas].sort((a, b) => a.id - b.id),
    findOneBy: async (condicion) => filas.find((f) => coincide(f, condicion)) ?? null,
    create: (datos) => ({ ...datos }),
    save: async (entidad) => {
      if (!entidad.id) {
        entidad.id = siguienteId++;
        filas.push(entidad);
      }
      return entidad;
    },
    merge: (destino, ...fuentes) => Object.assign(destino, ...fuentes),
    remove: async (entidad) => {
      const i = filas.findIndex((f) => f.id === entidad.id);
      if (i !== -1) filas.splice(i, 1);
      entidad.id = undefined; // igual que TypeORM: el id queda vacío después de borrar
      return entidad;
    },
  };
}

// Notificador simulado: guarda lo que "envía" y responde igual que el real (nunca lanza error).
function crearNotificadorFalso({ fallara = false } = {}) {
  const enviados = [];
  return {
    enviados,
    notificar: async (datos) => {
      enviados.push(datos);
      return !fallara;
    },
  };
}

// "res" falso de Express: guarda el código y el cuerpo que se envían.
function crearRes() {
  return {
    codigo: 200,
    cuerpo: null,
    status(c) { this.codigo = c; return this; },
    json(b) { this.cuerpo = b; return this; },
  };
}

function montar({ fallaNotificacion = false } = {}) {
  const repositorio = crearRepositorioFalso();
  const notificador = crearNotificadorFalso({ fallara: fallaNotificacion });
  const controlador = new FavoritosController(new FavoritosService(repositorio, notificador));
  return { repositorio, notificador, controlador };
}

const cancion = {
  id: 3135556,
  titulo: 'Harder, Better, Faster, Stronger',
  artista: 'Daft Punk',
  album: 'Discovery',
  portada: 'https://ejemplo.com/portada.jpg',
  duracion: 224,
  preview: 'https://ejemplo.com/preview.mp3',
  enlace: 'https://www.deezer.com/track/3135556',
};

test('Crear: guarda el favorito, responde 201 con su id y avisa a la API externa', async () => {
  const { controlador, notificador } = montar();
  const res = crearRes();
  await controlador.crear({ body: cancion }, res);
  assert.equal(res.codigo, 201);
  assert.equal(res.cuerpo.id, 1);
  assert.equal(res.cuerpo.deezerId, 3135556);
  assert.equal(notificador.enviados.length, 1);
  assert.equal(notificador.enviados[0].titulo, cancion.titulo);
});

test('Crear: valida los campos obligatorios y responde 400', async () => {
  const { controlador } = montar();
  const res = crearRes();
  await controlador.crear({ body: { titulo: 'Sin id ni artista' } }, res);
  assert.equal(res.codigo, 400);
  assert.match(res.cuerpo.error, /id/);
  assert.match(res.cuerpo.error, /artista/);
});

test('Crear: no permite guardar la misma canción dos veces (409)', async () => {
  const { controlador } = montar();
  await controlador.crear({ body: cancion }, crearRes());
  const res = crearRes();
  await controlador.crear({ body: cancion }, res);
  assert.equal(res.codigo, 409);
});

test('Crear: si la API externa falla, el favorito igual queda guardado', async () => {
  const { controlador, repositorio } = montar({ fallaNotificacion: true });
  const res = crearRes();
  await controlador.crear({ body: cancion }, res);
  assert.equal(res.codigo, 201);
  assert.equal(repositorio.filas.length, 1);
});

test('Leer: lista todos, busca por id y responde 404 si no existe', async () => {
  const { controlador } = montar();
  await controlador.crear({ body: cancion }, crearRes());

  const lista = crearRes();
  await controlador.listar({}, lista);
  assert.equal(lista.codigo, 200);
  assert.equal(lista.cuerpo.length, 1);

  const uno = crearRes();
  await controlador.obtener({ params: { id: '1' } }, uno);
  assert.equal(uno.codigo, 200);

  const noExiste = crearRes();
  await controlador.obtener({ params: { id: '99' } }, noExiste);
  assert.equal(noExiste.codigo, 404);
});

test('Actualizar: cambia solo las notas (200) y responde 404 si no existe', async () => {
  const { controlador } = montar();
  await controlador.crear({ body: cancion }, crearRes());

  const res = crearRes();
  await controlador.actualizar({ params: { id: '1' }, body: { notas: 'Para correr' } }, res);
  assert.equal(res.codigo, 200);
  assert.equal(res.cuerpo.notas, 'Para correr');
  assert.equal(res.cuerpo.titulo, cancion.titulo);

  const noExiste = crearRes();
  await controlador.actualizar({ params: { id: '99' }, body: { notas: 'x' } }, noExiste);
  assert.equal(noExiste.codigo, 404);
});

test('Eliminar: borra el registro, lo confirma y ya no aparece en la lista', async () => {
  const { controlador } = montar();
  await controlador.crear({ body: cancion }, crearRes());

  const borrado = crearRes();
  await controlador.eliminar({ params: { id: '1' } }, borrado);
  assert.equal(borrado.codigo, 200);
  assert.equal(borrado.cuerpo.mensaje, 'Favorito eliminado');

  const lista = crearRes();
  await controlador.listar({}, lista);
  assert.equal(lista.cuerpo.length, 0);
});

test('Notificación: sin URL configurada no envía nada y no rompe la app', async () => {
  let llamadas = 0;
  const notificador = new NotificacionService({
    urlDestino: '',
    http: { post: async () => { llamadas += 1; } },
  });
  assert.equal(await notificador.notificar({ id: 1 }), false);
  assert.equal(llamadas, 0);
});

test('Notificación: si la API externa falla, devuelve false sin lanzar error', async () => {
  const notificador = new NotificacionService({
    urlDestino: 'https://ejemplo.com/notificar',
    http: { post: async () => { throw new Error('ECONNREFUSED'); } },
  });
  assert.equal(await notificador.notificar({ id: 1 }), false);
});

test('Notificación: envía el JSON con POST a la URL configurada', async () => {
  const enviado = {};
  const notificador = new NotificacionService({
    urlDestino: 'https://ejemplo.com/notificar',
    http: {
      post: async (url, cuerpo) => {
        enviado.url = url;
        enviado.cuerpo = cuerpo;
        return { status: 200 };
      },
    },
  });
  assert.equal(await notificador.notificar({ id: 1, titulo: 'X' }), true);
  assert.equal(enviado.url, 'https://ejemplo.com/notificar');
  assert.equal(enviado.cuerpo.titulo, 'X');
});

test('Actualizar: edita el nombre (título) y valida que no quede vacío', async () => {
  const { controlador } = montar();
  await controlador.crear({ body: cancion }, crearRes());

  const ok = crearRes();
  await controlador.actualizar({ params: { id: '1' }, body: { titulo: '  Mi versión  ' } }, ok);
  assert.equal(ok.codigo, 200);
  assert.equal(ok.cuerpo.titulo, 'Mi versión');
  assert.equal(ok.cuerpo.artista, cancion.artista);

  const vacio = crearRes();
  await controlador.actualizar({ params: { id: '1' }, body: { titulo: '   ' } }, vacio);
  assert.equal(vacio.codigo, 400);

  const sinCampos = crearRes();
  await controlador.actualizar({ params: { id: '1' }, body: {} }, sinCampos);
  assert.equal(sinCampos.codigo, 400);
});
