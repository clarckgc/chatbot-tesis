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

// Función para asegurar el estado por sesión
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

// ACTUALIZADO: 3.5 minutos (210,000 ms) para sincronizar con el aviso de 3 min del frontend
const TIEMPO_INACTIVIDAD = 210000;

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

/* ===================================
   🚀 NUEVA RUTA: RESET (PARA EL SCRIPT)
=================================== */
router.post('/reset', (req, res) => {
    resetChat(req);
    res.json({ ok: true, mensaje: "Sesión reiniciada correctamente" });
});

/* ===================================
   SUBIDA DE IMÁGENES
=================================== */
router.post('/upload', upload.single('image'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                ok: false,
                mensaje: "No se recibió ninguna imagen"
            });
        }
        const url = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
        res.json({ ok: true, url });
    } catch {
        res.status(500).json({ ok: false, mensaje: "Error al subir imagen" });
    }
});

/* ===================================
   VALIDAR ALUMNO
=================================== */
const validarAlumno = async (codigo) => {
    if (!codigo) return null;

    if (MODO_DEMO) {
        return codigo === "N00123456" ? { nombre: "Alumno Demo UPN" } : null;
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
   RESPUESTAS RÁPIDAS
=================================== */
function respuestaRapida(texto) {
    if (texto.includes("gracias") || texto.includes("muchas gracias")) {
        return "😊 ¡Con gusto! Estoy para ayudarte en lo que necesites.";
    }

    if (texto === "ok" || texto === "oki" || texto === "vale" || texto === "perfecto") {
        return "👍 Excelente. Si necesitas algo más, solo escríbeme.";
    }

    if (texto.includes("hola") || texto.includes("buenas")) {
        return "👋 Hola, será un gusto ayudarte con tus consultas universitarias.";
    }

    if (texto.includes("retiro") && texto.includes("curso")) {
        return "📚 Para realizar el **Retiro de Asignatura (Curso)**, debes ingresar a tu portal MiMundoUPN, sección 'Solicitudes' y elegir la opción correspondiente. Asegúrate de estar dentro del plazo del calendario académico.";
    }

    if (texto.includes("pago") || texto.includes("pensiones")) {
        return `💰 Puedes revisar tus pagos y cronograma en:<br><br>👉 <a href="https://mimundo.upn.edu.pe" target="_blank">MiMundoUPN</a>`;
    }

    if (texto.includes("constancia") || texto.includes("certificado")) {
        return "📄 Las constancias y certificados se solicitan desde tu portal estudiantil.";
    }

    if (texto.includes("retiro")) {
        return "🔄 El **Retiro de Ciclo** se gestiona desde el portal del estudiante. Recuerda que esto implica dejar todas tus asignaturas del semestre actual.";
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
        const estadoChat = obtenerEstadoUsuario(req);
        const ahora = Date.now();

        // 1. Control de Inactividad
        if (ahora - estadoChat.ultimoMensaje > TIEMPO_INACTIVIDAD) {
            resetChat(req);
        }

        estadoChat.ultimoMensaje = ahora;

        const pregunta = req.body.pregunta || '';
        const opcionId = req.body.opcionId || '';
        const historialRaw = req.body.historial || '';
        const texto = pregunta.trim().toLowerCase();

        /* 🛡️ BLOQUEO DE LOGIN */
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
                        `Estoy listo para ayudarte con tus consultas.<br><br>` +
                        `✍️ Escribe tu consulta directamente o escribe **menú**.`,
                    opciones: null
                });
            }

            return res.json({
                respuesta: "⚠️ Tu sesión ha expirado o no te has identificado. Por favor, **ingresa tu código de alumno** para continuar.\n\n**Modo prueba:** usa el código **N00123456**.",
                opciones: null
            });
        }

        /* ✅ FLUJO PARA USUARIOS LOGUEADOS */
        let historialArreglo = [];

        if (historialRaw) {
            try {
                historialArreglo = JSON.parse(historialRaw);
            } catch (e) {
                historialArreglo = [];
            }
        }

        // 2. Manejo de Opciones del Menú
        if (opcionId) {
            let respuestaMenu = '';

            switch (opcionId) {
                case '1':
                    const tramites = await obtenerTramites(estadoChat.codigoAlumno);

                    respuestaMenu =
                        `🖥️ **Estado actual de tus trámites:**<br><br>` +
                        (tramites.length > 0
                            ? tramites.map(t => `📌 **${t.tipo_tramite}** — ${t.estado}`).join('<br>')
                            : "No se encontraron trámites registrados.") +
                        `<br><br>📍 Si deseas más detalle, también puedes consultarlo en MiMundoUPN.`;
                    break;

                case '2':
                    respuestaMenu =
                        `📅 **Información de trámites disponibles:**<br><br>` +
                        `• Constancia de estudios<br>` +
                        `• Certificado de notas<br>` +
                        `• Retiro de curso<br>` +
                        `• Retiro de ciclo<br>` +
                        `• Reserva de matrícula<br>` +
                        `• Actualización de datos<br><br>` +
                        `📌 La mayoría se solicita desde MiMundoUPN en la sección de Solicitudes.`;
                    break;

                case '3':
                    respuestaMenu =
                        `💰 **Pagos y Pensiones:**<br><br>` +
                        `Puedes revisar:<br>` +
                        `• Cronograma de cuotas<br>` +
                        `• Pensiones pendientes<br>` +
                        `• Historial de pagos<br>` +
                        `• Medios disponibles de pago<br><br>` +
                        `👉 <a href="https://mimundo.upn.edu.pe" target="_blank">Ingresar a MiMundoUPN</a>`;
                    break;

                case '4':
                    respuestaMenu =
                        `💻 **Soporte Blackboard / TI:**<br><br>` +
                        `Te podemos orientar en casos como:<br>` +
                        `• Problemas de acceso al aula virtual<br>` +
                        `• Error de contraseña<br>` +
                        `• Cursos no visibles<br>` +
                        `• Fallas técnicas de plataforma<br><br>` +
                        `📧 Contacto referencial: soporte.it@upn.edu.pe`;
                    break;

                case '5':
                    respuestaMenu =
                        `🔄 **Reingresos:**<br><br>` +
                        `Si dejaste de estudiar y deseas retomar tus clases, puedes solicitar tu reingreso o retorno a estudios.<br><br>` +
                        `📌 Normalmente se valida deuda pendiente, periodo académico y disponibilidad de carrera.`;
                    break;

                case '6':
                    estadoChat.esperandoDetalleCaso = true;

                    respuestaMenu =
                        `📝 **Registrar Solicitud o Queja:**<br><br>` +
                        `Por favor, escribe el detalle completo de tu caso para ayudarte mejor.<br><br>` +
                        `Ejemplo: “No puedo ingresar al portal”, “No visualizo mi curso”, “Error en mi matrícula”.`;
                    break;
            }

            return res.json({
                respuesta: respuestaMenu + MSJ_RETORNO,
                opciones: null
            });
        }

        // 3. Registrar Caso
        if (estadoChat.esperandoDetalleCaso && pregunta) {
            const nro = await registrarCaso(estadoChat.codigoAlumno, pregunta);
            estadoChat.esperandoDetalleCaso = false;

            return res.json({
                respuesta: `✅ Tu caso fue registrado correctamente.<br><br>📌 Número de seguimiento: **${nro}**${MSJ_RETORNO}`,
                opciones: null
            });
        }

        // 4. Menú
        if (texto === "menu" || texto === "menú") {
            return res.json({
                respuesta: "📋 Selecciona una opción del menú para continuar:",
                opciones: opcionesMenu
            });
        }

        // 5. Respuestas rápidas
        if (!req.file) {
            const rapida = respuestaRapida(texto);

            if (rapida) {
                return res.json({
                    respuesta: rapida + MSJ_RETORNO,
                    opciones: null
                });
            }
        }

        // 6. Consultar IA
        let imagenData = null;

        if (req.file) {
            imagenData = {
                inlineData: {
                    data: req.file.buffer.toString('base64'),
                    mimeType: req.file.mimetype
                }
            };
        }

        let promptFinal = pregunta || "Analiza esta imagen";

        if (req.file) {
            const textoUsuario = (pregunta || "").toLowerCase();

            if (
                textoUsuario.includes("analiza") ||
                textoUsuario.includes("imagen") ||
                textoUsuario.includes("foto") ||
                textoUsuario.includes("captura") ||
                textoUsuario.includes("documento") ||
                textoUsuario.trim() === ""
            ) {
                promptFinal =
                    "Analiza detalladamente la imagen adjunta. Describe de qué trata, detecta texto visible, objetos, errores o información importante y responde claramente.";
            }
        }

        const respuestaIA = await preguntarIA(
            promptFinal,
            conocimiento["1"],
            imagenData,
            historialArreglo
        );

        res.json({
            respuesta: respuestaIA,
            opciones: null
        });

    } catch (error) {
        console.error("Error en chat:", error);
        res.json({ respuesta: "Error al procesar la consulta." });
    }
});

module.exports = router;