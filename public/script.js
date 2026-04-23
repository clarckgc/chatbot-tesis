const chatBox = document.getElementById('chat-box');
const input = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');

function agregarMensaje(texto, tipo) {
    const div = document.createElement('div');
    div.classList.add('message', tipo);
    div.innerHTML = texto;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

async function enviarMensaje(opcionId = null) {
    const texto = input.value.trim();

    if (!texto && !opcionId) return;

    if (texto) {
        agregarMensaje(texto, 'user');
    }

    input.value = '';

    try {
        const res = await fetch('/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                pregunta: texto,
                opcionId: opcionId
            })
        });

        const data = await res.json();

        agregarMensaje(data.respuesta, 'bot');

        // 🔥 Renderizar opciones si existen
        if (data.opciones) {
            const contenedor = document.createElement('div');
            contenedor.classList.add('menu-opciones-container');

            data.opciones.forEach(op => {
                const btn = document.createElement('button');
                btn.classList.add('btn-opcion-upn');
                btn.textContent = op.texto;

                btn.onclick = () => enviarMensaje(op.id);

                contenedor.appendChild(btn);
            });

            chatBox.appendChild(contenedor);
            chatBox.scrollTop = chatBox.scrollHeight;
        }

    } catch (error) {
        agregarMensaje("Error al conectar con el servidor.", 'bot');
    }
}

// 🔥 CLICK BOTÓN
sendBtn.addEventListener('click', () => enviarMensaje());

// 🔥 ENTER
input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        enviarMensaje();
    }
});