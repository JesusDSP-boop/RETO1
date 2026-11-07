const ErrorApi = require('../errores');

const textoOpcional = (valor) => (typeof valor === 'string' && valor.trim() ? valor.trim() : null);

// Convierte el ":id" de la URL en un número entero positivo, o responde 400.
function aIdValido(valor) {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ErrorApi(400, 'El id debe ser un número entero positivo');
  }
  return id;
}

// Revisa los campos obligatorios del JSON del Reto 1 antes de tocar la base de datos.
function validarCancion(datos) {
  const faltan = [];
  if (!Number.isInteger(datos?.id) || datos.id <= 0) faltan.push('id (número de Deezer)');
  if (typeof datos?.titulo !== 'string' || !datos.titulo.trim()) faltan.push('titulo');
  if (typeof datos?.artista !== 'string' || !datos.artista.trim()) faltan.push('artista');
  if (faltan.length > 0) {
    throw new ErrorApi(400, `Campos obligatorios faltantes o inválidos: ${faltan.join(', ')}`);
  }
}

class FavoritosService {
  /**
   * INYECCIÓN DE DEPENDENCIAS (Reto 2)
   * El servicio recibe el repositorio de TypeORM y el notificador de la API externa.
   * No los crea él mismo, así las pruebas pueden pasarle versiones simuladas.
   */
  constructor(repositorio, notificador) {
    this.repositorio = repositorio;
    this.notificador = notificador;
  }

  listar() {
    return this.repositorio.find({ order: { id: 'ASC' } });
  }

  async obtener(idTexto) {
    const id = aIdValido(idTexto);
    const favorito = await this.repositorio.findOneBy({ id });
    if (!favorito) throw new ErrorApi(404, 'Favorito no encontrado');
    return favorito;
  }

  async crear(datos) {
    validarCancion(datos);

    const repetido = await this.repositorio.findOneBy({ deezerId: datos.id });
    if (repetido) throw new ErrorApi(409, 'Esa canción ya está en tus favoritos');

    const nuevo = this.repositorio.create({
      deezerId: datos.id,
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
    return guardado;
  }

  async actualizar(idTexto, datos = {}) {
    const id = aIdValido(idTexto);
    const favorito = await this.repositorio.findOneBy({ id });
    if (!favorito) throw new ErrorApi(404, 'Favorito no encontrado');

    // Solo se pueden editar el nombre (titulo) y las notas. Basta con enviar uno de los dos.
    const cambios = {};
    if ('titulo' in datos) {
      const titulo = typeof datos.titulo === 'string' ? datos.titulo.trim() : '';
      if (!titulo) throw new ErrorApi(400, 'El nombre de la canción no puede estar vacío');
      if (titulo.length > 120) throw new ErrorApi(400, 'El nombre no puede tener más de 120 caracteres');
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
    this.repositorio.merge(favorito, cambios);
    return this.repositorio.save(favorito);
  }

  async eliminar(idTexto) {
    const id = aIdValido(idTexto);
    const favorito = await this.repositorio.findOneBy({ id });
    if (!favorito) throw new ErrorApi(404, 'Favorito no encontrado');
    await this.repositorio.remove(favorito);
    return { mensaje: 'Favorito eliminado', id };
  }
}

module.exports = FavoritosService;
