# Guía del proyecto Ritmo: Retos 1, 2 y 3

Esta guía explica el proyecto completo y cómo ejecutar, una por una, todas las pruebas y los casos de error. Ábrela con la vista previa de VS Code (`Ctrl + Shift + V`).

## 1. Qué hace el proyecto

Ritmo es una página web de música con un Back End propio en Node.js. El servidor consulta la API pública de Deezer, guarda las canciones en una base de datos SQLite mediante un ORM (TypeORM), permite marcar favoritas y reproducir un fragmento de 30 segundos. Cada reto agregó una capa:

| Reto | Qué se agregó | Idea clave |
|---|---|---|
| 1 | Consumir una API y exponerla con endpoints propios | Servicio + controlador + rutas, inyección de dependencias, 3 pruebas unitarias, sin base de datos |
| 2 | Guardar datos con un ORM y hacer CRUD | Entidades `Favorito` y `Catalogo`, 4 operaciones CRUD, envío a una API externa |
| 3 | Dejarlo listo para el mundo real | Logs, `/health`, seguridad (3 vulnerabilidades corregidas) y pruebas de integración |

## 2. El recorrido de una petición

```
Navegador / Postman
   │  POST /api/favoritos  + encabezado x-api-key
   ▼
Express (src/app.js)
   1. registrarPeticiones   -> escribe la línea de log cuando la respuesta termina
   2. cabecerasSeguridad    -> nosniff, anti-iframe
   3. politicaCors          -> lista blanca de orígenes
   4. express.json (10 KB)  -> lee el cuerpo
   5. requerirApiKey        -> 401 si falta la clave (solo POST, PUT y DELETE)
   6. ruta -> controlador   -> traduce HTTP a llamadas y devuelve JSON con su código
   7. servicio              -> valida (src/validacion.js) y aplica las reglas
   8. repositorio TypeORM   -> SQLite (data/ritmo.sqlite)
   9. notificador           -> POST a la API externa (si hay URL_API_EXTERNA)
   ▲
   └─ si algo falla: manejadorErrores -> log ERROR con stacktrace + mensaje genérico al cliente
```

Cuando el servidor necesita datos de Deezer (carga del catálogo o los endpoints en vivo), `DeezerService` hace un `axios.get` a `https://api.deezer.com`.

## 3. Mapa de archivos

| Archivo | Qué hace |
|---|---|
| `server.js` | Lee `.env`, exige `API_KEY`, abre la base de datos, arma la app, inicia el servidor, carga las 100 canciones si el catálogo está vacío y cierra ordenadamente con Ctrl+C |
| `src/app.js` | Construye controladores y servicios (`new`) y define el orden de la cadena de middleware |
| `src/composicion.js` | Construye el servicio del catálogo; lo comparten el servidor y la terminal |
| `src/config.js` | Lee `.env`: cargas del catálogo, `API_KEY`, orígenes permitidos y nivel de logs |
| `src/logger.js` | Winston: consola, `logs/app.log` y `logs/error.log` |
| `src/validacion.js` | Reglas de validación de entrada (tipos, longitudes, URLs) |
| `src/errores.js` | `ErrorApi`: error con código HTTP |
| `src/middleware/observabilidad.js` | Log de cada petición y endpoint `/health` |
| `src/middleware/seguridad.js` | Cabeceras de seguridad, CORS y autenticación por clave |
| `src/middleware/errores.js` | 404 en JSON y manejador de errores (500 genérico) |
| `src/routes/*.js` | Qué ruta llama a qué método del controlador |
| `src/controllers/*.js` | Reciben la petición y responden. Usan el servicio que les inyectan |
| `src/services/deezerService.js` | Único archivo que habla con Deezer |
| `src/services/favoritosService.js` | Reglas del CRUD de favoritas y aviso a la API externa |
| `src/services/catalogoService.js` | Cargas del catálogo (inicial, completo, reiniciar), listado y borrado |
| `src/services/notificacionService.js` | POST a la API externa; nunca rompe el guardado |
| `src/database/dataSource.js` | Conexión SQLite con TypeORM y creación de tablas (`synchronize`) |
| `src/database/catalogoRepositorio.js` | Inserta, actualiza, busca y vacía la tabla `catalogo` |
| `src/entities/*.js` | Modelos: de ahí TypeORM genera las tablas sin SQL manual |
| `scripts/catalogo.js` | Comandos de terminal del catálogo |
| `public/index.html` | La página: catálogo, favoritas, clave de acceso y panel JSON |
| `test/*.test.js` | Pruebas unitarias y de integración |
| `postman/*.json` | Una colección por reto |

