// =================================================================================
// GUÍA DEL DESARROLLADOR (Pedriño)
// ---------------------------------------------------------------------------------
// Este archivo es el cerebro de toda la interactividad de tu sitio web.
// Está dividido en dos grandes secciones:
// 1. LÓGICA DEL CHATBOT: Todo lo relacionado con el asistente virtual Alex.
// 2. LÓGICA DEL SITIO WEB: Controla el slider, el menú, la galería, etc.
//
// He añadido comentarios detallados en cada parte para que no solo sepas
// QUÉ hace el código, sino POR QUÉ y CÓMO lo hace. ¡Vamos a explorarlo!
// =================================================================================


// =================================================================================
// SECCIÓN 1: IMPLEMENTACIÓN DEL CHATBOT
// =================================================================================
// Esta sección maneja todo el ciclo de vida del chatbot, desde su renderizado
// hasta la comunicación segura con el backend (Cloudflare Worker).
// ---------------------------------------------------------------------------------

// --- CONFIGURACIÓN PRINCIPAL DEL CHATBOT ---
// -------------------------------------------
// URL de tu Cloudflare Worker. Esta es la única "puerta" que el chatbot usa para
// hablar con la inteligencia artificial de Gemini de forma segura.
const WORKER_URL = "https://chat.corporativoimperdellanta.workers.dev";
// Clave para guardar el historial del chat en el navegador del usuario.
// Si cambias esto, todos los usuarios perderán su historial de chat actual.
const CHAT_STATE_KEY = 'imperdellanta_chat_state';
// -------------------------------------------

const chatbotContainer = document.getElementById('chatbot-container');

