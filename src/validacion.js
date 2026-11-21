const ErrorApi = require('./errores');

// HARDENING (validación de entrada): todo dato que llega del usuario se revisa (tipo, longitud y formato)
// ANTES de guardarlo. Los campos que no se esperan se ignoran: nunca llegan a la base de datos.
const MAX_TEXTO = 200;
const MAX_URL = 500;
const MAX_CONSULTA = 100;

// Solo http y https. Esto bloquea "javascript:..." y "data:..." en enlaces, portadas y audios.
function esUrlHttp(valor) {
  try {
    const url = new URL(valor);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function validarCancion(datos) {
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) {
    throw new ErrorApi(400, 'El cuerpo debe ser un objeto JSON con los datos de la canción');
  }

  const faltan = [];
  if (!Number.isSafeInteger(datos.id) || datos.id <= 0) faltan.push('id (número entero positivo de Deezer)');
  for (const campo of ['titulo', 'artista']) {
    if (typeof datos[campo] !== 'string' || !datos[campo].trim()) faltan.push(campo);
    else if (datos[campo].trim().length > MAX_TEXTO) faltan.push(`${campo} (máximo ${MAX_TEXTO} caracteres)`);
  }
  if (faltan.length > 0) throw new ErrorApi(400, `Campos obligatorios faltantes o inválidos: ${faltan.join(', ')}`);

  const invalidos = [];
  if (datos.album != null && (typeof datos.album !== 'string' || datos.album.length > MAX_TEXTO)) {
    invalidos.push(`album (texto de hasta ${MAX_TEXTO} caracteres)`);
  }
  for (const campo of ['portada', 'preview', 'enlace']) {
    const valor = datos[campo];
    if (valor != null && valor !== '' && (typeof valor !== 'string' || valor.length > MAX_URL || !esUrlHttp(valor))) {
      invalidos.push(`${campo} (URL http o https de hasta ${MAX_URL} caracteres)`);
    }
  }
  if (datos.duracion != null && (!Number.isInteger(datos.duracion) || datos.duracion < 0 || datos.duracion > 86400)) {
    invalidos.push('duracion (segundos entre 0 y 86400)');
  }
  if (invalidos.length > 0) throw new ErrorApi(400, `Campos opcionales inválidos: ${invalidos.join(', ')}`);
}

function validarConsulta(consulta) {
  if (String(consulta).length > MAX_CONSULTA) {
    throw new ErrorApi(400, `La búsqueda no puede tener más de ${MAX_CONSULTA} caracteres`);
  }
}

module.exports = { validarCancion, validarConsulta, esUrlHttp, MAX_TEXTO, MAX_CONSULTA };
