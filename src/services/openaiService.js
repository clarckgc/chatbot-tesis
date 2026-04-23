const axios = require('axios');

async function preguntarIA(pregunta, contexto) {
    try {
        // Creamos una base de conocimientos limpia para la IA
        const baseConocimiento = `
            UNIVERSIDAD: ${contexto.nombre}
            PAGOS: ${contexto.cronograma_pagos}
            ADMISION: ${contexto.admision}
            TRAMITES: ${contexto.tramites}
            SEDES: ${contexto.sedes}
            CONTACTO: ${contexto.contactos}
            PORTAL: ${contexto.enlace_portal}
        `;

        const systemPrompt = `
            Eres el Asistente Virtual de la UPN. Tu misión es ayudar a los alumnos con información administrativa precisa.
            
            USA ESTA INFORMACIÓN OFICIAL:
            ${baseConocimiento}

            REGLAS DE RESPUESTA:
            1. Responde con un tono amable, servicial y profesional.
            2. Proporciona la respuesta de forma redactada (párrafos), NO como una lista técnica.
            3. Si el alumno pregunta por algo que no está en la información oficial, indícale que puede revisar el portal MiMundoUPN: ${contexto.enlace_portal}.
            4. No menciones nombres de variables como 'undefined' o 'cronograma_pagos'. Habla de forma natural.
        `;

        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: "gpt-3.5-turbo",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: pregunta }
            ],
            temperature: 0.4 // Temperatura baja para mayor precisión administrativa
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        return response.data.choices[0].message.content;
    } catch (error) {
        console.error("Error en OpenAI Service:", error.message);
        return "Lo siento, tuve un inconveniente al consultar la información. Por favor, intenta de nuevo en unos momentos.";
    }
}

module.exports = { preguntarIA };