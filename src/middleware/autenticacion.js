const COOKIE_SESION = 'ritmo_sesion';

function leerCookie(req, nombre) {
  const cookies = String(req.headers.cookie || '').split(';');
  const entrada = cookies.map((c) => c.trim()).find((c) => c.startsWith(`${nombre}=`));
  return entrada ? entrada.slice(nombre.length + 1) : '';
}

function crearAutenticacion(authService) {
  function cargarSesion(req, res, next) {
    const token = leerCookie(req, COOKIE_SESION);
    const sesion = authService.obtenerSesion(token);
    if (sesion) {
      req.sesionToken = token;
      req.usuario = sesion.usuario;
    }
    next();
  }

  function requiereCliente(req, res, next) {
    if (!req.usuario || req.usuario.rol !== 'cliente') {
      return res.status(401).json({ error: 'Inicia sesión con una cuenta de cliente' });
    }
    return next();
  }

  function requiereAdmin(req, res, next) {
    if (!req.usuario || req.usuario.rol !== 'admin') {
      return res.status(401).json({ error: 'Inicia sesión con una cuenta de administrador' });
    }
    return next();
  }

  return { cargarSesion, requiereCliente, requiereAdmin };
}

module.exports = { crearAutenticacion, COOKIE_SESION };