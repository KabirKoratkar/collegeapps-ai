// Enhanced Essay Workspace with Real-time Autosave and Backend Integration

import {
    getCurrentUser,
    getUserEssays,
    getEssay,
    updateEssay,
    saveEssayVersion,
    shareEssay,
    getSharedEssays,
    addComment,
    getEssayComments,
    getUserDocuments,
    linkDocumentToEssay,
    unlinkDocumentFromEssay,
    getEssayDocuments,
    syncEssays
} from './supabase-config.js';
import { updateNavbarUser } from './ui.js';

let currentUser = null;
let currentEssay = null;
let autosaveTimer = null;
let lastSavedContent = '';

document.addEventListener('DOMContentLoaded', async function () {
    // Get current user
    currentUser = await getCurrentUser();

    if (!currentUser) {
        window.location.href = new URL('login.html', window.location.href).href;
        return;
    }

    updateNavbarUser(currentUser);

    // Sync missing essays for existing colleges
    if (window.showNotification) window.showNotification('Checking for missing essays...', 'info');
    await syncEssays(currentUser.id);

    // Load essays
    await loadEssays();

    // Share button
    const shareBtn = document.getElementById('shareBtn');
    const shareModal = document.getElementById('shareModal');
    const closeShareModal = document.getElementById('closeShareModal');
    const cancelShareBtn = document.getElementById('cancelShareBtn');
    const confirmShareBtn = document.getElementById('confirmShareBtn');
    const shareEmailInput = document.getElementById('shareEmailInput');
    const sharePermission = document.getElementById('sharePermission');

    if (shareBtn && shareModal) {
        shareBtn.addEventListener('click', function () {
            if (!currentEssay) {
                showNotification('Select an essay to share first!', 'warning');
                return;
            }
            shareModal.classList.add('active');
            shareEmailInput.value = '';
            shareEmailInput.focus();
        });

        const hideModal = () => shareModal.classList.remove('active');
        closeShareModal.onclick = hideModal;
        cancelShareBtn.onclick = hideModal;

        confirmShareBtn.onclick = async function () {
            const email = shareEmailInput.value.trim();
            const permission = sharePermission.value;

            if (email && email.includes('@')) {
                hideModal();
                showNotification('Sending invitation...', 'info');

                const shared = await shareEssay(currentEssay.id, currentUser.id, email, permission);
                if (shared) {
                    showNotification(`Essay shared with ${email}!`, 'success');
                } else {
                    showNotification('Error sharing essay. Please try again.', 'error');
                }
            } else {
                showNotification('Please enter a valid email address.', 'warning');
            }
        };
    }

    // Save button
    const saveBtn = document.getElementById('saveBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', async function () {
            await saveCurrentEssay();
            showNotification('Essay saved manually', 'success');
        });
    }

    const essayEditor = document.getElementById('essayEditor');
    const wordCountDisplay = document.getElementById('wordCount');
    const charCountDisplay = document.getElementById('charCount');

    if (essayEditor) {
        // Update counts on input
        essayEditor.addEventListener('input', function () {
            updateCounts();
            scheduleAutosave();
        });

        // Initialize counts
        updateCounts();
    }

    // Essay navigation (Static items)
    document.querySelectorAll('.essay-nav-item').forEach(item => {
        if (!item.dataset.shared) { // Don't double bind if already handled in loadEssays
            item.addEventListener('click', async function () {
                if (currentEssay && essayEditor.value !== lastSavedContent) {
                    await saveCurrentEssay();
                }
                document.querySelectorAll('.essay-nav-item').forEach(i => i.classList.remove('active'));
                this.classList.add('active');
                const essayId = this.dataset.essayId;
                await loadEssayContent(essayId);
            });
        }
    });

    // AI assistance buttons (New Sidebar Buttons)
    const aiButtons = document.querySelectorAll('.ai-action-btn');
    aiButtons.forEach(btn => {
        btn.addEventListener('click', function () {
            const action = this.dataset.action || this.textContent.trim();
            handleAIAction(action);
        });
    });

    // Save on page unload
    window.addEventListener('beforeunload', async function (e) {
        if (currentEssay && !essayEditor.readOnly && essayEditor.value !== lastSavedContent) {
            await saveCurrentEssay();
        }
    });

    // Link Document listener
    const linkDocBtn = document.getElementById('linkDocBtn');
    if (linkDocBtn) {
        linkDocBtn.addEventListener('click', async () => {
            if (!currentEssay) {
                showNotification('Select an essay first!', 'warning');
                return;
            }
            await linkDocument();
        });
    }

    // Comment listener
    const addCommentBtn = document.getElementById('addCommentBtn');
    const commentInput = document.getElementById('commentInput');
    if (addCommentBtn && commentInput) {
        addCommentBtn.addEventListener('click', async () => {
            const content = commentInput.value.trim();
            if (!content || !currentEssay) return;

            const comment = await addComment(currentEssay.id, currentUser.id, content);
            if (comment) {
                commentInput.value = '';
                await loadComments(currentEssay.id);
            }
        });

        commentInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') addCommentBtn.click();
        });
    }

    // Export global functions
    window.loadLinkedDocuments = loadLinkedDocuments;
    window.unlinkDocument = unlinkDocument;
});

