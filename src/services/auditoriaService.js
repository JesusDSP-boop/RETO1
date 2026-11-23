class AuditoriaService {
  constructor(repositorio) {
    this.repositorio = repositorio;
  }

  async registrar({ actor, rol, accion, entidad, entidadId = null, detalles = null }) {
    const fila = this.repositorio.create({
      actor: String(actor || 'sistema').slice(0, 80),
      rol: String(rol || 'sistema').slice(0, 20),
      accion: String(accion).slice(0, 40),
      entidad: String(entidad).slice(0, 40),
      entidadId: entidadId == null ? null : String(entidadId),
      detalles: detalles == null ? null : JSON.stringify(detalles),
    });
    return this.repositorio.save(fila);
  }

  listar(limite = 200) {
    return this.repositorio.find({
      order: { id: 'DESC' },
      take: Math.min(500, Math.max(1, Number(limite) || 200)),
    });
  }
}

module.exports = AuditoriaService;
