const ErrorApi = require('../errores');
const { validarCancion, MAX_TEXTO } = require('../validacion');

const textoOpcional = (valor) => (typeof valor === 'string' && valor.trim() ? valor.trim() : null);

// Convierte el ":id" de la URL en un número entero positivo, o responde 400.
function aIdValido(valor) {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ErrorApi(400, 'El id debe ser un número entero positivo');
  }
  return id;
}

class FavoritosService {
  /**
   * INYECCIÓN DE DEPENDENCIAS (Reto 2)
   * El servicio recibe el repositorio de TypeORM y el notificador de la API externa.
   * No los crea él mismo, así las pruebas pueden pasarle versiones simuladas.
   */
  constructor(repositorio, notificador, auditoriaService = null) {
    this.repositorio = repositorio;
    this.notificador = notificador;
    this.auditoriaService = auditoriaService;
  }

  async _auditar(actor, accion, favorito, detalles) {
    if (!this.auditoriaService) return;
    await this.auditoriaService.registrar({
      actor: actor?.usuario || 'cliente',
      rol: actor?.rol || 'cliente',
      accion,
      entidad: 'favorito',
      entidadId: favorito.id,
      detalles,
    });
  }

  _usuarioId(actor) {
    if (!actor || !Number.isSafeInteger(actor.id)) {
      throw new ErrorApi(401, 'Inicia sesión con una cuenta para acceder a tus favoritos');
    }
    return actor.id;
  }

  listar(actor) {
    const usuarioId = this._usuarioId(actor);
    return this.repositorio.find({ where: { usuarioId }, order: { id: 'ASC' } });
  }

  async obtener(idTexto, actor) {
    const id = aIdValido(idTexto);
    const favorito = await this.repositorio.findOneBy({ id, usuarioId: this._usuarioId(actor) });
    if (!favorito) throw new ErrorApi(404, 'Favorito no encontrado');
    return favorito;
  }

  async crear(datos, actor) {
    validarCancion(datos);
    const usuarioId = this._usuarioId(actor);

    const repetido = await this.repositorio.findOneBy({ deezerId: datos.id, usuarioId });
    if (repetido) throw new ErrorApi(409, 'Esa canción ya está en tus favoritos');

    const nuevo = this.repositorio.create({
      deezerId: datos.id,
      usuarioId,
      titulo: datos.titulo.trim(),
      artista: datos.artista.trim(),
      album: textoOpcional(datos.album),
      portada: textoOpcional(datos.portada),
      duracion: Number.isInteger(datos.duracion) ? datos.duracion : null,
      preview: textoOpcional(datos.preview),
      enlace: textoOpcional(datos.enlace),
    });
    const guardado = await this.repositorio.save(nuevo);

    // Parte 3: ya guardado en la base de datos, se envía el evento a la API externa.
    await this.notificador.notificar({
      evento: 'favorito_creado',
      id: guardado.id,
      deezerId: guardado.deezerId,
      titulo: guardado.titulo,
      artista: guardado.artista,
    });
    await this._auditar(actor, 'crear', guardado, { deezerId: guardado.deezerId, titulo: guardado.titulo, artista: guardado.artista });
    return guardado;
  }

  async actualizar(idTexto, datos = {}, actor) {
    const id = aIdValido(idTexto);
    const favorito = await this.repositorio.findOneBy({ id, usuarioId: this._usuarioId(actor) });
    if (!favorito) throw new ErrorApi(404, 'Favorito no encontrado');

    // Solo se pueden editar el nombre (titulo) y las notas. Basta con enviar uno de los dos.
    const cambios = {};
    if ('titulo' in datos) {
      const titulo = typeof datos.titulo === 'string' ? datos.titulo.trim() : '';
      if (!titulo) throw new ErrorApi(400, 'El nombre de la canción no puede estar vacío');
      if (titulo.length > MAX_TEXTO) throw new ErrorApi(400, `El nombre no puede tener más de ${MAX_TEXTO} caracteres`);
      cambios.titulo = titulo;
    }
    if ('notas' in datos) {
      if (datos.notas !== null && typeof datos.notas !== 'string') {
        throw new ErrorApi(400, 'Envía el campo "notas" como texto o como null');
      }
      const notas = textoOpcional(datos.notas);
      if (notas && notas.length > 500) throw new ErrorApi(400, 'Las notas no pueden tener más de 500 caracteres');
      cambios.notas = notas;
    }
    if (Object.keys(cambios).length === 0) {
      throw new ErrorApi(400, 'Envía "titulo" y/o "notas" para actualizar');
    }
    const anterior = { titulo: favorito.titulo, notas: favorito.notas };
    this.repositorio.merge(favorito, cambios);
    const guardado = await this.repositorio.save(favorito);
    await this._auditar(actor, 'actualizar', guardado, { anterior, cambios });
    return guardado;
  }

  async eliminar(idTexto, actor) {
    const id = aIdValido(idTexto);
    const favorito = await this.repositorio.findOneBy({ id, usuarioId: this._usuarioId(actor) });
    if (!favorito) throw new ErrorApi(404, 'Favorito no encontrado');
    const eliminado = { ...favorito };
    await this.repositorio.remove(favorito);
    await this._auditar(actor, 'eliminar', eliminado, { deezerId: eliminado.deezerId, titulo: eliminado.titulo });
    return { mensaje: 'Favorito eliminado', id };
  }
}

module.exports = FavoritosService;
