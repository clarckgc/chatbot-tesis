const chatBox = document.getElementById('chat-box');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');

/* 🆕 NUEVO: Manejo de imágenes */
const imageInput = document.getElementById('image-input');
const imageBtn = document.getElementById('image-btn');

let avisoTimer;
let cierreTimer;
let conversacionIniciada = false;
let enviando = false;
let archivoPendiente = null;

/* 🧠 MEMORIA DEL CHAT: Guardamos los últimos mensajes */
let historialMensajes = [];

/* =========================
    🔔 NOTIFICACIONES
========================= */
function solicitarPermisoNotificaciones() {
    if ("Notification" in window && Notification.permission !== "granted") {
        Notification.requestPermission();
    }
}

function mostrarNotificacion(mensaje) {
    if (
        "Notification" in window &&
        Notification.permission === "granted" &&
        document.hidden
    ) {
        new Notification("Asistente UPN", {
            body: mensaje.replace(/<[^>]*>/g, ""),
            icon: "https://cdn-icons-png.flaticon.com/512/4712/4712027.png"
        });
    }
}

/* =========================
    🕒 FORMATO HORA
========================= */
function obtenerHora() {
    const ahora = new Date();
    return ahora.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
    });
}

/* =========================
    🔥 MENSAJE UNIFICADO
========================= */
const MENSAJE_BIENVENIDA = `
👋 Bienvenido al asistente universitario.<br><br>
Ingresa tu código de alumno.<br><br>
🧪 <b>Modo prueba:</b> usa el código <b>N00123456</b>
`;

/* =========================
    🔥 SCROLL SUAVE
========================= */
function scrollToBottom() {
    chatBox.scrollTo({
        top: chatBox.scrollHeight,
        behavior: "auto"
    });
}

/* =========================
    🔥 TYPING IA
========================= */
function mostrarTyping() {
    const div = document.createElement("div");
    div.className = "message bot typing";
    div.id = "typing";

    div.innerHTML = `
        <span></span>
        <span></span>
        <span></span>
    `;

    chatBox.appendChild(div);
    scrollToBottom();
}

function quitarTyping() {
    const t = document.getElementById("typing");
    if (t) t.remove();
}

/* =========================
    🔥 1. INACTIVIDAD (SINCRONIZADO A 3 MIN + 30 SEG)
========================= */
function iniciarTemporizadores() {
    if (!conversacionIniciada) return;

    clearTimeout(avisoTimer);
    clearTimeout(cierreTimer);

    // CORREGIDO: Primer aviso a los 3 minutos (180,000 ms)
    avisoTimer = setTimeout(() => {
        appendMessage('bot', "¿Sigues ahí? 👀 Estoy atento para continuar ayudándote.");
    }, 180000);

    // CORREGIDO: Cierre a los 3.5 minutos (210,000 ms) para sincronizar con backend
    cierreTimer = setTimeout(() => {
        const URL_FORM = "https://docs.google.com/forms/d/e/1FAIpQLSdwz-LSX_jKUlEg9MVv9rvKYVZhTsKQop709vmc1PjH5hVytQ/viewform?usp=dialog";

        appendMessage('bot', `
            No hemos tenido respuesta para continuar con la comunicación.<br><br>
            Cuando quieras retomar la conversación, aquí estaremos para ayudarte. 😊<br><br>
            📝 Antes de irte, tu opinión es muy importante:<br><br>
            👉 <a href="${URL_FORM}" target="_blank">Evaluar el Chatbot</a>
        `);

        // Sincronizado con la ruta de reset del servidor
        fetch('/api/chat/reset', { method: 'POST' });
        
        conversacionIniciada = false;
        historialMensajes = []; 

    }, 210000);
}

/* =========================
    🔥 FORMATEO BOT
========================= */
function formatearTextoBot(texto) {
    if (!texto) return '';

    return texto
        .replace(/\n/g, '<br>')
        .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
}

/* =========================
    💬 MENSAJE NORMAL
========================= */
function appendMessage(sender, text) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message', sender);

    const hora = obtenerHora();

    if (sender === 'bot') {
        msgDiv.innerHTML = `
            ${formatearTextoBot(text)}
            <div class="hora">${hora}</div>
        `;

        mostrarNotificacion(text);

    } else {
        msgDiv.innerHTML = `
            ${text}
            <div class="hora">${hora}</div>
        `;
    }

    chatBox.appendChild(msgDiv);
    scrollToBottom();

    // No reiniciar timers si es un mensaje de sistema de inactividad
    if (!text.includes("¿Sigues ahí?") &&
        !text.includes("No hemos tenido respuesta")) {
        iniciarTemporizadores();
    }
}

/* =========================
    🔥 NUEVO EFECTO ESCRITURA BOT
========================= */
function appendMessageTypingEffect(textoCompleto, velocidad = 14) {
    return new Promise((resolve) => {

        const msgDiv = document.createElement('div');
        msgDiv.classList.add('message', 'bot');

        const contenido = document.createElement('div');
        const horaDiv = document.createElement('div');
        horaDiv.className = "hora";
        horaDiv.innerText = obtenerHora();

        msgDiv.appendChild(contenido);
        msgDiv.appendChild(horaDiv);

        chatBox.appendChild(msgDiv);
        scrollToBottom();

        mostrarNotificacion(textoCompleto);

        const texto = formatearTextoBot(textoCompleto);

        let i = 0;

        function escribir() {
            if (i < texto.length) {
                contenido.innerHTML = texto.substring(0, i + 1);
                i++;
                scrollToBottom();
                setTimeout(escribir, velocidad);
            } else {
                iniciarTemporizadores();
                resolve();
            }
        }

        escribir();
    });
}

