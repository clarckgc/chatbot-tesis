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

// --- FUNCIONES DE APOYO (MEJORA NLP PARA TESIS) ---

/**
 * Función que utiliza IA para clasificar la intención del usuario.
 * Valida la Dimensión 1: Capacidad de respuesta (NLP).
 */
const detectarIntencionIA = async (texto) => {
    try {
        const promptIntencion = `
        Clasifica el mensaje del alumno en UNA de estas categorías:
        - TRAMITES (Dudas sobre procesos o requisitos)
        - PAGOS (Dudas sobre dinero, deudas o pensiones)
        - SOPORTE (Problemas técnicos o de Blackboard)
        - REINGRESOS (Volver a estudiar)
        - REGISTRO (Quejas o nuevas solicitudes)
        - SALUDO (Hola, qué tal)
        - AGRADECIMIENTO (Gracias, perfecto, listo)
        - OTRO (Consultas generales)

        Mensaje: "${texto}"
        Responde SOLO con el nombre de la categoría en mayúsculas.`;

        const respuesta = await preguntarIA(promptIntencion, "Eres un clasificador de intenciones experto.");
        return respuesta.toUpperCase().trim();
    } catch (error) {
        return "OTRO";
    }
};

const validarAlumnoEnBD = async (codigo) => {
    try {
        const sql = 'SELECT nombre FROM alumnos WHERE codigo_alumno = ? LIMIT 1';
        const [rows] = await db.execute(sql, [codigo]);
        return rows.length > 0 ? rows[0] : null;
    } catch (error) { return null; }
};

const buscarTramiteEnBD = async (preguntaUsuario) => {
    try {
        const textoLimpio = preguntaUsuario.toLowerCase().trim();
        const sql = `SELECT * FROM tramites_upn WHERE ? LIKE CONCAT('%', nombre_tramite, '%') OR nombre_tramite LIKE ? LIMIT 1`;
        const [rows] = await db.execute(sql, [textoLimpio, `%${textoLimpio}%`]);
        return rows.length > 0 ? rows[0] : null;
    } catch (error) { return null; }
};

// ==========================================
// --- RUTA PARA MÉTRICAS ---
// ==========================================
router.get('/metricas', async (req, res) => {
    const { secret } = req.query;
    if (secret !== 'admin123') return res.status(403).json({ error: "Acceso denegado." });
    
    try {
        const [rows] = await db.execute(`
            SELECT 
                COUNT(*) AS total_consultas, 
                IFNULL(AVG(tiempo_respuesta), 0) AS promedio_ms 
            FROM consultas
        `);
        res.json(rows[0]);
    } catch (error) { 
        res.status(500).json({ total_consultas: 0, promedio_ms: 0 }); 
    }
});

