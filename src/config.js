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

module.exports = { leerConfig };
