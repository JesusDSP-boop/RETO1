const ErrorApi = require('../errores');
const { validarConsulta, MAX_TEXTO } = require('../validacion');

const pausa = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

// Mismo formato JSON del Reto 1, así la página reutiliza estas canciones tal cual.
const aJson = (f) => ({
  id: f.deezerId,
  titulo: f.titulo,
  artista: f.artista,
  album: f.album,
  notas: f.notas ?? null,
  portada: f.portada,
  duracion: f.duracion,
  preview: f.preview,
  enlace: f.enlace,
});

// Qué hace cada modo de carga:
//  inicial   : 100 canciones del ranking global (una sola petición). Se usa al iniciar el servidor.
//  completo  : ranking global + ranking de cada género; agrega las nuevas y actualiza las que ya estaban.
//  reiniciar : descarga las 100 iniciales y REEMPLAZA todo el contenido del catálogo.
const MODOS = {
  inicial: { soloGlobal: true, reemplazar: false },
  completo: { soloGlobal: false, reemplazar: false },
  reiniciar: { soloGlobal: true, reemplazar: true },
};

class CatalogoService {
  /**
   * INYECCIÓN DE DEPENDENCIAS: recibe el repositorio (base de datos), el servicio de Deezer y la
   * configuración. En las pruebas se reemplazan por versiones simuladas.
   */
  constructor(repositorio, deezer, config = {}) {
    this.repositorio = repositorio;
    this.deezer = deezer;
    this.cargaInicial = Math.min(100, config.cargaInicial ?? 100); // Deezer entrega hasta 100 por petición
    this.cargaCompleta = config.cargaCompleta ?? 5000;
    this.pausaMs = config.pausaMs ?? 200; // Deezer permite unas 50 peticiones cada 5 segundos
    this.log = config.logger ?? console; // el logger también se inyecta (Winston en producción)
    this.auditoriaService = config.auditoriaService ?? null;
    this.carga = { activa: false, modo: null, objetivo: 0, guardadas: 0, error: null };
    this.tarea = null;
  }

  async estado() {
    return { total: await this.repositorio.contar(), carga: { ...this.carga } };
  }

