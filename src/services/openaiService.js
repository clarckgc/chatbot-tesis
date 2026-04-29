const axios = require('axios');

async function preguntarIA(pregunta, contexto, imagenData = null, historial = []) {
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
            3. Si el alumno adjunta una imagen (como un recibo, captura de pantalla o carnet), analízala y relaciónala con la normativa de la universidad.
            4. Si el alumno pregunta por algo que no está en la información oficial, indícale que puede revisar el portal MiMundoUPN: ${contexto.enlace_portal}.
            5. No menciones nombres de variables internas. Habla de forma natural.
        `;

        let userContent = [];

        userContent.push({
            type: "text",
            text: pregunta || "Analiza la imagen adjunta según el contexto de la universidad."
        });

        if (imagenData && imagenData.inlineData) {
            userContent.push({
                type: "image_url",
                image_url: {
                    url: `data:${imagenData.inlineData.mimeType};base64,${imagenData.inlineData.data}`
                }
            });
        }

        // Construimos el arreglo de mensajes incluyendo el historial para mantener el contexto
        const mensajesCompletos = [
            { role: "system", content: systemPrompt },
            ...historial, // Insertamos los mensajes previos aquí
            { role: "user", content: userContent }
        ];

        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: "gpt-4o-mini",
                messages: mensajesCompletos,
                temperature: 0.4,
                max_tokens: 300
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 20000
            }
        );

        return response.data.choices[0].message.content;

    } catch (error) {
        console.error(
            "Error en OpenAI Service:",
            error.response ? error.response.data : error.message
        );

        return "Lo siento, tuve un inconveniente al consultar la información. Por favor, intenta de nuevo en unos momentos.";
    }
}

module.exports = { preguntarIA };