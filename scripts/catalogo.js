// Comandos de terminal para trabajar con la tabla "catalogo". Ver README.
require('dotenv').config();
const { leerConfig } = require('../src/config');
const { crearCatalogoServicio } = require('../src/composicion');
const { dataSource, iniciarBaseDeDatos } = require('../src/database/dataSource');

const AYUDA = `Uso: node scripts/catalogo.js <comando>

  estado         Muestra cuántas canciones hay en la tabla catalogo
  obtener [n]    Pide a la API el ranking global y el de cada género (hasta n canciones;
                 por defecto CARGA_COMPLETA). Agrega las nuevas y actualiza las que ya estaban
  borrar         Borra todas las canciones de la tabla catalogo
  reiniciar      Borra la tabla catalogo y vuelve a cargar las 100 canciones iniciales

Los favoritos no se tocan en ningún comando.`;

async function main() {
  const [comando, cantidad] = process.argv.slice(2);
  if (!['estado', 'obtener', 'borrar', 'reiniciar'].includes(comando)) {
    console.log(AYUDA);
    process.exitCode = comando ? 1 : 0;
    return;
  }

  const config = leerConfig();
  if (cantidad !== undefined) {
    const n = parseInt(cantidad, 10);
    if (comando !== 'obtener' || !(n > 0)) throw new Error('Solo "obtener" acepta una cantidad, y debe ser un entero mayor que 0');
    config.cargaCompleta = n;
  }

  await iniciarBaseDeDatos();
  try {
    const servicio = crearCatalogoServicio(dataSource, config);
    const progreso = (n, tope) => process.stdout.write(`\rDescargando... ${n} de ${tope}   `);

    if (comando === 'estado') {
      console.log(`Canciones en la tabla catalogo: ${(await servicio.estado()).total}`);
    } else if (comando === 'borrar') {
      const r = await servicio.vaciar();
      console.log(`Catálogo borrado: ${r.eliminadas} canciones eliminadas.`);
    } else if (comando === 'reiniciar') {
      const r = await servicio.cargar('reiniciar', progreso);
      console.log(`\nCatálogo reiniciado: ahora tiene ${r.total} canciones.`);
    } else {
      const r = await servicio.cargar('completo', progreso);
      console.log(`\nListo: ${r.nuevas} canciones nuevas y ${r.actualizadas} actualizadas. Total en el catálogo: ${r.total}.`);
    }
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