  async listar({ q = '', pagina = 1, limite = 24 } = {}) {
    const p = Math.max(1, parseInt(pagina, 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limite, 10) || 24));
    const consulta = String(q).trim();
    validarConsulta(consulta);
    const { filas, total } = await this.repositorio.buscar({ q: consulta, pagina: p, limite: l });
    return { total, pagina: p, limite: l, paginas: Math.max(1, Math.ceil(total / l)), canciones: filas.map(aJson) };
  }

  // Valida y marca la carga como activa (síncrono, para poder responder 400/409 de inmediato).
  _preparar(modo) {
    if (!MODOS[modo]) throw new ErrorApi(400, 'El modo debe ser "inicial", "completo" o "reiniciar"');
    if (this.carga.activa) throw new ErrorApi(409, 'Ya hay una carga en curso');
    const objetivo = modo === 'completo' ? this.cargaCompleta : this.cargaInicial;
    this.carga = { activa: true, modo, objetivo, guardadas: 0, error: null };
    return modo;
  }

  async _correr(modo, alProgreso, actor = { usuario: 'sistema', rol: 'sistema' }) {
    try {
      const resumen = await this._descargarYGuardar(modo, alProgreso);
      const resultado = { ...resumen, total: await this.repositorio.contar() };
      await this._auditar(actor, `carga_${modo}`, null, resultado);
      return resultado;
    } catch (error) {
      this.carga.error = error.message;
      throw error;
    } finally {
      this.carga.activa = false;
    }
  }

  // Terminal y arranque: espera a que termine la carga.
  async cargar(modo = 'inicial', alProgreso, actor) {
    return this._correr(this._preparar(modo), alProgreso, actor);
  }

  // Página web: responde enseguida y descarga en segundo plano (la página consulta el avance).
  iniciarCarga(modo = 'inicial', actor) {
    this._preparar(modo);
    this.tarea = this._correr(modo, undefined, actor).catch((error) => this.log.error(`[catálogo] La carga falló: ${error.stack}`));
    return { ...this.carga };
  }

  // Al iniciar el servidor: solo descarga si el catálogo está vacío.
  async cargarSiVacio() {
    if ((await this.repositorio.contar()) > 0) return null;
    return this.cargar('inicial');
  }

  async vaciar(actor) {
    if (this.carga.activa) throw new ErrorApi(409, 'Hay una carga en curso. Espera a que termine para borrar el catálogo');
    const eliminadas = await this.repositorio.contar();
    await this.repositorio.vaciar();
    this.carga.error = null;
    await this._auditar(actor, 'borrar_todo', null, { eliminadas });
    return { mensaje: 'Catálogo borrado', eliminadas };
  }

  async actualizar(idTexto, datos = {}, actor) {
    if (this.carga.activa) throw new ErrorApi(409, 'Hay una carga en curso. Espera a que termine para editar el catálogo');
    const deezerId = this._idValido(idTexto);
    const cancion = await this.repositorio.buscarPorDeezerId(deezerId);
    if (!cancion) throw new ErrorApi(404, 'Canción no encontrada en el catálogo');
    if (!datos || typeof datos !== 'object' || Array.isArray(datos)) {
      throw new ErrorApi(400, 'El cuerpo debe ser un objeto JSON');
    }
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
      const notas = typeof datos.notas === 'string' && datos.notas.trim() ? datos.notas.trim() : null;
      if (notas && notas.length > 500) throw new ErrorApi(400, 'Las notas no pueden tener más de 500 caracteres');
      cambios.notas = notas;
    }
    if (Object.keys(cambios).length === 0) throw new ErrorApi(400, 'Envía "titulo" y/o "notas" para actualizar');
    const anterior = { titulo: cancion.titulo, notas: cancion.notas };
    Object.assign(cancion, cambios);
    const guardada = await this.repositorio.guardarUno(cancion);
    await this._auditar(actor, 'actualizar', deezerId, { anterior, cambios });
    return aJson(guardada);
  }

  async eliminar(idTexto, actor) {
    if (this.carga.activa) throw new ErrorApi(409, 'Hay una carga en curso. Espera a que termine para eliminar canciones');
    const deezerId = this._idValido(idTexto);
    const cancion = await this.repositorio.buscarPorDeezerId(deezerId);
    if (!cancion) throw new ErrorApi(404, 'Canción no encontrada en el catálogo');
    await this.repositorio.eliminar(cancion);
    await this._auditar(actor, 'eliminar', deezerId, { titulo: cancion.titulo, deezerId });
    return { mensaje: 'Canción eliminada del catálogo', id: deezerId };
  }

  async eliminarSeleccion(ids, actor) {
    if (this.carga.activa) throw new ErrorApi(409, 'Hay una carga en curso. Espera a que termine para eliminar canciones');
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 200) {
      throw new ErrorApi(400, 'Envía entre 1 y 200 ids de canciones');
    }
    const deezerIds = [...new Set(ids.map((id) => this._idValido(id)))];
    const canciones = await this.repositorio.buscarPorDeezerIds(deezerIds);
    if (canciones.length === 0) throw new ErrorApi(404, 'No se encontraron canciones para eliminar');
    await this.repositorio.eliminarVarios(canciones);
    for (const cancion of canciones) {
      await this._auditar(actor, 'eliminar', cancion.deezerId, { titulo: cancion.titulo, deezerId: cancion.deezerId, seleccion: true });
    }
    return { mensaje: 'Canciones eliminadas del catálogo', eliminadas: canciones.length };
  }

  _idValido(valor) {
    const id = Number(valor);
    if (!Number.isSafeInteger(id) || id <= 0) throw new ErrorApi(400, 'El id debe ser un entero positivo');
    return id;
  }

  _auditar(actor, accion, entidadId, detalles) {
    if (!this.auditoriaService) return Promise.resolve();
    return this.auditoriaService.registrar({
      actor: actor?.usuario || 'sistema',
      rol: actor?.rol || 'sistema',
      accion,
      entidad: 'catalogo',
      entidadId,
      detalles,
    });
  }

  async _descargarYGuardar(modo, alProgreso) {
    const { soloGlobal, reemplazar } = MODOS[modo];
    let tope = this.carga.objetivo; // máximo de canciones que se piden a la API en esta carga
    const vistos = new Set();
    const resumen = { nuevas: 0, actualizadas: 0 };

    const procesar = async (lista) => {
      const lote = [];
      for (const c of lista) {
        if (vistos.size >= tope) break;
        if (c?.id && !vistos.has(c.id)) {
          vistos.add(c.id);
          lote.push(c);
        }
      }
      if (lote.length === 0) return;
      const r = await this.repositorio.guardar(lote);
      resumen.nuevas += r.nuevas;
      resumen.actualizadas += r.actualizadas;
      this.carga.guardadas = vistos.size;
      alProgreso?.(vistos.size, tope);
    };

    // 1. Ranking global. Se descarga ANTES de borrar nada: si Deezer falla, el catálogo queda intacto.
    const global = await this.deezer.obtenerTop(Math.min(tope, 100), 0);
    if (reemplazar) await this.repositorio.vaciar();
    await procesar(global);

    // 2. Ranking de cada género (solo en la carga completa).
    if (!soloGlobal) {
      const generos = (await this.deezer.listarGeneros()).filter((g) => g.id !== 0); // el 0 es "todos"
      tope = Math.min(tope, 100 * (generos.length + 1));
      this.carga.objetivo = tope;
      for (const genero of generos) {
        if (vistos.size >= tope) break;
        await pausa(this.pausaMs);
        let lista;
        try {
          lista = await this.deezer.obtenerTop(100, genero.id);
        } catch (error) {
          this.log.warn(`[catálogo] Género «${genero.nombre}» omitido: ${error.message}`);
          continue;
        }
        await procesar(lista);
      }
    }
    return resumen;
  }
}

module.exports = CatalogoService;
