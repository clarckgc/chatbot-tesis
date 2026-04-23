const chatBox = document.getElementById('chat-box');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');

let avisoTimer;
let cierreTimer;
let conversacionIniciada = false;

// --- 1. GESTIÓN DE INACTIVIDAD ---
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

// --- 🔥 FUNCIÓN PARA FORMATEAR TEXTO DEL BOT ---
function formatearTextoBot(texto) {
    if (!texto) return '';

    return texto
        .replace(/\n/g, '<br>') // saltos de línea
        .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>'); // negritas tipo markdown
}

// --- 2. RENDERIZAR MENSAJES ---
function appendMessage(sender, text) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message', sender);

    if (sender === 'bot') {
        // 🔥 CLAVE: permite HTML + formatea texto
        msgDiv.innerHTML = formatearTextoBot(text);
    } else {
        // 🔒 seguridad usuario
        msgDiv.textContent = text;
    }

    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
    
    if (!text.includes("¿Sigues ahí?") && !text.includes("No hemos tenido respuesta")) {
        iniciarTemporizadores();
    }
}

// --- 3. RENDERIZAR BOTONES ---
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
    chatBox.scrollTop = chatBox.scrollHeight;
}

// --- 4. ENVÍO DE DATOS ---
async function sendMessage(text, opcionId = null) {
    if (!text && !opcionId) return;

    conversacionIniciada = true;

    let pregunta = text;
    if (text && (text.toLowerCase().includes("menú") || text.toLowerCase().includes("regresar"))) {
        pregunta = "menú"; 
    }

    const payload = opcionId ? { opcionId } : { pregunta };

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        
        if (data.respuesta) {
            appendMessage('bot', data.respuesta);
        }

        if (data.opciones && data.opciones.length > 0) {
            renderOptions(data.opciones);
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

// --- 5. EVENTOS ---
sendBtn.onclick = () => {
    const text = userInput.value.trim();
    if (text) {
        conversacionIniciada = true;
        appendMessage('user', text);
        sendMessage(text);
        userInput.value = '';
    }
};

userInput.onkeypress = (e) => {
    if (e.key === 'Enter') sendBtn.click();
};