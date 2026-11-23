const test = require('node:test');
const assert = require('node:assert/strict');
const CatalogoService = require('../src/services/catalogoService');
const { leerConfig } = require('../src/config');

// Repositorio simulado en memoria: imita las operaciones de CatalogoRepositorio (sin base de datos).
function crearRepoFalso(iniciales = []) {
  const filas = iniciales.map((c, i) => {
    const { id: deezerId, ...resto } = c;
    return { ...resto, id: i + 1, deezerId };
  });
  return {
    filas,
    contar: async () => filas.length,
    buscarPorDeezerId: async (id) => filas.find((f) => f.deezerId === id) ?? null,
    buscarPorDeezerIds: async (ids) => filas.filter((f) => ids.includes(f.deezerId)),
    guardarUno: async (cancion) => cancion,
    eliminar: async (cancion) => {
      const indice = filas.findIndex((f) => f.deezerId === cancion.deezerId);
      if (indice !== -1) filas.splice(indice, 1);
    },
    eliminarVarios: async (canciones) => {
      const ids = new Set(canciones.map((c) => c.deezerId));
      for (let i = filas.length - 1; i >= 0; i -= 1) if (ids.has(filas[i].deezerId)) filas.splice(i, 1);
    },
    guardar: async (canciones) => {
      let nuevas = 0;
      let actualizadas = 0;
      for (const c of canciones) {
        const { id: deezerId, ...resto } = c;
        const existente = filas.find((f) => f.deezerId === deezerId);
        if (existente) {
          Object.assign(existente, resto);
          actualizadas += 1;
        } else {
          filas.push({ ...resto, id: filas.length + 1, deezerId });
          nuevas += 1;
        }
      }
      return { nuevas, actualizadas };
    },
    vaciar: async () => { filas.length = 0; },
    buscar: async ({ q, pagina, limite }) => {
      const t = q.toLowerCase();
      const coinciden = filas.filter((f) => !t || f.titulo.toLowerCase().includes(t) || f.artista.toLowerCase().includes(t));
      return { filas: coinciden.slice((pagina - 1) * limite, pagina * limite), total: coinciden.length };
    },
  };
}

// Deezer simulado: devuelve listas fijas y registra qué ranking y cuántas canciones se pidieron.
function crearDeezerFalso({ top = [], generos = [], porGenero = {}, falla = false } = {}) {
  return {
    llamadas: [],
    async obtenerTop(limite, genero = 0) {
      this.llamadas.push({ genero, limite });
      if (falla) throw new Error('sin conexión');
      return genero === 0 ? top : porGenero[genero] ?? [];
    },
    async listarGeneros() { return generos; },
  };
}

const cancion = (n, prefijo = 'Canción') => ({ id: n, titulo: `${prefijo} ${n}`, artista: `Artista ${n}`, album: 'Álbum', portada: 'p', duracion: 200, preview: 'u', enlace: 'e' });
const rango = (desde, hasta, prefijo) => Array.from({ length: hasta - desde + 1 }, (_, i) => cancion(desde + i, prefijo));
const crear = (repo, deezer, config = {}) => new CatalogoService(repo, deezer, { pausaMs: 0, ...config });

test('Al iniciar: pide a la API solo 100 canciones (una petición al ranking global)', async () => {
  const repo = crearRepoFalso();
  const deezer = crearDeezerFalso({ top: rango(1, 150) }); // aunque la API devolviera más, solo se guardan 100
  const resultado = await crear(repo, deezer).cargarSiVacio();
  assert.equal(repo.filas.length, 100);
  assert.equal(resultado.nuevas, 100);
  assert.deepEqual(deezer.llamadas, [{ genero: 0, limite: 100 }]);
});

test('Al iniciar: si el catálogo ya tiene canciones, no vuelve a descargar', async () => {
  const deezer = crearDeezerFalso({ top: rango(1, 10) });
  const servicio = crear(crearRepoFalso(rango(1, 3)), deezer);
  assert.equal(await servicio.cargarSiVacio(), null);
  assert.equal(deezer.llamadas.length, 0);
});

test('Obtener todo: suma el ranking de cada género, agrega las nuevas y actualiza las existentes', async () => {
  const repo = crearRepoFalso(rango(1, 3, 'Viejo'));
  const deezer = crearDeezerFalso({
    top: rango(1, 3, 'Nuevo'),
    generos: [{ id: 0, nombre: 'All' }, { id: 132, nombre: 'Pop' }],
    porGenero: { 132: rango(4, 6, 'Pop') },
  });
  const resultado = await crear(repo, deezer, { cargaCompleta: 100 }).cargar('completo');
  assert.equal(repo.filas.length, 6);
  assert.equal(resultado.nuevas, 3);
  assert.equal(resultado.actualizadas, 3);
  assert.equal(repo.filas.find((f) => f.deezerId === 1).titulo, 'Nuevo 1'); // se actualizó
  assert.deepEqual(deezer.llamadas.map((l) => l.genero), [0, 132]); // el género 0 no se repite
});