## 4. Los tres retos en detalle

### Reto 1: consumir la API

- **Dónde se llama a Deezer:** `deezerService.js`, método `_pedir`: `this.http.get(urlBase + ruta, { params, timeout: 8000 })`.
- **Endpoints:** `GET /api/canciones?q=` y `GET /api/canciones/top`. Devuelven un array JSON simplificado (`id`, `titulo`, `artista`, `album`, `portada`, `duracion`, `preview`, `enlace`).
- **Sin API key:** el catálogo público de Deezer no la pide.
- **Inyección de dependencias:** `MusicController` recibe el servicio por el constructor y `DeezerService` recibe el cliente HTTP. Sirve para desacoplar, para probar con simulaciones y para cambiar de API sin tocar el controlador. El comentario evaluado está en `musicController.js`.
- **Sin tablas:** en el Reto 1 todo era JSON puro.

### Reto 2: ORM y CRUD

- **ORM:** TypeORM lee `favorito.entity.js` y `catalogo.entity.js` y crea las tablas al arrancar. No hay `CREATE TABLE`.
- **CRUD de favoritas:** POST (201, 400, 409), GET lista y por id (404), PUT (nombre y notas) y DELETE (confirma).
- **API externa:** al guardar un favorito se envía un POST a `URL_API_EXTERNA`, después de guardar. Si falla, el favorito queda guardado y el error queda en el log.
- **Catálogo:** al iniciar, si la tabla está vacía, se piden 100 canciones. «Obtener todo» suma el ranking de cada género y actualiza las que ya estaban. «Borrar» vacía la tabla. «Reiniciar» la reemplaza por las 100 iniciales (si Deezer falla, no borra nada).
- **Favoritas y catálogo son tablas independientes:** borrar el catálogo no toca las favoritas.

### Reto 3: mundo real

- **Observabilidad:** una línea de log por petición (método, ruta, código, tiempo), errores con nivel ERROR y stacktrace en `logs/error.log`, y `GET /health` que también comprueba la base de datos.
- **Hardening:** autenticación por clave, validación de entrada, errores genéricos (más CORS con lista blanca y cabeceras). El detalle está en `docs/INFORME_HARDENING.md`.
- **Pruebas de integración:** servidor y base de datos reales, sin simulaciones en el camino.

## 5. Decisiones y cómo defenderlas

- **¿Por qué inyección de dependencias?** Para poder probar cada pieza aislada (con un repositorio, un servicio o un logger falsos) y cambiar una pieza sin tocar las demás.
- **¿Por qué SQLite?** No requiere instalar un servidor de base de datos y alcanza para el curso. En producción se usaría PostgreSQL u otra base administrada.
- **¿Por qué `synchronize: true`?** Es lo más simple para el curso. En producción se usan migraciones, porque `synchronize` puede alterar tablas.
- **¿Por qué una clave de API y no usuarios con JWT?** El proyecto no tiene usuarios. La clave en un encabezado es el middleware de autenticación más simple y cumple lo que pide el reto. Un siguiente paso sería un login con tokens.
- **¿Por qué Winston?** Permite niveles, formatos y varios destinos (consola y archivos) con una sola configuración.
- **¿Diferencia entre prueba unitaria y de integración?** La unitaria verifica una pieza aislada con simulaciones. La de integración verifica el sistema completo: HTTP real, middleware, controlador, servicio, ORM y base de datos.
- **Limitaciones reales:** los audios son previews de 30 s; «todo» el catálogo son los rankings por género (unos pocos miles de canciones); la clave se guarda en el navegador de quien la escribe; en un hosting con disco temporal los datos no son permanentes.

## 6. Cómo ejecutar cada prueba (una por una)

Primero: `npm install` y `.env` con `API_KEY`. Cada comando se ejecuta en la carpeta del proyecto. En todos se ve una línea por prueba y el resumen `tests / pass / fail`.

