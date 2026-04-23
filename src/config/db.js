const mysql = require('mysql2');
require('dotenv').config();

// Creamos un "pool" de conexiones para que sea más eficiente
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',      // Tu usuario de MySQL Workbench
    password: '123456', // ⚠️ IMPORTANTE: Pon tu contraseña real
    database: 'chatbot_tesis',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

module.exports = pool.promise();