// =================================================================================
// CHATBOT IMPLEMENTATION (SECURE PROXY VIA CLOUDFLARE WORKER)
// =================================================================================

// --- CONFIGURATION ---
// ---------------------
// URL de tu Cloudflare Worker. Esta es la dirección que actúa como intermediario seguro.
const WORKER_URL = "https://chat.corporativoimperdellanta.workers.dev";
const CHAT_STATE_KEY = 'imperdellanta_chat_state';
// ---------------------

const chatbotContainer = document.getElementById('chatbot-container');

if (chatbotContainer) {
    // --- STATE MANAGEMENT ---
    const defaultState = {
        isChatOpen: false,
        messages: [{
            role: "model",
            parts: [{ text: "¡Hola! Soy **Alex**, tu asistente virtual de Imperdellanta. Para darte una atención personalizada, **¿con quién tengo el gusto?**" }]
        }]
    };

    const loadChatState = () => {
        try {
            const savedState = localStorage.getItem(CHAT_STATE_KEY);
            if (savedState) {
                const parsedState = JSON.parse(savedState);
                if (parsedState.messages && Array.isArray(parsedState.messages)) {
                    // Start with defaults, override with saved
                    return { ...defaultState, ...parsedState };
                }
            }
        } catch (error) {
            console.error("Error al cargar el estado del chat desde localStorage:", error);
            localStorage.removeItem(CHAT_STATE_KEY); // Clear corrupted data
        }
        return { ...defaultState }; // Return a fresh copy
    };

    let { isChatOpen, messages } = loadChatState();
    let isLoading = false; // isLoading is always false on initial load

    const saveChatState = () => {
        try {
            const stateToSave = { isChatOpen, messages };
            localStorage.setItem(CHAT_STATE_KEY, JSON.stringify(stateToSave));
        } catch (error) {
            console.error("Error al guardar el estado del chat en localStorage:", error);
        }
    };


    // --- HELPERS ---
    /**
     * Finds URLs in a string and wraps them in an anchor tag.
     * @param {string} text The text to parse.
     * @returns {string} The text with HTML links.
     */
    const linkify = (text) => {
        const urlRegex = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
        // Plain text is received, so no need to escape HTML before this.
        return text.replace(urlRegex, (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
    };
    
    /**
     * Parses the AI's raw text to separate content, action buttons, and link buttons.
     * @param {string} rawText The raw text from the AI.
     * @returns {{mainContent: string, actionsHTML: string}}
     */
    const processMessageContent = (rawText) => {
        let text = rawText;
        const buttonRegex = /\[(action_button|link_button_resource|link_button_primary):([^\]]+?)\](?:\(([^)]+?)\))?/g;
        const buttons = [];
        let match;

        // Find all button markers and store them
        while ((match = buttonRegex.exec(rawText)) !== null) {
            buttons.push({
                type: match[1],
                text: match[2],
                url: match[3] || null,
                fullMatch: match[0]
            });
        }

        // Remove button markers from the main text
        buttons.forEach(button => {
            text = text.replace(button.fullMatch, '');
        });

        // 1. Handle Markdown for bold text: **text** -> <strong>text</strong>
        let processedText = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        
        // 2. Handle standard markdown links and raw URLs
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
        
        // 3. Convert newlines to <br> for final display
        const mainContent = processedText.replace(/\n/g, '<br>').trim();

        // 4. Generate HTML for the action buttons
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


    // --- RENDER FUNCTION ---
    const renderChatbot = () => {
        // Filter out the initial system prompt for display
        const displayMessages = messages.map(msg => ({
            sender: msg.role === 'user' ? 'user' : 'ai',
            text: msg.parts[0].text
        }));

        // Add loading indicator if needed
        if (isLoading) {
            displayMessages.push({ sender: 'loading', text: '...' });
        }
        
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
        
        const messagesContainer = chatbotContainer.querySelector('.chat-messages');
        if (messagesContainer) {
            const lastMessage = messagesContainer.querySelector('.message:last-child');
            if (lastMessage) {
                messagesContainer.scrollTo({
                    top: lastMessage.offsetTop,
                    behavior: 'smooth'
                });
            }
            // Add event listener for action buttons
            messagesContainer.addEventListener('click', (e) => {
                if (e.target.matches('button.btn-chat-action.secondary')) {
                    const buttonText = e.target.textContent;
                    sendMessage(buttonText);
                }
            });
        }

        chatbotContainer.querySelector('.chatbot-fab')?.addEventListener('click', toggleChat);
        chatbotContainer.querySelector('.close-chat-btn')?.addEventListener('click', toggleChat);
        chatbotContainer.querySelector('.chat-input-area')?.addEventListener('submit', handleFormSubmit);
    };

    // --- CORE LOGIC ---
    const sendMessage = async (userText) => {
        if (!userText || isLoading) return;

        messages.push({ role: 'user', parts: [{ text: userText }] });
        saveChatState(); // Save state after adding user message
        isLoading = true;
        renderChatbot();

        try {
            const response = await fetch(WORKER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ history: messages }),
            });

            const data = await response.json();

            // Handle both successful and error responses from the worker inside the try block
            if (!response.ok) {
                // Check for the specific quota error string from our worker
                if (data.error === 'quota_exceeded') {
                    const friendlyMessage = "Nuestro asistente se ha tomado un descanso, intenta de nuevo más tarde o contacta por whatsapp al https://wa.me/5212228496995?text=Hola!%20Necesito%20asistencia%20con%20Imperdellanta%20codigo%20500";
                    messages.push({ role: 'model', parts: [{ text: friendlyMessage }] });
                } else {
                    // Handle other generic errors from the worker
                    messages.push({ role: 'model', parts: [{ text: `Lo siento, ocurrió un problema de comunicación. Por favor, intenta de nuevo más tarde.` }] });
                    console.error("Error del Worker:", data.error || response.statusText);
                }
            } else {
                // This is the successful path
                const aiResponseText = data.reply;
                if (!aiResponseText) {
                    // This will be caught by the generic catch block below
                    throw new Error("Respuesta vacía del servidor.");
                }
                messages.push({ role: 'model', parts: [{ text: aiResponseText }] });
            }

        } catch (error) {
            // This catch block now primarily handles network errors or JSON parsing failures
            console.error("Error de Red o de análisis JSON:", error);
            const networkErrorMessage = "Lo siento, ocurrió un problema de comunicación. Por favor, revisa tu conexión a internet e intenta de nuevo.";
            messages.push({ role: 'model', parts: [{ text: networkErrorMessage }] });
        } finally {
            isLoading = false;
            saveChatState(); // Save state after receiving AI response (or error)
            renderChatbot();

            const finalInput = chatbotContainer.querySelector('#chat-input');
            if (finalInput) {
                const isMobile = window.innerWidth <= 768;
                if (isMobile) {
                    finalInput.blur();
                } else {
                    finalInput.focus();
                }
            }
        }
    };

    // --- EVENT HANDLERS ---
    const toggleChat = () => {
        isChatOpen = !isChatOpen;
        saveChatState();
        renderChatbot();
        if(isChatOpen){
            setTimeout(() => chatbotContainer.querySelector('#chat-input')?.focus(), 300);
        }
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        const input = chatbotContainer.querySelector('#chat-input');
        const userText = input.value.trim();
        sendMessage(userText);
        // Input is cleared on the re-render inside sendMessage
    };
    
    // Initial Render
    renderChatbot();
}