test('Reiniciar: reemplaza todo el contenido por las 100 canciones iniciales', async () => {
  const repo = crearRepoFalso(rango(901, 905, 'Vieja'));
  const deezer = crearDeezerFalso({ top: rango(1, 100) });
  await crear(repo, deezer).cargar('reiniciar');
  assert.equal(repo.filas.length, 100);
  assert.ok(!repo.filas.some((f) => f.deezerId >= 901));
});

test('Reiniciar con la API caída: no borra nada', async () => {
  const repo = crearRepoFalso(rango(1, 3));
  const servicio = crear(repo, crearDeezerFalso({ falla: true }));
  await assert.rejects(servicio.cargar('reiniciar'), /sin conexión/);
  assert.equal(repo.filas.length, 3);
});

test('Error de la API: la carga informa el error y no queda "activa"', async () => {
  const servicio = crear(crearRepoFalso(), crearDeezerFalso({ falla: true }));
  await assert.rejects(servicio.cargar('inicial'), /sin conexión/);
  const { carga } = await servicio.estado();
  assert.equal(carga.activa, false);
  assert.match(carga.error, /sin conexión/);
});

test('Una sola carga a la vez (409) y no se puede borrar mientras carga', async () => {
  let liberar;
  const espera = new Promise((resolver) => { liberar = resolver; });
  const deezer = { obtenerTop: async () => { await espera; return [cancion(1)]; }, listarGeneros: async () => [] };
  const servicio = crear(crearRepoFalso(), deezer);

  assert.equal(servicio.iniciarCarga('inicial').activa, true);
  assert.throws(() => servicio.iniciarCarga('completo'), (e) => e.status === 409);
  await assert.rejects(servicio.vaciar(), (e) => e.status === 409);

  liberar();
  await servicio.tarea;
  assert.equal((await servicio.estado()).carga.activa, false);
});

test('Modo inválido: responde 400', () => {
  const servicio = crear(crearRepoFalso(), crearDeezerFalso());
  assert.throws(() => servicio.iniciarCarga('todo'), (e) => e.status === 400);
});

test('Borrar: vacía el catálogo y dice cuántas canciones eliminó', async () => {
  const repo = crearRepoFalso(rango(1, 3));
  const resultado = await crear(repo, crearDeezerFalso()).vaciar();
  assert.equal(resultado.eliminadas, 3);
  assert.equal(repo.filas.length, 0);
});

test('Listar: usa el formato del Reto 1 (id de Deezer), pagina y busca', async () => {
  const servicio = crear(crearRepoFalso(rango(1, 5)), crearDeezerFalso());

  const pagina2 = await servicio.listar({ pagina: 2, limite: 2 });
  assert.equal(pagina2.total, 5);
  assert.equal(pagina2.paginas, 3);
  assert.equal(pagina2.canciones.length, 2);
  assert.equal(pagina2.canciones[0].id, 3);
  assert.ok('titulo' in pagina2.canciones[0] && 'preview' in pagina2.canciones[0]);

  const busqueda = await servicio.listar({ q: 'Artista 4' });
  assert.equal(busqueda.total, 1);
  assert.equal(busqueda.canciones[0].id, 4);
});

test('Catálogo: el admin edita título/notas y elimina una selección; valida IDs y campos', async () => {
  const repo = crearRepoFalso(rango(1, 2));
  const servicio = crear(repo, crearDeezerFalso());

  const editada = await servicio.actualizar(1, { titulo: '  Nueva versión ', notas: '  Mi nota ' });
  assert.equal(editada.titulo, 'Nueva versión');
  assert.equal(editada.notas, 'Mi nota');
  assert.equal(repo.filas[0].notas, 'Mi nota');

  await assert.rejects(servicio.actualizar(1, { titulo: ' ' }), (error) => error.status === 400);
  await assert.rejects(servicio.actualizar('no-id', { notas: 'x' }), (error) => error.status === 400);
  const borradas = await servicio.eliminarSeleccion([1, 2]);
  assert.equal(borradas.eliminadas, 2);
  assert.equal(repo.filas.length, 0);
  await assert.rejects(servicio.eliminar(999), (error) => error.status === 404);
});

test('Configuración (.env): valores por defecto y límites', () => {
  assert.deepEqual(leerConfig({}), { cargaInicial: 100, cargaCompleta: 5000, cargaAlIniciar: true });
  assert.equal(leerConfig({ CARGA_INICIAL: '50' }).cargaInicial, 50);
  assert.equal(leerConfig({ CARGA_INICIAL: '99999' }).cargaInicial, 100); // Deezer entrega hasta 100 por petición
  assert.equal(leerConfig({ CARGA_INICIAL: 'abc' }).cargaInicial, 100);
  assert.equal(leerConfig({ CARGA_AL_INICIAR: 'no' }).cargaAlIniciar, false);
});
