const express = require('express');
const router = express.Router();
const { preguntarIA } = require('../services/openaiService');
const multer = require('multer');

let db;

try {
    db = require('../config/db');
} catch (e) {
    db = null;
}

const conocimiento = require('../contexto_universidad');

// 🔥 Detectar entorno
const ES_PRODUCCION = process.env.RENDER === 'true' || process.env.NODE_ENV === 'production';
const MODO_DEMO = ES_PRODUCCION || !db;

/**
 * 🔥 ESTADO DEL CHAT
 */
let estadoChat = {
    tieneCodigo: false,
    codigoAlumno: '',
    nombreAlumno: '',
    esperandoDetalleCaso: false,
    ultimoMensaje: Date.now()
};

// 🔥 1 minuto
const TIEMPO_INACTIVIDAD = 60 * 1000;

function resetChat() {
    estadoChat = {
        tieneCodigo: false,
        codigoAlumno: '',
        nombreAlumno: '',
        esperandoDetalleCaso: false,
        ultimoMensaje: Date.now()
    };
}

const opcionesMenu = [
    { id: '1', texto: 'Estado de trámite 🖥️' },
    { id: '2', texto: 'Información de Trámites 📅' },
    { id: '3', texto: 'Pagos y Pensiones 💰' },
    { id: '4', texto: 'Soporte Blackboard/IT 💻' },
    { id: '5', texto: 'Reingresos 🔄' },
    { id: '6', texto: 'Registrar Solicitud/Queja 📝' }
];

const MSJ_RETORNO = " o escribe **'menú'** para volver.";

// =============================
// 🔥 MULTER CONFIG (MEMORIA)
// =============================
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// =============================
// 🔥 ENDPOINT IMAGENES
// =============================
router.post('/upload', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ ok: false, mensaje: "No se recibió ninguna imagen" });
        }
        const base64 = req.file.buffer.toString('base64');
        const mimeType = req.file.mimetype;
        const url = `data:${mimeType};base64,${base64}`;
        return res.json({ ok: true, url });
    } catch (error) {
        console.error("Error upload:", error);
        return res.status(500).json({ ok: false, mensaje: "Error al subir imagen" });
    }
});

// =============================
// 🔥 FUNCIONES AUXILIARES
// =============================
const validarAlumno = async (codigo) => {
    if (!codigo) return null;
    if (MODO_DEMO) {
        if (codigo === "N00123456") return { nombre: "Alumno Demo UPN" };
        return null;
    }
    try {
        const [rows] = await db.execute('SELECT nombre FROM alumnos WHERE codigo_alumno = ? LIMIT 1', [codigo]);
        return rows.length > 0 ? rows[0] : null;
    } catch { return null; }
};

const obtenerTramites = async (codigo) => {
    if (MODO_DEMO) {
        return [
            { tipo_tramite: "Retiro de ciclo", estado: "En proceso" },
            { tipo_tramite: "Constancia de estudios", estado: "Aprobado" }
        ];
    }
    const [rows] = await db.execute('SELECT * FROM solicitudes_tramites WHERE codigo_alumno = ?', [codigo]);
    return rows;
};

const registrarCaso = async (codigo, detalle) => {
    const nro = `CAS-${Math.floor(100000 + Math.random() * 900000)}`;
    if (!MODO_DEMO) {
        await db.execute(
            'INSERT INTO casos_reportados (nro_caso, codigo_alumno, detalle_incidente, estado_caso) VALUES (?, ?, ?, ?)',
            [nro, codigo, detalle, 'Abierto']
        );
    }
    return nro;
};

