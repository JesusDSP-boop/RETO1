const path = require('path');
const express = require('express');
const DeezerService = require('./services/deezerService');
const MusicController = require('./controllers/musicController');
const crearRutas = require('./routes/musicRoutes');

// Inyección de dependencias: este es el ÚNICO archivo donde se hace `new` de las
// piezas y se conectan entre sí. Si mañana cambiamos Deezer por otra API, solo se
// cambia la línea del servicio; el controlador y las rutas siguen igual.
const servicio = new DeezerService();
const controlador = new MusicController(servicio);

const app = express();
app.use(express.static(path.join(__dirname, '..', 'public'))); // la página web
app.use('/api', crearRutas(controlador));

module.exports = app;
