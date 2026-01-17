// Enhanced AI Counselor with Real Backend Integration
// Connects to AI server and uses function calling

import {
    getCurrentUser,
    getUserConversations,
    saveMessage,
    getUserProfile,
    isPremiumUser
} from './supabase-config.js';
import { updateNavbarUser } from './ui.js';
import config from './config.js';

const AI_SERVER_URL = config.apiUrl;

let conversationHistory = [];
let currentUser = null;
let currentModel = 'gpt';

document.addEventListener('DOMContentLoaded', async function () {
    // ... existing init code ...
    currentUser = await getCurrentUser();
    if (!currentUser) {
        window.location.href = new URL('login.html', window.location.href).href;
        return;
    }

    const profile = await getUserProfile(currentUser.id);
    updateNavbarUser(currentUser, profile);
    await loadConversationHistory(profile);

    const chatInput = document.getElementById('chatInput');
    const chatMessages = document.getElementById('chatMessages');
    const suggestions = document.querySelectorAll('.suggestion-chip');

    // Model Toggle Logic
    const modelButtons = document.querySelectorAll('#modelToggle button');
    modelButtons.forEach(btn => {
        btn.addEventListener('click', function () {
            modelButtons.forEach(b => {
                b.classList.remove('btn-primary', 'active');
                b.classList.add('btn-ghost');
            });
            this.classList.remove('btn-ghost');
            this.classList.add('btn-primary', 'active');
            currentModel = this.dataset.model;
            showNotification(`Switched to ${currentModel === 'claude' ? 'Claude 3.5' : 'GPT-4o'}`, 'info');
        });
    });

    // Handle suggestion chips
    suggestions.forEach(chip => {
        chip.addEventListener('click', function () {
            sendMessage(this.textContent);
        });
    });

    // Handle send button
    document.getElementById('sendBtn')?.addEventListener('click', () => {
        const message = chatInput.value.trim();
        if (message) {
            sendMessage(message);
            chatInput.value = '';
        }
    });

    // Handle Enter key
    chatInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const message = chatInput.value.trim();
            if (message) {
                sendMessage(message);
                chatInput.value = '';
            }
        }
    });
});

