const test = require('node:test');
const assert = require('node:assert/strict');
const { cabecerasSeguridad, politicaCors, requerirApiKey } = require('../src/middleware/seguridad');
const { validarCancion, validarConsulta } = require('../src/validacion');
const { leerConfigSeguridad } = require('../src/config');
const MusicController = require('../src/controllers/musicController');

const CLAVE = 'una-clave-larga-de-pruebas-123';
const silencio = { http() {}, info() {}, warn() {}, error() {} };

function crearRes() {
  const cabeceras = {};
  return {
    statusCode: 200, cuerpo: null, cabeceras, terminado: false,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.cuerpo = b; return this; },
    end() { this.terminado = true; return this; },
    setHeader(k, v) { cabeceras[k] = v; },
  };
}
const peticion = (metodo, encabezados = {}, ip = '1.1.1.1', url = '/api/favoritos') => ({ method: metodo, originalUrl: url, headers: encabezados, ip });
function pasar(middleware, req) {
  const res = crearRes();
  let siguiente = false;
  middleware(req, res, () => { siguiente = true; });
  return { res, siguiente };
}

test('Autenticación: sin clave o con clave incorrecta, POST/PUT/DELETE responden 401', () => {
  const exigir = requerirApiKey({ apiKey: CLAVE, logger: silencio });
  for (const metodo of ['POST', 'PUT', 'DELETE']) {
    const sinClave = pasar(exigir, peticion(metodo));
    assert.equal(sinClave.res.statusCode, 401);
    assert.equal(sinClave.siguiente, false);
    const mala = pasar(exigir, peticion(metodo, { 'x-api-key': 'clave-incorrecta' }));
    assert.equal(mala.res.statusCode, 401);
    assert.equal(mala.siguiente, false);
  }
});

test('Autenticación: con la clave correcta (x-api-key o Bearer) se permite; GET es público', () => {
  const exigir = requerirApiKey({ apiKey: CLAVE, logger: silencio });
  assert.equal(pasar(exigir, peticion('DELETE', { 'x-api-key': CLAVE })).siguiente, true);
  assert.equal(pasar(exigir, peticion('POST', { authorization: `Bearer ${CLAVE}` })).siguiente, true);
  assert.equal(pasar(exigir, peticion('GET')).siguiente, true);
});

test('Autenticación: tras demasiados intentos fallidos responde 429 y luego se libera', () => {
  let reloj = 0;
  const exigir = requerirApiKey({ apiKey: CLAVE, logger: silencio, maxFallos: 3, ventanaMs: 1000, ahora: () => reloj });
  for (let i = 0; i < 3; i++) assert.equal(pasar(exigir, peticion('POST', {}, '9.9.9.9')).res.statusCode, 401);

  assert.equal(pasar(exigir, peticion('POST', {}, '9.9.9.9')).res.statusCode, 429); // bloqueada
  assert.equal(pasar(exigir, peticion('POST', {}, '8.8.8.8')).res.statusCode, 401); // otra IP sigue normal

  reloj = 5000; // pasó la ventana
  assert.equal(pasar(exigir, peticion('POST', { 'x-api-key': CLAVE }, '9.9.9.9')).siguiente, true);
});

test('Autenticación: el servidor no puede crearse sin API_KEY (credenciales fuera del código)', () => {
  assert.throws(() => requerirApiKey({ apiKey: '' }), /API_KEY/);
});