| Comando | Qué ejecuta |
|---|---|
| `npm run test:reto1` | Las 3 pruebas del Reto 1 |
| `npm run test:reto2` | Pruebas de favoritas (11) y de catálogo (11) |
| `npm run test:reto3` | Pruebas de observabilidad (6) y de seguridad (9) |
| `npm run test:integracion` | Las 3 pruebas de integración |
| `npm run test:unitarias` | Todas las unitarias |
| `npm test` | Todo (unitarias e integración) |
| `node --test --test-name-pattern="Manejo de errores" test/musica.test.js` | Una sola prueba, por parte de su nombre |

### Reto 1 (`test/musica.test.js`)

1. **Formato correcto:** el JSON es un array y cada canción tiene `id`, `titulo`, `artista` y `preview`.
2. **Manejo de errores:** si la API falla (no responde o devuelve un error), el controlador responde 502 con un mensaje claro y sin detalles técnicos.
3. **Mock de dependencia:** el controlador funciona con un servicio simulado.

### Reto 2 (`test/favoritos.test.js` y `test/catalogo.test.js`)

- **Favoritas:** crear (201, avisa a la API externa), validar obligatorios (400), duplicado (409), API externa caída (el favorito se guarda igual), leer (lista, por id, 404), actualizar notas, editar el nombre y validar que no quede vacío, eliminar, y tres pruebas del notificador (sin URL, con fallo, envío correcto).
- **Catálogo:** la carga inicial pide solo 100 canciones en una petición, no vuelve a descargar si ya hay datos, «obtener todo» agrega y actualiza, «reiniciar» reemplaza todo, «reiniciar» con la API caída no borra nada, un error de la API no deja la carga activa, solo una carga a la vez (409), modo inválido (400), borrar, listar con paginación y búsqueda, y lectura de `.env`.

### Reto 3 (`test/observabilidad.test.js`, `test/seguridad.test.js`)

- **Observabilidad:** el log trae método, ruta, código y tiempo; el nivel depende del resultado (http, warn, error); un fallo inesperado se registra con ERROR y stacktrace pero el cliente solo ve un mensaje genérico; JSON inválido (400), cuerpo grande (413) y ruta inexistente (404); `/health` en estado normal y con la base de datos caída (503); y que un fallo de Deezer no filtra detalles.
- **Seguridad:** 401 sin clave o con clave incorrecta; la clave correcta (x-api-key o Bearer) pasa y GET es público; bloqueo 429 tras intentos fallidos y liberación después; el servidor no se crea sin `API_KEY`; validación de entrada con 10 casos peligrosos o mal formados; búsqueda de más de 100 caracteres (400); CORS con lista blanca; cabeceras de seguridad; lectura de la configuración de seguridad.

### Integración (`test/integracion.test.js`)

1. **Create completo:** POST con clave responde 201 y el dato existe en la base de datos.
2. **Read con dato real:** se guarda un favorito directamente en la base de datos y `GET /api/favoritos/:id` devuelve exactamente ese dato.
3. **Delete:** se crea, se borra con DELETE y un GET posterior responde 404; además la base de datos ya no lo tiene.

## 7. Pruebas de error en vivo, una por una

Con el servidor encendido (`npm start`), abre `postman/Reto3_Seguridad.postman_collection.json`, pega tu clave en la variable `apiKey` de la colección y ejecuta las peticiones en orden. Después de cada una, muestra la consola o `Get-Content logs\app.log -Tail 5`.

| Petición de Postman | Qué demuestra | Resultado esperado |
|---|---|---|
| 01 GET /health | Endpoint de salud | 200 `{ status: "ok", timestamp }` |
| 02 GET ruta inexistente | 404 sin datos técnicos | 404 `{ error: "Ruta no encontrada" }` |
| 03 POST sin clave | Autenticación | 401 |
| 04 POST con clave incorrecta | Autenticación | 401 |
| 05 POST con clave correcta | Crear | 201 con el favorito |
| 06 POST repetido | Duplicado | 409 |
| 07 POST con enlace `javascript:` | Validación (XSS) | 400 |
| 08 POST con datos inválidos | Validación | 400 |
| 09 POST con título de 201 caracteres | Límite de longitud | 400 |
| 10 POST con JSON mal escrito | Cuerpo inválido | 400 |
| 11 GET con id `abc` | Validación del id | 400 |
| 12 GET con id inexistente | No existe | 404 |
| 13 PUT sin clave | Autenticación | 401 |
| 14 PUT con clave | Editar nombre y notas | 200 |
| 15 DELETE sin clave | Autenticación | 401 |
| 16 DELETE con clave | Eliminar | 200 |
| 17 GET del eliminado | Ya no existe | 404 |
| 18 GET /api/canciones sin `q` | Validación | 400 |
| 19 GET catálogo | Lectura pública | 200 |
| 20 DELETE catálogo sin clave | Protege lo destructivo | 401 |
| 21 CORS origen permitido | Lista blanca | Cabecera `Access-Control-Allow-Origin` |
| 22 CORS origen ajeno | Lista blanca | Sin esa cabecera |
| 23 CORS preflight ajeno | Lista blanca | 403 |

