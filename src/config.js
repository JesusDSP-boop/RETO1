const entero = (valor, porDefecto, min, max) => {
  const n = parseInt(valor, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : porDefecto;
};

// Lee la configuración del catálogo desde las variables de entorno (.env).
function leerConfig(env = process.env) {
  return {
    cargaInicial: entero(env.CARGA_INICIAL, 100, 1, 100), // Deezer entrega hasta 100 por petición
    cargaCompleta: entero(env.CARGA_COMPLETA, 5000, 1, 20000),
    cargaAlIniciar: String(env.CARGA_AL_INICIAR ?? 'si').trim().toLowerCase() !== 'no',
  };
}

const NIVELES = ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'];

// Seguridad y logs: API_KEY (autenticación), ORIGENES_PERMITIDOS (CORS, separados por comas) y LOG_LEVEL.
function leerConfigSeguridad(env = process.env) {
  const nivel = String(env.LOG_LEVEL ?? 'http').trim().toLowerCase();
  return {
    apiKey: String(env.API_KEY ?? '').trim(),
    origenesPermitidos: String(env.ORIGENES_PERMITIDOS ?? '').split(',').map((o) => o.trim()).filter(Boolean),
    nivelLogs: NIVELES.includes(nivel) ? nivel : 'http',
  };
}

module.exports = { leerConfig, leerConfigSeguridad };
