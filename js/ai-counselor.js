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
let currentSessionId = crypto.randomUUID();
let currentCategory = null;

document.addEventListener('DOMContentLoaded', async function () {
    currentUser = await getCurrentUser();
    if (!currentUser) {
        window.location.href = new URL('login.html', window.location.href).href;
        return;
    }

    const profile = await getUserProfile(currentUser.id);
    updateNavbarUser(currentUser, profile);

    // Load latest session if exists
    await loadLatestSession(profile);

    // Systems Intelligence HUD Logs
    if (window.addIntelLog) {
        // ... (existing logging code) ...
    }

    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');
    const suggestions = document.querySelectorAll('.suggestion-chip');

    // ... (existing model toggle code) ...

    // History Button
    const historyBtn = document.getElementById('historyBtn');
    if (historyBtn) {
        historyBtn.addEventListener('click', async () => {
            await showFullHistory();
        });
    }

    // New Chat Button logic
    const newChatBtn = document.getElementById('newChatBtn');
    if (newChatBtn) {
        newChatBtn.addEventListener('click', () => {
            startNewSession();
        });
    }

    // Send logic
    sendBtn.addEventListener('click', async () => {
        const text = chatInput.value.trim();
        if (!text) return;

        chatInput.value = '';

        // Detect category if this is the first message of session
        if (!currentCategory) {
            currentCategory = detectCategory(text);
        }

        addMessageToUI('user', text);
        await sendMessageToAI(text);
    });

    // ... (existing input event listeners) ...
});

function startNewSession() {
    currentSessionId = crypto.randomUUID();
    currentCategory = null;
    conversationHistory = [];
    document.getElementById('chatMessages').innerHTML = `
        <div class="chat-message">
            <div class="chat-avatar">AI</div>
            <div class="chat-bubble">
                <p style="margin: 0; margin-bottom: var(--space-sm);"><strong>New Session Started 🚀</strong></p>
                <p style="margin: 0;">I'm ready to help. What's on your mind?</p>
            </div>
        </div>
    `;
}

function detectCategory(text) {
    const t = text.toLowerCase();
    if (t.includes('essay') || t.includes('personal statement') || t.includes('supplement') || t.includes('write') || t.includes('draft')) return 'Essays ✍️';
    if (t.includes('gpa') || t.includes('grade') || t.includes('sat') || t.includes('act') || t.includes('score')) return 'Academics 📚';
    if (t.includes('activity') || t.includes('sport') || t.includes('club') || t.includes('leadership') || t.includes('award')) return 'Extracurriculars 🏆';
    if (t.includes('college') || t.includes('university') || t.includes('list') || t.includes('school') || t.includes('ranking')) return 'College List 🏛️';
    if (t.includes('money') || t.includes('aid') || t.includes('scholarship') || t.includes('tuition')) return 'Financial Aid 💰';
    if (t.includes('deadline') || t.includes('schedule') || t.includes('plan') || t.includes('time')) return 'Planning 📅';
    return 'General Chat 💬';
}

async function loadLatestSession(profile) {
    // Fetch recent messages
    const messages = await getUserConversations(profile.id, 50);
    if (!messages || messages.length === 0) return;

    // Find the most recent session ID
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.metadata && lastMsg.metadata.sessionId) {
        currentSessionId = lastMsg.metadata.sessionId;
        currentCategory = lastMsg.metadata.category || 'General';

        // Filter messages for this session
        const sessionMessages = messages.filter(m => m.metadata && m.metadata.sessionId === currentSessionId);

        // Render
        const chatMessages = document.getElementById('chatMessages');
        chatMessages.innerHTML = '';
        sessionMessages.forEach(msg => {
            const msgElement = createMessageElement(msg.content, msg.role === 'user', msg.created_at);
            chatMessages.appendChild(msgElement);
        });

        // Restore history context for AI
        conversationHistory = sessionMessages.map(m => ({ role: m.role, content: m.content }));
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

// Replaces original loadConversationHistory
async function loadConversationHistory(profile) {
    // Legacy function support - redirected to new logic
    await loadLatestSession(profile);
}

// ... (existing helper functions: addMessageToUI) ...

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
                conversationHistory,
                sessionId: currentSessionId,
                category: currentCategory
            })
        });

        // ... (rest of function remains same) ...
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

// ... (existing helpers) ...

