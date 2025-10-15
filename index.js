const WORKER_URL = "https://chat.corporativoimperdellanta.workers.dev";
const CHAT_STATE_KEY = 'imperdellanta_chat_state';
const chatbotContainer = document.getElementById('chatbot-container');

if (chatbotContainer) {
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
                    return { ...defaultState, ...parsedState };
                }
            }
        } catch (error) {
            console.error("Error al cargar el estado del chat desde localStorage:", error);
            localStorage.removeItem(CHAT_STATE_KEY);
        }
        return { ...defaultState };
    };

    let { isChatOpen, messages } = loadChatState();
    let isLoading = false;

    const saveChatState = () => {
        try {
            const stateToSave = { isChatOpen, messages };
            localStorage.setItem(CHAT_STATE_KEY, JSON.stringify(stateToSave));
        } catch (error)
        {
            console.error("Error al guardar el estado del chat en localStorage:", error);
        }
    };

    const linkify = (text) => {
        const urlRegex = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
        return text.replace(urlRegex, (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
    };
    
    const processMessageContent = (rawText) => {
        let text = rawText;
        const buttonRegex = /\[(action_button|link_button_resource|link_button_primary):([^\]]+?)\](?:\(([^)]+?)\))?/g;
        const buttons = [];
        let match;

        while ((match = buttonRegex.exec(rawText)) !== null) {
            buttons.push({
                type: match[1],
                text: match[2],
                url: match[3] || null,
                fullMatch: match[0]
            });
        }

        buttons.forEach(button => {
            text = text.replace(button.fullMatch, '');
        });

        let processedText = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        
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
        
        const mainContent = processedText.replace(/\n/g, '<br>').trim();
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

    const renderChatbot = () => {
        const displayMessages = messages.map(msg => ({
            sender: msg.role === 'user' ? 'user' : 'ai',
            text: msg.parts[0].text
        }));

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

    const sendMessage = async (userText) => {
        if (!userText || isLoading) return;

        messages.push({ role: 'user', parts: [{ text: userText }] });
        saveChatState();
        isLoading = true;
        renderChatbot();

        try {
            const response = await fetch(WORKER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ history: messages }),
            });

            const data = await response.json();

            if (!response.ok) {
                if (data.error === 'quota_exceeded') {
                    const friendlyMessage = "Nuestro asistente se ha tomado un descanso, intenta de nuevo más tarde o contacta por whatsapp al https://wa.me/5212228496995?text=Hola!%20Necesito%20asistencia%20con%20Imperdellanta%20codigo%20500";
                    messages.push({ role: 'model', parts: [{ text: friendlyMessage }] });
                } else {
                    messages.push({ role: 'model', parts: [{ text: `Lo siento, ocurrió un problema de comunicación. Por favor, intenta de nuevo más tarde.` }] });
                    console.error("Error del Worker:", data.error || response.statusText);
                }
            } else {
                const aiResponseText = data.reply;
                if (!aiResponseText) {
                    throw new Error("Respuesta vacía del servidor.");
                }
                messages.push({ role: 'model', parts: [{ text: aiResponseText }] });
            }

        } catch (error) {
            console.error("Error de Red o de análisis JSON:", error);
            const networkErrorMessage = "Lo siento, ocurrió un problema de comunicación. Por favor, revisa tu conexión a internet e intenta de nuevo.";
            messages.push({ role: 'model', parts: [{ text: networkErrorMessage }] });
        } finally {
            isLoading = false;
            saveChatState();
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
    };
    
    renderChatbot();
}