test('Validación de entrada: acepta una canción válida y rechaza datos peligrosos o mal formados', () => {
  const valida = { id: 1, titulo: 'Canción', artista: 'Artista', album: 'Álbum', duracion: 200,
    portada: 'https://cdn.ejemplo.com/p.jpg', preview: 'https://cdn.ejemplo.com/p.mp3', enlace: 'https://www.deezer.com/track/1' };
  assert.doesNotThrow(() => validarCancion(valida));

  const casos = [
    [{ ...valida, enlace: 'javascript:alert(document.domain)' }, /enlace/], // XSS por enlace
    [{ ...valida, preview: 'data:audio/mp3;base64,AAAA' }, /preview/],
    [{ ...valida, portada: 'no es una url' }, /portada/],
    [{ ...valida, id: -5 }, /id/],
    [{ ...valida, id: '1; DROP TABLE favoritos' }, /id/],
    [{ ...valida, titulo: 'x'.repeat(201) }, /titulo/],
    [{ ...valida, artista: '   ' }, /artista/],
    [{ ...valida, duracion: -1 }, /duracion/],
    [[1, 2, 3], /objeto JSON/],
    [null, /objeto JSON/],
  ];
  for (const [datos, patron] of casos) {
    assert.throws(() => validarCancion(datos), (e) => e.status === 400 && patron.test(e.message), JSON.stringify(datos).slice(0, 60));
  }
});

test('Validación de entrada: una búsqueda de más de 100 caracteres responde 400', async () => {
  assert.doesNotThrow(() => validarConsulta('q'.repeat(100)));
  assert.throws(() => validarConsulta('q'.repeat(101)), (e) => e.status === 400);

  const controlador = new MusicController({ buscarCanciones: async () => [] }, silencio);
  const res = crearRes();
  await controlador.buscar({ query: { q: 'q'.repeat(101) } }, res);
  assert.equal(res.statusCode, 400);
});

test('CORS: solo los orígenes de la lista blanca reciben permiso (nunca "*")', () => {
  const cors = politicaCors(['http://localhost:3000']);

  const permitido = pasar(cors, peticion('GET', { origin: 'http://localhost:3000' }));
  assert.equal(permitido.res.cabeceras['Access-Control-Allow-Origin'], 'http://localhost:3000');
  assert.equal(permitido.siguiente, true);

  const ajeno = pasar(cors, peticion('GET', { origin: 'https://sitio-malicioso.com' }));
  assert.equal(ajeno.res.cabeceras['Access-Control-Allow-Origin'], undefined);

  const sinOrigen = pasar(cors, peticion('GET'));
  assert.deepEqual(sinOrigen.res.cabeceras, {});

  const previaPermitida = pasar(cors, peticion('OPTIONS', { origin: 'http://localhost:3000' }));
  assert.equal(previaPermitida.res.statusCode, 204);
  assert.equal(previaPermitida.siguiente, false);

  const previaAjena = pasar(cors, peticion('OPTIONS', { origin: 'https://sitio-malicioso.com' }));
  assert.equal(previaAjena.res.statusCode, 403);
  assert.notEqual(permitido.res.cabeceras['Access-Control-Allow-Origin'], '*');
});

test('Cabeceras de seguridad: nosniff, anti-iframe y política de referencia', () => {
  const { res, siguiente } = pasar(cabecerasSeguridad(), peticion('GET'));
  assert.equal(siguiente, true);
  assert.equal(res.cabeceras['X-Content-Type-Options'], 'nosniff');
  assert.equal(res.cabeceras['X-Frame-Options'], 'DENY');
  assert.equal(res.cabeceras['Referrer-Policy'], 'no-referrer');
  assert.match(res.cabeceras['Content-Security-Policy'], /frame-ancestors 'none'/);
});

test('Configuración de seguridad (.env): API_KEY, lista blanca de orígenes y nivel de logs', () => {
  const vacia = leerConfigSeguridad({});
  assert.deepEqual(vacia, { apiKey: '', origenesPermitidos: [], nivelLogs: 'http' });

  const completa = leerConfigSeguridad({ API_KEY: ` ${CLAVE} `, ORIGENES_PERMITIDOS: 'http://a.com, https://b.com ,', LOG_LEVEL: 'DEBUG' });
  assert.equal(completa.apiKey, CLAVE);
  assert.deepEqual(completa.origenesPermitidos, ['http://a.com', 'https://b.com']);
  assert.equal(completa.nivelLogs, 'debug');
  assert.equal(leerConfigSeguridad({ LOG_LEVEL: 'inventado' }).nivelLogs, 'http');
});