async function loadComments(essayId) {
    const commentList = document.getElementById('commentList');
    if (!commentList) return;

    const comments = await getEssayComments(essayId);
    if (comments.length === 0) {
        commentList.innerHTML = '<p style="color: var(--gray-500); font-size: var(--text-sm);">No comments yet.</p>';
        return;
    }

    commentList.innerHTML = comments.map(c => {
        const userName = c.profiles?.full_name || c.profiles?.email || 'Unknown User';
        return `
            <div style="margin-bottom: var(--space-md); padding-bottom: var(--space-sm); border-bottom: 1px solid var(--gray-100);">
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                    <span style="font-weight: 700; font-size: var(--text-xs); color: var(--primary-blue);">${userName}</span>
                    <span style="font-size: 10px; color: var(--gray-400);">${c.created_at ? new Date(c.created_at).toLocaleDateString() : 'Unknown Date'}</span>
                </div>
                <div style="font-size: var(--text-sm); line-height: 1.4;">${c.content || ''}</div>
            </div>
        `;
    }).join('');

    commentList.scrollTop = commentList.scrollHeight;
}

async function loadLinkedDocuments(essayId) {
    const list = document.getElementById('linkedDocsList');
    if (!list) return;

    const docs = await getEssayDocuments(essayId);
    if (docs.length === 0) {
        list.innerHTML = '<p style="color: var(--gray-500); font-size: var(--text-sm);">No documents linked.</p>';
        return;
    }

    list.innerHTML = docs.map(doc => {
        if (!doc) return '';
        return `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-sm); padding: var(--space-xs); background: var(--gray-50); border-radius: var(--radius-sm);">
                <div style="font-size: var(--text-sm); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;">
                    📄 ${doc.name || 'Unnamed Document'}
                </div>
                <div style="display: flex; gap: 4px;">
                    <button class="btn btn-sm btn-ghost" onclick="viewFile('${doc.file_path}')" style="padding: 2px 4px;">📂</button>
                    <button class="btn btn-sm btn-ghost" onclick="unlinkDocument('${doc.id}')" style="padding: 2px 4px;">✕</button>
                </div>
            </div>
        `;
    }).join('');
}

async function linkDocument() {
    const docs = await getUserDocuments(currentUser.id);
    if (docs.length === 0) {
        showNotification('No documents found in vault. Upload some first!', 'warning');
        return;
    }

    const docList = docs.map((d, i) => `${i + 1}. ${d.name} (${d.category})`).join('\n');
    const choice = prompt(`Select a document to link by number:\n\n${docList}`);

    if (choice && !isNaN(choice)) {
        const index = parseInt(choice) - 1;
        if (docs[index]) {
            const linked = await linkDocumentToEssay(currentEssay.id, docs[index].id);
            if (linked) {
                showNotification('Document linked!', 'success');
                await loadLinkedDocuments(currentEssay.id);
            } else {
                showNotification('Document already linked.', 'info');
            }
        }
    }
}

async function unlinkDocument(docId) {
    if (confirm('Unlink this document?')) {
        const success = await unlinkDocumentFromEssay(currentEssay.id, docId);
        if (success) {
            showNotification('Document unlinked.', 'success');
            await loadLinkedDocuments(currentEssay.id);
        }
    }
}

