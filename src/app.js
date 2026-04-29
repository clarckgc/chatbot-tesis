require('dotenv').config();
const express = require('express');
const path = require('path'); 
const session = require('express-session'); // 🆕 Importamos sesiones
const app = express();

const chatRoutes = require('./routes/chat');

app.use(express.json());

// 🆕 Configuración de sesión profesional
app.use(session({
    secret: 'mi-clave-secreta-tesis', // Cambia esto por cualquier frase
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Ponlo en true si usas HTTPS más adelante
}));

app.use(express.static(path.join(__dirname, '../public')));
app.use('/api/chat', chatRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});