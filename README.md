# Ritmo: reproductor de música con la API de Deezer

Reto 1 – API REST + Pruebas · Lenguaje de Programación III · Uniremington
Integrantes: _(escribe aquí los nombres)_

Ritmo es una página web que busca canciones y reproduce un fragmento de 30 segundos. Los datos vienen de una API pública de internet, pasan por nuestro Back End (Node.js + Express) y llegan a la página en formato JSON. No usa base de datos.

## API elegida y por qué

**Deezer** (`https://api.deezer.com`).

- **Es relevante para el proyecto:** entrega canciones, artistas, álbumes, carátulas y un enlace a un preview MP3 de 30 segundos, justo lo que necesita un reproductor.
- **Es gratuita y no pide llave de acceso:** no hay que crear cuentas ni guardar credenciales, así que cualquiera puede ejecutar el proyecto.
- **Responde JSON**, como pide el reto, y se puede probar en el navegador: https://api.deezer.com/search?q=queen
- **Limitación conocida:** son previews de 30 segundos, no canciones completas.

## Endpoints

Ambos usan `GET` (solo leen datos) y responden JSON.

- `GET /api/canciones?q=daft punk`: busca canciones. Si falta `q`, responde 400.
- `GET /api/canciones/top`: ranking global actual de Deezer.

Ejemplo de respuesta (un array):

```json
[
  {
    "id": 3135556,
    "titulo": "Harder, Better, Faster, Stronger",
    "artista": "Daft Punk",
    "album": "Discovery",
    "portada": "https://...",
    "duracion": 224,
    "preview": "https://...mp3",
    "enlace": "https://www.deezer.com/track/3135556"
  }
]
```

Si Deezer falla o no responde, el endpoint devuelve 502 con un mensaje claro:

```json
{ "error": "No se pudo obtener datos de la API de música", "detalle": "ECONNREFUSED" }
```

## Estructura del proyecto

```
server.js                          arranca el servidor
src/app.js                         ensambla las piezas (único lugar con `new`)
src/routes/musicRoutes.js          define los endpoints
src/controllers/musicController.js recibe la petición y responde JSON
src/services/deezerService.js      hace la petición a la API de Deezer
public/index.html                  la página web (buscador + reproductor)
test/musica.test.js                las 3 pruebas unitarias
postman/                           colección para probar los endpoints
```

## Inyección de dependencias

`MusicController` no crea su servicio: lo recibe por el constructor. A su vez, `DeezerService` recibe el cliente HTTP (por defecto `axios`). Solo `src/app.js` construye los objetos y los conecta.

Se aplicó para desacoplar el código, para poder usar servicios simulados (mocks) en las pruebas sin depender de internet, y para cambiar de API sin tocar el controlador. El comentario explicativo está en `src/controllers/musicController.js`.

## Sin base de datos

El proyecto no crea bases de datos ni tablas. Todo se obtiene de la API y viaja como JSON.

## Cómo ejecutar

Requisito: Node.js 20 o superior.

```bash
npm install
npm start
```

- Página: http://localhost:3000
- Endpoints: http://localhost:3000/api/canciones/top y http://localhost:3000/api/canciones?q=queen
- Postman: importa `postman/Reto1_Deezer.postman_collection.json`.

## Cómo ejecutar las pruebas

```bash
npm test
```

Usan el ejecutor integrado de Node (`node:test`): no necesitan instalar nada extra ni conexión a internet. Son tres:

1. **Formato correcto:** la respuesta es un array y cada canción tiene `id`, `titulo`, `artista` y `preview`.
2. **Manejo de errores:** si la API no responde o devuelve un error, el controlador responde 502 con un JSON claro.
3. **Mock de dependencia:** el controlador funciona con un servicio simulado en lugar del real.
