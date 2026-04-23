const express = require('express');
const router = express.Router();
const { preguntarIA } = require('../services/openaiService');
const db = require('../config/db'); 
const conocimiento = require('../contexto_universidad');

/**
 * ESTADO DEL CHAT
 */
let estadoChat = {
    tieneCodigo: false,
    codigoAlumno: '',
    nombreAlumno: '', 
    esperandoDetalleCaso: false,
    ultimaActividad: Date.now()
};

const opcionesMenu = [
    { id: '1', texto: 'Estado de trámite 🖥️', clave: 'estado' },
    { id: '2', texto: 'Información de Trámites 📅', clave: 'tramites' },
    { id: '3', texto: 'Pagos y Pensiones 💰', clave: 'pagos' },
    { id: '4', texto: 'Soporte Blackboard/IT 💻', clave: 'soporte' },
    { id: '5', texto: 'Reingresos 🔄', clave: 'reingresos' },
    { id: '6', texto: 'Registrar Solicitud/Queja 📝', clave: 'registro' }
];

const MSJ_RETORNO = " O escribe **'menú'** para volver.";

/**
 * 🔥 FUNCIÓN: Convertir enlaces en hipervínculos automáticamente
 */
const convertirLinks = (texto) => {
    if (!texto) return texto;
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return texto.replace(urlRegex, (url) => {
        return `<a href="${url}" target="_blank">${url}</a>`;
    });
};

/**
 * NLP - DETECCIÓN DE INTENCIÓN
 */
const detectarIntencionIA = async (texto) => {
    try {
        const promptIntencion = `
        Clasifica el mensaje del alumno en UNA de estas categorías:
        TRAMITES, PAGOS, SOPORTE, REINGRESOS, REGISTRO, SALUDO, AGRADECIMIENTO, OTRO.
        Mensaje: "${texto}"
        Responde SOLO con la categoría.`;

        const respuesta = await preguntarIA(promptIntencion, "Clasificador de intenciones");
        return respuesta.toUpperCase().trim();
    } catch {
        return "OTRO";
    }
};

/**
 * BD (con fallback)
 */
const validarAlumnoEnBD = async (codigo) => {
    try {
        const [rows] = await db.execute(
            'SELECT nombre FROM alumnos WHERE codigo_alumno = ? LIMIT 1',
            [codigo]
        );
        return rows.length > 0 ? rows[0] : null;
    } catch {
        return null;
    }
};

const buscarTramiteEnBD = async (preguntaUsuario) => {
    try {
        const texto = preguntaUsuario.toLowerCase();
        const [rows] = await db.execute(
            `SELECT * FROM tramites_upn 
             WHERE ? LIKE CONCAT('%', nombre_tramite, '%') 
             OR nombre_tramite LIKE ? LIMIT 1`,
            [texto, `%${texto}%`]
        );
        return rows.length > 0 ? rows[0] : null;
    } catch {
        return null;
    }
};

// ==========================================
// CHAT
// ==========================================
router.post('/', async (req, res) => {
    const { pregunta, opcionId } = req.body;

    try {
        // =========================
        // 1. IDENTIFICACIÓN
        // =========================
        if (!estadoChat.tieneCodigo) {
            const entrada = pregunta?.trim().toUpperCase();

            if (entrada && entrada.startsWith('N')) {

                let alumno = await validarAlumnoEnBD(entrada);

                // 🔥 MODO DEMO
                if (!alumno) {
                    alumno = { nombre: "Alumno Demo" };
                }

                estadoChat.codigoAlumno = entrada;
                estadoChat.nombreAlumno = alumno.nombre;
                estadoChat.tieneCodigo = true;

                return res.json({
                    respuesta: `Código **${entrada}** verificado. ¡Bienvenido(a) ${estadoChat.nombreAlumno}!`,
                    opciones: opcionesMenu
                });
            }

            return res.json({
                respuesta: "Ingresa tu código de alumno (ej: N00123456)"
            });
        }

        let respuestaFinal = null;
        let mostrarMenu = false;

        // =========================
        // 2. OPCIONES
        // =========================
        if (opcionId) {
            switch (opcionId) {
                case '1':
                    let solicitudes = [];
                    try {
                        const [rows] = await db.execute(
                            'SELECT * FROM solicitudes_tramites WHERE codigo_alumno = ?',
                            [estadoChat.codigoAlumno]
                        );
                        solicitudes = rows;
                    } catch {
                        solicitudes = [
                            { tipo_tramite: "Retiro de curso", estado: "En proceso" }
                        ];
                    }

                    respuestaFinal = solicitudes.length > 0
                        ? "Tus trámites:\n" + solicitudes.map(s => `📌 ${s.tipo_tramite}: ${s.estado}`).join('\n')
                        : "No tienes trámites registrados.";
                    break;

                case '3':
                    respuestaFinal = `Ir a MiMundoUPN:<br>
                    <a href="https://mimundo.upn.edu.pe" target="_blank">https://mimundo.upn.edu.pe</a>`;
                    break;

                default:
                    mostrarMenu = true;
            }
        }

        // =========================
        // 3. IA / TEXTO LIBRE
        // =========================
        if (!respuestaFinal && pregunta) {

            const intencion = await detectarIntencionIA(pregunta);

            if (intencion === 'SALUDO') {
                respuestaFinal = "Hola 👋 ¿En qué puedo ayudarte?";
                mostrarMenu = true;
            } 
            else if (intencion === 'AGRADECIMIENTO') {
                respuestaFinal = "¡Con gusto! 😊";
            } 
            else {
                const tramite = await buscarTramiteEnBD(pregunta);

                if (tramite) {
                    respuestaFinal = `
                    ${tramite.nombre_tramite}<br>
                    Requisitos: ${tramite.requisitos}<br>
                    <a href="${tramite.enlace_portal}" target="_blank">Ver trámite</a>
                    `;
                } else {
                    respuestaFinal = await preguntarIA(pregunta, conocimiento["1"]);
                }
            }
        }

        // 🔥 CONVERTIR LINKS AUTOMÁTICOS
        respuestaFinal = convertirLinks(respuestaFinal);

        res.json({
            respuesta: respuestaFinal || "No entendí tu consulta",
            opciones: mostrarMenu ? opcionesMenu : null
        });

    } catch (error) {
        console.error(error);
        res.json({ respuesta: "Error en el sistema" });
    }
});

module.exports = router;