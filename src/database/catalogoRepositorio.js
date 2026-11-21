const { In, Like } = require('typeorm');

// Capa de acceso a datos del catálogo. Envuelve el repositorio de TypeORM y expone
// operaciones simples; así CatalogoService no depende de TypeORM y se puede probar con un repositorio falso.
class CatalogoRepositorio {
  constructor(repositorioTypeorm) {
    this.repo = repositorioTypeorm;
  }

  contar() {
    return this.repo.count();
  }

  // Inserta las canciones nuevas y ACTUALIZA las que ya estaban (se reconocen por el id de Deezer).
  async guardar(canciones) {
    const existentes = await this.repo.find({
      select: { id: true, deezerId: true },
      where: { deezerId: In(canciones.map((c) => c.id)) },
    });
    const idLocal = new Map(existentes.map((f) => [f.deezerId, f.id]));

    const filas = canciones.map((c) => {
      const fila = {
        deezerId: c.id,
        titulo: c.titulo,
        artista: c.artista,
        album: c.album ?? null,
        portada: c.portada ?? null,
        duracion: Number.isInteger(c.duracion) ? c.duracion : null,
        preview: c.preview || null,
        enlace: c.enlace ?? null,
      };
      if (idLocal.has(c.id)) fila.id = idLocal.get(c.id); // con id => TypeORM actualiza esa fila
      return fila;
    });
    await this.repo.save(filas, { chunk: 100 });
    return { nuevas: filas.length - existentes.length, actualizadas: existentes.length };
  }

  vaciar() {
    return this.repo.clear(); // borra todas las filas de la tabla
  }

  async buscar({ q, pagina, limite }) {
    const patron = `%${q.replace(/[%_]/g, '')}%`;
    const where = q ? [{ titulo: Like(patron) }, { artista: Like(patron) }] : {};
    const [filas, total] = await this.repo.findAndCount({
      where,
      order: { id: 'ASC' },
      skip: (pagina - 1) * limite,
      take: limite,
    });
    return { filas, total };
  }
}

module.exports = CatalogoRepositorio;
