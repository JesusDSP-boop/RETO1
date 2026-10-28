// Servicio: el único archivo que sabe hablar con la API pública de Deezer.

// Convierte una canción de Deezer en un JSON más simple para nuestra página.
function aCancion(t) {
  return {
    id: t.id,
    titulo: t.title,
    artista: t.artist?.name,
    album: t.album?.title,
    portada: t.album?.cover_medium,
    duracion: t.duration, // segundos de la canción completa
    preview: t.preview, // MP3 de 30 segundos
    enlace: t.link,
  };
}

class DeezerService {
  // El cliente HTTP también se inyecta (por defecto axios) para poder simularlo
  // en las pruebas y no depender de internet. `require` solo se ejecuta si no
  // se pasa uno.
  constructor(http = require('axios')) {
    this.http = http;
    this.urlBase = 'https://api.deezer.com';
  }

  async buscarCanciones(consulta, limite = 12) {
    const cuerpo = await this._pedir('/search', { q: consulta, limit: limite });
    return cuerpo.data.map(aCancion);
  }

  async obtenerTop(limite = 12) {
    const cuerpo = await this._pedir('/chart/0/tracks', { limit: limite });
    return cuerpo.data.map(aCancion);
  }

  async _pedir(ruta, params) {
    const respuesta = await this.http.get(this.urlBase + ruta, { params, timeout: 8000 });
    const cuerpo = respuesta.data;
    // Deezer a veces responde 200 con {"error": {...}} en lugar de datos.
    if (!cuerpo || cuerpo.error || !Array.isArray(cuerpo.data)) {
      throw new Error(cuerpo?.error?.message || 'Respuesta inesperada de la API de Deezer');
    }
    return cuerpo;
  }
}

module.exports = DeezerService;
