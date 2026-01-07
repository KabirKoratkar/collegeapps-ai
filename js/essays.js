// Enhanced Essay Workspace with Real-time Autosave and Backend Integration

import {
    getCurrentUser,
    getUserEssays,
    getEssay,
    updateEssay,
    updateProfile,
    getUserProfile,
    saveEssayVersion,
    shareEssay,
    getSharedEssays,
    addComment,
    getEssayComments,
    getUserDocuments,
    linkDocumentToEssay,
    unlinkDocumentFromEssay,
    getEssayDocuments,
    syncEssays,
    getActivities,
    getAwards,
    addActivity,
    addAward,
    updateActivity,
    updateAward,
    deleteActivity,
    deleteAward
} from './supabase-config.js';
import config from './config.js';
import { updateNavbarUser } from './ui.js';

let currentUser = null;
let currentEssay = null;
let autosaveTimer = null;
let lastSavedContent = '';

const OFFICIAL_DIRECTIONS = {
    activities: {
        title: "Common App Activities Guide",
        content: "List up to 10 activities. Focus on leadership, impact, and measurable results. Use strong action verbs. You have 50 chars for position/org and 150 chars for the description.",
        tips: ["Quantify your impact (numbers, dates)", "Start with most important", "Show progression over years"]
    },
    awards: {
        title: "Awards & Honors Guide",
        content: "List up to 5 academic honors. Focus on the most prestigious regional, state, or national awards first.",
        tips: ["Explain cryptic acronyms", "Higher level recognition (National/Intl) carries more weight"]
    },
    commonapp: {
        title: "Personal Statement Directions",
        content: "The essay helps you distinguish yourself in your own voice. Focus on a story only you can tell. (250-650 words)",
        tips: ["Show, don't tell", "Focus on your growth/reflection", "The 'Hook' is crucial"]
    },
    ucpiq: {
        title: "UC Personal Insight Questions",
        content: "Select 4 out of 8 questions. Each response is max 350 words. Be direct, use 'I' statements, and focus on your specific contributions.",
        tips: ["Treat it as an interview on paper", "Don't be poetic; be clear and factual", "Focus on what you did and the outcome"]
    }
};

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
        if (!item.dataset.shared && !item.dataset.module) {
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
            const editorContainer = document.getElementById('essayEditorContainer');
            const moduleContainer = document.getElementById('moduleContainer');

            let selection = '';
            let isModuleReview = false;

            if (editorContainer.style.display !== 'none') {
                // Essay View
                selection = editor.value.substring(editor.selectionStart, editor.selectionEnd).trim();
                // If nothing is selected, we'll review the whole thing (handled in handleConceptualReview)
            } else {
                // Module View
                isModuleReview = true;
                selection = window.getSelection().toString().trim();
            }

            await handleConceptualReview(selection, isModuleReview);
        });
    }

    // Save on page unload
    window.addEventListener('beforeunload', async function (e) {
        if (currentEssay && !essayEditor.readOnly && essayEditor.value !== lastSavedContent) {
            await saveCurrentEssay();
        }
    });

    // Essay Search

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
    window.switchView = switchView;

    // Sample Modal Close
    const closeSampleModal = document.getElementById('closeSampleModal');
    if (closeSampleModal) {
        closeSampleModal.onclick = () => {
            document.getElementById('sampleModal').classList.remove('active');
        };
    }

    // --- Activity & Award Handlers ---

    // Sidebar Navigation
    document.querySelectorAll('[data-module]').forEach(item => {
        item.addEventListener('click', function () {
            const moduleName = this.dataset.module;
            switchView(moduleName);
        });
    });

    // Add Item Button (Plus)
    const addModuleItemBtn = document.getElementById('addModuleItemBtn');
    if (addModuleItemBtn) {
        addModuleItemBtn.onclick = () => {
            const currentModule = document.getElementById('moduleContainer').dataset.activeModule;
            if (currentModule === 'activities') {
                openActivityModal();
            } else {
                openAwardModal();
            }
        };
    }

    // AI Review Module Button
    const aiReviewModuleBtn = document.getElementById('aiReviewModuleBtn');
    if (aiReviewModuleBtn) {
        aiReviewModuleBtn.onclick = async () => {
            await handleConceptualReview(null, true);
        };
    }

    // Activity Form Submit
    const activityForm = document.getElementById('activityForm');
    if (activityForm) {
        activityForm.onsubmit = async (e) => {
            e.preventDefault();
            await saveActivity();
        };
    }

    // Award Form Submit
    const awardForm = document.getElementById('awardForm');
    if (awardForm) {
        awardForm.onsubmit = async (e) => {
            e.preventDefault();
            await saveAward();
        };
    }

    // Description Counter
    const actDesc = document.getElementById('actDesc');
    const descCount = document.getElementById('descCharCount');
    if (actDesc && descCount) {
        actDesc.oninput = () => {
            descCount.textContent = `${actDesc.value.length} / 150`;
            descCount.style.color = actDesc.value.length >= 140 ? 'var(--error)' : 'var(--gray-400)';
        };
    }

    // Close Modals
    ['Activity', 'Award'].forEach(mod => {
        const closeBtn = document.getElementById(`close${mod}Modal`);
        const cancelBtn = document.getElementById(`cancel${mod}Btn`);
        const modal = document.getElementById(`${mod.toLowerCase()}Modal`);
        if (closeBtn) closeBtn.onclick = () => modal.classList.remove('active');
        if (cancelBtn) cancelBtn.onclick = () => modal.classList.remove('active');
    });

});