// =================================================================================
// ORIGINAL WEBSITE LOGIC (Moved from inline scripts)
// =================================================================================
document.addEventListener('DOMContentLoaded', () => {

    // --- Menu toggle logic ---
    const menuToggle = document.querySelector('.menu-toggle');
    const mainNav = document.querySelector('.main-nav');

    if (menuToggle && mainNav) {
        menuToggle.addEventListener('click', function() {
            mainNav.classList.toggle('active');
            document.body.classList.toggle('menu-open');
        });
    }

    // --- Slider Logic ---
    const slider = document.querySelector('.hero-slider');
    if (slider) {
        const items = slider.querySelectorAll('.slider-item');
        const prevBtn = slider.querySelector('.slider-prev');
        const nextBtn = slider.querySelector('.slider-next');
        const dotsContainer = slider.querySelector('.slider-dots');

        if (items.length > 0 && prevBtn && nextBtn && dotsContainer) {
            let current = 0;
            let slideInterval;
            let resumeTimeout;
            const AUTOPLAY_INTERVAL = 5000; // 5 seconds
            const INTERACTION_PAUSE_DURATION = 8000; // 8 seconds

            // Create dots
            dotsContainer.innerHTML = ''; // Clear existing dots if any
            items.forEach((_, index) => {
                const dot = document.createElement('span');
                dot.classList.add('slider-dot');
                if (index === 0) dot.classList.add('active');
                dot.addEventListener('click', () => {
                    goToSlide(index);
                    pauseAndResume();
                });
                dotsContainer.appendChild(dot);
            });

            const dots = dotsContainer.querySelectorAll('.slider-dot');

            const goToSlide = (slideIndex) => {
                items[current].classList.remove('active');
                dots[current].classList.remove('active');
                current = (slideIndex + items.length) % items.length;
                items[current].classList.add('active');
                dots[current].classList.add('active');
            };

            const nextSlide = () => goToSlide(current + 1);
            const prevSlide = () => goToSlide(current - 1);
            
            const stopSlider = () => {
                clearInterval(slideInterval);
                clearTimeout(resumeTimeout);
            };

            const startSlider = () => {
                stopSlider(); // Ensure no multiple intervals are running
                slideInterval = setInterval(nextSlide, AUTOPLAY_INTERVAL);
            };
            
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

            // Intersection Observer to play/pause slider based on visibility
            const observer = new IntersectionObserver((entries) => {
                const entry = entries[0];
                if (entry.isIntersecting) {
                    startSlider();
                } else {
                    stopSlider();
                }
            }, { threshold: 0.5 }); // Trigger when 50% of the slider is visible

            observer.observe(slider);
        }
    }

    // --- Auto-update copyright year ---
    const copyrightYearEl = document.getElementById('copyright-year');
    if(copyrightYearEl) {
      copyrightYearEl.textContent = new Date().getFullYear().toString();
    }

    // --- Intelligent Header Logic ---
    const mainHeader = document.querySelector('.main-header');
    if (mainHeader) {
        const triggerHeight = mainHeader.offsetTop + mainHeader.offsetHeight;

        window.addEventListener('scroll', function() {
            if (window.scrollY > triggerHeight) {
                document.body.classList.add('header-is-sticky');
            } else {
                document.body.classList.remove('header-is-sticky');
            }
        });
    }

    // --- Slider AI Assistant Button ---
    const openChatBtn = document.querySelector('.btn-open-chat');
    const chatbotFab = document.querySelector('.chatbot-fab');

    if (openChatBtn && chatbotFab) {
        openChatBtn.addEventListener('click', (e) => {
            e.preventDefault();
            // Simulate a click on the main chatbot button to open the chat window
            chatbotFab.click();
        });
    }

});
