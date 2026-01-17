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
let currentModel = 'gpt'; // 'gpt' or 'claude'

document.addEventListener('DOMContentLoaded', async function () {
    currentUser = await getCurrentUser();
    if (!currentUser) {
        window.location.href = new URL('login.html', window.location.href).href;
        return;
    }

    const profile = await getUserProfile(currentUser.id);
    updateNavbarUser(currentUser, profile);
    await loadConversationHistory(profile);

    // Systems Intelligence HUD Logs
    if (window.addIntelLog) {
        window.addIntelLog("Network: Establishing Secure Proxy tunnel...", "process");
        try {
            const health = await fetch(`${AI_SERVER_URL}/api/health`).catch(() => null);
            if (health && health.ok) {
                window.addIntelLog("Network: Core Systems online (Supabase Native)", "success");
            } else {
                window.addIntelLog("Network: Edge Timeout - falling back to local relay", "warning");
            }
        } catch (e) {
            window.addIntelLog("Network: Offline relay mode active", "warning");
        }
    }

    const chatInput = document.getElementById('chatInput');
    const chatMessages = document.getElementById('chatMessages');
    const sendBtn = document.getElementById('sendBtn');
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
            showNotification(`Switched to ${currentModel === 'claude' ? 'Claude 3.5 Sonnet' : 'GPT-4o'}`, 'info');
        });
    });

    // Send logic
    sendBtn.addEventListener('click', async () => {
        const text = chatInput.value.trim();
        if (!text) return;

        chatInput.value = '';
        addMessageToUI('user', text);
        await sendMessageToAI(text);
    });

    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendBtn.click();
        }
    });

    suggestions.forEach(chip => {
        chip.addEventListener('click', () => {
            chatInput.value = chip.dataset.query;
            sendBtn.click();
        });
    });
});

async function loadConversationHistory(profile) {
    const messages = await getUserConversations(profile.id);
    if (!messages || messages.length === 0) return;

    const chatMessages = document.getElementById('chatMessages');
    chatMessages.innerHTML = '';

    // Display history
    messages.forEach(msg => {
        const msgElement = createMessageElement(msg.content, msg.role === 'user', msg.created_at);
        chatMessages.appendChild(msgElement);
    });

    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addMessageToUI(role, content) {
    const chatMessages = document.getElementById('chatMessages');
    const div = document.createElement('div');
    div.className = `chat-message ${role}`;
    div.innerHTML = `<div class="message-content">${content}</div>`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function sendMessageToAI(message) {
    if (window.addIntelLog) window.addIntelLog(`Inbound: ${message.substring(0, 20)}...`, "process");

    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'chat-message assistant loading';
    loadingDiv.innerHTML = '<div class="spinner spinner-sm"></div>';
    document.getElementById('chatMessages').appendChild(loadingDiv);

    try {
        const endpoint = currentModel === 'claude' ? '/api/chat/claude' : '/api/chat';
        const response = await fetch(`${AI_SERVER_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message,
                userId: currentUser.id,
                conversationHistory
            })
        });

        const data = await response.json();
        loadingDiv.remove();

        if (data.error) {
            const msgElement = createMessageElement(`Sorry, I encountered an error: ${data.error}`, false);
            document.getElementById('chatMessages').appendChild(msgElement);
        } else {
            const msgElement = createMessageElement(data.response, false);
            document.getElementById('chatMessages').appendChild(msgElement);
            conversationHistory.push({ role: 'user', content: message });
            conversationHistory.push({ role: 'assistant', content: data.response });

            if (data.functionCalled && window.addIntelLog) {
                window.addIntelLog(`Exec: tool_${data.functionCalled} success`, "success");
            }
        }
    } catch (e) {
        loadingDiv.remove();
        const msgElement = createMessageElement("I'm having trouble connecting to the intelligence server right now.", false);
        document.getElementById('chatMessages').appendChild(msgElement);
    }
}

function showNotification(msg, type) {
    console.log(`[Notification] ${type}: ${msg}`);
}
function createMessageElement(text, isUser, timestamp = null) {
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

    const timeEl = document.createElement('div');
    timeEl.style.fontSize = '8px';
    timeEl.style.opacity = '0.5';
    timeEl.style.marginTop = '4px';
    timeEl.style.textAlign = isUser ? 'right' : 'left';

    // Use provided timestamp or current time
    const date = timestamp ? new Date(timestamp) : new Date();
    timeEl.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    bubble.appendChild(timeEl);

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

async function startScoutPolling(taskId) {
    const statusBubble = createScoutStatusBubble();
    chatMessages.appendChild(statusBubble);
    chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });

    let completed = false;
    let attempts = 0;
    const maxAttempts = 30; // ~1 minute

    while (!completed && attempts < maxAttempts) {
        attempts++;
        try {
            const res = await fetch(`${AI_SERVER_URL}/api/scout/status/${taskId}`);
            const data = await res.json();

            const statusLabel = statusBubble.querySelector('.scout-status-label');
            const statusDetail = statusBubble.querySelector('.scout-status-detail');

            if (data.status === 'completed' || data.status === 'success') {
                completed = true;
                statusBubble.classList.add('completed');
                statusLabel.textContent = 'Scout Report Ready';
                statusDetail.innerHTML = formatMessageText(data.result);
                if (window.addIntelLog) window.addIntelLog("Yutori: Intelligence payload delivered", "success");
            } else if (data.status === 'failed') {
                completed = true;
                statusLabel.textContent = 'Scouting Failed';
                statusDetail.textContent = 'The agent was blocked by the university firewall.';
            } else {
                // Update status (e.g. running, queued)
                statusLabel.textContent = `Navigator: ${data.status.charAt(0).toUpperCase() + data.status.slice(1)}...`;
            }
        } catch (e) {
            console.error('Polling error:', e);
        }
        if (!completed) await new Promise(r => setTimeout(r, 3000));
    }
}

function createScoutStatusBubble() {
    const div = document.createElement('div');
    div.className = 'chat-message scout-update';
    div.innerHTML = `
        <div class="chat-avatar">🔍</div>
        <div class="chat-bubble" style="border: 1px solid var(--accent-primary); background: rgba(var(--accent-rgb), 0.05);">
            <div class="scout-status-label" style="font-weight: bold; color: var(--accent-primary); margin-bottom: 4px;">
                Initiating Navigator...
            </div>
            <div class="scout-status-detail" style="font-size: 0.9em; opacity: 0.8;">
                Deploying autonomous scouting agent to university servers.
            </div>
        </div>
    `;
    return div;
}

window.sendMessage = sendMessage;
