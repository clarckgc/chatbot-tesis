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

const TIEMPO_INACTIVIDAD = 60000; // 1 minuto

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
   RUTA PRINCIPAL (CORREGIDA)
=================================== */
router.post('/', upload.single('file'), async (req, res) => {
    try {
        const estadoChat = obtenerEstadoUsuario(req);
        const ahora = Date.now();

        // 1. Control de Inactividad (Pre-bloqueo)
        if (ahora - estadoChat.ultimoMensaje > TIEMPO_INACTIVIDAD) {
            resetChat(req);
        }
        estadoChat.ultimoMensaje = ahora;

        const pregunta = req.body.pregunta || '';
        const opcionId = req.body.opcionId || '';
        const historialRaw = req.body.historial || ''; 
        const texto = pregunta.trim().toLowerCase();

        /* 🛡️ BLOQUEO DE LOGIN REFORZADO */
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

            // Bloqueo total: Si no hay código válido, no se procesa nada más
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
                    respuestaMenu = tramites.length > 0 
                        ? tramites.map(t => `📌 **${t.tipo_tramite}**: ${t.estado}`).join('<br>')
                        : "No se encontraron trámites registrados.";
                    break;
                case '2':
                    respuestaMenu = "Puedes consultar trámites como retiro de ciclo, constancias o certificados.";
                    break;
                case '3':
                    respuestaMenu = `Revisa tus pagos aquí: <a href="https://mimundo.upn.edu.pe" target="_blank">MiMundoUPN</a>`;
                    break;
                case '4':
                    respuestaMenu = "Soporte: soporte.it@upn.edu.pe";
                    break;
                case '5':
                    respuestaMenu = "Para reingresar, solicita 'Retorno a estudios'.";
                    break;
                case '6':
                    estadoChat.esperandoDetalleCaso = true;
                    respuestaMenu = "Describe tu problema para registrar un caso.";
                    break;
            }
            return res.json({ respuesta: respuestaMenu + MSJ_RETORNO, opciones: null });
        }

        // 3. Registrar Caso
        if (estadoChat.esperandoDetalleCaso && pregunta) {
            const nro = await registrarCaso(estadoChat.codigoAlumno, pregunta);
            estadoChat.esperandoDetalleCaso = false;
            return res.json({ respuesta: `Caso registrado: **${nro}**${MSJ_RETORNO}`, opciones: null });
        }

        // 4. Palabra clave "menú"
        if (texto === "menu" || texto === "menú") {
            return res.json({ respuesta: "Selecciona una opción:", opciones: opcionesMenu });
        }

        // 5. Respuestas rápidas
        if (!req.file) {
            const rapida = respuestaRapida(texto);
            if (rapida) return res.json({ respuesta: rapida + MSJ_RETORNO, opciones: null });
        }

        // 6. Consultar a la IA (Último recurso)
        let imagenData = null;
        if (req.file) {
            imagenData = { inlineData: { data: req.file.buffer.toString('base64'), mimeType: req.file.mimetype } };
        }

        const respuestaIA = await preguntarIA(
            pregunta || "Analiza esta imagen",
            conocimiento["1"],
            imagenData,
            historialArreglo 
        );

        res.json({
            respuesta: respuestaIA + MSJ_RETORNO,
            opciones: null
        });

    } catch (error) {
        console.error("Error en chat:", error);
        res.json({ respuesta: "Error al procesar la consulta." });
    }
});

module.exports = router;