/**
 * AI Chat Widget Component
 * A floating, persistent chat counselor available on all pages
 */

import {
    getCurrentUser,
    getUserConversations,
    getUserProfile
} from './supabase-config.js';
import config from './config.js';

class AIChatWidget {
    constructor() {
        this.isOpen = false;
        this.currentUser = null;
        this.conversationHistory = [];
        this.apiUrl = config.apiUrl;

        this.init();
    }

    async init() {
        // Authenticate user
        this.currentUser = await getCurrentUser();
        if (!this.currentUser) return; // Don't show for non-logged-in users

        // Inject HTML and CSS
        this.injectStyles();
        this.injectHTML();

        // Load history
        await this.loadHistory();

        // Bind events
        this.bindEvents();
    }

    injectStyles() {
        if (!document.getElementById('chat-widget-styles')) {
            const link = document.createElement('link');
            link.id = 'chat-widget-styles';
            link.rel = 'stylesheet';
            link.href = 'css/chat-widget.css';
            document.head.appendChild(link);
        }
    }

    injectHTML() {
        const widgetHTML = `
            <div class="ai-chat-widget" id="aiChatWidget">
                <button class="chat-widget-button" id="chatWidgetBtn">
                    <span id="chatBtnIcon">💬</span>
                </button>
                
                <div class="chat-window" id="chatWindow">
                    <div class="chat-window-header">
                        <div class="chat-header-info">
                            <div class="chat-header-avatar">AI</div>
                            <div class="chat-header-text">
                                <h3>AI Counselor</h3>
                                <p>Online & ready to help</p>
                            </div>
                        </div>
                        <button class="chat-send-btn" id="closeChatBtn" style="color: white; font-size: 20px;">×</button>
                    </div>

                    <div class="chat-window-messages" id="widgetMessages">
                        <!-- Messages populated here -->
                    </div>

                    <div class="chat-widget-suggestions" id="widgetSuggestions">
                        <div class="widget-suggestion-chip">Stanford essays?</div>
                        <div class="widget-suggestion-chip">Common App tip</div>
                        <div class="widget-suggestion-chip">USC deadlines</div>
                    </div>

                    <div class="chat-window-input">
                        <input type="text" id="widgetInput" placeholder="Ask me anything...">
                        <button class="chat-send-btn" id="widgetSendBtn">Send</button>
                    </div>
                </div>
            </div>
        `;

        const container = document.createElement('div');
        container.innerHTML = widgetHTML;
        document.body.appendChild(container.firstElementChild);
    }

    async loadHistory() {
        const history = await getUserConversations(this.currentUser.id, 10);
        this.conversationHistory = history;

        const container = document.getElementById('widgetMessages');
        container.innerHTML = '';

        // Add welcome message if no history
        if (history.length === 0) {
            const profile = await getUserProfile(this.currentUser.id);
            const firstName = profile?.full_name ? profile.full_name.split(' ')[0] : (this.currentUser.user_metadata?.full_name?.split(' ')[0] || 'there');

            this.addMessage(`Hi ${firstName}! 👋 I'm your AI counselor. How can I help you today?`, 'ai');
        } else {
            history.forEach(msg => {
                this.addMessage(msg.content, msg.role === 'user' ? 'user' : 'ai');
            });
        }

        this.scrollToBottom();
    }

    bindEvents() {
        const btn = document.getElementById('chatWidgetBtn');
        const closeBtn = document.getElementById('closeChatBtn');
        const input = document.getElementById('widgetInput');
        const sendBtn = document.getElementById('widgetSendBtn');
        const suggestions = document.querySelectorAll('.widget-suggestion-chip');

        btn.addEventListener('click', () => this.toggleChat());
        closeBtn.addEventListener('click', () => this.toggleChat(false));

        sendBtn.addEventListener('click', () => this.handleSendMessage());

        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleSendMessage();
        });

        suggestions.forEach(chip => {
            chip.addEventListener('click', () => {
                input.value = chip.textContent;
                this.handleSendMessage();
            });
        });
    }

    toggleChat(force) {
        this.isOpen = force !== undefined ? force : !this.isOpen;
        const windowEl = document.getElementById('chatWindow');
        const btnEl = document.getElementById('chatWidgetBtn');
        const iconEl = document.getElementById('chatBtnIcon');

        if (this.isOpen) {
            windowEl.classList.add('active');
            btnEl.classList.add('active');
            iconEl.textContent = '×';
            document.getElementById('widgetInput').focus();
        } else {
            windowEl.classList.remove('active');
            btnEl.classList.remove('active');
            iconEl.textContent = '💬';
        }
    }

    async handleSendMessage() {
        const input = document.getElementById('widgetInput');
        const message = input.value.trim();
        if (!message) return;

        input.value = '';
        this.addMessage(message, 'user');
        this.scrollToBottom();

        // Show typing indicator
        this.showTyping(true);

        try {
            const response = await fetch(`${this.apiUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message,
                    userId: this.currentUser.id,
                    conversationHistory: this.conversationHistory
                })
            });

            const data = await response.json();
            this.showTyping(false);

            if (data.response) {
                this.addMessage(data.response, 'ai');
                this.conversationHistory.push(
                    { role: 'user', content: message },
                    { role: 'assistant', content: data.response }
                );

                // Command Center Notifications Logic
                if (data.functionCalled) {
                    const functionName = data.functionCalled;
                    let notificationMessage = '';
                    const status = data.functionResult?.success;

                    if (status) {
                        switch (functionName) {
                            case 'addCollege':
                                notificationMessage = `Added ${data.functionResult.college?.name || 'College'} to your list! 🎓`;
                                break;
                            case 'updateProfile':
                                notificationMessage = `Profile updated! I've logged your new preferences. ✅`;
                                break;
                            case 'modifyTask':
                                const action = data.functionResult.action || 'updated';
                                notificationMessage = `Task ${action} successfully! 📅`;
                                break;
                            case 'updateEssay':
                                notificationMessage = `Essay draft saved! ✍️`;
                                break;
                            case 'updateCollege':
                                notificationMessage = `College strategy updated! 🚀`;
                                break;
                        }
                    }

                    if (notificationMessage && window.showNotification) {
                        setTimeout(() => {
                            window.showNotification(notificationMessage, status ? 'success' : 'warning');
                        }, 500);
                    }
                }
            }
        } catch (error) {
            console.error('Chat error:', error);
            this.showTyping(false);
            this.addMessage("Sorry, I'm having trouble connecting. Please check if the server is running.", 'ai');
        }

        this.scrollToBottom();
    }

    addMessage(text, role) {
        const container = document.getElementById('widgetMessages');
        const div = document.createElement('div');
        div.className = `widget-message ${role}`;

        // Handle basic formatting
        let formatted = text
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>');

        div.innerHTML = formatted;
        container.appendChild(div);
    }

    showTyping(show) {
        const container = document.getElementById('widgetMessages');
        const existing = document.getElementById('widgetTyping');

        if (show && !existing) {
            const div = document.createElement('div');
            div.id = 'widgetTyping';
            div.className = 'typing-indicator';
            div.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
            container.appendChild(div);
        } else if (!show && existing) {
            existing.remove();
        }
    }

    scrollToBottom() {
        const container = document.getElementById('widgetMessages');
        container.scrollTop = container.scrollHeight;
    }
}

// Initialize
const initWidget = () => {
    if (!window.location.pathname.includes('ai-counselor.html')) {
        new AIChatWidget();
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWidget);
} else {
    initWidget();
}