document.addEventListener('DOMContentLoaded', () => {
    const menuToggle = document.querySelector('.menu-toggle');
    const mainNav = document.querySelector('.main-nav');

    if (menuToggle && mainNav) {
        menuToggle.addEventListener('click', function() {
            mainNav.classList.toggle('active');
            document.body.classList.toggle('menu-open');
        });
    }

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
            const AUTOPLAY_INTERVAL = 5000;
            const INTERACTION_PAUSE_DURATION = 8000;

            dotsContainer.innerHTML = '';
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
                stopSlider();
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

            const observer = new IntersectionObserver((entries) => {
                const entry = entries[0];
                if (entry.isIntersecting) {
                    startSlider();
                } else {
                    stopSlider();
                }
            }, { threshold: 0.5 });

            observer.observe(slider);
        }
    }

    const copyrightYearEl = document.getElementById('copyright-year');
    if(copyrightYearEl) {
      copyrightYearEl.textContent = new Date().getFullYear().toString();
    }

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

    const galleryGrid = document.querySelector('.gallery-grid');
    const modal = document.getElementById('gallery-modal');

    if (galleryGrid && modal) {
        const modalImage = document.getElementById('modal-image');
        const modalCounter = document.getElementById('modal-counter');
        const closeModalBtn = modal.querySelector('.modal-close');
        const prevBtn = modal.querySelector('.modal-prev');
        const nextBtn = modal.querySelector('.modal-next');
        
        const IMAGE_COUNT = 12;
        const images = [];
        let currentIndex = 0;

        for (let i = 1; i <= IMAGE_COUNT; i++) {
            const imageUrl = `https://assets-web-27t.pages.dev/impermeabilizacion_imperdellanta_by_pedriño_${i}`;
            images.push(imageUrl);

            const thumbnail = document.createElement('div');
            thumbnail.className = 'gallery-thumbnail';
            thumbnail.dataset.index = i - 1;
            
            const img = document.createElement('img');
            img.src = imageUrl;
            img.alt = `Proyecto de impermeabilización Imperdellanta - Antes y Después ${i}`;
            img.loading = 'lazy';
            img.decoding = 'async';

            thumbnail.appendChild(img);
            galleryGrid.appendChild(thumbnail);
        }

        const showImage = (index) => {
            if (index < 0 || index >= images.length) return;
            currentIndex = index;
            modalImage.src = images[currentIndex];
            modalCounter.textContent = `${currentIndex + 1} / ${images.length}`;
        };

        const openModal = (index) => {
            modal.classList.add('show');
            setTimeout(() => {
                modal.classList.add('visible');
                document.body.style.overflow = 'hidden';
            }, 10);
            showImage(index);
        };

        const closeModal = () => {
            modal.classList.remove('visible');
            setTimeout(() => {
                modal.classList.remove('show');
                document.body.style.overflow = '';
            }, 300);
        };
        
        const nextImage = () => showImage((currentIndex + 1) % images.length);
        const prevImage = () => showImage((currentIndex - 1 + images.length) % images.length);

        galleryGrid.addEventListener('click', (e) => {
            const thumbnail = e.target.closest('.gallery-thumbnail');
            if (thumbnail) {
                openModal(parseInt(thumbnail.dataset.index, 10));
            }
        });

        closeModalBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
        
        nextBtn.addEventListener('click', nextImage);
        prevBtn.addEventListener('click', prevImage);
        
        document.addEventListener('keydown', (e) => {
            if (modal.classList.contains('visible')) {
                if (e.key === 'ArrowRight') nextImage();
                if (e.key === 'ArrowLeft') prevImage();
                if (e.key === 'Escape') closeModal();
            }
        });

        let touchstartX = 0;
        let touchendX = 0;

        modal.addEventListener('touchstart', (e) => {
            touchstartX = e.changedTouches[0].screenX;
        }, { passive: true });

        modal.addEventListener('touchend', (e) => {
            touchendX = e.changedTouches[0].screenX;
            if (touchendX < touchstartX - 50) nextImage();
            if (touchendX > touchstartX + 50) prevImage();
        }, { passive: true }); 
    }

    const openChatBtn = document.querySelector('.btn-open-chat');
    const chatbotFab = document.querySelector('.chatbot-fab');

    if (openChatBtn && chatbotFab) {
        openChatBtn.addEventListener('click', (e) => {
            e.preventDefault();
            chatbotFab.click();
        });
    }
});
