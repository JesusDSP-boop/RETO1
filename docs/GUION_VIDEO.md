# Guion del video (máximo 5 minutos)

Graba la pantalla con el servidor ya corriendo (`npm start`).

- **0:00 a 0:30. Presentación.** Nombre del proyecto (Ritmo), qué hace y qué API usa (Deezer) y por qué.
- **0:30 a 1:30. La API y el servicio.** Abre `https://api.deezer.com/search?q=queen` en el navegador y muestra el JSON. Luego abre `src/services/deezerService.js` y señala la petición con `axios`.
- **1:30 a 2:45. Endpoints funcionando.** En Postman ejecuta los dos `GET` y muestra el JSON de cada uno. Después abre la página: busca un artista, reproduce una canción y abre «Ver respuesta JSON».
- **2:45 a 3:45. Inyección de dependencias.** Muestra el constructor y el comentario en `musicController.js`. Muestra `src/app.js` como único lugar con `new`. Explica que por eso en las pruebas se puede pasar un servicio simulado.
- **3:45 a 4:45. Pruebas.** En la terminal ejecuta `npm test` y muestra las 3 pruebas en verde. Di en una frase qué verifica cada una.
- **4:45 a 5:00. Cierre.** Recuerda que no hay base de datos y que todo viaja como JSON.
