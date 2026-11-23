const crypto = require('crypto');

// HARDENING (Reto 3, Parte 2)

// Cabeceras de seguridad. Las directivas de CSP elegidas no afectan a la página:
// impiden que otro sitio la meta en un iframe (clickjacking) y bloquean <object> y <base> ajenos.
function cabecerasSeguridad() {
  return (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
    next();
  };
}

// CORS con LISTA BLANCA: solo los orígenes de ORIGENES_PERMITIDOS reciben permiso de los navegadores.
// Nunca se responde con "*". La página propia no lo necesita porque se sirve desde el mismo origen.
function politicaCors(origenesPermitidos = []) {
  const permitidos = new Set(origenesPermitidos);
  return (req, res, next) => {
    const origen = req.headers.origin;
    if (origen && permitidos.has(origen)) {
      res.setHeader('Access-Control-Allow-Origin', origen);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
      res.setHeader('Access-Control-Max-Age', '600');
      if (req.method === 'OPTIONS') return res.status(204).end();
    } else if (origen && req.method === 'OPTIONS') {
      return res.status(403).json({ error: 'Origen no permitido' }); // petición previa (preflight) de un origen no permitido
    }
    return next();
  };
}

const METODOS_LIBRES = new Set(['GET', 'HEAD', 'OPTIONS']);
const huella = (texto) => crypto.createHash('sha256').update(String(texto)).digest();

// AUTENTICACIÓN: las escrituras protegidas del catálogo exigen API key
// en "x-api-key" (o "Authorization: Bearer <clave>"). Favoritos usa sesión de cliente.
// - Compara con timingSafeEqual, para no filtrar información por el tiempo de respuesta.
// - Tras `maxFallos` claves incorrectas desde una misma IP, responde 429 durante `ventanaMs`.
function requerirApiKey({ apiKey, logger = console, maxFallos = 10, ventanaMs = 60000, ahora = () => Date.now() } = {}) {
  if (!apiKey) throw new Error('requerirApiKey necesita una apiKey (variable API_KEY)');
  const esperada = huella(apiKey);
  const fallos = new Map(); // ip -> { cuenta, desde }
  const verificar = (presentada) => typeof presentada === 'string'
    && presentada.length > 0
    && crypto.timingSafeEqual(huella(presentada), esperada);

  const presentar = (req) => {
    const encabezado = req.headers.authorization || '';
    return req.headers['x-api-key'] || (encabezado.startsWith('Bearer ') ? encabezado.slice(7) : '');
  };

  function rechazar(req, res) {
    const ip = req.ip || req.socket?.remoteAddress || 'desconocida';
    let registro = fallos.get(ip);
    if (registro && ahora() - registro.desde > ventanaMs) {
      fallos.delete(ip);
      registro = undefined;
    }
    if (registro && registro.cuenta >= maxFallos) {
      logger.warn(`Autenticación bloqueada por demasiados intentos fallidos desde ${ip}`);
      return res.status(429).json({ error: 'Demasiados intentos fallidos. Espera un minuto e inténtalo de nuevo' });
    }
    if (fallos.size > 1000) fallos.clear();
    const nuevo = registro || { cuenta: 0, desde: ahora() };
    nuevo.cuenta += 1;
    fallos.set(ip, nuevo);
    logger.warn(`Acceso denegado: ${req.method} ${req.originalUrl} desde ${ip}`);
    return res.status(401).json({ error: 'Autenticación requerida: envía tu clave en el encabezado x-api-key' });
  }

  function marcarAdmin(req) {
    req.usuario = { usuario: 'admin (API key)', rol: 'admin' };
  }

  function exigirSiempre(req, res, next) {
    if (verificar(presentar(req))) {
      fallos.delete(req.ip || req.socket?.remoteAddress || 'desconocida');
      marcarAdmin(req);
      return next();
    }
    return rechazar(req, res);
  }

  const middleware = (req, res, next) => {
    if (METODOS_LIBRES.has(req.method)) return next();
    if (verificar(presentar(req))) {
      fallos.delete(req.ip || req.socket?.remoteAddress || 'desconocida');
      marcarAdmin(req);
      return next();
    }
    return rechazar(req, res);
  };
  middleware.verificar = verificar;
  middleware.exigirSiempre = exigirSiempre;
  return middleware;
}

module.exports = { cabecerasSeguridad, politicaCors, requerirApiKey };