// Ensure viewFile is available here too if needed, or import from main
window.viewFile = async function (filePath) {
    const { getDocumentUrl } = await import('./supabase-config.js');
    const url = await getDocumentUrl(filePath);
    if (url) window.open(url, '_blank');
};

async function loadEssays() {
    if (!currentUser) return;

    const essays = await getUserEssays(currentUser.id);
    const sharedEssays = await getSharedEssays(currentUser.email);

    const navList = document.getElementById('essayNavList');
    if (!navList) return;

    // Clear previous items
    navList.innerHTML = '';

    // Groups essays by college
    const grouped = essays.reduce((acc, essay) => {
        const collegeName = essay.colleges?.name || 'General';
        if (!acc[collegeName]) acc[collegeName] = [];
        acc[collegeName].push(essay);
        return acc;
    }, {});

    // Render personal essays
    Object.keys(grouped).forEach(college => {
        const section = document.createElement('div');
        section.style.marginBottom = 'var(--space-xl)';
        section.innerHTML = `<h4 class="nav-section-title">${college}</h4>`;

        grouped[college].forEach(essay => {
            const navItem = createNavItem(essay);
            section.appendChild(navItem);
        });
        navList.appendChild(section);
    });

    // Render shared essays
    if (sharedEssays.length > 0) {
        const sharedSection = document.createElement('div');
        sharedSection.style.marginTop = 'var(--space-2xl)';
        sharedSection.innerHTML = `<h4 class="nav-section-title">Shared With Me</h4>`;

        sharedEssays.forEach(item => {
            const essay = item.essays;
            if (essay) {
                const navItem = createNavItem(essay, true);
                sharedSection.appendChild(navItem);
            }
        });

        navList.appendChild(sharedSection);
    }

    if (essays.length === 0 && sharedEssays.length === 0) {
        navList.innerHTML = '<p class="empty-state">No essays yet.</p>';
        return;
    }

    // Load first available essay if none selected
    if (!currentEssay) {
        if (essays.length > 0) {
            await loadEssayContent(essays[0].id);
            navList.querySelector('.essay-nav-item')?.classList.add('active');
        } else if (sharedEssays.length > 0) {
            await loadEssayContent(sharedEssays[0].essays.id, true);
            navList.querySelector('.essay-nav-item')?.classList.add('active');
        }
    }
}

