const crypto = require('crypto');
const { promisify } = require('util');
const ErrorApi = require('../errores');

const scrypt = promisify(crypto.scrypt);
const DURACION_SESION_MS = 8 * 60 * 60 * 1000;

class AuthService {
  constructor(repositorioUsuarios, {
    ahora = () => Date.now(),
    apiKey = '',
    repositorioFavoritos = null,
    auditoriaService = null,
    esquemas = null,
  } = {}) {
    this.repositorio = repositorioUsuarios;
    this.ahora = ahora;
    this.sesiones = new Map();
    this.apiKeyHash = apiKey ? crypto.createHash('sha256').update(apiKey).digest() : null;
    this.repositorioFavoritos = repositorioFavoritos;
    this.auditoriaService = auditoriaService;
    this.esquemas = esquemas;
  }

  async registrar({ usuario, password, apiKey } = {}) {
    const nombre = typeof usuario === 'string' ? usuario.trim() : '';
    if (!/^[\p{L}\p{N}]{3,40}$/u.test(nombre)) {
      throw new ErrorApi(400, 'El usuario debe tener entre 3 y 40 letras o números, sin espacios ni caracteres especiales');
    }
    if (typeof password !== 'string' || password.length < 10 || password.length > 200) {
      throw new ErrorApi(400, 'La contraseña debe tener entre 10 y 200 caracteres');
    }
    const clave = typeof apiKey === 'string' ? apiKey.trim() : '';
    if (clave && !this.verificarApiKey(clave)) {
      throw new ErrorApi(401, 'API_KEY incorrecta; la cuenta no fue creada');
    }
    if (await this.repositorio.findOneBy({ nombre })) {
      throw new ErrorApi(409, 'Ese nombre de usuario ya está registrado');
    }
    const rol = clave ? 'admin' : 'cliente';
    const primerCliente = rol === 'cliente' && (await this.repositorio.count({ where: { rol: 'cliente' } })) === 0;
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = await scrypt(password, salt, 64);
    const guardado = await this.repositorio.save(this.repositorio.create({
      nombre,
      passwordHash: `${salt}:${hash.toString('hex')}`,
      rol,
    }));
    if (primerCliente) await this._adoptarFavoritosLegados(guardado.id);
    return { id: guardado.id, usuario: guardado.nombre, rol };
  }

  verificarApiKey(clave) {
    return Boolean(this.apiKeyHash && typeof clave === 'string' && clave.length > 0
      && crypto.timingSafeEqual(crypto.createHash('sha256').update(clave).digest(), this.apiKeyHash));
  }

  async _adoptarFavoritosLegados(usuarioId) {
    if (!this.repositorioFavoritos) return;
    const resultado = await this.repositorioFavoritos.createQueryBuilder()
      .update()
      .set({ usuarioId })
      .where('usuarioId IS NULL')
      .execute();
    if (resultado.affected && this.auditoriaService) {
      await this.auditoriaService.registrar({
        actor: 'sistema',
        rol: 'sistema',
        accion: 'asignacion_favoritos_legados',
        entidad: 'favorito',
        detalles: { usuarioId, cantidad: resultado.affected },
      });
    }
  }

  async iniciarSesion({ usuario, password } = {}) {
    const nombre = typeof usuario === 'string' ? usuario.trim() : '';
    const cuenta = await this.repositorio.findOneBy({ nombre });
    if (!cuenta) throw new ErrorApi(401, 'No existe una cuenta con ese nombre de usuario; crea una cuenta primero');
    if (typeof password !== 'string') throw new ErrorApi(401, 'La contraseña es incorrecta');
    if (!await this._verificarPassword(cuenta, password)) throw new ErrorApi(401, 'La contraseña es incorrecta');
    const token = crypto.randomBytes(32).toString('hex');
    const sesion = {
      token,
      expira: this.ahora() + DURACION_SESION_MS,
      usuario: { id: cuenta.id, usuario: cuenta.nombre, rol: cuenta.rol === 'admin' ? 'admin' : 'cliente' },
    };
    for (const [tokenExistente, sesionExistente] of this.sesiones) {
      if (sesionExistente.expira <= this.ahora()) this.sesiones.delete(tokenExistente);
    }
    this.sesiones.set(token, sesion);
    return sesion;
  }