async function showFullHistory() {
    if (!currentUser) return;

    showNotification('Fetching archive...', 'info');
    const messages = await getUserConversations(currentUser.id, 500);

    if (!messages || messages.length === 0) {
        showNotification('No history found.', 'warning');
        return;
    }

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(15, 23, 42, 0.95); display: flex; align-items: center; justify-content: center;
        z-index: 2000; backdrop-filter: blur(10px);
    `;

    // Group messages by SESSION ID
    const sessions = {};

    // Sort messages newest first for processing
    const sortedMsgs = [...messages].reverse();

    sortedMsgs.forEach(msg => {
        // Use metadata sessionId or fallback to 'Legacy'
        const sessionId = msg.metadata?.sessionId || 'legacy_chats';
        const category = msg.metadata?.category || 'General Chat';
        const date = new Date(msg.created_at).toLocaleDateString();

        if (!sessions[sessionId]) {
            sessions[sessionId] = {
                id: sessionId,
                category: category,
                date: date,
                messages: []
            };
        }
        sessions[sessionId].messages.unshift(msg); // Add to start to maintain chrono order within session
    });

    const contentHtml = Object.values(sessions).map(session => `
        <div class="history-session-card" style="margin-bottom: var(--space-xl); background: var(--white); border-radius: var(--radius-lg); border: 1px solid var(--gray-200); overflow: hidden;">
            <div style="padding: 12px 20px; background: var(--gray-50); border-bottom: 1px solid var(--gray-200); display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <span style="font-weight: 700; color: var(--gray-900); font-size: 14px; margin-right: 8px;">${session.category}</span>
                    <span style="font-size: 12px; color: var(--gray-500);">${session.date}</span>
                </div>
                <span class="badge" style="font-size: 10px;">${session.messages.length} msgs</span>
            </div>
            <div style="padding: 20px; max-height: 300px; overflow-y: auto; background: var(--white);">
                ${session.messages.map(msg => `
                    <div style="margin-bottom: 12px; font-size: 13px; color: var(--gray-700); border-left: 2px solid ${msg.role === 'user' ? 'var(--primary-blue)' : 'var(--gray-300)'}; padding-left: 10px;">
                        <strong style="color: ${msg.role === 'user' ? 'var(--primary-blue)' : 'var(--gray-900)'};">${msg.role === 'user' ? 'You' : 'AI'}:</strong> 
                        ${msg.content.substring(0, 150)}${msg.content.length > 150 ? '...' : ''}
                    </div>
                `).join('')}
            </div>
             <div style="padding: 8px 20px; border-top: 1px solid var(--gray-100); text-align: right;">
                <button class="btn btn-sm btn-ghost" onclick="continueSession('${session.id}')" style="font-size: 12px;">Continue Chat →</button>
            </div>
        </div>
    `).join('');

    modal.innerHTML = `
        <div class="card" style="width: 800px; max-width: 95%; height: 90vh; padding: 0; display: flex; flex-direction: column; overflow: hidden; background: var(--gray-100);">
            <div style="padding: var(--space-lg); border-bottom: 1px solid var(--gray-200); display: flex; justify-content: space-between; align-items: center; background: var(--white);">
                <div>
                    <h2 style="font-size: var(--text-xl); font-weight: 800; margin: 0; display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 24px;">🗂️</span> Past Sessions
                    </h2>
                    <p style="margin: 0; font-size: 12px; color: var(--gray-500);">Auto-categorized by topic</p>
                </div>
                <button class="btn btn-icon btn-ghost" onclick="this.closest('.modal-overlay').remove()">×</button>
            </div>
            <div style="flex: 1; overflow-y: auto; padding: var(--space-lg);">
                ${contentHtml}
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Add continue helper
    window.continueSession = (sessId) => {
        if (sessId === 'legacy_chats') {
            showNotification('Cannot continue legacy chats', 'warning');
            return;
        }
        currentSessionId = sessId;
        const session = sessions[sessId];
        currentCategory = session.category;

        // Load messages for this session
        const chatMessages = document.getElementById('chatMessages');
        chatMessages.innerHTML = '';
        session.messages.forEach(msg => {
            const msgElement = createMessageElement(msg.content, msg.role === 'user', msg.created_at);
            chatMessages.appendChild(msgElement);
        });

        // Restore context
        conversationHistory = session.messages.map(m => ({ role: m.role, content: m.content }));
        chatMessages.scrollTop = chatMessages.scrollHeight;

        document.querySelector('.modal-overlay').remove();
    };
}