// --- State Management ---

async function switchView(view) {
    const editorContainer = document.getElementById('essayEditorContainer');
    const moduleContainer = document.getElementById('moduleContainer');
    const navItems = document.querySelectorAll('.essay-nav-item');
    const sampleCard = document.getElementById('sampleEssaysCard');
    const strategyCard = document.getElementById('strategySourcesCard');

    // Remove active class from all
    navItems.forEach(i => i.classList.remove('active'));

    if (view === 'activities' || view === 'awards') {
        // Auto-save current essay if switching to modules
        if (currentEssay && document.getElementById('essayEditor').value !== lastSavedContent) {
            await saveCurrentEssay();
        }

        editorContainer.style.display = 'none';
        moduleContainer.style.display = 'block';
        moduleContainer.dataset.activeModule = view;

        if (sampleCard) sampleCard.style.display = 'none';
        if (strategyCard) strategyCard.style.display = 'none';

        const activeNav = document.getElementById(`nav-${view}`);
        if (activeNav) activeNav.classList.add('active');

        const title = view === 'activities' ? 'Activity List' : 'Awards & Honors';
        document.getElementById('moduleTitle').textContent = title;

        await loadModuleData(view);
        // Essay view
        editorContainer.style.display = 'block';
        moduleContainer.style.display = 'none';
    }
}


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
    const componentList = document.getElementById('dynamic-components');
    if (!navList || !componentList) return;

    // Clear previous items
    navList.innerHTML = '';
    componentList.innerHTML = '';

    const globalEssays = [];
    const collegeEssays = [];

    essays.forEach(e => {
        const title = (e.title || '').toLowerCase();
        const type = (e.essay_type || '').toLowerCase();
        const platform = e.colleges?.application_platform;

        // Is it a Personal Statement/Common App main?
        const isPS = (type === 'common app' || type === 'personal statement' || title.includes('common app personal statement'));
        // Is it a UC PIQ?
        const isUCPIQ = (platform === 'UC App' && (type === 'uc piq' || title.includes('piq')));

        if (isPS || isUCPIQ) {
            globalEssays.push(e);
        } else {
            collegeEssays.push(e);
        }
    });

    // 1. Render Global Components (PS, PIQs)
    globalEssays.forEach(e => {
        const item = createNavItem(e);
        item.style.marginBottom = 'var(--space-xs)';
        componentList.appendChild(item);
    });

    // 2. Group College Supplements by College
    const collegeGroups = collegeEssays.reduce((acc, e) => {
        const name = e.colleges?.name || 'General';
        if (!acc[name]) acc[name] = [];
        acc[name].push(e);
        return acc;
    }, {});

    Object.keys(collegeGroups).sort().forEach(collegeName => {
        const groupEssays = collegeGroups[collegeName];
        const platform = groupEssays[0]?.colleges?.application_platform;

        const collegeSection = document.createElement('div');
        collegeSection.style.marginBottom = 'var(--space-xs)';

        const emoji = collegeName === 'General' ? '📁' : (platform === 'UC App' ? '🐻' : '🏛️');

        collegeSection.innerHTML = `
            <div class="collapsible-header" style="display: flex; align-items: center; justify-content: space-between; padding: var(--space-sm) var(--space-md); border-radius: var(--radius-md); cursor: pointer; transition: all 0.2s;">
                <div style="display: flex; align-items: center; gap: var(--space-sm); overflow: hidden;">
                    <span style="font-size: 14px; flex-shrink: 0;">${emoji}</span>
                    <span style="font-weight: 700; font-size: 13px; color: var(--gray-700); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${collegeName}</span>
                </div>
                <span class="chevron" style="font-size: 10px; color: var(--gray-400); transition: transform 0.3s;">▼</span>
            </div>
            <div class="group-content" style="margin-left: var(--space-md); display: none; padding-top: 4px;"></div>
        `;

        const header = collegeSection.querySelector('.collapsible-header');
        const content = collegeSection.querySelector('.group-content');
        const chevron = collegeSection.querySelector('.chevron');

        header.onclick = () => {
            const isHidden = content.style.display === 'none';
            content.style.display = isHidden ? 'block' : 'none';
            chevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
            header.style.background = isHidden ? 'var(--gray-50)' : 'transparent';
        };

        if (currentEssay && groupEssays.some(e => e.id === currentEssay.id)) {
            content.style.display = 'block';
            chevron.style.transform = 'rotate(180deg)';
            header.style.background = 'var(--gray-50)';
        }

        groupEssays.forEach(essay => {
            content.appendChild(createNavItem(essay));
        });

        navList.appendChild(collegeSection);
    });

    // 3. Render shared essays
    if (sharedEssays.length > 0) {
        const sharedSection = document.createElement('div');
        sharedSection.style.marginTop = 'var(--space-xl)';
        sharedSection.innerHTML = `<div class="nav-section-title">Shared With Me</div>`;

        sharedEssays.forEach(item => {
            if (item.essays) sharedSection.appendChild(createNavItem(item.essays, true));
        });
        navList.appendChild(sharedSection);
    }

    if (essays.length === 0 && sharedEssays.length === 0) {
        navList.innerHTML = '<p class="empty-state">No essays yet. Add colleges to see prompts.</p>';
        return;
    }

    // Load first available essay if none selected
    if (!currentEssay) {
        const firstEssay = globalEssays[0] || collegeEssays[0] || (sharedEssays[0] ? sharedEssays[0].essays : null);
        if (firstEssay) {
            loadEssayContent(firstEssay.id);
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
        <div style="font-weight: 500; font-size: 13px; color: var(--gray-800); margin-bottom: 2px;">${essay.title || 'Untitled Essay'}</div>
        <div style="font-size: 10px; color: var(--gray-400); font-weight: 600;">
            ${isShared ? 'Shared by: ' + userName : (essay.word_limit || 0) + ' words'}
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
    // Switch back to essay editor if we were in another module
    await switchView('essays');

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
    document.getElementById('save-status').textContent = 'Last saved: ' + (essay.last_saved ? new Date(essay.last_saved).toLocaleTimeString() : 'Just now');

    // Show Guidance if applicable
    const guidanceSlot = document.getElementById('essayGuidanceSlot');
    const guidanceText = document.getElementById('essayGuidanceText');
    const guidanceTips = document.getElementById('essayGuidanceTips');

    const title = (essay.title || '').toLowerCase();
    const type = (essay.essay_type || '').toLowerCase();
    const platform = essay.colleges?.application_platform;

    let guideKey = null;
    if (type === 'common app' || type === 'personal statement' || title.includes('personal statement')) {
        guideKey = 'commonapp';
    } else if (platform === 'UC App' && (type === 'uc piq' || title.includes('piq'))) {
        guideKey = 'ucpiq';
    }

    if (guideKey && OFFICIAL_DIRECTIONS[guideKey]) {
        const guide = OFFICIAL_DIRECTIONS[guideKey];
        guidanceSlot.style.display = 'block';
        guidanceText.textContent = guide.content;
        guidanceTips.innerHTML = guide.tips.map(tip => `
            <span class="badge badge-outline" style="font-size: 10px; border-color: rgba(91, 141, 238, 0.3); color: var(--gray-500);">💡 ${tip}</span>
        `).join('');
    } else {
        guidanceSlot.style.display = 'none';
    }

    // Disable AI buttons and Save if read only

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

async function handleConceptualReview(selection, isModule = false) {
    const moduleContainer = document.getElementById('moduleContainer');
    const activeModule = moduleContainer?.dataset.activeModule;

    if (!currentEssay && !isModule) return;

    const feedbackContainer = document.getElementById('aiFeedbackContainer');
    const customQuestionField = document.getElementById('aiCustomQuestion');
    const customQuestion = customQuestionField?.value.trim();

    let content = '';
    let promptTitle = '';
    let reviewType = selection ? 'Section Focus' : 'Full Overview';

    if (isModule && activeModule) {
        if (activeModule === 'activities') {
            const activities = await getActivities(currentUser.id);
            content = activities.map(a => `- ${a.title} at ${a.organization}: ${a.description} (${a.hours_per_week}h/w, ${a.weeks_per_year}w/y during ${a.years_active.join(', ')})`).join('\n');
            promptTitle = "Activity List Analysis";
        } else {
            const awards = await getAwards(currentUser.id);
            content = awards.map(a => `- ${a.title} (${a.level}): Received in ${a.years_received.join(', ')}`).join('\n');
            promptTitle = "Awards & Honors Analysis";
        }
    } else {
        const editor = document.getElementById('essayEditor');
        content = editor.value;
        promptTitle = currentEssay.prompt || currentEssay.title;
    }

    if (!selection && !customQuestion) {
        selection = null;
    }

    // Show loading state
    const loadingId = 'loading-' + Date.now();
    const loadingHtml = `
        <div id="${loadingId}" class="card" style="padding: var(--space-md); background: var(--gray-50); border: 1px dashed var(--accent-purple); margin-bottom: var(--space-sm);">
            <div style="display: flex; align-items: center; gap: var(--space-sm);">
                <div class="loading-spinner" style="width: 14px; height: 14px;"></div>
                <span style="font-size: var(--text-xs); color: var(--gray-500);">Counselor is thinking...</span>
            </div>
        </div>
    `;

    const emptyState = feedbackContainer.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    feedbackContainer.insertAdjacentHTML('afterbegin', loadingHtml);
    feedbackContainer.scrollTop = 0;

    if (customQuestionField) customQuestionField.value = '';

    try {
        let aiMessage = '';
        if (isModule) {
            aiMessage = `
                Review Type: ${reviewType}
                Task: Provide EXPERT ADMISSIONS COUNSELING for this ${activeModule === 'activities' ? 'ACTIVITY LIST' : 'AWARDS LIST'}.
                
                Content:
                "${content}"
                
                ${selection ? `SPECIFIC FOCUS (Highlighted text): "${selection}"` : ''}
                ${customQuestion ? `STUDENT QUESTION: "${customQuestion}"` : ''}
                
                CRITICAL COACHING RULES:
                1. Review for IMPACT and QUANTIFIED RESULTS.
                2. Check for strong ACTION VERBS.
                3. Strategic Advice: How does this represent the student's unique brand?
                ${!selection ? 'Provide a comprehensive overview of the entire list.' : 'Focus specifically on the highlighted part while considering the whole context.'}
                4. NEVER rewrite content for the student. Focus on advice.
            `;
        } else {
            aiMessage = `
                Review Type: ${reviewType}
                Task: Provide STRATEGIC ADMISSIONS COUNSELING.
                
                Essay Category/Prompt: "${promptTitle}"
                Full Essay Content: "${content}"
                ${selection ? `HIGHLIGHTED SELECTION FOR FOCUS: "${selection}"` : 'No specific text highlighted.'}
                ${customQuestion ? `SPECIFIC STUDENT QUESTION: "${customQuestion}"` : ''}
                
                STRICT RULES:
                1. NEVER provide text for copy-pasting. 
                2. NEVER rewrite sentences.
                3. Focus on narrative impact and thematic consistency.
                ${!selection ? 'Provide a comprehensive overview of the entire essay.' : 'Focus your advice specifically on the highlighted section.'}
            `;
        }

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

// --- Activity & Award Module Logic ---

async function loadModuleData(type) {
    const list = document.getElementById('moduleItemsList');
    list.innerHTML = '<div style="padding: 40px; text-align: center;"><div class="loading-spinner"></div></div>';

    // Update Guidance UI
    const guide = OFFICIAL_DIRECTIONS[type];
    if (guide) {
        document.getElementById('guideTitle').textContent = guide.title;
        document.getElementById('guideContent').textContent = guide.content;
        const tipsContainer = document.getElementById('guideTips');
        tipsContainer.innerHTML = guide.tips.map(tip => `
            <div style="display: flex; gap: 8px; align-items: flex-start; font-size: 13px; color: var(--gray-500);">
                <span style="color: var(--primary-blue);">•</span>
                <span>${tip}</span>
            </div>
        `).join('');
    }

    if (type === 'activities') {
        const activities = await getActivities(currentUser.id);
        renderActivities(activities);
    } else {
        const awards = await getAwards(currentUser.id);
        renderAwards(awards);
    }
}

function renderActivities(activities) {
    const list = document.getElementById('moduleItemsList');
    if (activities.length === 0) {
        list.innerHTML = '<p class="empty-state">No activities added yet. Click "+ Add New" to start your list.</p>';
        return;
    }

    list.innerHTML = activities.map(act => `
        <div class="card module-item-card" data-id="${act.id}" style="padding: var(--space-xl); border: 1px solid var(--gray-100); position: relative; cursor: pointer; transition: all 0.2s;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: var(--space-sm);">
                <div>
                    <h3 style="font-size: var(--text-lg); font-weight: 700; color: var(--gray-900);">${act.title}</h3>
                    <p style="font-size: var(--text-sm); color: var(--gray-500);">${act.organization || ''}</p>
                </div>
                <div style="display: flex; gap: var(--space-sm);">
                    <button class="btn btn-xs btn-ghost" onclick="event.stopPropagation(); editActivity('${act.id}')">✏️</button>
                    <button class="btn btn-xs btn-ghost" onclick="event.stopPropagation(); removeActivity('${act.id}')">🗑️</button>
                </div>
            </div>
            <p class="description-text" style="font-size: var(--text-sm); line-height: 1.5; color: var(--gray-700); margin-bottom: var(--space-md);">${act.description || ''}</p>
            <div style="display: flex; gap: var(--space-md); align-items: center;">
                <div class="badge badge-primary">${act.years_active ? act.years_active.map(y => y + 'th').join(', ') : ''}</div>
                <span style="font-size: var(--text-xs); color: var(--gray-400);">${act.hours_per_week || 0} hrs/wk · ${act.weeks_per_year || 0} wks/yr</span>
            </div>
        </div>
    `).join('');

    // Add selection logic
    list.querySelectorAll('.module-item-card').forEach(card => {
        card.addEventListener('click', function () {
            list.querySelectorAll('.module-item-card').forEach(c => c.classList.remove('focused-for-ai'));
            this.classList.add('focused-for-ai');
            showNotification('Card focused for AI review. Highlight text or click "Counselor Selection" in sidebar.', 'info');
        });
    });
}

function renderAwards(awards) {
    const list = document.getElementById('moduleItemsList');
    if (awards.length === 0) {
        list.innerHTML = '<p class="empty-state">No awards added yet. Click "+ Add New" to highlight your achievements.</p>';
        return;
    }

    list.innerHTML = awards.map(reward => `
        <div class="card module-item-card" data-id="${reward.id}" style="padding: var(--space-xl); border: 1px solid var(--gray-100); position: relative; cursor: pointer; transition: all 0.2s;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div>
                    <h3 style="font-size: var(--text-lg); font-weight: 700; color: var(--gray-900);">${reward.title}</h3>
                    <div style="display: flex; gap: var(--space-sm); margin-top: 4px;">
                        <div class="badge badge-success">${reward.level}</div>
                        <div class="badge badge-outline">${reward.years_received ? reward.years_received.map(y => y + 'th').join(', ') : ''}</div>
                    </div>
                </div>
                <div style="display: flex; gap: var(--space-sm);">
                    <button class="btn btn-xs btn-ghost" onclick="event.stopPropagation(); editAward('${reward.id}')">✏️</button>
                    <button class="btn btn-xs btn-ghost" onclick="event.stopPropagation(); removeAward('${reward.id}')">🗑️</button>
                </div>
            </div>
        </div>
    `).join('');

    // Add selection logic
    list.querySelectorAll('.module-item-card').forEach(card => {
        card.addEventListener('click', function () {
            list.querySelectorAll('.module-item-card').forEach(c => c.classList.remove('focused-for-ai'));
            this.classList.add('focused-for-ai');
            showNotification('Award focused for AI review.', 'info');
        });
    });
}

// Activity Handlers
function openActivityModal(act = null) {
    const modal = document.getElementById('activityModal');
    const form = document.getElementById('activityForm');
    if (!modal || !form) return;
    form.reset();

    document.getElementById('activityId').value = act ? act.id : '';
    document.getElementById('actTitle').value = act ? act.title : '';
    document.getElementById('actOrg').value = act ? act.organization : '';
    document.getElementById('actDesc').value = act ? act.description : '';
    document.getElementById('actHours').value = act ? act.hours_per_week : '';
    document.getElementById('actWeeks').value = act ? act.weeks_per_year : '';

    // Set checkboxes
    const years = act ? (act.years_active || []) : [];
    document.querySelectorAll('[name="actYear"]').forEach(cb => {
        cb.checked = years.includes(parseInt(cb.value));
    });

    document.getElementById('descCharCount').textContent = `${(act ? act.description.length : 0)} / 150`;
    modal.classList.add('active');
}

async function saveActivity() {
    const id = document.getElementById('activityId').value;
    const years = Array.from(document.querySelectorAll('[name="actYear"]:checked')).map(cb => parseInt(cb.value));

    const activityData = {
        user_id: currentUser.id,
        title: document.getElementById('actTitle').value,
        organization: document.getElementById('actOrg').value,
        description: document.getElementById('actDesc').value,
        hours_per_week: parseInt(document.getElementById('actHours').value) || 0,
        weeks_per_year: parseInt(document.getElementById('actWeeks').value) || 0,
        years_active: years
    };

    let result;
    if (id) {
        result = await updateActivity(id, activityData);
    } else {
        result = await addActivity(activityData);
    }

    if (result) {
        showNotification('Activity saved!', 'success');
        document.getElementById('activityModal').classList.remove('active');
        await loadModuleData('activities');
    }
}

window.editActivity = async (id) => {
    const activities = await getActivities(currentUser.id);
    const act = activities.find(a => a.id === id);
    if (act) openActivityModal(act);
};

window.removeActivity = async (id) => {
    if (confirm('Delete this activity?')) {
        const success = await deleteActivity(id);
        if (success) {
            showNotification('Activity deleted', 'info');
            await loadModuleData('activities');
        }
    }
};

window.openActivityModal = openActivityModal;
window.openAwardModal = openAwardModal;
window.saveActivity = saveActivity;
window.saveAward = saveAward;

// Award Handlers
function openAwardModal(award = null) {
    const modal = document.getElementById('awardModal');
    const form = document.getElementById('awardForm');
    if (!modal || !form) return;
    form.reset();

    document.getElementById('awardId').value = award ? award.id : '';
    document.getElementById('awardTitleInput').value = award ? award.title : '';
    document.getElementById('awardLevel').value = award ? award.level : 'School';

    const years = award ? (award.years_received || []) : [];
    document.querySelectorAll('[name="awardYear"]').forEach(cb => {
        cb.checked = years.includes(parseInt(cb.value));
    });

    modal.classList.add('active');
}

async function saveAward() {
    const id = document.getElementById('awardId').value;
    const years = Array.from(document.querySelectorAll('[name="awardYear"]:checked')).map(cb => parseInt(cb.value));

    const awardData = {
        user_id: currentUser.id,
        title: document.getElementById('awardTitleInput').value,
        level: document.getElementById('awardLevel').value,
        years_received: years
    };

    let result;
    if (id) {
        result = await updateAward(id, awardData);
    } else {
        result = await addAward(awardData);
    }

    if (result) {
        showNotification('Award saved!', 'success');
        document.getElementById('awardModal').classList.remove('active');
        await loadModuleData('awards');
    }
}

window.editAward = async (id) => {
    const awards = await getAwards(currentUser.id);
    const award = awards.find(a => a.id === id);
    if (award) openAwardModal(award);
};

window.removeAward = async (id) => {
    if (confirm('Delete this award?')) {
        const success = await deleteAward(id);
        if (success) {
            showNotification('Award deleted', 'info');
            await loadModuleData('awards');
        }
    }
};

window.switchView = switchView;
window.loadModuleData = loadModuleData;