// --- RUTA PRINCIPAL DEL CHAT ---
router.post('/', async (req, res) => {
    const { pregunta, opcionId, reiniciarConversacion } = req.body;
    const inicio = Date.now();

    if (reiniciarConversacion) {
        estadoChat.tieneCodigo = false;
        estadoChat.codigoAlumno = '';
        estadoChat.nombreAlumno = '';
        estadoChat.esperandoDetalleCaso = false;
    }

    try {
        // 1. IDENTIFICACIÓN DE USUARIO
        if (!estadoChat.tieneCodigo) {
            const entrada = pregunta?.trim().toUpperCase();
            if (entrada && entrada.startsWith('N') && entrada.length >= 5) {
                const alumnoEncontrado = await validarAlumnoEnBD(entrada);
                if (alumnoEncontrado) {
                    estadoChat.codigoAlumno = entrada;
                    estadoChat.nombreAlumno = alumnoEncontrado.nombre;
                    estadoChat.tieneCodigo = true;
                    return res.json({ 
                        respuesta: `Código **${entrada}** verificado. ¡Bienvenido(a) ${estadoChat.nombreAlumno}! ¿Qué consulta deseas realizar?`,
                        opciones: opcionesMenu 
                    });
                } else {
                    return res.json({ respuesta: "El código ingresado no existe en nuestra base de datos. Por favor, verifícalo y vuelve a ingresar." });
                }
            } else {
                return res.json({ respuesta: "¡Hola! Por seguridad, ingresa tu código de alumno (ejemplo: N00123456) para comenzar." });
            }
        }

        let respuestaFinal = null;
        let mostrarMenu = false;
        let esCierreCortesia = false; 

        // 2. LÓGICA DE OPCIONES DEL MENÚ (Botones)
        if (opcionId) {
            switch (opcionId) {
                case '1':
                    const [solicitudes] = await db.execute('SELECT * FROM solicitudes_tramites WHERE codigo_alumno = ?', [estadoChat.codigoAlumno]);
                    respuestaFinal = solicitudes.length > 0 
                        ? `Tus trámites académicos:\n` + solicitudes.map(s => `\n📌 **${s.tipo_tramite}**: ${s.estado}`).join('')
                        : "No registras trámites académicos pendientes.";
                    break;
                case '2':
                    respuestaFinal = "Dime qué trámite específico deseas consultar (ej: Retiro de ciclo).";
                    break;
                case '3':
    respuestaFinal = `Puedes revisar tus pagos y cronogramas en MiMundoUPN:<br><br>
    👉 <a href="https://mimundo.upn.edu.pe" target="_blank">Ir a MiMundoUPN</a>`;
    break;
                case '4':
                    respuestaFinal = "Soporte técnico: Escribe a soporte.it@upn.edu.pe o llama al (01) 604-4444.";
                    break;
                case '5':
                    respuestaFinal = "Para reingresos, consulta la guía en el portal institucional o solicita información sobre 'Retorno a estudios'.";
                    break;
                case '6':
                    estadoChat.esperandoDetalleCaso = true;
                    respuestaFinal = "Si ya cuentas con un número de caso (ejemplo: **CAS-123456**), por favor ingrésalo para darte el estado.\n\nDe lo contrario, descríbenos tu inconveniente o queja para generar un nuevo registro.";
                    break;
                default:
                    respuestaFinal = "Opción no reconocida. Elige una del menú.";
                    mostrarMenu = true;
            }
        }

        // 3. NLP MEJORADO CON IA / DETECCIÓN DE INTENCIONES
        if (!respuestaFinal && pregunta) {
            const intencion = await detectarIntencionIA(pregunta);
            const preguntaUpper = pregunta.trim().toUpperCase();
            const preguntaLower = pregunta.toLowerCase().trim();

            if (intencion === 'SALUDO' || ['menu', 'menú', 'hola'].includes(preguntaLower)) {
                estadoChat.esperandoDetalleCaso = false;
                respuestaFinal = "¡Hola de nuevo! Elige una opción de nuestro menú para continuar:";
                mostrarMenu = true;
            } 
            else if (intencion === 'AGRADECIMIENTO') {
                const URL_FORM = "https://docs.google.com/forms/u/0/d/e/1FAIpQLSdOCCsw20B4grhmn3ggTSVkU0K8Uugg08FRFnEY5Pb5DioFGQ/formResponse?pli=1";
                
                respuestaFinal = `¡De nada, ${estadoChat.nombreAlumno.split(' ')[0]}! 😊 Me alegra haberte ayudado.<br><br>` +
                                 `Tu opinión es fundamental para validar la **Calidad de Servicio** de este proyecto. ¿Podrías evaluar mi desempeño?<br><br>` +
                                 `👉 <a href="${URL_FORM}" target="_blank">Haz clic aquí para evaluar el Chatbot</a><br><br>` +
                                 `¡Que tengas un excelente día!`;
                
                esCierreCortesia = true; 
                estadoChat.esperandoDetalleCaso = false;
            }
            else if (estadoChat.esperandoDetalleCaso) {
                if (preguntaUpper.startsWith('CAS-')) {
                    const sqlBuscar = 'SELECT estado_caso, detalle_incidente FROM casos_reportados WHERE nro_caso = ? AND codigo_alumno = ?';
                    const [caso] = await db.execute(sqlBuscar, [preguntaUpper, estadoChat.codigoAlumno]);
                    
                    if (caso.length > 0) {
                        respuestaFinal = `He encontrado tu reporte. 📌 **Estado:** ${caso[0].estado_caso} \n**Detalle registrado:** ${caso[0].detalle_incidente}`;
                    } else {
                        respuestaFinal = `No encontré el caso **${preguntaUpper}** asociado a tu código de alumno.`;
                    }
                } else {
                    const nroTicket = `CAS-${Math.floor(100000 + Math.random() * 900000)}`;
                    const sqlInsertar = 'INSERT INTO casos_reportados (nro_caso, codigo_alumno, detalle_incidente, estado_caso) VALUES (?, ?, ?, ?)';
                    await db.execute(sqlInsertar, [nroTicket, estadoChat.codigoAlumno, pregunta, 'Abierto']);
                    
                    respuestaFinal = `¡Solicitud registrada con éxito! Tu número de seguimiento es: **${nroTicket}**. El área correspondiente revisará tu caso.`;
                }
                estadoChat.esperandoDetalleCaso = false; 
            } 
            else {
                // Primero intentamos búsqueda exacta en Base de Datos (Eficiencia operativa)
                const tramiteLocal = await buscarTramiteEnBD(pregunta);
                if (tramiteLocal) {
                    respuestaFinal = `He recuperado la información oficial sobre *${tramiteLocal.nombre_tramite}*:<br><br>` +
                                     `✅ **Requisitos:** ${tramiteLocal.requisitos}<br>` +
                                     `💰 **Costo:** ${tramiteLocal.costo}<br>` +
                                     `🔗 **Enlace:** <a href="${tramiteLocal.enlace_portal}" target="_blank">Ver en el portal</a>`;
                } else {
                    // Si no está en BD, usamos IA Generativa (Capacidad de respuesta NLP)
                    respuestaFinal = await preguntarIA(pregunta, conocimiento["1"]);
                }
            }
        }

        if (respuestaFinal && !mostrarMenu && !esCierreCortesia) {
            respuestaFinal += MSJ_RETORNO;
        }

        // GUARDAR MÉTRICAS (Dimensión: Eficiencia operativa y Automatización)
        const tiempo = Date.now() - inicio;
        await db.execute('INSERT INTO consultas (pregunta, respuesta, tiempo_respuesta) VALUES (?, ?, ?)', 
            [pregunta || `Opción ID: ${opcionId}`, respuestaFinal, tiempo]);

        res.json({ 
            respuesta: respuestaFinal || "No logré procesar tu solicitud. Elige una opción:", 
            opciones: (mostrarMenu || !respuestaFinal) ? opcionesMenu : null 
        });
        
    } catch (error) {
        console.error("Error General:", error);
        res.status(500).json({ respuesta: "Ocurrió un error en el servicio del chat." });
    }
});

router.post('/reset', (req, res) => {
    estadoChat.tieneCodigo = false;
    estadoChat.codigoAlumno = '';
    estadoChat.nombreAlumno = '';
    estadoChat.esperandoDetalleCaso = false;
    res.json({ success: true, message: "Sesión reiniciada" });
});

module.exports = router;