Casos que se hacen fuera de Postman:

1. **Deezer caído (502 y ERROR en el log).** En `src/services/deezerService.js` cambia `this.urlBase = 'https://api.deezer.com';` por `'https://api.dee!zer.com'`, reinicia el servidor y llama a `GET /api/canciones?q=queen`. Respuesta: 502 con un mensaje genérico, sin `detalle`. En la consola y en `logs/error.log` aparece `[ERROR] Fallo al consultar la API de Deezer: Error: getaddrinfo ENOTFOUND ...` con el stacktrace, y después la línea de la petición con 502. Al terminar: `git restore src/services/deezerService.js` y reinicia.
2. **Sin `API_KEY` el servidor no arranca.** Quita o vacía `API_KEY` en `.env` y ejecuta `npm start`: muestra «Falta API_KEY en el archivo .env» y termina. Devuélvela al terminar.
3. **Fuerza bruta (429).** Con el servidor encendido ejecuta en PowerShell: `1..11 | % { curl.exe -s -o NUL -w "%{http_code}`n" -X POST http://localhost:3000/api/favoritos -H "x-api-key: mala" }`. Resultado: diez 401 y un 429. Espera un minuto o reinicia el servidor para liberar la IP.
4. **Cuerpo demasiado grande (413).** `'{"id":1,"titulo":"' + ('x' * 11000) + '","artista":"a"}' | Set-Content grande.json` y luego `curl.exe -i -X POST http://localhost:3000/api/favoritos -H "x-api-key: TU_CLAVE" -H "Content-Type: application/json" --data-binary "@grande.json"`. Resultado: 413. Borra `grande.json` después.
5. **Sin `X-Powered-By` y con cabeceras de seguridad.** `curl.exe -i http://localhost:3000/health`: no aparece `X-Powered-By` y sí `X-Content-Type-Options`, `X-Frame-Options` y `Content-Security-Policy`.
6. **Carga concurrente (409).** En la pestaña Catálogo, pulsa «Obtener todo» y, mientras descarga, intenta «Reiniciar» o «Borrar todo»: la API responde 409 y la página lo avisa.
7. **Probar que una prueba falla.** Cambia una aserción en `test/musica.test.js` (por ejemplo `assert.equal(res.codigo, 502)` por `200`), ejecuta `npm run test:reto1` y verás la prueba en rojo. Restaura con `git restore test/musica.test.js`. Si olvidas restaurar, pierdes puntos.

## 8. Orden sugerido para presentar

1. **Visión general (1 minuto):** el diagrama de la sección 2.
2. **Reto 1:** `npm run test:reto1` (3 en verde) y la petición 18 o `GET /api/canciones?q=queen` en Postman.
3. **Reto 2:** `npm run test:reto2`; CRUD desde la página (con la clave); el webhook recibiendo el POST; la tabla `favoritos` y `catalogo` en DB Browser; los botones del catálogo y `npm run catalogo:estado`.
4. **Reto 3, observabilidad:** `GET /health` y las peticiones de Postman con la consola visible; el log de errores (caso 1 de la sección 7).
5. **Reto 3, seguridad:** peticiones 03, 07, 08, 20 y 21–23; el informe antes y después.
6. **Pruebas de integración:** `npm run test:integracion` y, para cerrar, `npm test`.

## 9. Lista de verificación antes de presentar

- [ ] `npm install` ejecutado y `.env` con `API_KEY`.
- [ ] `npm test` en verde (todas las pruebas).
- [ ] `npm start` arranca y se ve «Servidor listo» y la carga inicial.
- [ ] La página abre, el botón «Clave de acceso» dice «lista» y puedes agregar una favorita.
- [ ] La variable `apiKey` de Postman tiene tu clave.
- [ ] `deezerService.js` está restaurado (sin la dirección rota).
- [ ] Tienes internet (Deezer es una API externa).

