const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { registrarPeticiones, crearRutaSalud } = require('../src/middleware/observabilidad');
const { manejadorErrores, rutaNoEncontrada } = require('../src/middleware/errores');
const MusicController = require('../src/controllers/musicController');
const DeezerService = require('../src/services/deezerService');

// Logger falso: guarda cada mensaje con su nivel para poder revisarlo.
function crearLoggerFalso() {
  const registros = [];
  const en = (nivel) => (mensaje) => registros.push({ nivel, mensaje });
  return { registros, http: en('http'), info: en('info'), warn: en('warn'), error: en('error') };
}

// "res" falso de Express: emite "finish" como el real al terminar la respuesta.
function crearRes() {
  const res = new EventEmitter();
  return Object.assign(res, {
    statusCode: 200, cuerpo: null, headersSent: false,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.cuerpo = b; return this; },
  });
}

function atender(logger, metodo, url, codigo) {
  const res = crearRes();
  res.statusCode = codigo;
  registrarPeticiones(logger)({ method: metodo, originalUrl: url }, res, () => {});
  res.emit('finish');
}

test('Logs: cada petición registra método, ruta, código HTTP y tiempo', () => {
  const logger = crearLoggerFalso();
  atender(logger, 'GET', '/api/canciones?q=queen', 200);
  assert.equal(logger.registros.length, 1);
  assert.equal(logger.registros[0].nivel, 'http');
  assert.match(logger.registros[0].mensaje, /^GET \/api\/canciones\?q=queen 200 \d+ms$/);
});

test('Logs: el nivel depende del resultado (201 = http, 404 = warn, 500 = error)', () => {
  const logger = crearLoggerFalso();
  atender(logger, 'POST', '/api/favoritos', 201);
  atender(logger, 'GET', '/no-existe', 404);
  atender(logger, 'GET', '/api/catalogo', 500);
  assert.deepEqual(logger.registros.map((r) => r.nivel), ['http', 'warn', 'error']);
  assert.match(logger.registros[1].mensaje, /^GET \/no-existe 404 \d+ms$/);
});

test('Errores: un fallo inesperado se registra con nivel ERROR y stacktrace; el cliente solo recibe un mensaje genérico', () => {
  const logger = crearLoggerFalso();
  const res = crearRes();
  manejadorErrores(logger)(new Error('contraseña de la base: 1234'), { method: 'GET', originalUrl: '/api/x' }, res, () => {});

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.cuerpo, { error: 'Error interno del servidor' });
  assert.ok(!JSON.stringify(res.cuerpo).includes('contraseña'));
  assert.equal(logger.registros[0].nivel, 'error');
  assert.match(logger.registros[0].mensaje, /contraseña de la base: 1234/);
  assert.match(logger.registros[0].mensaje, /\n\s+at /); // líneas del stacktrace
});

test('Errores: JSON mal escrito responde 400, cuerpo demasiado grande 413 y ruta inexistente 404', () => {
  const logger = crearLoggerFalso();
  const peticion = { method: 'POST', originalUrl: '/api/favoritos' };

  const malJson = crearRes();
  manejadorErrores(logger)({ type: 'entity.parse.failed' }, peticion, malJson, () => {});
  assert.equal(malJson.statusCode, 400);

  const grande = crearRes();
  manejadorErrores(logger)({ type: 'entity.too.large' }, peticion, grande, () => {});
  assert.equal(grande.statusCode, 413);

  const noExiste = crearRes();
  rutaNoEncontrada({}, noExiste);
  assert.equal(noExiste.statusCode, 404);
  assert.deepEqual(noExiste.cuerpo, { error: 'Ruta no encontrada' });
  assert.equal(logger.registros.length, 0); // estos casos no son fallos del servidor
});

test('Health: GET /health responde { status: "ok", timestamp } y 503 si la base de datos falla', async () => {
  const logger = crearLoggerFalso();

  const ok = crearRes();
  await crearRutaSalud(async () => 0, logger)({}, ok);
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.cuerpo.status, 'ok');
  assert.ok(!Number.isNaN(Date.parse(ok.cuerpo.timestamp)));
  assert.deepEqual(Object.keys(ok.cuerpo).sort(), ['status', 'timestamp']);

  const caida = crearRes();
  await crearRutaSalud(async () => { throw new Error('base de datos caída'); }, logger)({}, caida);
  assert.equal(caida.statusCode, 503);
  assert.equal(caida.cuerpo.status, 'error');
  assert.equal(logger.registros[0].nivel, 'error');
});

test('Hardening: si Deezer falla se registra el error con stacktrace y el cliente no ve detalles técnicos', async () => {
  const logger = crearLoggerFalso();
  const http = { get: async () => { throw new Error('connect ECONNREFUSED 10.0.0.5:443'); } };
  const controlador = new MusicController(new DeezerService(http), logger);
  const res = crearRes();
  await controlador.buscar({ query: { q: 'queen' } }, res);

  assert.equal(res.statusCode, 502);
  assert.deepEqual(res.cuerpo, { error: 'No se pudo obtener datos de la API de música' });
  assert.ok(!JSON.stringify(res.cuerpo).includes('ECONNREFUSED'));
  assert.equal(logger.registros[0].nivel, 'error');
  assert.match(logger.registros[0].mensaje, /ECONNREFUSED 10\.0\.0\.5/);
  assert.match(logger.registros[0].mensaje, /\n\s+at /);
});
