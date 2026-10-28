const test = require('node:test');
const assert = require('node:assert/strict');
const DeezerService = require('../src/services/deezerService');
const MusicController = require('../src/controllers/musicController');

// Respuesta simulada con la forma real de Deezer (así no hace falta internet).
const respuestaDeezer = {
  data: {
    data: [
      {
        id: 3135556,
        title: 'Harder, Better, Faster, Stronger',
        duration: 224,
        preview: 'https://cdn.ejemplo.com/preview.mp3',
        link: 'https://www.deezer.com/track/3135556',
        artist: { id: 27, name: 'Daft Punk' },
        album: { id: 302127, title: 'Discovery', cover_medium: 'https://cdn.ejemplo.com/portada.jpg' },
      },
    ],
  },
};

// "res" falso de Express: guarda el código y el cuerpo que se envían.
function crearRes() {
  return {
    codigo: 200,
    cuerpo: null,
    status(c) { this.codigo = c; return this; },
    json(b) { this.cuerpo = b; return this; },
  };
}

test('1. Formato correcto: el JSON es un array y cada canción tiene id', async () => {
  const servicio = new DeezerService({ get: async () => respuestaDeezer });
  const canciones = await servicio.buscarCanciones('daft punk');

  assert.ok(Array.isArray(canciones));
  assert.ok(canciones.length > 0);
  for (const c of canciones) {
    assert.ok('id' in c);
    assert.equal(typeof c.titulo, 'string');
    assert.ok('artista' in c && 'preview' in c);
  }
});

test('2. Manejo de errores: si la API falla, se responde un error claro (no explota)', async () => {
  const fallos = [
    { get: async () => { throw new Error('ECONNREFUSED'); } }, // la API no responde
    { get: async () => ({ data: { error: { code: 4, message: 'Quota limit exceeded' } } }) }, // error de Deezer
  ];
  for (const http of fallos) {
    const controlador = new MusicController(new DeezerService(http));
    const res = crearRes();
    await controlador.buscar({ query: { q: 'queen' } }, res);

    assert.equal(res.codigo, 502);
    assert.equal(typeof res.cuerpo.error, 'string');
    assert.equal(typeof res.cuerpo.detalle, 'string');
  }
});

test('3. Mock de dependencia: el controlador funciona con un servicio simulado', async () => {
  const servicioFalso = {
    buscarCanciones: async (q) => [{ id: 1, titulo: `Canción falsa de ${q}` }],
    obtenerTop: async () => [],
  };
  const controlador = new MusicController(servicioFalso);
  const res = crearRes();
  await controlador.buscar({ query: { q: 'prueba' } }, res);

  assert.equal(res.codigo, 200);
  assert.deepEqual(res.cuerpo, [{ id: 1, titulo: 'Canción falsa de prueba' }]);
});
