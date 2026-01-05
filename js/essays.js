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

    // Google Import 
    const importBtn = document.getElementById('importGoogleBtn');
    if (importBtn) {
        importBtn.addEventListener('click', () => {
            showNotification('Google Drive integration coming soon! For now, please copy and paste your draft.', 'info');
        });
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

    // Essay Search
    const essaySearch = document.getElementById('essaySearch');
    if (essaySearch) {
        essaySearch.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const items = document.querySelectorAll('.essay-nav-item');
            items.forEach(item => {
                const text = item.textContent.toLowerCase();
                item.style.display = text.includes(term) ? 'block' : 'none';
            });
        });
    }

    // Finalize button
    const finalizeBtn = document.getElementById('finalizeBtn');
    if (finalizeBtn) {
        finalizeBtn.onclick = async () => {
            if (!currentEssay) return;
            const success = await updateEssay(currentEssay.id, { is_completed: true });
            if (success) {
                showNotification('Essay finalized!', 'success');
                currentEssay.is_completed = true;
                finalizeBtn.style.display = 'none';
                await loadEssays();
            }
        };
    }

    // Export global functions
    window.loadLinkedDocuments = loadLinkedDocuments;
    window.unlinkDocument = unlinkDocument;

    // Sample Modal Close
    const closeSampleModal = document.getElementById('closeSampleModal');
    if (closeSampleModal) {
        closeSampleModal.onclick = () => {
            document.getElementById('sampleModal').classList.remove('active');
        };
    }
});