async function loadConversationHistory(profile = null) {
    if (!currentUser) return;

    const history = await getUserConversations(currentUser.id, 20);
    conversationHistory = history;

    // Get profile for personalization if not provided
    if (!profile) {
        profile = await getUserProfile(currentUser.id);
    }
    const firstName = profile?.full_name ? profile.full_name.split(' ')[0] : (currentUser.user_metadata?.full_name?.split(' ')[0] || 'there');

    const chatMessages = document.getElementById('chatMessages');
    const welcomeMessage = chatMessages.querySelector('.chat-message:first-child');

    if (welcomeMessage) {
        const welcomeTitle = welcomeMessage.querySelector('strong');
        if (welcomeTitle) {
            welcomeTitle.textContent = `Hi ${firstName}! 👋`;
        }
    }

    chatMessages.innerHTML = '';
    if (welcomeMessage) {
        chatMessages.appendChild(welcomeMessage);
        // Add listener to initial welcome message TTS button
        const initialTtsBtn = welcomeMessage.querySelector('.tts-btn');
        if (initialTtsBtn) {
            initialTtsBtn.addEventListener('click', () => playTTS(welcomeMessage.querySelector('.chat-bubble').innerText, initialTtsBtn));
        }
    }

    // Display history
    history.forEach(msg => {
        const msgElement = createMessageElement(msg.content, msg.role === 'user');
        chatMessages.appendChild(msgElement);
    });

    chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function sendMessage(message) {
    const chatMessages = document.getElementById('chatMessages');

    // Add user message to UI
    const userMsg = createMessageElement(message, true);
    chatMessages.appendChild(userMsg);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Show typing indicator
    const typingIndicator = createTypingIndicator();
    chatMessages.appendChild(typingIndicator);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    try {
        const profile = await getUserProfile(currentUser.id);
        const hasPremium = isPremiumUser(profile);

        if (!hasPremium && conversationHistory.length >= 10) {
            typingIndicator.remove();
            const limitMsg = createMessageElement("You've reached the limit. Upgrade to Pro for unlimited Claude access and voice features!", false);
            chatMessages.appendChild(limitMsg);

            const upgradeDiv = document.createElement('div');
            upgradeDiv.style.cssText = 'margin-top: 10px; text-align: center;';
            upgradeDiv.innerHTML = '<a href="settings.html" class="btn btn-primary btn-sm">Upgrade to Pro</a>';
            chatMessages.appendChild(upgradeDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
            return;
        }

        // Endpoint depends on selected model
        const endpoint = currentModel === 'claude' ? `${AI_SERVER_URL}/api/chat/claude` : `${AI_SERVER_URL}/api/chat`;

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message,
                userId: currentUser.id,
                conversationHistory: conversationHistory.map(msg => ({
                    role: msg.role,
                    content: msg.content
                }))
            })
        });

        if (!response.ok) throw new Error('Failed to get AI response');
        const data = await response.json();

        typingIndicator.remove();

        // Add AI response to UI
        const aiMsg = createMessageElement(data.response, false);
        chatMessages.appendChild(aiMsg);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        // Auto-play TTS for Claude if premium (optionally)
        if (currentModel === 'claude' && hasPremium) {
            const ttsBtn = aiMsg.querySelector('.tts-btn');
            playTTS(data.response, ttsBtn);
        }

        conversationHistory.push(
            { role: 'user', content: message },
            { role: 'assistant', content: data.response }
        );

        // Handle function calls if any (GPT-4 only currently)
        if (data.functionCalled) {
            handleFunctionNotification(data.functionCalled, data.functionResult);
        }

    } catch (error) {
        console.error('Error sending message:', error);
        typingIndicator.remove();
        const errorMsg = createMessageElement('Connection error. Please try again.', false);
        chatMessages.appendChild(errorMsg);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

async function playTTS(text, button) {
    if (button.classList.contains('playing')) return;

    button.classList.add('playing');
    button.textContent = '⌛';

    try {
        const response = await fetch(`${AI_SERVER_URL}/api/tts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });

        if (!response.ok) throw new Error('TTS failed');

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);

        button.textContent = '🔊';
        document.querySelector('.voice-wave')?.classList.add('active');

        audio.onended = () => {
            button.classList.remove('playing');
            document.querySelector('.voice-wave')?.classList.remove('active');
        };

        await audio.play();
    } catch (err) {
        console.error('TTS Playback Error:', err);
        button.classList.remove('playing');
        button.textContent = '🔊';
    }
}

function handleFunctionNotification(name, result) {
    if (!result?.success) return;
    let msg = '';
    switch (name) {
        case 'addCollege': msg = `Added ${result.college?.name}! 🎓`; break;
        case 'updateProfile': msg = `Profile updated! ✅`; break;
        case 'modifyTask': msg = `Schedule adjusted! ⏰`; break;
        case 'createEssays': msg = `Essays loaded! 📝`; break;
    }
    if (msg) showNotification(msg, 'success');
}

function createMessageElement(text, isUser) {
    const div = document.createElement('div');
    div.className = `chat-message ${isUser ? 'user' : ''}`;

    const avatar = document.createElement('div');
    avatar.className = 'chat-avatar';
    avatar.textContent = isUser ? 'U' : 'AI';

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';

    if (!isUser) {
        const actions = document.createElement('div');
        actions.className = 'bubble-actions';
        const ttsBtn = document.createElement('button');
        ttsBtn.className = 'btn-icon btn-sm tts-btn';
        ttsBtn.title = 'Speak Response';
        ttsBtn.textContent = '🔊';
        ttsBtn.addEventListener('click', () => playTTS(text, ttsBtn));
        actions.appendChild(ttsBtn);
        bubble.appendChild(actions);
    }

    const content = document.createElement('div');
    content.innerHTML = formatMessageText(text);
    bubble.appendChild(content);

    div.appendChild(avatar);
    div.appendChild(bubble);

    return div;
}

function formatMessageText(text) {
    return text
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br>');
}

function createTypingIndicator() {
    const div = document.createElement('div');
    div.className = 'chat-message';
    div.innerHTML = `<div class="chat-avatar">AI</div><div class="chat-bubble"><span style="opacity: 0.6;">Thinking...</span></div>`;
    return div;
}

window.sendMessage = sendMessage;
