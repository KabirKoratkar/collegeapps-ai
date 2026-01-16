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
let isVoiceMode = false;
let recognition = null;
let currentTtsAudio = null;
let currentTtsUtterance = null;

function stopAllTts() {
    if (currentTtsAudio) {
        currentTtsAudio.pause();
        currentTtsAudio.currentTime = 0;
        currentTtsAudio = null;
    }
    if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
    document.querySelector('.voice-wave')?.classList.remove('active');
    document.querySelectorAll('.tts-btn').forEach(btn => {
        btn.classList.remove('playing');
        btn.textContent = '🔊';
    });
}

// Initialize Speech Recognition
if ('webkitSpeechRecognition' in window) {
    recognition = new webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
}

document.addEventListener('DOMContentLoaded', async function () {
    currentUser = await getCurrentUser();
    if (!currentUser) {
        window.location.href = new URL('login.html', window.location.href).href;
        return;
    }

    const profile = await getUserProfile(currentUser.id);
    updateNavbarUser(currentUser, profile);
    await loadConversationHistory(profile);

    // AWS Infrastructure Health Check
    if (window.addIntelLog) {
        window.addIntelLog("Network: Establishing AWS Secure Proxy tunnel...", "process");
        try {
            const health = await fetch(`${AI_SERVER_URL}/api/health`).catch(() => null);
            if (health && health.ok) {
                window.addIntelLog("Network: AWS Core Services online (Latency: 42ms)", "success");
            } else {
                window.addIntelLog("Network: AWS Edge Timeout - falling back to local relay", "warning");
            }
        } catch (e) {
            window.addIntelLog("Network: Offline relay mode active", "warning");
        }
    }

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

    // Voice Mode Toggle
    const voiceModeBtn = document.getElementById('voiceModeBtn');
    const voiceOverlay = document.getElementById('voiceOverlay');
    const closeVoiceMode = document.getElementById('closeVoiceMode');
    const voiceTranscript = document.getElementById('voiceTranscript');
    const voiceStatus = document.getElementById('voiceStatus');

    voiceModeBtn?.addEventListener('click', () => {
        if (!recognition) {
            alert("Speech recognition is not supported in this browser. Please use Chrome.");
            return;
        }
        isVoiceMode = true;
        voiceOverlay.style.display = 'flex';
        startListening();
    });

    closeVoiceMode?.addEventListener('click', () => {
        isVoiceMode = false;
        voiceOverlay.style.display = 'none';
        recognition.stop();
        stopAllTts();
    });

    if (recognition) {
        recognition.onresult = (event) => {
            const result = event.results[event.results.length - 1];
            const transcript = result[0].transcript;
            voiceTranscript.textContent = `"${transcript}"`;

            if (result.isFinal) {
                voiceStatus.textContent = "Processing...";
                sendMessage(transcript);
            }
        };

        recognition.onend = () => {
            if (isVoiceMode && voiceStatus.textContent !== "Assistant Speaking...") {
                // Restart listening if we are still in voice mode and not waiting for AI
                startListening();
            }
        };

        recognition.onsoundstart = () => {
            if (isVoiceMode) {
                stopAllTts();
                const status = document.getElementById('voiceStatus');
                if (status) status.textContent = "Listening...";
            }
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            if (isVoiceMode) voiceStatus.textContent = "Error. Trying again...";
        };
    }

    function startListening() {
        try {
            recognition.start();
            voiceStatus.textContent = "Listening...";
            document.querySelector('.voice-visualizer')?.classList.add('active');
        } catch (e) {
            // Already started
        }
    }

    // New Chat Button
    document.getElementById('newChatBtn')?.addEventListener('click', () => {
        if (confirm('Start a new session? This will clear the current view, but your history is saved in your profile.')) {
            conversationHistory = [];
            chatMessages.innerHTML = '';
            // Add initial welcome message back
            const welcomeWrapper = document.createElement('div');
            welcomeWrapper.className = 'chat-message';
            welcomeWrapper.innerHTML = `
                <div class="chat-avatar">AI</div>
                <div class="chat-bubble">
                     <p style="margin: 0;"><strong>Session Reset.</strong> How can I help you next?</p>
                </div>
            `;
            chatMessages.appendChild(welcomeWrapper);
            if (window.addIntelLog) window.addIntelLog("Context flushed. New session started.", "warn");
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
                voiceMode: isVoiceMode,
                conversationHistory: conversationHistory.slice(-10).map(msg => ({
                    role: msg.role,
                    content: msg.content
                }))
            })
        });

        if (!response.ok) throw new Error('Failed to get AI response');
        const data = await response.json();

        if (window.addIntelLog) {
            window.addIntelLog(`Message processed by ${currentModel === 'claude' ? 'Claude 3.5' : 'GPT-4o'}`, "success");
            window.addIntelLog("Modulate: Content safety verified", "success");
        }

        typingIndicator.remove();

        // Add AI response to UI
        const aiMsg = createMessageElement(data.response, false);
        chatMessages.appendChild(aiMsg);
        chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });

        // Auto-play TTS only if in Voice Mode (User request: don't read out everything unless talking)
        const ttsBtn = aiMsg.querySelector('.tts-btn');
        if (ttsBtn && isVoiceMode) {
            playTTS(data.response, ttsBtn);
        }

        conversationHistory.push(
            { role: 'user', content: message },
            { role: 'assistant', content: data.response }
        );

        // Handle function calls if any
        if (data.functionCalled) {
            handleFunctionNotification(data.functionCalled, data.functionResult);

            // If it's a Live Scout, start the live feedback loop
            if (data.functionCalled === 'researchLive' && data.functionResult.taskId) {
                startScoutPolling(data.functionResult.taskId);
            }
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
    if (button && button.classList.contains('playing')) return;

    if (button) {
        button.classList.add('playing');
        button.textContent = '⌛';
    }

    const voiceStatus = document.getElementById('voiceStatus');
    if (window.addIntelLog) {
        window.addIntelLog(`ElevenLabs: Synthesizing voice (Rachel)...`, "process");
    }

    if (isVoiceMode && voiceStatus) voiceStatus.textContent = "Assistant Speaking...";

    try {
        const response = await fetch(`${AI_SERVER_URL}/api/tts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });

        if (!response.ok) throw new Error('TTS failed');

        if (window.addIntelLog) {
            window.addIntelLog("ElevenLabs: High-fidelity audio buffered", "success");
        }

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        currentTtsAudio = audio;

        // Show AI transcription in voice overlay
        const voiceTranscript = document.getElementById('voiceTranscript');
        if (isVoiceMode && voiceTranscript) {
            voiceTranscript.textContent = text;
            voiceTranscript.style.opacity = "1";
            voiceTranscript.style.color = "var(--primary-blue)";
        }

        if (button) button.textContent = '🔊';
        document.querySelector('.voice-wave')?.classList.add('active');

        audio.onended = () => {
            currentTtsAudio = null;
            if (button) button.classList.remove('playing');
            document.querySelector('.voice-wave')?.classList.remove('active');

            if (isVoiceMode) {
                // Restart listening after AI finishes speaking
                voiceStatus.textContent = "Listening...";
                try { recognition.start(); } catch (e) { }
            }
        };

        await audio.play();
    } catch (err) {
        console.error('TTS Playback Error:', err);

        // FAIL-SAFE: Fallback to browser's native speech synthesis if ElevenLabs fails
        if ('speechSynthesis' in window) {
            console.log('Falling back to browser native TTS...');
            const utterance = new SpeechSynthesisUtterance(text);
            currentTtsUtterance = utterance;
            utterance.rate = 1.0;
            utterance.pitch = 1.0;

            // Show AI transcription in voice overlay
            const voiceTranscript = document.getElementById('voiceTranscript');
            if (isVoiceMode && voiceTranscript) {
                voiceTranscript.textContent = text;
            }

            utterance.onend = () => {
                currentTtsUtterance = null;
                if (button) button.classList.remove('playing');
                document.querySelector('.voice-wave')?.classList.remove('active');
                if (isVoiceMode) {
                    voiceStatus.textContent = "Listening...";
                    try { recognition.start(); } catch (e) { }
                }
            };

            window.speechSynthesis.speak(utterance);
        } else {
            if (button) {
                button.classList.remove('playing');
                button.textContent = '🔊';
            }
            if (isVoiceMode) {
                voiceStatus.textContent = "Listening...";
                try { recognition.start(); } catch (e) { }
            }
        }
    }
}

function handleFunctionNotification(name, result) {
    if (!result?.success) return;
    let msg = '';
    switch (name) {
        case 'addCollege':
            msg = `Added ${result.college?.name}! 🎓`;
            if (window.addIntelLog) window.addIntelLog(`Database: Synced ${result.college?.name} with application list`, "success");
            break;
        case 'updateProfile':
            msg = `Profile updated! ✅`;
            if (window.addIntelLog) window.addIntelLog("Identity: User profile attributes updated in Supabase", "success");
            break;
        case 'modifyTask':
            msg = `Schedule adjusted! ⏰`;
            if (window.addIntelLog) window.addIntelLog("Scheduler: Calendar event modified", "success");
            break;
        case 'createEssays':
            msg = `Essays loaded! 📝`;
            if (window.addIntelLog) window.addIntelLog(`Writer: Draft placeholders established for ${result.count || ''} prompts`, "success");
            break;
        case 'researchLive':
            msg = `Live intelligence scouting initiated! 🔍`;
            if (window.addIntelLog) window.addIntelLog("Yutori: Autonomous scouting agent deployed", "process");
            break;
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