/* 🆕 NUEVO: mostrar imagen en burbuja */
function appendImage(sender, imageUrl) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message', sender);

    const hora = obtenerHora();

    msgDiv.innerHTML = `
        <img src="${imageUrl}" class="img-chat">
        <div class="hora">${hora}</div>
    `;

    chatBox.appendChild(msgDiv);
    scrollToBottom();
}

/* =========================
    🔥 3. OPCIONES
========================= */
function renderOptions(options) {
    if (!options || options.length === 0) return;

    const menusViejos = document.querySelectorAll('.menu-opciones-container');
    menusViejos.forEach(m => m.remove());

    const optionsContainer = document.createElement('div');
    optionsContainer.classList.add('menu-opciones-container');

    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.classList.add('btn-opcion-upn');
        btn.innerHTML = opt.texto;

        btn.onclick = () => {
            conversacionIniciada = true;
            appendMessage('user', opt.texto);
            sendMessage(null, opt.id, opt.texto); 
            optionsContainer.remove();
        };

        optionsContainer.appendChild(btn);
    });

    chatBox.appendChild(optionsContainer);
    scrollToBottom();
}

/* =========================
    🔥 4. ENVÍO UNIFICADO
========================= */
async function sendMessage(text, opcionId = null, textoOpcion = null) {

    if (enviando) return;
    if (!text && !opcionId && !archivoPendiente) return;

    enviando = true;
    const formData = new FormData();

    let preguntaFinal = text || textoOpcion || "Analiza la imagen adjunta";

    if (opcionId) {
        formData.append('opcionId', opcionId);
    } else if (text) {
        const textoMin = text.toLowerCase();
        const temasClave = ['pagos', 'bachiller', 'titulo', 'maestria', 'inasistencias', 'procesos', 'cursos', 'malla', 'sunedu', 'reclamo'];
        const temaDetectado = temasClave.find(tema => textoMin.includes(tema));
        
        if (temaDetectado) {
            preguntaFinal = `Responde brevemente sobre ${temaDetectado}: ${text}`;
        }
        if (textoMin.includes("menú") || textoMin.includes("regresar")) {
            preguntaFinal = "menú";
            historialMensajes = []; 
        }
    }

    formData.append('pregunta', preguntaFinal);
    formData.append('historial', JSON.stringify(historialMensajes));

    if (archivoPendiente) {
        formData.append('file', archivoPendiente);
    }

    mostrarTyping();

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        quitarTyping();
        archivoPendiente = null;

        if (data.respuesta) {
            const respuestaLower = data.respuesta.toLowerCase();
            const requiereTextoDirecto =
                respuestaLower.includes("ingresa tu código") ||
                respuestaLower.includes("código de alumno") ||
                respuestaLower.includes("código correcto de prueba") ||
                respuestaLower.includes("código no válido") ||
                respuestaLower.includes("para iniciar la demostración");

            if (requiereTextoDirecto) {
                appendMessage('bot', data.respuesta);
                conversacionIniciada = false;
                historialMensajes = []; 
            } else {
                conversacionIniciada = true;
                
                historialMensajes.push({ role: "user", content: preguntaFinal });
                historialMensajes.push({ role: "assistant", content: data.respuesta });

                if (historialMensajes.length > 6) {
                    historialMensajes = historialMensajes.slice(-6);
                }

                await appendMessageTypingEffect(data.respuesta, 10);
            }
        }

        if (data.opciones && data.opciones.length > 0) {
            renderOptions(data.opciones);
        }

    } catch (error) {
        quitarTyping();
        appendMessage('bot', "⚠️ Error de conexión con el servidor.");
        console.error('Error:', error);
    }

    enviando = false;
}

/* =========================
    🔥 5. EVENTOS
========================= */
sendBtn.onclick = () => {
    const text = userInput.value.trim();
    if (text || archivoPendiente) {
        if (text) appendMessage('user', text);
        sendMessage(text);
        userInput.value = '';
    }
};

userInput.onkeypress = (e) => {
    if (e.key === 'Enter') sendBtn.click();
};

if (imageBtn) {
    imageBtn.onclick = () => imageInput.click();
}

/* 🆕 Captura de imagen */
if (imageInput) {
    imageInput.addEventListener('change', () => {
        const file = imageInput.files[0];
        if (!file) return;

        if (!conversacionIniciada) {
            appendMessage('bot', MENSAJE_BIENVENIDA);
            imageInput.value = "";
            return;
        }

        archivoPendiente = file;
        const reader = new FileReader();

        reader.onload = (e) => {
            appendImage('user', e.target.result);
            requestAnimationFrame(() => {
                appendMessage(
                    'bot',
                    "He recibido tu imagen. 😊 Escribe tu consulta para analizarla juntos o presiona <b>Enviar</b>."
                );
            });
        };

        reader.readAsDataURL(file);
        imageInput.value = "";
    });
}

/* =========================
    🔥 MENSAJE INICIAL
========================= */
window.addEventListener("load", () => {
    solicitarPermisoNotificaciones();
    requestAnimationFrame(() => {
        appendMessage('bot', MENSAJE_BIENVENIDA);
    });
});