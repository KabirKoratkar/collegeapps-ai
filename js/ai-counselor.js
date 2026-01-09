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

document.addEventListener('DOMContentLoaded', async function () {
    // Get current user
    currentUser = await getCurrentUser();

    if (!currentUser) {
        window.location.href = new URL('login.html', window.location.href).href;
        return;
    }

    const profile = await getUserProfile(currentUser.id);
    updateNavbarUser(currentUser, profile);

    // Load conversation history
    await loadConversationHistory(profile);

    const chatInput = document.getElementById('chatInput');
    const chatMessages = document.getElementById('chatMessages');
    const suggestions = document.querySelectorAll('.suggestion-chip');

    // Handle suggestion chips
    suggestions.forEach(chip => {
        chip.addEventListener('click', function () {
            const message = this.textContent;
            sendMessage(message);
        });
    });

    // Handle send button
    const sendBtn = document.querySelector('.chat-input-wrapper .btn-primary');
    if (sendBtn) {
        sendBtn.addEventListener('click', function () {
            const message = chatInput.value.trim();
            if (message) {
                sendMessage(message);
                chatInput.value = '';
            }
        });
    }

    // Handle Enter key
    if (chatInput) {
        chatInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const message = this.value.trim();
                if (message) {
                    sendMessage(message);
                    this.value = '';
                }
            }
        });
    }
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

    // Clear current messages except welcome
    const chatMessages = document.getElementById('chatMessages');
    const welcomeMessage = chatMessages.querySelector('.chat-message:first-child');

    // Update welcome message name
    if (welcomeMessage) {
        const welcomeTitle = welcomeMessage.querySelector('strong');
        if (welcomeTitle) {
            welcomeTitle.textContent = `Hi ${firstName}! 👋`;
        }
    }

    chatMessages.innerHTML = '';
    if (welcomeMessage) {
        chatMessages.appendChild(welcomeMessage);
    }

    // Display history
    history.forEach(msg => {
        const msgElement = createMessageElement(msg.content, msg.role === 'user');
        chatMessages.appendChild(msgElement);
    });

    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function sendMessage(message) {
    const chatMessages = document.getElementById('chatMessages');

    // Add user message to UI
    const userMsg = createMessageElement(message, true);
    chatMessages.appendChild(userMsg);

    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Show typing indicator
    const typingIndicator = createTypingIndicator();
    chatMessages.appendChild(typingIndicator);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    try {
        // Limit check for free users
        const profile = await getUserProfile(currentUser.id);
        const hasPremium = isPremiumUser(profile);

        if (!hasPremium && conversationHistory.length >= 10) { // 10 messages = 5 exchanges
            typingIndicator.remove();
            const limitMsg = createMessageElement("You've reached the free message limit for this conversation. Join our Pro plan or Beta program for unlimited guidance!", false);
            chatMessages.appendChild(limitMsg);

            // Add an upgrade button
            const upgradeDiv = document.createElement('div');
            upgradeDiv.style.cssText = 'margin-top: 10px; text-align: center;';
            upgradeDiv.innerHTML = '<a href="settings.html" class="btn btn-primary btn-sm">Upgrade to Pro</a>';
            chatMessages.appendChild(upgradeDiv);

            chatMessages.scrollTop = chatMessages.scrollHeight;
            return;
        }

        // Send to AI server
        const response = await fetch(`${AI_SERVER_URL}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message,
                userId: currentUser.id,
                conversationHistory: conversationHistory.map(msg => ({
                    role: msg.role,
                    content: msg.content
                }))
            })
        });

        if (!response.ok) {
            throw new Error('Failed to get AI response');
        }

        const data = await response.json();

        // Remove typing indicator
        typingIndicator.remove();

        // Add AI response to UI
        const aiMsg = createMessageElement(data.response, false);
        chatMessages.appendChild(aiMsg);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        // Update conversation history
        conversationHistory.push(
            { role: 'user', content: message },
            { role: 'assistant', content: data.response }
        );

        // Show notification if function was called
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
                        const action = data.functionResult.message || 'Task updated';
                        notificationMessage = `${action}! I've adjusted your schedule. ⏰`;
                        break;
                    case 'updateEssay':
                        notificationMessage = `Essay draft updated! I've saved the changes for you. ✍️`;
                        break;
                    case 'updateCollege':
                        notificationMessage = `College status updated! Strategy confirmed. 🎯`;
                        break;
                    case 'createEssays':
                        notificationMessage = `Essays loaded! Head to the workspace to start writing. 📝`;
                        break;
                    case 'createTasks':
                        notificationMessage = `Plan generated! Check your dashboard for the new milestones. 📊`;
                        break;
                }
            }

            if (notificationMessage) {
                setTimeout(() => {
                    showNotification(notificationMessage, status ? 'success' : 'warning');
                }, 500);
            }
        }

    } catch (error) {
        console.error('Error sending message:', error);
        typingIndicator.remove();

        // Show error message
        const errorMsg = createMessageElement(
            'Sorry, I\'m having trouble connecting to the AI server. Please make sure the backend server is running on port 3001.',
            false
        );
        chatMessages.appendChild(errorMsg);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        showNotification('Failed to connect to AI. Check console for details.', 'error');
    }
}

function createMessageElement(text, isUser) {
    const div = document.createElement('div');
    div.className = `chat-message ${isUser ? 'user' : ''}`;

    const avatar = document.createElement('div');
    avatar.className = 'chat-avatar';
    avatar.textContent = isUser ? currentUser?.email?.[0]?.toUpperCase() || 'U' : 'AI';

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';

    // Convert markdown-style formatting to HTML
    const formattedText = formatMessageText(text);
    bubble.innerHTML = formattedText;

    div.appendChild(avatar);
    div.appendChild(bubble);

    return div;
}

function formatMessageText(text) {
    // Convert markdown-style formatting
    let formatted = text
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') // Bold
        .replace(/\*(.+?)\*/g, '<em>$1</em>') // Italic
        .replace(/\n/g, '<br>'); // Line breaks

    return formatted;
}

function createTypingIndicator() {
    const div = document.createElement('div');
    div.className = 'chat-message';
    div.id = 'typing-indicator';

    const avatar = document.createElement('div');
    avatar.className = 'chat-avatar';
    avatar.textContent = 'AI';

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    bubble.innerHTML = '<span style="opacity: 0.6;">Typing...</span>';

    div.appendChild(avatar);
    div.appendChild(bubble);

    return div;
}

// Override the old sendMessage function
window.sendMessage = sendMessage;
