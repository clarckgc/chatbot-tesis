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
            1. Responde con tono amable, claro y profesional.
            2. Redacta respuestas naturales, no técnicas.
            3. Si el usuario adjunta una imagen, DEBES analizar visualmente su contenido.
            4. Puedes identificar:
               - recibos de pago
               - vouchers
               - capturas de pantalla
               - errores del portal
               - documentos
               - carnets
               - horarios
               - textos visibles
            5. Si hay texto en la imagen, léelo y explícalo.
            6. Si no se distingue bien, indica que la imagen está borrosa.
            7. Si el usuario escribe "analiza la imagen", "revisa imagen", "que ves", etc, interpreta automáticamente la imagen.
            8. Si preguntan algo fuera del contexto oficial, deriva al portal MiMundoUPN: ${contexto.enlace_portal}
            9. Nunca digas "no puedo ver imágenes" porque SÍ puedes analizarlas.
        `;

        let userContent = [];

        // TEXTO DEL USUARIO
        userContent.push({
            type: "text",
            text: pregunta || "Analiza detalladamente la imagen adjunta."
        });

        // IMAGEN
        if (imagenData && imagenData.inlineData) {
            userContent.push({
                type: "image_url",
                image_url: {
                    url: `data:${imagenData.inlineData.mimeType};base64,${imagenData.inlineData.data}`
                }
            });
        }

        // MENSAJES COMPLETOS
        const mensajesCompletos = [
            { role: "system", content: systemPrompt },
            ...historial,
            { role: "user", content: userContent }
        ];

        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: "gpt-4o",
                messages: mensajesCompletos,
                temperature: 0.3,
                max_tokens: 500
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );

        return response.data.choices[0].message.content;

    } catch (error) {
        console.error(
            "Error en OpenAI Service:",
            error.response ? error.response.data : error.message
        );

        return "Lo siento, ocurrió un inconveniente al analizar la información o la imagen. Intenta nuevamente en unos momentos.";
    }
}

module.exports = { preguntarIA };