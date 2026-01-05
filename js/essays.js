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
import config from './config.js';
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

    // Conceptual AI Review
    const reviewBtn = document.getElementById('reviewSelectionBtn');
    if (reviewBtn) {
        reviewBtn.addEventListener('click', async () => {
            const editor = document.getElementById('essayEditor');
            const selection = editor.value.substring(editor.selectionStart, editor.selectionEnd).trim();

            if (!selection) {
                showNotification('Please highlight some text in your essay first!', 'warning');
                return;
            }

            await handleConceptualReview(selection);
        });
    }

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

    // 1. Get real linked documents from Supabase
    const docs = await getEssayDocuments(essayId);

    // 2. Get AI-suggested sample essays based on current essay type/prompt
    const samples = getSampleEssays(currentEssay);

    if (docs.length === 0 && samples.length === 0) {
        list.innerHTML = '<p style="color: var(--gray-500); font-size: var(--text-sm);">No documents linked.</p>';
        return;
    }

    let html = '';

    // Render Samples First
    if (samples.length > 0) {
        html += `<div style="font-size: 10px; font-weight: 800; color: var(--primary-purple); text-transform: uppercase; margin-bottom: 8px; letter-spacing: 0.05em;">✨ AI Sample Essays</div>`;
        html += samples.map(sample => `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-sm); padding: var(--space-xs); background: rgba(139, 123, 247, 0.05); border: 1px dashed var(--primary-purple); border-radius: var(--radius-sm);">
                <div style="font-size: var(--text-sm); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; font-weight: 600; color: var(--gray-700);">
                    📖 ${sample.title}
                </div>
                <div style="display: flex; gap: 4px;">
                    <button class="btn btn-sm btn-ghost" onclick="window.viewSample('${sample.id}')" style="padding: 2px 4px;" title="View Sample">👁️</button>
                </div>
            </div>
        `).join('');
        html += `<hr style="border: 0; border-top: 1px solid var(--gray-100); margin: 12px 0;">`;
    }

    // Render Real Docs
    if (docs.length > 0) {
        html += `<div style="font-size: 10px; font-weight: 800; color: var(--gray-400); text-transform: uppercase; margin-bottom: 8px; letter-spacing: 0.05em;">📎 Your Documents</div>`;
        html += docs.map(doc => {
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

    list.innerHTML = html;
}

function getSampleEssays(essay) {
    if (!essay) return [];

    // Mock sample essays based on common themes
    const allSamples = [
        { id: 's1', title: 'Why Stanford: The Tech-Social Balance', type: 'Supplement', keywords: ['Stanford', 'Why'] },
        { id: 's2', title: 'Overcoming Failure: The Broken Violin', type: 'Common App', keywords: ['Common App', 'Personal'] },
        { id: 's3', title: 'Community Impact: Local Coding Camp', type: 'Supplement', keywords: ['Community', 'Contribution'] },
        { id: 's4', title: 'The Roommate Letter: Espresso & Late Nights', type: 'Supplement', keywords: ['Roommate'] },
        { id: 's5', title: 'Modernizing Classical Music: Academic Why', type: 'Supplement', keywords: ['Academic', 'Major'] }
    ];

    // Simple matching logic
    return allSamples.filter(s => {
        const title = essay.title.toLowerCase();
        return s.keywords.some(k => title.includes(k.toLowerCase()));
    }).slice(0, 3);
}

window.viewSample = function (id) {
    showNotification("Sample essay view coming soon! This would open a read-only modal with high-scoring examples.", "info");
};

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
    const statusIndicators = [
        document.getElementById('save-status'),
        document.getElementById('save-status-indicator')
    ];

    statusIndicators.forEach(indicator => {
        if (indicator) {
            indicator.textContent = message;
            indicator.style.color = saving ? 'var(--primary-blue)' : 'var(--gray-400)';
            if (saving) {
                indicator.style.fontWeight = '600';
            } else {
                indicator.style.fontWeight = '400';
                setTimeout(() => {
                    if (indicator.textContent === message) {
                        indicator.textContent = 'All changes saved';
                    }
                }, 3000);
            }
        }
    });

    // Also update the floating one if it exists or for legacy compatibility
    let indicator = document.getElementById('save-indicator');
    if (indicator) {
        indicator.textContent = message;
        indicator.style.opacity = saving ? '1' : '0.7';
        if (!saving) {
            setTimeout(() => {
                indicator.style.opacity = '0';
            }, 2000);
        }
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

async function handleConceptualReview(selection) {
    if (!currentEssay) return;

    const feedbackContainer = document.getElementById('aiFeedbackContainer');
    const editor = document.getElementById('essayEditor');
    const content = editor.value;
    const prompt = currentEssay.prompt || currentEssay.title;

    // Show loading state in the container
    const loadingId = 'loading-' + Date.now();
    const loadingHtml = `
        <div id="${loadingId}" class="card" style="padding: var(--space-md); background: var(--gray-50); border: 1px dashed var(--primary-blue); margin-bottom: var(--space-sm);">
            <div style="display: flex; align-items: center; gap: var(--space-sm);">
                <div class="loading-spinner" style="width: 14px; height: 14px;"></div>
                <span style="font-size: var(--text-xs); color: var(--gray-500);">Analyzing selection...</span>
            </div>
        </div>
    `;

    // Remove empty state if present
    const emptyState = feedbackContainer.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    feedbackContainer.insertAdjacentHTML('afterbegin', loadingHtml);
    feedbackContainer.scrollTop = 0;

    try {
        const aiMessage = `
            Task: Provide CONCEPTUAL and STRATEGIC feedback on the following selection from a college essay.
            
            Essay Prompt: "${prompt}"
            Full Essay Content: "${content}"
            HIGHLIGHTED SELECTION: "${selection}"
            
            STRICT RULES:
            - Do NOT provide rewrites.
            - Do NOT provide better sentences.
            - Focus ONLY on conceptual growth: what's missing, what the theme is, how it connects to the prompt.
            - Be concise (2-3 bullet points maximum).
            - Use a professional, counselor-like tone.
        `;

        const response = await fetch(`${config.apiUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: aiMessage,
                userId: currentUser.id,
                conversationHistory: []
            })
        });

        if (!response.ok) throw new Error('AI Server error');

        const data = await response.json();
        const feedback = data.response;

        // Replace loading with real feedback
        const loadingEl = document.getElementById(loadingId);
        if (loadingEl) {
            loadingEl.innerHTML = `
                <div style="font-size: var(--text-xs); color: var(--primary-blue); font-weight: 700; margin-bottom: var(--space-xs); display: flex; justify-content: space-between; align-items: center;">
                    <span style="display: flex; align-items: center; gap: 4px;">🎯 Insight</span>
                    <span style="font-weight: 400; color: var(--gray-400);">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div style="font-size: 11px; color: var(--gray-500); font-style: italic; margin-bottom: var(--space-md); border-left: 2px solid var(--gray-200); padding-left: var(--space-sm); line-height: 1.4;">
                    "${selection.length > 70 ? selection.substring(0, 70) + '...' : selection}"
                </div>
                <div style="font-size: var(--text-sm); line-height: 1.5; color: var(--gray-800);">
                    ${feedback.replace(/\n/g, '<br>')}
                </div>
            `;
            loadingEl.style.background = 'var(--white)';
            loadingEl.style.borderStyle = 'solid';
            loadingEl.style.borderColor = 'var(--gray-200)';
            loadingEl.style.animation = 'fadeIn 0.5s ease-out';
        }

    } catch (error) {
        console.error('AI Review Error:', error);
        const loadingEl = document.getElementById(loadingId);
        if (loadingEl) {
            loadingEl.innerHTML = `<p style="color: var(--error); font-size: var(--text-xs);">Failed to get AI feedback. Ensure backend is running.</p>`;
        }
    }
}
