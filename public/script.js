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
let archivoPendiente = null; // 🔥 Almacena la imagen antes de enviarla

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
        behavior: "smooth"
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
    🔥 1. INACTIVIDAD
========================= */
function iniciarTemporizadores() {
    if (!conversacionIniciada) return;

    clearTimeout(avisoTimer);
    clearTimeout(cierreTimer);

    avisoTimer = setTimeout(() => {
        appendMessage('bot', "¿Sigues ahí? 👀 Estoy atento para continuar ayudándote.");
    }, 30000); 

    cierreTimer = setTimeout(() => {
        const URL_FORM = "https://docs.google.com/forms/d/e/1FAIpQLSdwz-LSX_jKUlEg9MVv9rvKYVZhTsKQop709vmc1PjH5hVytQ/viewform?usp=dialog";

        appendMessage('bot', `
            No hemos tenido respuesta para continuar con la comunicación.<br><br>
            Cuando quieras retomar la conversación, aquí estaremos para ayudarte. 😊<br><br>
            
            📝 Antes de irte, tu opinión es muy importante:<br><br>
            👉 <a href="${URL_FORM}" target="_blank">Evaluar el Chatbot</a>
        `);

        fetch('/api/chat/reset', { method: 'POST' });
        conversacionIniciada = false;

    }, 60000);
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
    💬 2. MENSAJES CON HORA
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
    
    if (!text.includes("¿Sigues ahí?") && !text.includes("No hemos tenido respuesta")) {
        iniciarTemporizadores();
    }
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
            sendMessage(null, opt.id);
            optionsContainer.remove(); 
        };

        optionsContainer.appendChild(btn);
    });

    chatBox.appendChild(optionsContainer);
    scrollToBottom();
}

/* =========================
    🔥 4. ENVÍO UNIFICADO (TEXTO + IMAGEN)
========================= */
async function sendMessage(text, opcionId = null) {

    if (enviando) return;
    if (!text && !opcionId && !archivoPendiente) return;

    enviando = true;

    const formData = new FormData();
    
    if (opcionId) {
        formData.append('opcionId', opcionId);
    } else {
        let pregunta = text || "Analiza la imagen adjunta"; 
        if (text && (text.toLowerCase().includes("menú") || text.toLowerCase().includes("regresar"))) {
            pregunta = "menú"; 
        }
        formData.append('pregunta', pregunta);
    }

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

        // Limpiamos el archivo pendiente solo después de que se envió con éxito
        archivoPendiente = null;

        setTimeout(() => {
        if (data.respuesta) {

                const respuestaLower = data.respuesta.toLowerCase();

                // 🔥 MENSAJES DONDE AÚN NO ESTÁ AUTENTICADO
                if (
                    respuestaLower.includes("ingresa tu código") ||
                    respuestaLower.includes("código de alumno") ||
                    respuestaLower.includes("código correcto de prueba") ||
                    respuestaLower.includes("código no válido") ||
                    respuestaLower.includes("para iniciar la demostración")
                ) {

                    appendMessage('bot', data.respuesta);
                    conversacionIniciada = false;

                } else {

                    // 🔥 RESPUESTA NORMAL (YA AUTENTICADO)
                    appendMessage('bot', data.respuesta);
                    conversacionIniciada = true;
                    iniciarTemporizadores();
                }
            }

            if (data.opciones && data.opciones.length > 0) {
                renderOptions(data.opciones);
            }

        }, 400);

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

/* 🆕 Captura de imagen: BLOQUEA SI NO ESTÁ AUTENTICADO */
if (imageInput) {
    imageInput.addEventListener('change', () => {
        const file = imageInput.files[0];
        if (!file) return;

        // 🔥 CRÍTICO: Si no hay conversación iniciada (autenticado), bloqueamos.
        if (!conversacionIniciada) {
            appendMessage('bot', MENSAJE_BIENVENIDA);
            imageInput.value = ""; 
            return;
        }

        archivoPendiente = file; 

        const reader = new FileReader();
        reader.onload = (e) => {
            // 1. Mostrar la imagen en el chat
            appendImage('user', e.target.result);

            // 2. Solo confirmación, espera a que el usuario escriba o de click en enviar
            setTimeout(() => {
                appendMessage('bot', "He recibido tu imagen. 😊 Escribe tu consulta para analizarla juntos o presiona <b>Enviar</b>.");
            }, 500);
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

    setTimeout(() => {
        appendMessage('bot', MENSAJE_BIENVENIDA);
    }, 500);
});