// =============================
// 🔥 RUTA PRINCIPAL
// =============================
router.post('/', upload.single('file'), async (req, res) => {
    const { pregunta, opcionId } = req.body;

    try {
        const ahora = Date.now();
        if (ahora - estadoChat.ultimoMensaje > TIEMPO_INACTIVIDAD) {
            resetChat();
        }
        estadoChat.ultimoMensaje = ahora;

        // =============================
        // 🔥 VALIDACIÓN DE AUTENTICACIÓN (BLOQUEO DE TEXTO E IMAGEN)
        // =============================
        if (!estadoChat.tieneCodigo) {
            // Intentamos validar lo que haya en 'pregunta'
            const entrada = pregunta?.trim().toUpperCase() || "";
            const alumno = await validarAlumno(entrada);

            if (alumno) {
                estadoChat.tieneCodigo = true;
                estadoChat.codigoAlumno = entrada;
                estadoChat.nombreAlumno = alumno.nombre;

                return res.json({
                    respuesta:
                        `✅ Código **${entrada}** verificado correctamente.<br><br>` +
                        `¡Bienvenido(a) **${alumno.nombre}**! 👋<br><br>` +
                        `Estoy listo para ayudarte con tus consultas administrativas, académicas o de soporte.<br><br>` +
                        `✍️ Escribe tu consulta directamente o escribe **menú** para ver las opciones disponibles.`,
                    opciones: null
                });
            }

            // SI NO ES UN CÓDIGO VÁLIDO:
            // Bloqueamos cualquier intento de subir imagen o hacer preguntas
            return res.json({ 
                respuesta: "⚠️ Acceso restringido. Por favor, ingresa tu código de alumno para comenzar.\n\n**Modo prueba:** usa el código **N00123456**.",
                opciones: null 
            });
        }

        let respuestaFinal = "";

        // =============================
        // 🔥 MENÚ
        // =============================
        if (opcionId) {
            switch (opcionId) {
                case '1':
                    const tramites = await obtenerTramites(estadoChat.codigoAlumno);
                    respuestaFinal = tramites.map(t => `📌 **${t.tipo_tramite}**: ${t.estado}`).join('<br>');
                    break;
                case '2': respuestaFinal = "Puedes consultar trámites como retiro de ciclo, constancias o certificados."; break;
                case '3': respuestaFinal = `Revisa tus pagos aquí:<br><br>👉 <a href="https://mimundo.upn.edu.pe" target="_blank">Ir a MiMundoUPN</a>`; break;
                case '4': respuestaFinal = "Soporte: soporte.it@upn.edu.pe"; break;
                case '5': respuestaFinal = "Para reingresar, solicita 'Retorno a estudios'."; break;
                case '6':
                    estadoChat.esperandoDetalleCaso = true;
                    respuestaFinal = "Describe tu problema para registrar un caso.";
                    break;
            }
        }
        // =============================
        // 🔥 REGISTRO DE CASO
        // =============================
        else if (estadoChat.esperandoDetalleCaso && pregunta) {
            const nro = await registrarCaso(estadoChat.codigoAlumno, pregunta);
            respuestaFinal = `Caso registrado: **${nro}**`;
            estadoChat.esperandoDetalleCaso = false;
        }
        // =============================
        // 🔥 LÓGICA IA (SOLO SI YA ESTÁ AUTENTICADO)
        // =============================
        else if (pregunta || req.file) {
            const texto = pregunta ? pregunta.toLowerCase().trim() : "";

            if (["gracias", "ok", "listo", "perfecto", "dale"].includes(texto)) {
                return res.json({
                    respuesta: "😊 ¡Con gusto! ¿Necesitas algo más?",
                    opciones: null
                });
            }

            if (texto.includes("menu") || texto.includes("menú")) {
                return res.json({
                    respuesta: "Selecciona una opción:",
                    opciones: opcionesMenu
                });
            }

            // Preparar objeto de imagen para la IA
            let imagenData = null;
            if (req.file) {
                imagenData = {
                    inlineData: {
                        data: req.file.buffer.toString('base64'),
                        mimeType: req.file.mimetype
                    }
                };
            }

            respuestaFinal = await preguntarIA(pregunta || "Analiza esta imagen", conocimiento["1"], imagenData);
        }

        res.json({
            respuesta: respuestaFinal + MSJ_RETORNO,
            opciones: null
        });

    } catch (error) {
        console.error("Error en ruta principal:", error);
        res.json({ respuesta: "Error en el servidor." });
    }
});


module.exports = router;