# Informe de hardening (Reto 3, Parte 2)

Se revisó el proyecto del Reto 2 y se encontraron **tres vulnerabilidades reales**, todas corregidas en la rama `reto3`. Para cada una: riesgo, código antes y después, evidencia y una línea que explica el riesgo.

| # | Vulnerabilidad | Riesgo | Estado |
|---|---|---|---|
| 1 | Endpoints que modifican datos sin autenticación | Medio | Corregida |
| 2 | Sin validación de entrada suficiente | Alto | Corregida |
| 3 | Errores técnicos expuestos al cliente | Bajo | Corregida |

Revisados y sin hallazgo: credenciales en el código (no había) y CORS abierto (no estaba configurado). Aun así se dejaron medidas preventivas, descritas al final.

## 1. Endpoints sin autenticación (riesgo medio)

**Riesgo:** cualquier persona con acceso a la URL podía crear, editar o borrar favoritas y vaciar el catálogo sin identificarse.

**Antes** (`src/app.js`, rama `reto2`):

```js
app.use('/api/favoritos', crearRutasFavoritos(favoritos));
app.use('/api/catalogo', crearRutasCatalogo(catalogo));
```

**Después** (`src/app.js` y `src/middleware/seguridad.js`, rama `reto3`):

```js
const exigirClave = requerirApiKey({ apiKey: config.apiKey, logger });
app.use('/api/favoritos', exigirClave, crearRutasFavoritos(favoritos));
app.use('/api/catalogo', exigirClave, crearRutasCatalogo(catalogo));
```

La clave (`API_KEY`) está en `.env`, se compara con `crypto.timingSafeEqual` y, tras 10 claves incorrectas desde la misma IP, la API responde 429.

**Evidencia:** `DELETE /api/catalogo` sin clave. Antes: **200** y el catálogo quedaba vacío. Después: **401** `{ "error": "Autenticación requerida..." }`. Con la clave en `x-api-key`, vuelve a funcionar.

## 2. Sin validación de entrada suficiente (riesgo alto)

**Riesgo:** el servidor solo revisaba `id`, `titulo` y `artista`. Campos como `enlace`, `portada` y `preview` aceptaban cualquier texto, incluido `javascript:alert(...)`, que se guardaba y la página mostraba como enlace (XSS almacenado). Tampoco había límite de longitud.

**Antes** (`src/services/favoritosService.js`, rama `reto2`):

```js
function validarCancion(datos) {
  const faltan = [];
  if (!Number.isInteger(datos?.id) || datos.id <= 0) faltan.push('id (número de Deezer)');
  if (typeof datos?.titulo !== 'string' || !datos.titulo.trim()) faltan.push('titulo');
  if (typeof datos?.artista !== 'string' || !datos.artista.trim()) faltan.push('artista');
  ...
}
// enlace: textoOpcional(datos.enlace)   <- cualquier texto
```

**Después** (`src/validacion.js`, rama `reto3`):

```js
// Solo http y https. Esto bloquea "javascript:..." y "data:..." en enlaces, portadas y audios.
function esUrlHttp(valor) {
  try {
    const url = new URL(valor);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch { return false; }
}
// + límites: titulo/artista/album 200 caracteres, URLs 500, duración 0-86400, búsqueda 100,
//   cuerpo de la petición 10 KB (express.json({ limit: '10kb' }))
```

La página también ignora cualquier enlace que no sea http(s).

**Evidencia:** `POST /api/favoritos` con `"enlace": "javascript:alert(document.domain)"`. Antes: **201**. Después: **400** `Campos opcionales inválidos: enlace (URL http o https...)`. Lo mismo con un título de más de 200 caracteres, un `id` que no es número y un JSON mal escrito.

## 3. Errores técnicos expuestos (riesgo bajo)

**Riesgo:** cuando Deezer fallaba, la respuesta incluía el mensaje interno (`getaddrinfo ENOTFOUND api.deezer.com`), que revela nombres de servidores y detalles de red. Además, el encabezado `X-Powered-By: Express` anunciaba el framework, y las rutas inexistentes devolvían la página HTML por defecto de Express.

**Antes** (`src/controllers/musicController.js`, rama `reto2`):

```js
return res.status(502).json({
  error: 'No se pudo obtener datos de la API de música',
  detalle: error.message,   // <- dato interno enviado al cliente
});
```

**Después** (rama `reto3`):

```js
this.logger.error(`Fallo al consultar la API de Deezer: ${error.stack}`); // el detalle queda SOLO en los logs
return res.status(502).json({ error: 'No se pudo obtener datos de la API de música' });
// src/app.js:  app.disable('x-powered-by');
// src/middleware/errores.js: 404 en JSON y 500 genérico; el stacktrace va al log con nivel ERROR
```

**Evidencia:** con la dirección de Deezer rota, `GET /api/canciones?q=queen`. Antes: la respuesta traía `detalle` con el error de red y el encabezado `X-Powered-By`. Después: solo el mensaje genérico, sin ese encabezado, y el detalle completo con stacktrace aparece en `logs/error.log`.

## Medidas adicionales

- **CORS con lista blanca** (`politicaCors`): solo los orígenes de `ORIGENES_PERMITIDOS` reciben permiso. Nunca se responde `*`. No estaba abierto (el servidor no configuraba CORS), pero ahora la política es explícita y se puede demostrar.
- **Cabeceras de seguridad:** `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` y una CSP que impide ser embebido en iframes.
- **Credenciales fuera del código:** no hay claves en el código. `API_KEY` se lee de `.env`, que está en `.gitignore`, y el servidor no arranca sin ella. Verificación: `git grep -n -i -E "password|secret|api_key|token" -- src server.js` solo muestra nombres de variables, ningún valor.

## Cómo obtener las capturas de «antes» y «después»

1. **Código:** `git diff reto2 reto3 -- src/app.js` (y `src/validacion.js`, `src/controllers/musicController.js`) muestra las líneas antes y después.
2. **Comportamiento, después:** con la rama `reto3` y `npm start`, ejecuta las peticiones 03, 07 y 20 de `postman/Reto3_Seguridad.postman_collection.json`.
3. **Comportamiento, antes:** `git checkout reto2`, `npm start`, y repite las mismas peticiones sin clave (en esa rama responden 201, 201 y 200). Al terminar, `git checkout reto3`.