// Verificamos que el contenedor del chatbot exista en el HTML antes de ejecutar nada.
if (chatbotContainer) {

    // --- GESTIÓN DEL ESTADO (STATE MANAGEMENT) ---
    // El "estado" es la memoria del chatbot en un momento dado. Incluye si la
    // ventana está abierta, el historial de mensajes y si está esperando una respuesta.

    // Estado inicial por defecto si no hay nada guardado.
    const defaultState = {
        isChatOpen: false, // El chat empieza cerrado.
        messages: [{
            role: "model", // El primer mensaje siempre es del asistente.
            parts: [{ text: "¡Hola! Soy **Alex**, tu asistente virtual de Imperdellanta. Para darte una atención personalizada, **¿con quién tengo el gusto?**" }]
        }]
    };

    /**
     * Carga el estado del chat desde el localStorage del navegador.
     * localStorage es como una pequeña caja de almacenamiento que persiste
     * incluso si el usuario cierra la pestaña o recarga la página.
     * @returns {object} El estado del chat cargado o el estado por defecto.
     */
    const loadChatState = () => {
        try {
            const savedState = localStorage.getItem(CHAT_STATE_KEY);
            if (savedState) {
                const parsedState = JSON.parse(savedState);
                // Verificación de seguridad: nos aseguramos de que los datos guardados tengan el formato correcto.
                if (parsedState.messages && Array.isArray(parsedState.messages)) {
                    // Combinamos el estado por defecto con el guardado para asegurar consistencia.
                    return { ...defaultState, ...parsedState };
                }
            }
        } catch (error) {
            console.error("Error al cargar el estado del chat desde localStorage:", error);
            localStorage.removeItem(CHAT_STATE_KEY); // Si los datos están corruptos, los limpiamos.
        }
        return { ...defaultState }; // Si no hay nada o hay un error, devolvemos una copia del estado inicial.
    };

    // Inicializamos nuestras variables de estado. `let` porque cambiarán con el tiempo.
    let { isChatOpen, messages } = loadChatState();
    let isLoading = false; // `isLoading` siempre es falso al inicio, nunca se guarda.

    /**
     * Guarda el estado actual del chat en el localStorage.
     * Se llama cada vez que el usuario o el bot envían un mensaje.
     */
    const saveChatState = () => {
        try {
            const stateToSave = { isChatOpen, messages };
            localStorage.setItem(CHAT_STATE_KEY, JSON.stringify(stateToSave));
        } catch (error)
        {
            console.error("Error al guardar el estado del chat en localStorage:", error);
        }
    };


    // --- FUNCIONES AUXILIARES (HELPERS) ---
    // Pequeñas funciones que realizan tareas específicas y reutilizables.

    /**
     * Busca URLs en un texto y las convierte en enlaces HTML <a> clicables.
     * @param {string} text El texto a procesar.
     * @returns {string} El texto con las URLs convertidas en enlaces.
     */
    const linkify = (text) => {
        const urlRegex = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
        return text.replace(urlRegex, (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
    };
    
    /**
     * Procesa el texto crudo de la IA para convertirlo en HTML formateado.
     * Esta función es clave para la apariencia de los mensajes del bot.
     * Separa el contenido principal de los botones de acción.
     * @param {string} rawText El texto tal como llega del worker.
     * @returns {{mainContent: string, actionsHTML: string}} Un objeto con el HTML del contenido y el HTML de los botones.
     */
    const processMessageContent = (rawText) => {
        let text = rawText;
        // Expresión Regular (REGEX) para buscar nuestros códigos de botones personalizados.
        // Ej: [action_button:Texto del Botón] o [link_button_primary:Texto](url)
        const buttonRegex = /\[(action_button|link_button_resource|link_button_primary):([^\]]+?)\](?:\(([^)]+?)\))?/g;
        const buttons = [];
        let match;

        // Extraemos todos los botones y los guardamos en un array.
        while ((match = buttonRegex.exec(rawText)) !== null) {
            buttons.push({
                type: match[1], // Ej: 'action_button'
                text: match[2], // Ej: 'Ver productos'
                url: match[3] || null, // Ej: 'https://...'
                fullMatch: match[0] // El texto completo, ej: '[action_button:Ver productos]'
            });
        }

        // Limpiamos el texto principal, quitando los códigos de los botones.
        buttons.forEach(button => {
            text = text.replace(button.fullMatch, '');
        });

        // Proceso de formateo en 4 pasos:
        // 1. Convertir negritas de Markdown (**texto**) a etiquetas HTML <strong>.
        let processedText = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        
        // 2. Convertir enlaces de Markdown ([texto](url)) y URLs crudas a etiquetas <a>.
        const markdownLinks = {};
        let placeholderId = 0;
        processedText = processedText.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, (match, linkText, url) => {
            const placeholder = `__MARKDOWN_LINK_${placeholderId++}__`;
            markdownLinks[placeholder] = `<a href="${url}" target="_blank" rel="noopener noreferrer">${linkText}</a>`;
            return placeholder;
        });
        processedText = linkify(processedText);
        for (const placeholder in markdownLinks) {
            processedText = processedText.replace(placeholder, markdownLinks[placeholder]);
        }
        
        // 3. Convertir saltos de línea (\n) a etiquetas HTML <br> para que se muestren correctamente.
        const mainContent = processedText.replace(/\n/g, '<br>').trim();

        // 4. Generar el bloque de HTML para los botones de acción.
        let actionsHTML = '';
        if (buttons.length > 0) {
            const buttonsHTML = buttons.map(btn => {
                const boldedText = btn.text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                switch (btn.type) {
                    case 'action_button':
                        return `<button class="btn-chat-action secondary">${boldedText}</button>`;
                    case 'link_button_resource':
                        return `<a href="${btn.url}" target="_blank" rel="noopener noreferrer" class="btn-chat-action resource">${boldedText}</a>`;
                    case 'link_button_primary':
                        return `<a href="${btn.url}" target="_blank" rel="noopener noreferrer" class="btn-chat-action primary">${boldedText}</a>`;
                    default:
                        return '';
                }
            }).join('');
            actionsHTML = `<div class="message-actions">${buttonsHTML}</div>`;
        }

        return { mainContent, actionsHTML };
    };


    // --- FUNCIÓN DE RENDERIZADO (RENDER) ---
    // Esta es la función que "dibuja" la interfaz del chatbot en la pantalla.
    // Se llama cada vez que el estado cambia para reflejar las actualizaciones.
    const renderChatbot = () => {
        const displayMessages = messages.map(msg => ({
            sender: msg.role === 'user' ? 'user' : 'ai',
            text: msg.parts[0].text
        }));

        // Si `isLoading` es true, añadimos un mensaje temporal de "escribiendo...".
        if (isLoading) {
            displayMessages.push({ sender: 'loading', text: '...' });
        }
        
        // Usamos template literals (comillas ``) para construir el HTML de forma dinámica.
        chatbotContainer.innerHTML = `
            <button class="chatbot-fab" aria-label="Abrir chat de asistente virtual">
                <i class="fas fa-comment-dots"></i>
            </button>
            <div class="chat-window ${isChatOpen ? 'open' : ''}">
                <div class="chat-header">
                    <h3>Alex | Asistente Imperdellanta</h3>
                    <button class="close-chat-btn" aria-label="Cerrar chat">&times;</button>
                </div>
                <div class="chat-messages">
                    ${displayMessages.map(msg => {
                        let contentHTML;
                        if (msg.sender === 'loading') {
                            contentHTML = `<div class="typing-indicator"><span></span><span></span><span></span></div>`;
                        } else {
                            const { mainContent, actionsHTML } = processMessageContent(msg.text);
                            contentHTML = `${mainContent}${actionsHTML}`;
                        }

                        return `
                        <div class="message ${msg.sender}">
                            <div class="message-content">
                                ${contentHTML}
                            </div>
                        </div>
                        `;
                    }).join('')}
                </div>
                <form class="chat-input-area">
                    <input type="text" id="chat-input" placeholder="Escribe tu pregunta..." ${isLoading ? 'disabled' : ''} autocomplete="off">
                    <button type="submit" id="send-btn" ${isLoading ? 'disabled' : ''}>
                        <i class="fas fa-paper-plane"></i>
                    </button>
                </form>
            </div>
        `;
        
        // --- POST-RENDERIZADO Y ASIGNACIÓN DE EVENTOS ---
        // Después de dibujar el HTML, necesitamos darle vida asignando los eventos.
        const messagesContainer = chatbotContainer.querySelector('.chat-messages');
        if (messagesContainer) {
            // Hacemos scroll automático al último mensaje para que siempre esté visible.
            const lastMessage = messagesContainer.querySelector('.message:last-child');
            if (lastMessage) {
                messagesContainer.scrollTo({
                    top: lastMessage.offsetTop,
                    behavior: 'smooth'
                });
            }
            // Delegación de eventos: un solo listener en el contenedor para todos los botones de acción.
            messagesContainer.addEventListener('click', (e) => {
                if (e.target.matches('button.btn-chat-action.secondary')) {
                    const buttonText = e.target.textContent;
                    sendMessage(buttonText); // Al hacer clic, enviamos el texto del botón como un mensaje.
                }
            });
        }

        // Asignamos los eventos a los botones principales (abrir, cerrar, enviar).
        chatbotContainer.querySelector('.chatbot-fab')?.addEventListener('click', toggleChat);
        chatbotContainer.querySelector('.close-chat-btn')?.addEventListener('click', toggleChat);
        chatbotContainer.querySelector('.chat-input-area')?.addEventListener('submit', handleFormSubmit);
    };

    // --- LÓGICA PRINCIPAL (CORE LOGIC) ---
    /**
     * Envía un mensaje al backend y maneja la respuesta de la IA.
     * Esta es una función asíncrona (`async`), lo que significa que puede
     * esperar (`await`) a que terminen operaciones largas como las llamadas de red.
     * @param {string} userText El mensaje escrito por el usuario.
     */
    const sendMessage = async (userText) => {
        if (!userText || isLoading) return; // No hacer nada si no hay texto o ya estamos esperando una respuesta.

        // 1. Actualización Optimista de la UI:
        messages.push({ role: 'user', parts: [{ text: userText }] });
        saveChatState(); // Guardamos el nuevo mensaje del usuario.
        isLoading = true;
        renderChatbot(); // Mostramos inmediatamente el mensaje del usuario y el indicador de "escribiendo...".

        // 2. Llamada a la Red (Backend):
        try {
            // `fetch` es la forma moderna de hacer peticiones de red en JavaScript.
            const response = await fetch(WORKER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ history: messages }), // Enviamos todo el historial.
            });

            const data = await response.json();

            // 3. Manejo de la Respuesta:
            if (!response.ok) {
                // Si la respuesta no fue exitosa (ej. error 429 - Cuota Excedida).
                if (data.error === 'quota_exceeded') {
                    const friendlyMessage = "Nuestro asistente se ha tomado un descanso, intenta de nuevo más tarde o contacta por whatsapp al https://wa.me/5212228496995?text=Hola!%20Necesito%20asistencia%20con%20Imperdellanta%20codigo%20500";
                    messages.push({ role: 'model', parts: [{ text: friendlyMessage }] });
                } else {
                    // Para otros errores del worker.
                    messages.push({ role: 'model', parts: [{ text: `Lo siento, ocurrió un problema de comunicación. Por favor, intenta de nuevo más tarde.` }] });
                    console.error("Error del Worker:", data.error || response.statusText);
                }
            } else {
                // Si la respuesta fue exitosa.
                const aiResponseText = data.reply;
                if (!aiResponseText) {
                    throw new Error("Respuesta vacía del servidor.");
                }
                messages.push({ role: 'model', parts: [{ text: aiResponseText }] });
            }

        } catch (error) {
            // Este bloque `catch` se activa si hay un error de red (ej. sin conexión a internet)
            // o si la respuesta del servidor no es un JSON válido.
            console.error("Error de Red o de análisis JSON:", error);
            const networkErrorMessage = "Lo siento, ocurrió un problema de comunicación. Por favor, revisa tu conexión a internet e intenta de nuevo.";
            messages.push({ role: 'model', parts: [{ text: networkErrorMessage }] });
        } finally {
            // 4. Limpieza y Actualización Final:
            // El bloque `finally` se ejecuta SIEMPRE, tanto si hubo éxito como si hubo error.
            isLoading = false; // Dejamos de cargar.
            saveChatState(); // Guardamos la respuesta final del bot (o el mensaje de error).
            renderChatbot(); // Volvemos a dibujar el chat con la respuesta final.

            // Devolvemos el foco al campo de texto para una mejor experiencia de usuario.
            const finalInput = chatbotContainer.querySelector('#chat-input');
            if (finalInput) {
                const isMobile = window.innerWidth <= 768;
                if (isMobile) {
                    finalInput.blur(); // En móvil, es mejor ocultar el teclado.
                } else {
                    finalInput.focus();
                }
            }
        }
    };

    // --- MANEJADORES DE EVENTOS (EVENT HANDLERS) ---
    // Son las funciones que se activan por las acciones del usuario.

    /**
     * Abre o cierra la ventana del chat.
     */
    const toggleChat = () => {
        isChatOpen = !isChatOpen;
        saveChatState();
        renderChatbot();
        // Si acabamos de abrir el chat, ponemos el foco en el input después de la animación.
        if(isChatOpen){
            setTimeout(() => chatbotContainer.querySelector('#chat-input')?.focus(), 300);
        }
    };

    /**
     * Maneja el envío del formulario del chat.
     * @param {Event} e El objeto del evento submit.
     */
    const handleFormSubmit = async (e) => {
        e.preventDefault(); // Prevenimos que la página se recargue al enviar el formulario.
        const input = chatbotContainer.querySelector('#chat-input');
        const userText = input.value.trim();
        sendMessage(userText);
        // El input se limpia solo en el siguiente `renderChatbot` porque su valor no se guarda en el estado.
    };
    
    // --- INICIO DE LA APLICACIÓN ---
    // La primera vez que se carga la página, llamamos a `renderChatbot` para mostrar el estado inicial.
    renderChatbot();
}