  async _verificarPassword(cuenta, password) {
    const [parteA, parteB] = cuenta.passwordHash.split(':');
    const [salt, hashGuardado] = parteA?.length === 32
      ? [parteA, parteB]
      : [parteB, parteA];
    if (!salt || !hashGuardado) return false;
    const hashPresentado = await scrypt(password, salt, 64);
    const hashEsperado = Buffer.from(hashGuardado, 'hex');
    return hashPresentado.length === hashEsperado.length && crypto.timingSafeEqual(hashPresentado, hashEsperado);
  }

  async eliminarCuenta(usuarioId, password) {
    if (!Number.isSafeInteger(usuarioId) || typeof password !== 'string' || !password) {
      throw new ErrorApi(400, 'Confirma la eliminación con tu contraseña');
    }
    const cuenta = await this.repositorio.findOneBy({ id: usuarioId });
    if (!cuenta) throw new ErrorApi(404, 'La cuenta ya no existe');
    if (!await this._verificarPassword(cuenta, password)) {
      throw new ErrorApi(401, 'La contraseña es incorrecta; la cuenta no fue eliminada');
    }
    return this._eliminarCuentaTransaccional(cuenta, cuenta);
  }

  listarCuentas() {
    return this.repositorio.find({
      select: { id: true, nombre: true, rol: true, creadoEn: true },
      order: { id: 'ASC' },
    });
  }

  async eliminarCuentaAdmin(usuarioId, actor) {
    if (!Number.isSafeInteger(usuarioId) || !actor || actor.rol !== 'admin') {
      throw new ErrorApi(403, 'Se requiere una cuenta de administrador');
    }
    const cuenta = await this.repositorio.findOneBy({ id: usuarioId });
    if (!cuenta) throw new ErrorApi(404, 'Cuenta no encontrada');
    return this._eliminarCuentaTransaccional(cuenta, actor);
  }

  async _eliminarCuentaTransaccional(cuenta, actor) {
    const usuarioId = cuenta.id;
    if (!this.repositorioFavoritos || !this.esquemas) {
      throw new Error('No se configuraron los repositorios necesarios para eliminar una cuenta');
    }

    await this.repositorio.manager.transaction(async (manager) => {
      const usuarios = manager.getRepository(this.esquemas.usuario);
      const favoritos = manager.getRepository(this.esquemas.favorito);
      const auditoria = manager.getRepository(this.esquemas.auditoria);
      const resultado = await favoritos.delete({ usuarioId });
      await auditoria.save(auditoria.create({
        actor: actor.usuario,
        rol: actor.rol,
        accion: 'eliminar_cuenta',
        entidad: 'usuario',
        entidadId: String(usuarioId),
        detalles: JSON.stringify({
          usuarioEliminado: cuenta.nombre,
          rolEliminado: cuenta.rol,
          favoritosEliminados: resultado.affected || 0,
        }),
      }));
      const eliminacion = await usuarios.delete({ id: usuarioId });
      if (!eliminacion.affected) throw new ErrorApi(409, 'La cuenta cambió durante la eliminación; inténtalo de nuevo');
    });

    for (const [token, sesion] of this.sesiones) {
      if (sesion.usuario.id === usuarioId) this.sesiones.delete(token);
    }
    return { mensaje: 'Cuenta eliminada' };
  }

  obtenerSesion(token) {
    if (!token) return null;
    const sesion = this.sesiones.get(token);
    if (!sesion) return null;
    if (sesion.expira <= this.ahora()) {
      this.sesiones.delete(token);
      return null;
    }
    return sesion;
  }

  cerrarSesion(token) {
    return this.sesiones.delete(token);
  }
}

AuthService.DURACION_SESION_MS = DURACION_SESION_MS;
module.exports = AuthService;