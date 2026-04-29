const express = require('express');
const router = express.Router();
const { preguntarIA } = require('../services/openaiService');
const multer = require('multer');

let db;

try {
    db = require('../config/db');
} catch {
    db = null;
}

const conocimiento = require('../contexto_universidad');

const ES_PRODUCCION =
    process.env.RENDER === 'true' ||
    process.env.NODE_ENV === 'production';

const MODO_DEMO = ES_PRODUCCION || !db;

// 🆕 Esta función asegura que cada usuario tenga su propio objeto de estado
function obtenerEstadoUsuario(req) {
    if (!req.session.estadoChat) {
        req.session.estadoChat = {
            tieneCodigo: false,
            codigoAlumno: '',
            nombreAlumno: '',
            esperandoDetalleCaso: false,
            ultimoMensaje: Date.now()
        };
    }
    return req.session.estadoChat;
}

const TIEMPO_INACTIVIDAD = 60000;

// 🆕 Ahora el reset limpia la sesión del usuario específico
function resetChat(req) {
    req.session.estadoChat = {
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

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }
});

router.post('/upload', upload.single('image'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                ok: false,
                mensaje: "No se recibió ninguna imagen"
            });
        }

        const url =
            `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;

        res.json({ ok: true, url });

    } catch {
        res.status(500).json({
            ok: false,
            mensaje: "Error al subir imagen"
        });
    }
});

/* ===================================
   VALIDAR ALUMNO
=================================== */
const validarAlumno = async (codigo) => {
    if (!codigo) return null;

    if (MODO_DEMO) {
        return codigo === "N00123456"
            ? { nombre: "Alumno Demo UPN" }
            : null;
    }

    try {
        const [rows] = await db.execute(
            'SELECT nombre FROM alumnos WHERE codigo_alumno = ? LIMIT 1',
            [codigo]
        );

        return rows[0] || null;

    } catch {
        return null;
    }
};

/* ===================================
   TRÁMITES
=================================== */
const obtenerTramites = async (codigo) => {
    if (MODO_DEMO) {
        return [
            { tipo_tramite: "Retiro de ciclo", estado: "En proceso" },
            { tipo_tramite: "Constancia de estudios", estado: "Aprobado" }
        ];
    }

    const [rows] = await db.execute(
        'SELECT * FROM solicitudes_tramites WHERE codigo_alumno = ?',
        [codigo]
    );

    return rows;
};

/* ===================================
   CASOS
=================================== */
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

/* ===================================
   RESPUESTAS RÁPIDAS (SIN IA)
=================================== */
function respuestaRapida(texto) {
    if (texto.includes("pago") || texto.includes("pensiones")) {
        return `💰 Puedes revisar tus pagos y cronograma en:<br><br>👉 <a href="https://mimundo.upn.edu.pe" target="_blank">MiMundoUPN</a>`;
    }

    if (texto.includes("constancia") || texto.includes("certificado")) {
        return "📄 Las constancias y certificados se solicitan desde tu portal estudiantil.";
    }

    if (texto.includes("retiro")) {
        return "🔄 El retiro de ciclo se gestiona desde el portal del estudiante.";
    }

    if (texto.includes("blackboard")) {
        return "💻 Si tienes inconvenientes con Blackboard, contacta soporte.it@upn.edu.pe";
    }

    if (texto.includes("horario") || texto.includes("clases")) {
        return "📚 Tu horario académico se encuentra disponible en MiMundoUPN.";
    }

    if (texto.includes("matricula") || texto.includes("matrícula")) {
        return "📝 El proceso de matrícula lo puedes revisar desde MiMundoUPN.";
    }

    return null;
}

/* ===================================
   RUTA PRINCIPAL
=================================== */
router.post('/', upload.single('file'), async (req, res) => {
    try {
        // 🆕 Obtenemos el estado único del usuario actual
        const estadoChat = obtenerEstadoUsuario(req);
        const ahora = Date.now();

        if (ahora - estadoChat.ultimoMensaje > TIEMPO_INACTIVIDAD) {
            resetChat(req);
        }

        estadoChat.ultimoMensaje = ahora;

        const pregunta = req.body.pregunta || '';
        const opcionId = req.body.opcionId || '';
        const texto = pregunta.trim().toLowerCase();

        /* ===============================
            LOGIN
        =============================== */
        if (!estadoChat.tieneCodigo) {
            const entrada = pregunta.trim().toUpperCase();
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

            return res.json({
                respuesta:
                    "⚠️ Acceso restringido. Por favor, ingresa tu código de alumno para comenzar.\n\n**Modo prueba:** usa el código **N00123456**.",
                opciones: null
            });
        }

        let respuestaFinal = '';

        /* ===============================
            BOTONES MENÚ
        =============================== */
        if (opcionId) {
            switch (opcionId) {
                case '1':
                    const tramites = await obtenerTramites(estadoChat.codigoAlumno);
                    respuestaFinal = tramites
                        .map(t => `📌 **${t.tipo_tramite}**: ${t.estado}`)
                        .join('<br>');
                    break;

                case '2':
                    respuestaFinal = "Puedes consultar trámites como retiro de ciclo, constancias o certificados.";
                    break;

                case '3':
                    respuestaFinal =
                        `Revisa tus pagos aquí:<br><br>` +
                        `👉 <a href="https://mimundo.upn.edu.pe" target="_blank">Ir a MiMundoUPN</a>`;
                    break;

                case '4':
                    respuestaFinal = "Soporte: soporte.it@upn.edu.pe";
                    break;

                case '5':
                    respuestaFinal = "Para reingresar, solicita 'Retorno a estudios'.";
                    break;

                case '6':
                    estadoChat.esperandoDetalleCaso = true;
                    respuestaFinal = "Describe tu problema para registrar un caso.";
                    break;
            }

            return res.json({
                respuesta: respuestaFinal + MSJ_RETORNO,
                opciones: null
            });
        }

        /* ===============================
            REGISTRAR CASO
        =============================== */
        if (estadoChat.esperandoDetalleCaso && pregunta) {
            const nro = await registrarCaso(
                estadoChat.codigoAlumno,
                pregunta
            );

            estadoChat.esperandoDetalleCaso = false;

            return res.json({
                respuesta: `Caso registrado: **${nro}**${MSJ_RETORNO}`,
                opciones: null
            });
        }

        /* ===============================
            RESPUESTAS CORTAS
        =============================== */
        if (["gracias", "ok", "listo", "perfecto", "dale"].includes(texto)) {
            return res.json({
                respuesta: "😊 ¡Con gusto! ¿Necesitas algo más?",
                opciones: null
            });
        }

        /* ===============================
            MENÚ
        =============================== */
        if (texto.includes("menu") || texto.includes("menú")) {
            return res.json({
                respuesta: "Selecciona una opción:",
                opciones: opcionesMenu
            });
        }

        /* ===============================
            RESPUESTA RÁPIDA SIN IA
        =============================== */
        if (!req.file) {
            const rapida = respuestaRapida(texto);

            if (rapida) {
                return res.json({
                    respuesta: rapida + MSJ_RETORNO,
                    opciones: null
                });
            }
        }

        /* ===============================
            IMAGEN
        =============================== */
        let imagenData = null;

        if (req.file) {
            imagenData = {
                inlineData: {
                    data: req.file.buffer.toString('base64'),
                    // Se usa req.file.mimetype para mayor precisión
                    mimeType: req.file.mimetype
                }
            };
        }

        /* ===============================
            IA SOLO CUANDO REALMENTE SE NECESITA
        =============================== */
        respuestaFinal = await preguntarIA(
            pregunta || "Analiza esta imagen",
            conocimiento["1"],
            imagenData
        );

        res.json({
            respuesta: respuestaFinal + MSJ_RETORNO,
            opciones: null
        });

    } catch (error) {
        console.error(error);

        res.json({
            respuesta: "Error en el servidor."
        });
    }
});

module.exports = router;