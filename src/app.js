require('dotenv').config();
const express = require('express');
const path = require('path'); 
const app = express();

const chatRoutes = require('./routes/chat');

app.use(express.json());

// Servir archivos de la carpeta public
app.use(express.static(path.join(__dirname, '../public')));

// Solo usamos esta ruta, ya que contiene tanto el chat como las métricas
app.use('/api/chat', chatRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});