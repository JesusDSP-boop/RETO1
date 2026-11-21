# Ritmo: reproductor de música con la API de Deezer

Lenguaje de Programación III · Uniremington · Retos 1, 2 y 3 integrados
Integrantes: _(escribe aquí los nombres)_

Ritmo consume la API pública de Deezer, guarda un catálogo de canciones en una base de datos SQLite con un ORM (TypeORM), permite marcar favoritas y reproducir un fragmento de 30 segundos de cada canción. El Reto 3 lo deja listo para el mundo real: logs, endpoint de salud, seguridad y pruebas de integración.

## Ramas

- `main`: Reto 1 (API REST con Deezer, inyección de dependencias y 3 pruebas unitarias).
- `reto2`: persistencia con TypeORM, CRUD de favoritas, catálogo y envío a una API externa.
- `reto3`: proyecto final, con los tres retos integrados.

## Instalación y ejecución

Requisito: Node.js 20 o superior.

```powershell
npm install
copy .env.example .env     # solo si todavía no tienes un archivo .env
```

Abre `.env` y completa **`API_KEY`** (obligatoria; sin ella el servidor no arranca). Genera una clave con:

```powershell
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

Luego inicia el servidor:

```powershell
npm start
```

Abre http://localhost:3000. Para agregar, editar o eliminar desde la página, pulsa **Clave de acceso** y pega tu `API_KEY`. Se guarda solo en esa pestaña del navegador.

### Variables de entorno (`.env`, no se sube a GitHub)

| Variable | Para qué sirve |
|---|---|
| `API_KEY` | Clave que exigen POST, PUT y DELETE (mínimo 16 caracteres). Obligatoria. |
| `ORIGENES_PERMITIDOS` | Lista blanca de orígenes para CORS, separados por comas. |
| `LOG_LEVEL` | `error`, `warn`, `info`, `http` o `debug`. Con `http` se registra cada petición. |
| `PORT` | Puerto del servidor (3000 por defecto). |
| `URL_API_EXTERNA` | URL que recibe el POST al guardar un favorito (por ejemplo webhook.site). |
| `CARGA_INICIAL`, `CARGA_COMPLETA`, `CARGA_AL_INICIAR` | Tamaño de las cargas del catálogo y si se hace la carga inicial al arrancar. |

## API elegida (Reto 1)

**Deezer** (https://developers.deezer.com/api): entrega canciones, artistas, carátulas y un preview MP3 de 30 segundos, es gratuita y consultar el catálogo no requiere API key. Es la fuente de los datos del proyecto. Limitación: los audios son previews, no canciones completas.

## Endpoints

Todas las respuestas, incluidos los errores, son JSON. «Clave» indica que la petición debe llevar el encabezado `x-api-key`.

| Método | Ruta | Clave | Qué hace | Respuestas |
|---|---|---|---|---|
| GET | `/health` | no | Estado del servicio: `{ status: "ok", timestamp }` | 200, 503 |
| GET | `/api/canciones?q=` | no | Busca en Deezer (en vivo) | 200, 400, 502 |
| GET | `/api/canciones/top` | no | Ranking global de Deezer (en vivo) | 200, 502 |
| GET | `/api/favoritos` | no | Lista las favoritas | 200 |
| GET | `/api/favoritos/:id` | no | Busca una favorita | 200, 400, 404 |
| POST | `/api/favoritos` | sí | Guarda una favorita | 201, 400, 401, 409, 413 |
| PUT | `/api/favoritos/:id` | sí | Edita el nombre y/o las notas | 200, 400, 401, 404 |
| DELETE | `/api/favoritos/:id` | sí | Elimina una favorita | 200, 400, 401, 404 |
| GET | `/api/catalogo?q=&pagina=&limite=` | no | Lista paginada del catálogo guardado | 200, 400 |
| GET | `/api/catalogo/estado` | no | Total guardado y avance de la carga | 200 |
| POST | `/api/catalogo/cargar` | sí | Inicia una carga: `{ "modo": "inicial" \| "completo" \| "reiniciar" }` | 202, 400, 401, 409 |
| DELETE | `/api/catalogo` | sí | Borra el catálogo | 200, 401, 409 |

Tras 10 claves incorrectas desde la misma IP en un minuto, la API responde 429.

## Arquitectura e inyección de dependencias

Cada petición recorre: **middleware** (log, cabeceras, CORS, JSON) → **ruta** → **autenticación** (si modifica datos) → **controlador** (HTTP) → **servicio** (reglas de negocio) → **repositorio / API externa**.

Ninguna pieza crea a la siguiente: la recibe por el constructor (inyección de dependencias). Los `new` están solo en `src/app.js` y `src/composicion.js`. Por eso las pruebas unitarias usan repositorios, servicios, cliente HTTP y loggers simulados, sin base de datos ni internet. La explicación evaluada está en `src/controllers/musicController.js`.

## Reto 2: ORM, CRUD y API externa

- **TypeORM + SQLite.** Los modelos `Favorito` y `Catalogo` (`src/entities`) generan las tablas `favoritos` y `catalogo` con `synchronize`. No hay SQL escrito a mano. La base es el archivo `data/ritmo.sqlite`.
- **CRUD de favoritas:** POST, GET (lista y por id), PUT y DELETE.
- **Envío a una API externa:** al guardar un favorito, el servidor envía un POST con su resumen a `URL_API_EXTERNA`. Si esa API falla, el favorito queda guardado igual.

### Catálogo: carga automática y comandos

La tabla `catalogo` guarda las canciones descargadas de Deezer, y la página busca sobre ella.

| Operación | Qué hace |
|---|---|
| Carga inicial (al iniciar) | Si `catalogo` está vacía, pide a la API solo 100 canciones. Si ya tiene datos, no descarga nada. |
| Obtener todo | Pide el ranking global y el de cada género (hasta `CARGA_COMPLETA`). Agrega las nuevas y actualiza las existentes. |
| Borrar | Vacía la tabla `catalogo`. |
| Reiniciar | Descarga las 100 iniciales y reemplaza todo el contenido. Si la API falla, no borra nada. |

```powershell
npm run catalogo:estado       # cuántas canciones hay
npm run catalogo:obtener      # obtener todo
npm run catalogo:borrar       # borrar todo
npm run catalogo:reiniciar    # borrar y volver a cargar las 100 iniciales
```

Los mismos botones están en la pestaña **Catálogo** de la página. Los favoritos nunca se tocan.

## Reto 3, Parte 1: Observabilidad

- **Logging con Winston** (`src/logger.js`): consola y archivos `logs/app.log` (todo) y `logs/error.log` (solo errores).
- **Una línea por petición** con método, ruta, código y tiempo:

  ```
  2026-11-21 10:15:30 [HTTP] GET /api/catalogo?pagina=1 200 12ms
  2026-11-21 10:15:31 [WARN] GET /no-existe 404 2ms
  ```

- **Errores con nivel ERROR y stacktrace completo** (por ejemplo, cuando Deezer no responde).
- **`GET /health`** responde `{ "status": "ok", "timestamp": "..." }` y comprueba que la base de datos responde (503 si no).

## Reto 3, Parte 2: Hardening

El informe con el antes y el después de cada vulnerabilidad está en [`docs/INFORME_HARDENING.md`](docs/INFORME_HARDENING.md).

| # | Vulnerabilidad | Riesgo | Medida |
|---|---|---|---|
| 1 | Endpoints que modifican datos sin autenticación | Medio | Middleware `requerirApiKey` (clave en `.env`, comparación segura y bloqueo tras intentos fallidos) |
| 2 | Sin validación de entrada suficiente | Alto | `src/validacion.js`: tipos, longitudes y URLs http/https; el cuerpo se limita a 10 KB |
| 3 | Errores técnicos expuestos | Bajo | Mensajes genéricos al cliente, detalle solo en los logs, sin `X-Powered-By` |

Además: CORS con lista blanca (nunca `*`), cabeceras de seguridad y credenciales solo en `.env`.

## Reto 3, Parte 3 y pruebas

```powershell
npm run test:reto1          # 3 pruebas unitarias del Reto 1
npm run test:reto2          # pruebas unitarias de favoritas y catálogo
npm run test:reto3          # pruebas unitarias de observabilidad y seguridad
npm run test:integracion    # 3 pruebas de integración (servidor y base de datos reales)
npm run test:unitarias      # todas las unitarias
npm test                    # todo
```

Las **pruebas de integración** (`test/integracion.test.js`) levantan el servidor Express real, hacen peticiones HTTP reales y usan una base SQLite real en memoria (no tocan `data/ritmo.sqlite`):

1. **Create completo:** POST responde 201 y el dato ya existe en la base de datos.
2. **Read con dato real:** se guarda un registro en la base de datos y GET `/:id` devuelve exactamente ese dato.
3. **Delete:** se crea un registro, se borra y un GET posterior responde 404.

La guía [`docs/GUIA_DEL_PROYECTO.md`](docs/GUIA_DEL_PROYECTO.md) explica cada prueba y cómo ejecutar cada prueba de error.

## Evidencias para la entrega

1. **Logs funcionando:** consola y `logs/app.log` mientras se ejecutan las peticiones de `postman/Reto3_Seguridad.postman_collection.json`.
2. **Informe de hardening:** `docs/INFORME_HARDENING.md` (antes y después de cada medida).
3. **Pruebas en verde:** captura de `npm run test:integracion` y de `npm test`.
4. **Postman:** colecciones de `postman/` (Reto 1, Reto 2 y Reto 3).
5. **Tablas del ORM:** `data/ritmo.sqlite` abierto en DB Browser (tablas `favoritos` y `catalogo`).

## Estructura

```
server.js                           arranca la base de datos, el logger y el servidor
src/app.js                          arma la cadena de middleware y las rutas
src/middleware/                     observabilidad.js, seguridad.js, errores.js
src/validacion.js                   validación de entrada
src/logger.js                       logging con Winston
src/config.js, src/composicion.js   configuración (.env) y construcción del catálogo
src/routes/, src/controllers/       rutas y controladores (música, favoritas, catálogo)
src/services/                       Deezer, favoritas, catálogo y API externa
src/database/, src/entities/        TypeORM: conexión, repositorio del catálogo y modelos
scripts/catalogo.js                 comandos de terminal del catálogo
public/index.html                   la página web
test/                               pruebas unitarias y de integración
postman/                            colecciones de los tres retos
docs/                               informe de hardening y guía del proyecto
```

## Notas

- Es una aplicación pensada para ejecutarse en local con SQLite. En un hosting como Render el disco es temporal: los datos se pierden al reiniciar el servicio.
- Para publicarla se recomienda usar HTTPS y una base de datos administrada.