function createNavItem(essay, isShared = false) {
    if (!essay) return document.createElement('div');
    const navItem = document.createElement('div');
    navItem.className = 'essay-nav-item';
    navItem.dataset.essayId = essay.id;
    if (isShared) navItem.dataset.shared = "true";

    const userName = isShared ? (essay.profiles?.full_name || essay.profiles?.email || 'Unknown') : '';

    navItem.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 0.25rem;">${essay.title || 'Untitled Essay'}</div>
        <div style="font-size: var(--text-xs); color: var(--gray-500);">
            ${isShared ? 'From: ' + userName : (essay.word_limit || 0) + ' words'}
        </div>
    `;

    navItem.addEventListener('click', async function () {
        if (currentEssay && !isShared && document.getElementById('essayEditor').value !== lastSavedContent) {
            await saveCurrentEssay();
        }
        document.querySelectorAll('.essay-nav-item').forEach(i => i.classList.remove('active'));
        this.classList.add('active');
        await loadEssayContent(essay.id, isShared);
    });

    return navItem;
}

async function loadEssayContent(essayId, isReadOnly = false) {
    const essay = await getEssay(essayId);

    if (!essay) {
        showNotification('Failed to load essay', 'error');
        return;
    }

    currentEssay = essay;
    lastSavedContent = essay.content || '';

    const essayEditor = document.getElementById('essayEditor');
    const essayPrompt = document.getElementById('currentPrompt');
    const essayTypeBadge = document.getElementById('essayTypeBadge');

    if (essayEditor) {
        essayEditor.value = essay.content || '';
        essayEditor.readOnly = isReadOnly;
        updateCounts();
    }

    if (essayPrompt) {
        essayPrompt.innerHTML = essay.prompt || 'No prompt provided for this essay.';
    }

    if (essayTypeBadge) {
        essayTypeBadge.textContent = essay.essay_type || 'Common App';
    }

    // Load comments
    await loadComments(essayId);

    // Load linked documents
    await loadLinkedDocuments(essayId);

    // Disable AI buttons and Save if read only
    const aiButtons = document.querySelectorAll('.ai-action-btn');
    if (aiButtons) {
        aiButtons.forEach(btn => {
            btn.disabled = isReadOnly;
            btn.style.opacity = isReadOnly ? '0.5' : '1';
        });
    }

    if (saveBtn) {
        saveBtn.disabled = isReadOnly;
        saveBtn.style.opacity = isReadOnly ? '0.5' : '1';
    }

    showNotification(isReadOnly ? `Viewing Shared Essay: ${essay.title}` : `Loaded: ${essay.title}`, 'info');
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

async function handleAIAction(action) {
    console.log('AI Action:', action);

    if (action.includes('Save')) {
        await saveCurrentEssay();
        return;
    }

    if (!currentEssay) {
        showNotification('Select an essay first!', 'warning');
        return;
    }

    const essayEditor = document.getElementById('essayEditor');
    const content = essayEditor.value;
    const prompt = currentEssay.prompt || currentEssay.title;

    showNotification(`AI is working on ${action}...`, 'info');
    showSavingIndicator(true, 'AI Processing...');

    try {
        let aiMessage = '';
        if (action.includes('Brainstorm')) {
            aiMessage = `Please brainstorm 3-5 unique angles for this essay prompt: "${prompt}". My current context: ${content || 'No draft yet.'}`;
        } else if (action.includes('Outline')) {
            aiMessage = `Please provide a structured outline for this essay: "${prompt}". Use my current content as a base if any: ${content}`;
        } else if (action.includes('Rewrite')) {
            aiMessage = `Please rewrite the following essay content to make it more compelling while maintaining my voice: \n\n${content}`;
        } else if (action.includes('Improve')) {
            aiMessage = `Please review and improve the clarity, grammar, and flow of this essay: \n\n${content}`;
        }

        const response = await fetch(`${config.apiUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: aiMessage,
                userId: currentUser.id,
                conversationHistory: [] // Start fresh for specific actions
            })
        });

        if (!response.ok) throw new Error('AI Server error');

        const data = await response.json();
        showSavingIndicator(false);

        // For rewrite or improve, we might want to offer to replace the text
        // For now, let's show it in a notification or a custom modal
        // In a real app, you'd have a "diff" view. 
        // Let's just create a simple modal or alert with the response.

        const result = data.response;

        // Simple way to show AI result for brainstorming/outlining
        if (action.includes('Brainstorm') || action.includes('Outline')) {
            // Create a temporary overlay to show the AI's thoughts
            showAIResultModal(action, result);
        } else {
            // For rewrite/improve, maybe show it and ask to apply
            const apply = confirm(`AI Suggestion:\n\n${result.slice(0, 300)}...\n\nWould you like to replace your current draft with this improved version?`);
            if (apply) {
                essayEditor.value = result;
                updateCounts();
                await saveCurrentEssay();
                showNotification('AI improvements applied!', 'success');
            }
        }

    } catch (error) {
        console.error('AI Action Error:', error);
        showSavingIndicator(false);
        showNotification('AI service is currently unavailable. Please check your internet connection or try again later.', 'error');
    }
}

function showAIResultModal(title, content) {
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(15, 23, 42, 0.85);
        display: flex; align-items: center; justify-content: center;
        z-index: 2000;
        backdrop-filter: blur(16px);
    `;

    const card = document.createElement('div');
    card.className = 'card';
    card.style.cssText = `
        max-width: 600px; width: 90%; max-height: 80vh;
        overflow-y: auto; padding: var(--space-xl);
        position: relative; background: var(--gray-50); border: 1px solid var(--gray-200);
    `;

    const header = document.createElement('h2');
    header.textContent = `AI ${title}`;
    header.style.marginBottom = 'var(--space-lg)';

    const body = document.createElement('div');
    body.innerHTML = content.replace(/\n/g, '<br>');
    body.style.lineHeight = '1.6';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn btn-primary';
    closeBtn.textContent = 'Close';
    closeBtn.style.marginTop = 'var(--space-xl)';
    closeBtn.onclick = () => modal.remove();

    card.appendChild(header);
    card.appendChild(body);
    card.appendChild(closeBtn);
    modal.appendChild(card);
    document.body.appendChild(modal);
}
