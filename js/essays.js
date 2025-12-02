// Enhanced Essay Workspace with Real-time Autosave and Backend Integration

import {
    getCurrentUser,
    getUserEssays,
    getEssay,
    updateEssay,
    saveEssayVersion
} from './supabase-config.js';

let currentUser = null;
let currentEssay = null;
let autosaveTimer = null;
let lastSavedContent = '';

document.addEventListener('DOMContentLoaded', async function () {
    // Get current user
    currentUser = await getCurrentUser();

    if (!currentUser) {
        window.location.href = 'login.html';
        return;
    }

    // Load essays
    await loadEssays();

    const essayEditor = document.getElementById('essayEditor');
    const wordCountDisplay = document.getElementById('wordCount');
    const charCountDisplay = document.getElementById('charCount');

    // Update word/character count
    function updateCounts() {
        if (!essayEditor) return;

        const text = essayEditor.value;
        const words = text.trim().split(/\s+/).filter(word => word.length > 0).length;
        const chars = text.length;

        if (wordCountDisplay) wordCountDisplay.textContent = words;
        if (charCountDisplay) charCountDisplay.textContent = chars;

        // Update word count in current essay object
        if (currentEssay) {
            currentEssay.word_count = words;
            currentEssay.char_count = chars;
        }
    }

    if (essayEditor) {
        // Update counts on input
        essayEditor.addEventListener('input', function () {
            updateCounts();
            scheduleAutosave();
        });

        updateCounts(); // Initial count
    }

    // Essay navigation
    document.querySelectorAll('.essay-nav-item').forEach(item => {
        item.addEventListener('click', async function () {
            // Check if we need to save current essay first
            if (currentEssay && essayEditor.value !== lastSavedContent) {
                await saveCurrentEssay();
            }

            // Remove active class from all
            document.querySelectorAll('.essay-nav-item').forEach(i => i.classList.remove('active'));
            // Add active to clicked
            this.classList.add('active');

            const essayId = this.dataset.essayId;
            await loadEssayContent(essayId);
        });
    });

    // AI assistance buttons
    const aiButtons = document.querySelectorAll('.essay-toolbar .btn');
    aiButtons.forEach(btn => {
        btn.addEventListener('click', function () {
            const action = this.textContent.trim();
            handleAIAction(action);
        });
    });

    // Save on page unload
    window.addEventListener('beforeunload', async function (e) {
        if (currentEssay && essayEditor.value !== lastSavedContent) {
            e.preventDefault();
            await saveCurrentEssay();
        }
    });
});

async function loadEssays() {
    if (!currentUser) return;

    const essays = await getUserEssays(currentUser.id);

    if (essays.length === 0) {
        showNotification('No essays yet. The AI can create essays when you add colleges!', 'info');
        return;
    }

    // Group essays by type/college
    const commonAppEssays = essays.filter(e => e.essay_type === 'Common App');
    const ucEssays = essays.filter(e => e.essay_type === 'UC PIQ');
    const supplementalEssays = essays.filter(e => e.essay_type === 'Supplement');

    // Update sidebar with real essays
    // TODO: Dynamically rebuild sidebar with real data
    // For now, load the first essay
    if (essays.length > 0) {
        await loadEssayContent(essays[0].id);
    }
}

async function loadEssayContent(essayId) {
    const essay = await getEssay(essayId);

    if (!essay) {
        showNotification('Failed to load essay', 'error');
        return;
    }

    currentEssay = essay;
    lastSavedContent = essay.content || '';

    const essayEditor = document.getElementById('essayEditor');
    const essayPrompt = document.querySelector('.essay-prompt');

    if (essayEditor) {
        essayEditor.value = essay.content || '';
        updateCounts();
    }

    if (essayPrompt) {
        essayPrompt.innerHTML = `<strong>${essay.title}</strong><br>${essay.prompt || ''}`;
    }

    showNotification(`Loaded: ${essay.title}`, 'info');
}

function scheduleAutosave() {
    // Clear existing timer
    if (autosaveTimer) {
        clearTimeout(autosaveTimer);
    }

    // Schedule autosave for 3 seconds after last keystroke
    autosaveTimer = setTimeout(async () => {
        await saveCurrentEssay();
    }, 3000);
}

async function saveCurrentEssay() {
    if (!currentEssay) return;

    const essayEditor = document.getElementById('essayEditor');
    if (!essayEditor) return;

    const content = essayEditor.value;

    // Don't save if content hasn't changed
    if (content === lastSavedContent) return;

    // Show saving indicator
    showSavingIndicator(true);

    try {
        // Update essay
        const updated = await updateEssay(currentEssay.id, {
            content,
            word_count: currentEssay.word_count,
            char_count: currentEssay.char_count
        });

        if (updated) {
            lastSavedContent = content;
            showSavingIndicator(false, 'Saved');

            // Save version every 10 saves or significant changes
            const wordDiff = Math.abs(
                content.split(/\s+/).length - lastSavedContent.split(/\s+/).length
            );

            if (wordDiff > 50) {
                await saveEssayVersion(
                    currentEssay.id,
                    currentUser.id,
                    content,
                    currentEssay.word_count,
                    (currentEssay.version || 1) + 1
                );
            }
        } else {
            showSavingIndicator(false, 'Error saving');
            showNotification('Failed to save essay', 'error');
        }
    } catch (error) {
        console.error('Error saving essay:', error);
        showSavingIndicator(false, 'Error');
        showNotification('Error saving essay', 'error');
    }
}

function showSavingIndicator(saving, message = 'Saving...') {
    let indicator = document.getElementById('save-indicator');

    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'save-indicator';
        indicator.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            padding: 0.5rem 1rem;
            background: #5B8DEE;
            color: white;
            border-radius: 8px;
            font-size: 0.875rem;
            font-weight: 600;
            z-index: 1000;
            transition: opacity 0.3s;
        `;
        document.body.appendChild(indicator);
    }

    indicator.textContent = message;
    indicator.style.opacity = saving ? '1' : '0.7';

    if (!saving) {
        setTimeout(() => {
            indicator.style.opacity = '0';
        }, 2000);
    }
}

function updateCounts() {
    const essayEditor = document.getElementById('essayEditor');
    const wordCountDisplay = document.getElementById('wordCount');
    const charCountDisplay = document.getElementById('charCount');

    if (!essayEditor) return;

    const text = essayEditor.value;
    const words = text.trim().split(/\s+/).filter(word => word.length > 0).length;
    const chars = text.length;

    if (wordCountDisplay) wordCountDisplay.textContent = words;
    if (charCountDisplay) charCountDisplay.textContent = chars;

    if (currentEssay) {
        currentEssay.word_count = words;
        currentEssay.char_count = chars;
    }
}

function handleAIAction(action) {
    console.log('AI Action:', action);

    if (action.includes('Save')) {
        saveCurrentEssay();
        return;
    }

    // TODO: Implement AI assistance features
    if (action.includes('Brainstorm')) {
        showNotification('AI brainstorming coming soon!', 'info');
    } else if (action.includes('Outline')) {
        showNotification('AI outline generation coming soon!', 'info');
    } else if (action.includes('Rewrite')) {
        showNotification('AI rewriting coming soon!', 'info');
    } else if (action.includes('Improve')) {
        showNotification('AI clarity improvements coming soon!', 'info');
    }
}
