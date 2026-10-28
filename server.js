const app = require('./src/app');

const PUERTO = process.env.PORT || 3000;
app.listen(PUERTO, () => console.log(`Servidor listo en http://localhost:${PUERTO}`));
