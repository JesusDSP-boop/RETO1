# Ritmo: reproductor de música con la API de Deezer

Lenguaje de Programación III · Uniremington · Retos 1, 2 y 3 integrados
 _(Jesus David Sanchez Pacheco)_

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

Abre http://localhost:3000. Cada persona debe crear una cuenta antes de iniciar sesión. Sin `API_KEY` se crea una cuenta de cliente; al proporcionar una `API_KEY` válida durante el registro, la cuenta queda guardada como administrador y conserva ese rol en los siguientes inicios de sesión.

### Variables de entorno (`.env`, no se sube a GitHub)

| Variable | Para qué sirve |
|---|---|
| `API_KEY` | Clave del administrador para modificar el catálogo y consultar auditoría (mínimo 16 caracteres). Obligatoria. |
| `ORIGENES_PERMITIDOS` | Lista blanca de orígenes para CORS, separados por comas. |
| `LOG_LEVEL` | `error`, `warn`, `info`, `http` o `debug`. Con `http` se registra cada petición. |
| `PORT` | Puerto del servidor (3000 por defecto). |
| `URL_API_EXTERNA` | URL que recibe el POST al guardar un favorito (por ejemplo webhook.site). |
| `CARGA_INICIAL`, `CARGA_COMPLETA`, `CARGA_AL_INICIAR` | Tamaño de las cargas del catálogo y si se hace la carga inicial al arrancar. |

## API elegida (Reto 1)