// =================================================================================
// SECCIÓN 2: LÓGICA ORIGINAL DEL SITIO WEB
// =================================================================================
// Todo lo que está aquí adentro se ejecutará solo cuando el HTML completo
// haya sido cargado y procesado por el navegador. Es una buena práctica para
// evitar errores de "elemento no encontrado".
// ---------------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {

    // --- Lógica del Menú Hamburguesa (Móvil) ---
    const menuToggle = document.querySelector('.menu-toggle');
    const mainNav = document.querySelector('.main-nav');

    if (menuToggle && mainNav) {
        menuToggle.addEventListener('click', function() {
            // `toggle` añade la clase si no está, y la quita si ya está.
            mainNav.classList.toggle('active');
            document.body.classList.toggle('menu-open'); // `menu-open` bloquea el scroll del fondo.
        });
    }

    // --- Lógica del Slider de Héroe ---
    const slider = document.querySelector('.hero-slider');
    if (slider) {
        const items = slider.querySelectorAll('.slider-item');
        const prevBtn = slider.querySelector('.slider-prev');
        const nextBtn = slider.querySelector('.slider-next');
        const dotsContainer = slider.querySelector('.slider-dots');

        if (items.length > 0 && prevBtn && nextBtn && dotsContainer) {
            let current = 0; // Índice del slide actual.
            let slideInterval; // Variable para guardar el temporizador del autoplay.
            let resumeTimeout; // Temporizador para reanudar el autoplay tras una interacción.
            const AUTOPLAY_INTERVAL = 5000; // 5 segundos. ¡Modifica este valor para cambiar la velocidad!
            const INTERACTION_PAUSE_DURATION = 8000; // 8 segundos de pausa tras un clic.

            // Creación dinámica de los puntos de navegación.
            dotsContainer.innerHTML = '';
            items.forEach((_, index) => {
                const dot = document.createElement('span');
                dot.classList.add('slider-dot');
                if (index === 0) dot.classList.add('active');
                dot.addEventListener('click', () => {
                    goToSlide(index);
                    pauseAndResume(); // Pausamos el autoplay si el usuario interactúa.
                });
                dotsContainer.appendChild(dot);
            });

            const dots = dotsContainer.querySelectorAll('.slider-dot');

            /**
             * Cambia al slide especificado por su índice.
             * @param {number} slideIndex El índice del slide al que ir.
             */
            const goToSlide = (slideIndex) => {
                items[current].classList.remove('active');
                dots[current].classList.remove('active');
                // El operador de módulo (%) asegura que el índice siempre esté dentro del rango válido.
                current = (slideIndex + items.length) % items.length;
                items[current].classList.add('active');
                dots[current].classList.add('active');
            };

            const nextSlide = () => goToSlide(current + 1);
            const prevSlide = () => goToSlide(current - 1);
            
            // Detiene cualquier temporizador activo.
            const stopSlider = () => {
                clearInterval(slideInterval);
                clearTimeout(resumeTimeout);
            };

            // Inicia el autoplay.
            const startSlider = () => {
                stopSlider(); // Previene múltiples intervalos corriendo a la vez.
                slideInterval = setInterval(nextSlide, AUTOPLAY_INTERVAL);
            };
            
            // Pausa el autoplay y lo reanuda después de un tiempo.
            const pauseAndResume = () => {
                stopSlider();
                resumeTimeout = setTimeout(startSlider, INTERACTION_PAUSE_DURATION);
            };

            nextBtn.addEventListener('click', () => {
                nextSlide();
                pauseAndResume();
            });

            prevBtn.addEventListener('click', () => {
                prevSlide();
                pauseAndResume();
            });

            // Optimización de rendimiento: Intersection Observer.
            // Esta API del navegador es mucho más eficiente que un evento de scroll.
            // Solo ejecuta el código cuando el slider entra o sale de la vista.
            const observer = new IntersectionObserver((entries) => {
                const entry = entries[0];
                if (entry.isIntersecting) {
                    startSlider(); // Si el slider es visible, inicia el autoplay.
                } else {
                    stopSlider(); // Si no es visible, lo detiene para ahorrar recursos.
                }
            }, { threshold: 0.5 }); // Se activa cuando el 50% del slider es visible.

            observer.observe(slider);
        }
    }

    // --- Actualización automática del año en el copyright del footer ---
    const copyrightYearEl = document.getElementById('copyright-year');
    if(copyrightYearEl) {
      copyrightYearEl.textContent = new Date().getFullYear().toString();
    }

    // --- Lógica del Header Inteligente (Sticky Header) ---
    const mainHeader = document.querySelector('.main-header');
    if (mainHeader) {
        // Calculamos la altura a la que el header debe volverse "pegajoso".
        const triggerHeight = mainHeader.offsetTop + mainHeader.offsetHeight;

        window.addEventListener('scroll', function() {
            if (window.scrollY > triggerHeight) {
                // Cuando el usuario ha hecho suficiente scroll, añadimos una clase al body.
                // El CSS se encarga del resto (fijar el header, mostrar el logo pequeño, etc.).
                document.body.classList.add('header-is-sticky');
            } else {
                document.body.classList.remove('header-is-sticky');
            }
        });
    }

    // --- Lógica de la Galería de Imágenes y Modal (Lightbox) ---
    const galleryGrid = document.querySelector('.gallery-grid');
    const modal = document.getElementById('gallery-modal');

    if (galleryGrid && modal) {
        // Referencias a los elementos del modal.
        const modalImage = document.getElementById('modal-image');
        const modalCounter = document.getElementById('modal-counter');
        const closeModalBtn = modal.querySelector('.modal-close');
        const prevBtn = modal.querySelector('.modal-prev');
        const nextBtn = modal.querySelector('.modal-next');
        
        const IMAGE_COUNT = 12; // ¡Modifica este número si añades o quitas imágenes en tus assets!
        const images = [];
        let currentIndex = 0;

        // 1. Poblamos la galería dinámicamente.
        for (let i = 1; i <= IMAGE_COUNT; i++) {
            const imageUrl = `https://assets-web-27t.pages.dev/impermeabilizacion_imperdellanta_by_pedriño_${i}`;
            images.push(imageUrl);

            const thumbnail = document.createElement('div');
            thumbnail.className = 'gallery-thumbnail';
            thumbnail.dataset.index = i - 1; // Guardamos el índice para saber qué imagen abrir.
            
            const img = document.createElement('img');
            img.src = imageUrl;
            img.alt = `Proyecto de impermeabilización Imperdellanta - Antes y Después ${i}`;
            // `loading="lazy"` es una optimización clave: las imágenes solo se cargan cuando están a punto de ser visibles.
            img.loading = 'lazy';
            img.decoding = 'async'; // Ayuda al navegador a procesar imágenes de forma más eficiente.

            thumbnail.appendChild(img);
            galleryGrid.appendChild(thumbnail);
        }

        // 2. Funciones para controlar el modal.
        const showImage = (index) => {
            if (index < 0 || index >= images.length) return;
            currentIndex = index;
            modalImage.src = images[currentIndex];
            modalCounter.textContent = `${currentIndex + 1} / ${images.length}`;
        };

        const openModal = (index) => {
            modal.classList.add('show'); // Hace que el modal exista en el DOM (display: flex).
            setTimeout(() => { // Un pequeño retraso para permitir que la transición de CSS se active.
                modal.classList.add('visible'); // Activa la animación de opacidad.
                document.body.style.overflow = 'hidden'; // Bloquea el scroll del fondo.
            }, 10);
            showImage(index);
        };

        const closeModal = () => {
            modal.classList.remove('visible');
            setTimeout(() => { // Esperamos a que termine la animación de opacidad antes de ocultarlo.
                modal.classList.remove('show');
                document.body.style.overflow = ''; // Desbloquea el scroll.
            }, 300);
        };
        
        const nextImage = () => showImage((currentIndex + 1) % images.length);
        const prevImage = () => showImage((currentIndex - 1 + images.length) % images.length);

        // 3. Asignación de Eventos.
        // Clic en una miniatura para abrir el modal.
        galleryGrid.addEventListener('click', (e) => {
            const thumbnail = e.target.closest('.gallery-thumbnail');
            if (thumbnail) {
                openModal(parseInt(thumbnail.dataset.index, 10));
            }
        });

        // Eventos para cerrar el modal.
        closeModalBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal(); // Cerrar al hacer clic en el fondo oscuro.
        });
        
        // Eventos para las flechas de navegación.
        nextBtn.addEventListener('click', nextImage);
        prevBtn.addEventListener('click', prevImage);
        
        // Navegación con el teclado (flechas y tecla Escape).
        document.addEventListener('keydown', (e) => {
            if (modal.classList.contains('visible')) {
                if (e.key === 'ArrowRight') nextImage();
                if (e.key === 'ArrowLeft') prevImage();
                if (e.key === 'Escape') closeModal();
            }
        });

        // Navegación por deslizamiento (swipe) para móviles.
        let touchstartX = 0;
        let touchendX = 0;

        modal.addEventListener('touchstart', (e) => {
            touchstartX = e.changedTouches[0].screenX;
        }, { passive: true }); // `passive: true` mejora el rendimiento del scroll en móviles.

        modal.addEventListener('touchend', (e) => {
            touchendX = e.changedTouches[0].screenX;
            if (touchendX < touchstartX - 50) nextImage(); // Swipe a la izquierda.
            if (touchendX > touchstartX + 50) prevImage(); // Swipe a la derecha.
        }, { passive: true }); 
    }

    // --- Conexión del Botón del Slider con el Chatbot ---
    const openChatBtn = document.querySelector('.btn-open-chat');
    const chatbotFab = document.querySelector('.chatbot-fab');

    if (openChatBtn && chatbotFab) {
        // Cuando se hace clic en el botón "Chat Asistente 24/7" del slider...
        openChatBtn.addEventListener('click', (e) => {
            e.preventDefault();
            // ...simulamos un clic en el botón flotante principal del chat para abrirlo.
            // Esto mantiene la lógica de apertura del chat en un solo lugar.
            chatbotFab.click();
        });
    }

});
