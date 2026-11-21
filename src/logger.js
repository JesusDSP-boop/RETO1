const fs = require('fs');
const path = require('path');
const { createLogger, format, transports } = require('winston');

const NIVELES = ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'];

// OBSERVABILIDAD: sistema de logging con Winston. Escribe en la consola y en archivos de la carpeta "logs":
//   logs/app.log    todo lo que se registra (peticiones, avisos y errores)
//   logs/error.log  solo los errores, con su stacktrace completo
function crearLogger({ nivel = 'http', carpeta = path.join(__dirname, '..', 'logs') } = {}) {
  fs.mkdirSync(carpeta, { recursive: true });
  const nivelValido = NIVELES.includes(String(nivel).toLowerCase()) ? String(nivel).toLowerCase() : 'http';

  const mayusculas = format((info) => {
    info.level = info.level.toUpperCase();
    return info;
  });
  const marca = format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' });
  const linea = format.printf(({ timestamp, level, message }) => `${timestamp} [${level}] ${message}`);

  return createLogger({
    level: nivelValido,
    transports: [
      new transports.Console({ format: format.combine(marca, mayusculas(), format.colorize(), linea) }),
      new transports.File({ filename: path.join(carpeta, 'app.log'), format: format.combine(marca, mayusculas(), linea) }),
      new transports.File({ filename: path.join(carpeta, 'error.log'), level: 'error', format: format.combine(marca, mayusculas(), linea) }),
    ],
  });
}

module.exports = { crearLogger };