**Deezer** (https://developers.deezer.com/api): entrega canciones, artistas, carátulas y un preview MP3 de 30 segundos, es gratuita y consultar el catálogo no requiere API key. Es la fuente de los datos del proyecto. Limitación: los audios son previews, no canciones completas.

## Endpoints

Todas las respuestas, incluidos los errores, son JSON. «Acceso» indica si el endpoint requiere sesión o `API_KEY`.

| Método | Ruta | Acceso | Qué hace | Respuestas |
|---|---|---|---|---|
| GET | `/health` | no | Estado del servicio: `{ status: "ok", timestamp }` | 200, 503 |
| GET | `/api/canciones?q=` | no | Busca en Deezer (en vivo) | 200, 400, 502 |
| GET | `/api/canciones/top` | no | Ranking global de Deezer (en vivo) | 200, 502 |
| POST | `/api/auth/registro` | API_KEY opcional | Crea una cuenta de cliente o administrador según la clave enviada en `apiKey`; usuario de 3 a 40 letras o números | 201, 400, 401, 409 |
| POST | `/api/auth/login` | no | Inicia sesión en una cuenta existente; crea una cookie HttpOnly de 8 horas | 200, 401 |
| GET | `/api/auth/me` | sesión | Devuelve la cuenta activa | 200, 401 |
| POST | `/api/auth/logout` | sesión | Cierra la sesión activa | 200 |
| GET | `/api/auth/usuarios` | Sesión admin o API_KEY | Lista cuentas sin incluir hashes de contraseña | 200, 401 |
| DELETE | `/api/auth/usuarios/:id` | Sesión admin o API_KEY | Elimina una cuenta y sus favoritos, conserva auditoría | 200, 400, 401, 404 |
| DELETE | `/api/auth/cuenta` | sesión + contraseña | Elimina la cuenta activa y sus favoritos; conserva la auditoría | 200, 400, 401 |
| GET | `/api/favoritos` | sesión | Lista las favoritas | 200, 401 |
| GET | `/api/favoritos/:id` | sesión | Busca una favorita | 200, 400, 401, 404 |
| POST | `/api/favoritos` | sesión | Guarda una favorita | 201, 400, 401, 409, 413 |
| PUT | `/api/favoritos/:id` | sesión | Edita el nombre y/o las notas | 200, 400, 401, 404 |
| DELETE | `/api/favoritos/:id` | sesión | Elimina una favorita | 200, 400, 401, 404 |
| GET | `/api/catalogo?q=&pagina=&limite=` | no | Lista paginada del catálogo guardado | 200, 400 |
| GET | `/api/catalogo/estado` | no | Total guardado y avance de la carga | 200 |
| POST | `/api/catalogo/cargar` | Sesión admin o API_KEY | Inicia una carga: `{ "modo": "inicial" \| "completo" \| "reiniciar" }` | 202, 400, 401, 409 |
| PUT | `/api/catalogo/:deezerId` | Sesión admin o API_KEY | Edita el nombre y/o las notas | 200, 400, 401, 404 |
| DELETE | `/api/catalogo/:deezerId` | Sesión admin o API_KEY | Elimina una canción del catálogo | 200, 400, 401, 404 |
| DELETE | `/api/catalogo/seleccion` | Sesión admin o API_KEY | Elimina varias: `{ "ids": [1, 2] }` | 200, 400, 401 |
| DELETE | `/api/catalogo` | Sesión admin o API_KEY | Borra el catálogo completo | 200, 401, 409 |
| GET | `/api/auditoria?limite=200` | Sesión admin o API_KEY | Consulta el historial más reciente (máximo 500) | 200, 401 |

Cada cuenta de cliente solo puede consultar y modificar sus propios favoritos. Las cuentas administradoras acceden al catálogo y a la auditoría con su sesión; las integraciones de terminal también pueden seguir usando `x-api-key` o `Authorization: Bearer ...`. Tras 10 intentos fallidos desde la misma IP en un minuto (para la API key o el inicio de sesión), la API responde 429.

## Arquitectura e inyección de dependencias

Cada petición recorre: **middleware** (log, cabeceras, CORS, JSON) → **ruta** → **autenticación** (si modifica datos) → **controlador** (HTTP) → **servicio** (reglas de negocio) → **repositorio / API externa**.

Ninguna pieza crea a la siguiente: la recibe por el constructor (inyección de dependencias). Los `new` están solo en `src/app.js` y `src/composicion.js`. Por eso las pruebas unitarias usan repositorios, servicios, cliente HTTP y loggers simulados, sin base de datos ni internet. La explicación evaluada está en `src/controllers/musicController.js`.

## Reto 2: ORM, CRUD y API externa

- **TypeORM + SQLite.** Los modelos `Favorito`, `Catalogo`, `Usuario` y `Auditoria` (`src/entities`) generan las tablas con `synchronize`. Cada favorito queda asociado a su cuenta; la base es el archivo `data/ritmo.sqlite`.
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

### Acceso de clientes y auditoría

- Los clientes se registran desde **Acceso** y gestionan sus propios favoritos con su sesión. La contraseña se guarda con scrypt; la cookie de sesión es HttpOnly y dura 8 horas. Las sesiones se invalidan al reiniciar el servidor.
- Desde **Acceso → Eliminar mi cuenta** se puede borrar la cuenta activa después de confirmar la contraseña. También se eliminan sus favoritos, se invalidan sus sesiones y se conserva el historial de auditoría.
- Para administrar otras cuentas desde terminal, consulta `GET /api/auth/usuarios` y elimina una cuenta con `DELETE /api/auth/usuarios/:id`; ambas acciones requieren una sesión admin o `API_KEY`. La lista nunca contiene hashes ni contraseñas.
- La terminal permite la misma eliminación con `DELETE /api/auth/cuenta` usando la cookie de sesión y la contraseña de confirmación. El usuario acepta letras o números (sin espacios ni símbolos), de 3 a 40 caracteres; no es necesario mezclar letras y números.
- El formulario muestra errores de acceso y registro, como contraseña incorrecta o nombre de usuario ya registrado. Las contraseñas no se pueden consultar: se guardan como hashes `scrypt` no reversibles.
- Para registrar un administrador, se introduce `API_KEY` en el formulario de registro. El rol se guarda en `usuarios`, así que no hay que volver a introducir la clave en cada inicio de sesión. Una clave inválida no crea la cuenta.
- Los favoritos previos a esta separación se asignan al cliente existente más antiguo; si todavía no hay clientes, se asignan al primer cliente creado. No se eliminan canciones durante esa migración.
- El admin puede editar nombre/notas, eliminar canciones individuales o seleccionadas, obtener todo, borrar y reiniciar el catálogo. Las modificaciones de catálogo no tocan los favoritos.
- La tabla `auditoria` guarda el actor, rol, acción, entidad, id, detalles y fecha. Registra registro/inicio/cierre de sesión, cambios de favoritos, edición/eliminación del catálogo y cargas masivas. En el arranque automático, el actor queda como `sistema`; las acciones directas del script local se identifican como `admin (terminal)`.
- El historial se ve en **Catálogo → Ver historial** con la API key. El endpoint de auditoría también exige clave.

### Comandos de terminal para las acciones de la página (PowerShell)

Inicia sesión con una sesión web reutilizable y define la URL. Las llamadas de favoritos usan la cookie; las del catálogo usan `API_KEY`.

```powershell
$base = 'http://localhost:3000'
$sesion = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$env:API_KEY = 'PEGA_AQUI_TU_API_KEY'
```

Registro e inicio/cierre de sesión:

```powershell
$cuenta = @{ usuario = 'cliente1'; password = 'contraseña-segura-123' } | ConvertTo-Json
Invoke-RestMethod "$base/api/auth/registro" -Method Post -ContentType 'application/json' -Body $cuenta
Invoke-RestMethod "$base/api/auth/login" -Method Post -WebSession $sesion -ContentType 'application/json' -Body $cuenta
Invoke-RestMethod "$base/api/auth/me" -WebSession $sesion
Invoke-RestMethod "$base/api/auth/logout" -Method Post -WebSession $sesion
```

Para eliminar la cuenta activa desde la terminal, vuelve a proporcionar su contraseña:

```powershell
$confirmacion = @{ password = 'contraseña-segura-123' } | ConvertTo-Json
Invoke-RestMethod "$base/api/auth/cuenta" -Method Delete -WebSession $sesion -ContentType 'application/json' -Body $confirmacion
```

Para crear una cuenta de administrador, registra una cuenta nueva con la API key del servidor y después inicia sesión con sus credenciales. La sesión resultante autoriza las mismas operaciones de administrador desde la terminal:

```powershell
$cuentaAdmin = @{ usuario = 'admin1'; password = 'contraseña-segura-123'; apiKey = $env:API_KEY } | ConvertTo-Json
Invoke-RestMethod "$base/api/auth/registro" -Method Post -ContentType 'application/json' -Body $cuentaAdmin
$credencialesAdmin = @{ usuario = 'admin1'; password = 'contraseña-segura-123' } | ConvertTo-Json
Invoke-RestMethod "$base/api/auth/login" -Method Post -WebSession $sesion -ContentType 'application/json' -Body $credencialesAdmin
```

Acciones de cliente en favoritos:

```powershell
Invoke-RestMethod "$base/api/canciones?q=Daft%20Punk"
Invoke-RestMethod "$base/api/canciones/top"
Invoke-RestMethod "$base/api/favoritos" -WebSession $sesion
$cancion = @{ id = 3135556; titulo = 'Cancion'; artista = 'Artista'; album = 'Album'; portada = 'https://ejemplo.com/portada.jpg'; duracion = 200; preview = 'https://ejemplo.com/preview.mp3'; enlace = 'https://www.deezer.com/track/3135556' } | ConvertTo-Json
$guardada = Invoke-RestMethod "$base/api/favoritos" -Method Post -WebSession $sesion -ContentType 'application/json' -Body $cancion
$idFavorito = $guardada.id
$edicion = @{ titulo = 'Nombre editado'; notas = 'Mi nota' } | ConvertTo-Json
Invoke-RestMethod "$base/api/favoritos/$idFavorito" -Method Put -WebSession $sesion -ContentType 'application/json' -Body $edicion
Invoke-RestMethod "$base/api/favoritos/$idFavorito" -Method Delete -WebSession $sesion
$idsFavoritos = @(2, 3)
foreach ($idFavorito in $idsFavoritos) { Invoke-RestMethod "$base/api/favoritos/$idFavorito" -Method Delete -WebSession $sesion }
```

Acciones de administrador en el catálogo:

```powershell
$headersAdmin = @{ 'x-api-key' = $env:API_KEY }
$cuentas = Invoke-RestMethod "$base/api/auth/usuarios" -Headers $headersAdmin
$cuentas | Format-Table id, nombre, rol
$idCuenta = [int](Read-Host 'ID de la cuenta que deseas eliminar')
Invoke-RestMethod "$base/api/auth/usuarios/$idCuenta" -Method Delete -Headers $headersAdmin
Invoke-RestMethod "$base/api/catalogo?q=daft&pagina=1&limite=24"
Invoke-RestMethod "$base/api/catalogo/estado"
Invoke-RestMethod "$base/api/catalogo/cargar" -Method Post -Headers $headersAdmin -ContentType 'application/json' -Body '{"modo":"completo"}'
$cambiosCatalogo = @{ titulo = 'Nombre editado'; notas = 'Nota del admin' } | ConvertTo-Json
Invoke-RestMethod "$base/api/catalogo/3135556" -Method Put -Headers $headersAdmin -ContentType 'application/json' -Body $cambiosCatalogo
Invoke-RestMethod "$base/api/catalogo/3135556" -Method Delete -Headers $headersAdmin
$seleccion = @{ ids = @(3135556, 1234567) } | ConvertTo-Json
Invoke-RestMethod "$base/api/catalogo/seleccion" -Method Delete -Headers $headersAdmin -ContentType 'application/json' -Body $seleccion
Invoke-RestMethod "$base/api/catalogo" -Method Delete -Headers $headersAdmin
Invoke-RestMethod "$base/api/catalogo/cargar" -Method Post -Headers $headersAdmin -ContentType 'application/json' -Body '{"modo":"reiniciar"}'
Invoke-RestMethod "$base/api/auditoria?limite=200" -Headers $headersAdmin
```

Para borrar una selección de favoritos desde la terminal, obtén la lista con el primer comando y elimina cada `id` con el comando `DELETE` mostrado. Los comandos locales `npm run catalogo:obtener`, `npm run catalogo:borrar` y `npm run catalogo:reiniciar` también registran sus cambios en la auditoría; `npm run catalogo:estado` solo consulta.

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
| 1 | Endpoints que modifican datos sin autenticación | Medio | Sesión cliente para favoritos; API key en `.env` para cambios del catálogo y auditoría |
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
src/services/auditoriaService.js    registro y consulta del historial
scripts/catalogo.js                 comandos de terminal del catálogo
public/index.html                   la página web
test/                               pruebas unitarias y de integración
postman/                            colecciones de los tres retos
docs/                               informe de hardening y guía del proyecto
```

## Notas

- Es una aplicación pensada para ejecutarse en local con SQLite. En un hosting como Render el disco es temporal: los datos se pierden al reiniciar el servicio.
- Para publicarla se recomienda usar HTTPS y una base de datos administrada.
