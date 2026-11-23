const { Router } = require('express');
const ErrorApi = require('../errores');
const AuthService = require('../services/authService');
const { COOKIE_SESION } = require('../middleware/autenticacion');

module.exports = function crearRutasAuth(authService, auditoriaService, logger = console, requerirAdmin) {
  const router = Router();
  const protegerAdministracion = requerirAdmin || ((_req, res) => (
    res.status(401).json({ error: 'Se requiere una cuenta de administrador' })
  ));
  const fallosLogin = new Map();
  const ventanaLogin = 60_000;
  const maxFallosLogin = 10;

  function limitarIntentosLogin(req, res, next) {
    const ip = req.ip || req.socket?.remoteAddress || 'desconocida';
    const registro = fallosLogin.get(ip);
    if (registro && Date.now() - registro.desde >= ventanaLogin) fallosLogin.delete(ip);
    const actual = fallosLogin.get(ip);
    if (actual && actual.cuenta >= maxFallosLogin) {
      return res.status(429).json({ error: 'Demasiados intentos de inicio de sesión. Espera un minuto e inténtalo de nuevo' });
    }
    if (fallosLogin.size > 1000) fallosLogin.clear();
    req.ipLogin = ip;
    return next();
  }

  async function responder(res, accion, alFallar) {
    try {
      return await accion();
    } catch (error) {
      alFallar?.(error);
      if (error instanceof ErrorApi) return res.status(error.status).json({ error: error.message });
      logger.error(`Error inesperado en autenticación: ${error.stack}`);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  }

  function cookie(res, token) {
    const seguro = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    const duracion = Math.floor(AuthService.DURACION_SESION_MS / 1000);
    res.setHeader('Set-Cookie', `${COOKIE_SESION}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${duracion}${seguro}`);
  }

  function limpiarCookie(res) {
    const seguro = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${COOKIE_SESION}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${seguro}`);
  }

  router.post('/registro', async (req, res) => responder(res, async () => {
    const usuario = await authService.registrar(req.body || {});
    await auditoriaService.registrar({
      actor: usuario.usuario, rol: usuario.rol, accion: 'registro', entidad: 'usuario',
      entidadId: usuario.id, detalles: { usuario: usuario.usuario, rol: usuario.rol },
    });
    return res.status(201).json(usuario);
  }));

  router.post('/login', limitarIntentosLogin, async (req, res) => responder(res, async () => {
    const sesion = await authService.iniciarSesion(req.body || {});
    fallosLogin.delete(req.ipLogin);
    cookie(res, sesion.token);
    await auditoriaService.registrar({
      actor: sesion.usuario.usuario, rol: sesion.usuario.rol, accion: 'inicio_sesion', entidad: 'sesion',
      entidadId: sesion.usuario.id,
    });
    return res.json(sesion.usuario);
  }, (error) => {
    if (error.status !== 401) return;
    const registro = fallosLogin.get(req.ipLogin) || { cuenta: 0, desde: Date.now() };
    registro.cuenta += 1;
    fallosLogin.set(req.ipLogin, registro);
  }));

  router.get('/me', (req, res) => {
    if (!req.usuario) return res.status(401).json({ error: 'No hay una sesión activa' });
    return res.json(req.usuario);
  });

  router.get('/usuarios', protegerAdministracion, async (req, res) => responder(res, async () => (
    res.json(await authService.listarCuentas())
  )));

  router.delete('/usuarios/:id', protegerAdministracion, async (req, res) => responder(res, async () => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) throw new ErrorApi(400, 'El id debe ser un entero positivo');
    return res.json(await authService.eliminarCuentaAdmin(id, req.usuario));
  }));

  router.delete('/cuenta', async (req, res) => {
    if (!req.usuario || !req.sesionToken) {
      return res.status(401).json({ error: 'Inicia sesión para eliminar tu cuenta' });
    }
    return responder(res, async () => {
      const resultado = await authService.eliminarCuenta(req.usuario.id, req.body?.password);
      limpiarCookie(res);
      return res.json(resultado);
    });
  });

  router.post('/logout', async (req, res) => responder(res, async () => {
    if (req.sesionToken) {
      authService.cerrarSesion(req.sesionToken);
      await auditoriaService.registrar({
        actor: req.usuario.usuario, rol: req.usuario.rol, accion: 'cierre_sesion', entidad: 'sesion',
        entidadId: req.usuario.id,
      });
    }
    limpiarCookie(res);
    return res.json({ mensaje: 'Sesión cerrada' });
  }));

  return router;
};