async function loadComments(essayId) {
    const commentList = document.getElementById('commentList');
    if (!commentList) return;

    const comments = await getEssayComments(essayId);
    if (comments.length === 0) {
        commentList.innerHTML = '<p class="empty-state">No comments yet.</p>';
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
    const samplesContainer = document.getElementById('sampleEssaysList');
    if (!list || !samplesContainer) return;

    // 1. Render Sample Essays
    const samples = getSampleEssays(currentEssay);
    if (samples.length === 0) {
        samplesContainer.innerHTML = '<p class="empty-state" style="color: var(--gray-400);">No premium samples available for this specific prompt yet.</p>';
    } else {
        samplesContainer.innerHTML = samples.map(sample => `
            <div class="card card-compact" style="padding: var(--space-sm); border: 1px solid rgba(91, 141, 238, 0.1); transition: all 0.2s ease; cursor: pointer;" onclick="window.viewSample('${sample.id}')">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2px;">
                    <div style="font-size: 11px; font-weight: 700; color: var(--gray-800); line-height: 1.3;">${sample.title}</div>
                    <span style="font-size: 10px;">📖</span>
                </div>
                <div style="font-size: 9px; color: var(--gray-400); text-transform: uppercase;">View Full Essay →</div>
            </div>
        `).join('');
    }

    // 2. Render Linked Strategy Docs
    const docs = await getEssayDocuments(essayId);

    if (docs.length === 0) {
        list.innerHTML = '<p class="empty-state">No strategy documents linked.</p>';
        return;
    }

    list.innerHTML = docs.map(doc => `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-sm); padding: var(--space-xs) var(--space-sm); background: var(--gray-50); border-radius: var(--radius-sm); border-left: 3px solid var(--gray-200);">
            <div style="font-size: var(--text-sm); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; color: var(--gray-700);">
                📄 ${doc.name || 'Unnamed Document'}
            </div>
            <div style="display: flex; gap: 4px;">
                <button class="btn btn-xs btn-ghost" onclick="viewFile('${doc.file_path}')" style="padding: 2px 4px;">📂</button>
                <button class="btn btn-xs btn-ghost" onclick="unlinkDocument('${doc.id}')" style="padding: 2px 4px; color: var(--error);">✕</button>
            </div>
        </div>
    `).join('');
}


function getSampleEssays(essay) {
    if (!essay) return [];
    const allSamples = [
        { id: 's1', title: 'The Stanford Social Balance', keywords: ['Stanford', 'Why'] },
        { id: 's2', title: 'Broken Violins: Growth Through Failure', keywords: ['Common App', 'Personal'] },
        { id: 's3', title: 'Local Coding Camp: Community Impact', keywords: ['Community', 'Contribution', 'Activity'] },
        { id: 's4', title: 'Espresso nights: A Letter to Roommate', keywords: ['Roommate'] },
        { id: 's5', title: 'Modern Music: An Academic Journey', keywords: ['Academic', 'Major', 'CS'] },
        { id: 's6', title: 'The Persistence of Curiosity', keywords: ['Personal'] }
    ];

    const query = (essay.title + ' ' + (essay.prompt || '')).toLowerCase();
    return allSamples.filter(s => {
        return s.keywords.some(k => query.includes(k.toLowerCase())) || query.includes('personal');
    }).slice(0, 3);
}


const MOCK_SAMPLES = {
    's1': {
        title: 'The Stanford Social Balance',
        content: `I have always found myself at the intersection of contrasting worlds. In my high school's robotics lab, I was the girl who could debug C++ code with one hand while organizing a community fundraiser for local music programs with the other. Stanford's interdisciplinary spirit isn't just an academic preference for me; it's a way of being.\n\nAt Stanford, I hope to join the CS+Social Good community. I want to build tools that increase accessibility in public transit, using algorithms to optimize routes for underserved neighborhoods. My experience volunteering at the San Jose Transit Authority showed me that data without empathy is just numbers. I saw elderly passengers waiting hours for buses that were rerouted due to poor predictive modeling. At Stanford, I want to bridge that gap...\n\nBeyond the screen, I look forward to the "Stanford Marriage of Arts and Sciences." I want to continue my violin studies at the Bing Concert Hall while exploring Ethics in Technology. This balance is where I thrive—where the precision of code meets the nuance of human experience.`
    },
    's2': {
        title: 'Broken Violins: Growth Through Failure',
        content: `The sound of a snapping string is final. In the middle of my solo at the Regional Orchestra Competition, my A-string didn't just go out of tune—it gave up. For three seconds, the hall was silent. For those three seconds, I felt my entire identity as a "perfect" student athlete and musician dissolve.\n\nBut growth doesn't happen in the applause; it happens in the silence. I didn't leave the stage. I re-tuned my remaining strings in seconds and transposed the rest of the Vivaldi concerto on the fly. It wasn't the performance I had practiced for ten months, but it was the most honest piece of music I've ever played. This moment taught me that resilience isn't about never breaking—it's about knowing how to play with what's left. In my academic life, I've applied this "musical transposition" to my physics experiments and my leadership in the debate club...`
    },
    's3': {
        title: 'Local Coding Camp: Community Impact',
        content: `“Is it going to explode?” six-year-old Maya asked as we plugged in the first LED. I laughed, but I realized then that to a child in a neighborhood with limited tech resources, a simple breadboard looks like magic. My goal with 'CodeLocal' wasn't just to teach Python; it was to demystify that magic.\n\nGrowing up in a low-income district, I saw a persistent 'digital divide.' Students here weren't less capable; they were less exposed. Over ten weeks, I led a team of five volunteers to teach basic logic and web design to thirty middle-schoolers. We didn't have the latest MacBook Pros, but we had curiosity. By the end of the summer, Maya had built a website about her favorite planets. Seeing her face light up when her code worked was more rewarding than any grade I've received. This experience solidified my commitment to using technology as a lever for social equity.`
    }
};

window.viewSample = (id) => {
    const sample = MOCK_SAMPLES[id] || { title: 'Sample Essay', content: 'Sample essay content coming soon!' };
    const modal = document.getElementById('sampleModal');
    const titleEl = document.getElementById('sampleTitle');
    const contentEl = document.getElementById('sampleContent');

    if (modal && titleEl && contentEl) {
        titleEl.textContent = sample.title;
        contentEl.innerHTML = sample.content.replace(/\n\n/g, '<br><br>');
        modal.classList.add('active');
    }
};


async function linkDocument() {
    const docs = await getUserDocuments(currentUser.id);
    if (docs.length === 0) {
        showNotification('No documents found in vault.', 'warning');
        return;
    }
    const docList = docs.map((d, i) => `${i + 1}. ${d.name}`).join('\n');
    const choice = prompt(`Select a document to link:\n\n${docList}`);
    if (choice && !isNaN(choice)) {
        const index = parseInt(choice) - 1;
        if (docs[index]) {
            const linked = await linkDocumentToEssay(currentEssay.id, docs[index].id);
            if (linked) {
                showNotification('Document linked!', 'success');
                await loadLinkedDocuments(currentEssay.id);
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

window.viewFile = async (filePath) => {
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

    // Portals we want to group by
    const portalGroups = {
        'Common App': [],
        'UC App': [],
        'Coalition App': [],
        'Others': []
    };

    // Filter for "One Common App Personal Statement"
    // Keep only the first Common App Personal Statement we find
    let commonAppPSAdded = false;

    const uniqueEssays = essays.filter(e => {
        if (e.essay_type === 'Personal Statement' && (e.colleges?.application_platform === 'Common App' || e.title.includes('Common App'))) {
            if (commonAppPSAdded) return false;
            commonAppPSAdded = true;
            return true;
        }
        return true;
    });

    uniqueEssays.forEach(essay => {
        const platform = essay.colleges?.application_platform || 'Others';
        if (portalGroups[platform]) {
            portalGroups[platform].push(essay);
        } else {
            portalGroups['Others'].push(essay);
        }
    });

    // Render Portal Groups
    Object.keys(portalGroups).forEach(portal => {
        const groupEssays = portalGroups[portal];
        if (groupEssays.length === 0) return;

        const section = document.createElement('div');
        section.style.marginBottom = 'var(--space-xl)';
        section.innerHTML = `
            <h4 class="nav-section-title" style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 14px;">${portal === 'Common App' ? '🟦' : (portal === 'UC App' ? '🐻' : '📁')}</span>
                ${portal}
            </h4>
        `;

        // If it's Others, maybe group by college still
        if (portal === 'Others') {
            const othersGrouped = groupEssays.reduce((acc, e) => {
                const collegeName = e.colleges?.name || 'General';
                if (!acc[collegeName]) acc[collegeName] = [];
                acc[collegeName].push(e);
                return acc;
            }, {});

            Object.keys(othersGrouped).forEach(college => {
                const collegeSubTitle = document.createElement('div');
                collegeSubTitle.style.fontSize = '10px';
                collegeSubTitle.style.fontWeight = '700';
                collegeSubTitle.style.color = 'var(--gray-400)';
                collegeSubTitle.style.textTransform = 'uppercase';
                collegeSubTitle.style.margin = 'var(--space-sm) 0 var(--space-xs) var(--space-sm)';
                collegeSubTitle.textContent = college;
                section.appendChild(collegeSubTitle);

                othersGrouped[college].forEach(essay => {
                    section.appendChild(createNavItem(essay));
                });
            });
        } else {
            groupEssays.forEach(essay => {
                section.appendChild(createNavItem(essay));
            });
        }

        navList.appendChild(section);
    });

    // Render shared essays
    if (sharedEssays.length > 0) {
        const sharedSection = document.createElement('div');
        sharedSection.style.marginTop = 'var(--space-2xl)';
        sharedSection.innerHTML = `
            <h4 class="nav-section-title" style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 14px;">👥</span>
                Shared With Me
            </h4>
        `;

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
    const customQuestionField = document.getElementById('aiCustomQuestion');
    const customQuestion = customQuestionField?.value.trim();
    const content = editor.value;
    const promptTitle = currentEssay.prompt || currentEssay.title;

    if (!selection && !customQuestion) {
        showNotification('Highlight text or ask a question first!', 'info');
        return;
    }

    // Show loading state in the container
    const loadingId = 'loading-' + Date.now();
    const loadingHtml = `
        <div id="${loadingId}" class="card" style="padding: var(--space-md); background: var(--gray-50); border: 1px dashed var(--accent-purple); margin-bottom: var(--space-sm);">
            <div style="display: flex; align-items: center; gap: var(--space-sm);">
                <div class="loading-spinner" style="width: 14px; height: 14px;"></div>
                <span style="font-size: var(--text-xs); color: var(--gray-500);">Counselor is thinking...</span>
            </div>
        </div>
    `;

    // Remove empty state if present
    const emptyState = feedbackContainer.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    feedbackContainer.insertAdjacentHTML('afterbegin', loadingHtml);
    feedbackContainer.scrollTop = 0;

    // Clear question field for next use
    if (customQuestionField) customQuestionField.value = '';

    try {
        const aiMessage = `
            Task: Provide high-level ADMISSIONS COUNSELING and STRATEGIC feedback.
            
            Essay Category/Prompt: "${promptTitle}"
            Full Essay Content: "${content}"
            ${selection ? `HIGHLIGHTED SELECTION FOR FOCUS: "${selection}"` : 'No specific text highlighted.'}
            ${customQuestion ? `SPECIFIC STUDENT QUESTION: "${customQuestion}"` : ''}
            
            STRICT ADMISSIONS COACH RULES:
            1. NEVER provide text that can be copied/pasted directly into the essay. 
            2. NEVER rewrite sentences or provide "better" versions.
            3. Focus on: Narrative impact, thematic consistency, and whether the student is addressing the prompt effectively.
            4. If a specific question is asked, answer it as an expert counselor would, focusing on advice and perspective.
            5. Keep the response concise and encouraging. 
            6. Use a tone that feels like a mentor giving high-level guidance.
        `;

        const response = await fetch(`${config.apiUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: aiMessage,
                userId: currentUser.id,
                conversationHistory: [] // Keep results independent for the sidebar history
            })
        });

        if (!response.ok) throw new Error('AI Server error');

        const data = await response.json();
        const feedback = data.response;

        // Replace loading with real feedback
        const loadingEl = document.getElementById(loadingId);
        if (loadingEl) {
            loadingEl.innerHTML = `
                <div style="font-size: var(--text-xs); color: var(--accent-purple); font-weight: 700; margin-bottom: var(--space-xs); display: flex; justify-content: space-between; align-items: center;">
                    <span style="display: flex; align-items: center; gap: 4px;">✨ Counselor Insight</span>
                    <span style="font-weight: 400; color: var(--gray-400);">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                ${customQuestion ? `<div style="font-size: 11px; font-weight: 600; color: var(--gray-600); margin-bottom: 4px;">Q: ${customQuestion}</div>` : ''}
                ${selection ? `
                    <div style="font-size: 10px; color: var(--gray-400); font-style: italic; margin-bottom: var(--space-md); border-left: 2px solid var(--gray-200); padding-left: var(--space-sm); line-height: 1.4;">
                        Ref: "${selection.length > 50 ? selection.substring(0, 50) + '...' : selection}"
                    </div>
                ` : ''}
                <div style="font-size: var(--text-sm); line-height: 1.5; color: var(--gray-800);">
                    ${feedback.replace(/\n/g, '<br>')}
                </div>
            `;
            loadingEl.style.background = 'var(--white)';
            loadingEl.style.borderStyle = 'solid';
            loadingEl.style.borderColor = 'var(--gray-100)';
            loadingEl.style.boxShadow = 'var(--shadow-sm)';
        }

    } catch (error) {
        console.error('AI Counseling Error:', error);
        const loadingEl = document.getElementById(loadingId);
        if (loadingEl) {
            loadingEl.innerHTML = `<p style="color: var(--error); font-size: var(--text-xs); padding: var(--space-sm);">Error connecting to counselor. Please try again.</p>`;
        }
    }
}

