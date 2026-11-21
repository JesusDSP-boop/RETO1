# Ritmo: reproductor de música con la API de Deezer

Lenguaje de Programación III · Uniremington · Reto 1 (API REST + pruebas) y Reto 2 (persistencia y CRUD)

Integrantes: _(escribe aquí los nombres)_

Ritmo busca canciones en la API pública de Deezer, reproduce un fragmento de 30 segundos y guarda un catálogo de canciones en la base de datos SQLite y permite marcar favoritas.

## Ramas del repositorio

- **`main`**: entrega del Reto 1. API REST, 3 pruebas unitarias y página web. Sin base de datos.
- **`reto2`**: persistencia con TypeORM, CRUD de favoritos y envío a una API externa.

## Instalación y ejecución

Requisito: Node.js 20 o superior.

```bash
npm install
copy .env.example .env
npm start
```

Abre http://localhost:3000. Las pruebas se ejecutan con `npm test`.

Para la Parte 3 edita `.env` y completa `URL_API_EXTERNA` (ver más abajo). Si la dejas vacía, la aplicación funciona igual, solo que no envía notificaciones.

## Reto 1: API REST con Deezer

- **API elegida:** Deezer (https://developers.deezer.com/api). Consultar el catálogo público no requiere API key.
- **Por qué:** entrega canciones, artistas, carátulas y un enlace a un preview MP3 de 30 segundos, que es lo que necesita un reproductor.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/canciones?q=texto` | Busca canciones (400 si falta `q`) |
| GET | `/api/canciones/top` | Ranking global |

Si Deezer no responde, el servidor devuelve 502 con un JSON de error y la página lo muestra sin romperse.

Pruebas (`test/musica.test.js`): formato correcto, manejo de errores y mock de dependencia.

## Reto 2: persistencia y CRUD de favoritos

### Modelo y ORM

- **Entidad `Favorito`** (`src/entities/favorito.entity.js`): sus campos vienen del JSON del Reto 1, más un `id` autogenerado y las fechas `creadoEn` y `actualizadoEn`.
- **TypeORM** crea la tabla `favoritos` al arrancar (`synchronize: true`). No hay ninguna sentencia SQL escrita a mano.
- **Base de datos:** un archivo SQLite en `data/ritmo.sqlite`, que se crea solo. La carpeta `data/` no se sube a GitHub.

### Endpoints

| Método | Ruta | Qué hace | Respuestas |
|---|---|---|---|
| POST | `/api/favoritos` | Guarda una canción (JSON del Reto 1) | 201, 400, 409 |
| GET | `/api/favoritos` | Lista todos los favoritos | 200 |
| GET | `/api/favoritos/:id` | Busca uno por su id | 200, 400, 404 |
| PUT | `/api/favoritos/:id` | Edita el nombre y/o las notas | 200, 400, 404 |
| DELETE | `/api/favoritos/:id` | Elimina el registro y lo confirma | 200, 400, 404 |

Cuerpo del POST (`id`, `titulo` y `artista` son obligatorios):

```json
{
  "id": 3135556,
  "titulo": "Harder, Better, Faster, Stronger",
  "artista": "Daft Punk",
  "album": "Discovery",
  "portada": "https://...",
  "duracion": 224,
  "preview": "https://...",
  "enlace": "https://www.deezer.com/track/3135556"
}
```

Cuerpo del PUT (basta con un campo): `{ "titulo": "Mi versión", "notas": "Para entrenar" }`. El nombre no puede estar vacío (máximo 120 caracteres). Envía `"notas": null` para borrar las notas (máximo 500).

Los errores tienen siempre el mismo formato: `{ "error": "mensaje" }`.

### Parte 3: envío a una API externa

Cuando se guarda un favorito, el servidor envía por POST este JSON a `URL_API_EXTERNA`:

```json
{ "evento": "favorito_creado", "id": 1, "deezerId": 3135556, "titulo": "...", "artista": "Daft Punk" }
```

El envío ocurre después de guardar. Si la API externa falla, el favorito queda guardado igual y el error se registra en la consola.

Para probarlo, abre https://webhook.site, copia tu URL única y pégala en `URL_API_EXTERNA` dentro de `.env`. Reinicia el servidor y crea un favorito: la petición aparecerá en esa página.

### Flujo completo

```
Postman / página web
        │  POST /api/favoritos  (JSON)
        ▼
routes/favoritosRoutes.js
        ▼
controllers/favoritosController.js     ← traduce el resultado a códigos HTTP
        ▼
services/favoritosService.js           ← valida y evita duplicados
        │                    │
        │ 1. guarda          │ 2. notifica (Parte 3)
        ▼                    ▼
TypeORM → data/ritmo.sqlite   services/notificacionService.js
                                       │  POST JSON
                                       ▼
                              API externa (webhook.site)
```

## Catálogo en la base de datos (tabla `catalogo`)

TypeORM crea la tabla **`catalogo`** (entidad `Catalogo`), donde se guardan las canciones descargadas de la API de Deezer. La página trabaja sobre esta tabla: la búsqueda y la lista del apartado **Catálogo** salen de ella, no de la API. La tabla `favoritos` es independiente: borrar o reiniciar el catálogo nunca la modifica.

### Qué hace cada operación

| Operación | Qué hace |
|---|---|
| Carga inicial (automática) | Al iniciar el servidor, si `catalogo` está vacía, pide a la API **solo 100 canciones** (una petición al ranking global) y las guarda. Si la tabla ya tiene datos, no descarga nada. |
| Obtener todo | Pide a la API el ranking global y el de cada género (hasta `CARGA_COMPLETA`, 5000 por defecto). Agrega las canciones nuevas y **actualiza** las que ya estaban. |
| Borrar | Vacía la tabla `catalogo`. |
| Reiniciar | Descarga las 100 canciones iniciales y reemplaza todo el contenido de `catalogo`. Si la API falla, no borra nada. |

Deezer no permite descargar todo su catálogo (son millones de canciones), así que «todo» significa los rankings global y por género: unos pocos miles de canciones.

### Desde la terminal

```powershell
npm run catalogo:estado                 # cuántas canciones hay en la tabla catalogo
npm run catalogo:obtener                # obtener todo: ranking global + ranking de cada género
node scripts/catalogo.js obtener 1000   # igual, pero hasta 1000 canciones
npm run catalogo:borrar                 # borra todas las canciones del catálogo
npm run catalogo:reiniciar              # borra el catálogo y vuelve a cargar las 100 iniciales
```

Funcionan con el servidor encendido o apagado. Si está encendido, recarga la página para ver el cambio. Ninguno toca los favoritos.

Para reiniciar **toda** la base de datos (favoritos incluidos): detén el servidor y borra el archivo `data/ritmo.sqlite`. Se vuelve a crear al iniciar.

### Desde la página

La pestaña **Catálogo** tiene los botones **Obtener todo**, **Reiniciar** y **Borrar todo**, que hacen lo mismo que los comandos. Mientras descarga muestra una barra de avance, y «Reiniciar» y «Borrar todo» piden confirmación.

### Endpoints del catálogo

| Método | Ruta | Qué hace | Respuestas |
|---|---|---|---|
| GET | `/api/catalogo?q=&pagina=&limite=` | Lista paginada y búsqueda (formato del Reto 1) | 200 |
| GET | `/api/catalogo/estado` | Total guardado y avance de la carga | 200 |
| POST | `/api/catalogo/cargar` | Inicia una carga. Cuerpo: `{ "modo": "inicial" \| "completo" \| "reiniciar" }` | 202, 400, 409 |
| DELETE | `/api/catalogo` | Borra todo el catálogo | 200, 409 |

La carga corre en segundo plano (202) y su avance se consulta en `/estado`. Solo puede haber una carga a la vez (409).

## Interfaz web

La página tiene dos secciones:

- **Catálogo:** busca y lista las canciones de la tabla `catalogo`, con paginación. El corazón de cada canción la agrega a favoritas (POST) o la quita (DELETE).
- **Mis favoritas:** muestra las canciones guardadas (GET). Cada tarjeta permite reproducir, **editar** el nombre y las notas (PUT) y **eliminar** con confirmación (DELETE). El botón **Seleccionar** activa casillas para marcar varias canciones y eliminarlas de una vez.

El panel «Ver última respuesta JSON», al final de la página, muestra el método, la ruta, el código de estado y el JSON de cada petición. Sirve para mostrar el CRUD funcionando sin abrir Postman.

## Evidencias para la entrega

1. **Tablas generadas por el ORM:** abre `data/ritmo.sqlite` con DB Browser for SQLite y captura las tablas `favoritos` y `catalogo`. Opcional: cambia `logging: false` por `logging: true` en `src/database/dataSource.js` para ver en la consola el `CREATE TABLE` que genera TypeORM. Después vuelve a dejarlo en `false`.
2. **CRUD en Postman:** importa `postman/Reto2_Favoritos.postman_collection.json` y ejecuta las peticiones 1 a 5 en orden. Cada una tiene su captura.
3. **Envío a API externa:** captura la petición recibida en webhook.site y la línea `[API externa] Enviado correctamente` de la consola.

## Estructura

```
server.js                           arranca la base de datos y el servidor
.env.example                        plantilla de variables (copiar a .env)
src/app.js                          ensambla las piezas (único lugar con `new`)
src/database/dataSource.js          conexión SQLite con TypeORM
src/entities/favorito.entity.js     modelo Favorito (TypeORM crea la tabla)
src/entities/catalogo.entity.js     modelo Catalogo (tabla "catalogo")
src/database/catalogoRepositorio.js acceso a la tabla del catálogo
src/composicion.js                  construye el servicio del catálogo (server y terminal)
src/config.js                       lee CARGA_INICIAL, CARGA_COMPLETA y CARGA_AL_INICIAR
scripts/catalogo.js                 comandos de terminal: estado, obtener, borrar, reiniciar
src/routes/                         rutas del Reto 1 y del Reto 2
src/controllers/                    traduce peticiones a respuestas HTTP
src/services/                       reglas de negocio y llamadas externas
src/errores.js                      error con código HTTP
public/index.html                   página web: explorar, favoritos y CRUD
test/                               pruebas unitarias (Reto 1 y Reto 2)
postman/                            colecciones de Postman
```

## Inyección de dependencias

- `FavoritosController` recibe el servicio por el constructor.
- `FavoritosService` recibe el repositorio de TypeORM y el notificador.
- `NotificacionService` recibe la URL y el cliente HTTP.
- `CatalogoService` recibe el repositorio del catálogo, el servicio de Deezer y la configuración.
- Las piezas se construyen con `new` solo en `src/app.js` y `src/composicion.js`. Por eso las pruebas usan repositorios y servicios simulados y no necesitan base de datos ni internet.

## Notas

- Render despliega solo la rama `main`, así que la rama `reto2` no cambia la página publicada.
- En Render el disco es temporal: los favoritos se borran al reiniciar el servicio. Por eso esta versión está pensada para correr en local.
