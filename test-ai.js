require('dotenv').config(); // Carga tu llave del .env
const { preguntarIA } = require('./src/services/openaiService');

async function test() {
    console.log("⏳ Enviando pregunta a la IA... (espera unos segundos)");
    try {
        const respuesta = await preguntarIA("¿Cuáles son los requisitos para el grado de bachiller?");
        console.log("------------------------------------------");
        console.log("🤖 RESPUESTA DE LA IA:");
        console.log(respuesta);
        console.log("------------------------------------------");
        console.log("✅ ¡Prueba exitosa! El servicio funciona.");
    } catch (error) {
        console.error("❌ Error en la prueba:", error.message);
    }
}

test();