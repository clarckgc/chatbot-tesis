const chatBox = document.getElementById('chat-box');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const chat = document.getElementById('chat');
const badge = document.getElementById('chat-badge');

let avisoTimer;
let cierreTimer;
let conversacionIniciada = false;
let enviando = false;
let mensajesNoLeidos = 0;

/* =========================
   🔔 NOTIFICACIONES
========================= */

// 🔥 pedir permiso
function solicitarPermisoNotificaciones() {
    if ("Notification" in window && Notification.permission !== "granted") {
        Notification.requestPermission();
    }
}

// 🔥 mostrar notificación
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
   🔴 CONTADOR NO LEÍDOS
========================= */
function incrementarNoLeidos() {
    if (!chat.classList.contains("active")) {
        mensajesNoLeidos++;
        badge.textContent = mensajesNoLeidos;
        badge.style.display = "flex";
    }
}

function resetearNoLeidos() {
    mensajesNoLeidos = 0;
    badge.style.display = "none";
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
        const URL_FORM = "https://docs.google.com/forms/u/0/d/e/1FAIpQLSdOCCsw20B4grhmn3ggTSVkU0K8Uugg08FRFnEY5Pb5DioFGQ/formResponse?pli=1";

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
   🔥 2. MENSAJES
========================= */
function appendMessage(sender, text) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message', sender);

    if (sender === 'bot') {
        msgDiv.innerHTML = formatearTextoBot(text);

        // 🔔 notificación
        mostrarNotificacion(text);

        // 🔴 contador
        incrementarNoLeidos();

    } else {
        msgDiv.textContent = text;
    }

    chatBox.appendChild(msgDiv);
    scrollToBottom();
    
    if (!text.includes("¿Sigues ahí?") && !text.includes("No hemos tenido respuesta")) {
        iniciarTemporizadores();
    }
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
   🔥 4. ENVÍO
========================= */
async function sendMessage(text, opcionId = null) {

    if (enviando) return;
    if (!text && !opcionId) return;

    enviando = true;
    conversacionIniciada = true;

    let pregunta = text;
    if (text && (text.toLowerCase().includes("menú") || text.toLowerCase().includes("regresar"))) {
        pregunta = "menú"; 
    }

    const payload = opcionId ? { opcionId } : { pregunta };

    mostrarTyping();

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();

        quitarTyping();

        setTimeout(() => {

            if (data.respuesta) {

                if (
                    data.respuesta.includes("Ingresa tu código") ||
                    data.respuesta.toLowerCase().includes("código de alumno")
                ) {
                    appendMessage('bot', MENSAJE_BIENVENIDA);
                } else {
                    appendMessage('bot', data.respuesta);
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

    if (text) {
        appendMessage('user', text);
        sendMessage(text);
        userInput.value = '';
    }
};

userInput.onkeypress = (e) => {
    if (e.key === 'Enter') sendBtn.click();
};

// 🔥 resetear contador al abrir chat
document.getElementById("chat-toggle").addEventListener("click", () => {
    if (!chat.classList.contains("active")) return;
    resetearNoLeidos();
});

/* =========================
   🔥 MENSAJE INICIAL
========================= */
window.addEventListener("load", () => {
    solicitarPermisoNotificaciones();

    setTimeout(() => {
        appendMessage('bot', MENSAJE_BIENVENIDA);
    }, 500);
});