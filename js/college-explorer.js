import config from './config.js';
import {
    getCurrentUser,
    getUserProfile,
    getUserColleges,
    getUserEssays,
    getUserTasks,
    getUserDocuments,
    updateEssay,
    toggleTaskCompletion
} from './supabase-config.js';
import { updateNavbarUser } from './ui.js';

let enrollmentChart = null;
let currentCollege = null;
let userColleges = [];
let userEssays = [];
let userTasks = [];
let userDocuments = [];
let selectedEssay = null;
let autoSaveInterval = null;
let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const collegeName = urlParams.get('name');

    if (!collegeName) {
        window.location.href = 'colleges.html';
        return;
    }

    currentUser = await getCurrentUser();
    if (!currentUser) {
        window.location.href = 'login.html';
        return;
    }

    const profile = await getUserProfile(currentUser.id);
    updateNavbarUser(currentUser, profile);

    try {
        // Parallel load college data and user's context
        const [researchData, colleges, essays, tasks, documents] = await Promise.all([
            fetch(`${config.apiUrl}/api/colleges/research?name=${encodeURIComponent(collegeName)}`).then(r => r.json()),
            getUserColleges(currentUser.id),
            getUserEssays(currentUser.id),
            getUserTasks(currentUser.id),
            getUserDocuments(currentUser.id)
        ]);

        if (!researchData.success) throw new Error(researchData.error || 'Failed to fetch college data');

        currentCollege = researchData.college;
        userColleges = colleges;
        userEssays = essays;
        userTasks = tasks;
        userDocuments = documents;

        renderCollegeData(currentCollege);
        setupTabs();
        checkUserStatus();
        setupIntelligenceReport();

    } catch (error) {
        console.error('Error loading college data:', error);
        if (window.showNotification) window.showNotification('Could not load college data. Please try again.', 'error');
        window.location.href = 'colleges.html';
    } finally {
        document.getElementById('loadingOverlay').style.display = 'none';
    }
});

function renderCollegeData(college) {
    // Basic Info
    const safeSetText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    safeSetText('collegeName', college.name);
    document.title = `${college.name} - Waypoint Explorer`;
    safeSetText('collegeLocation', college.location || 'Location Unknown');

    const websiteEl = document.getElementById('collegeWebsite');
    if (websiteEl) websiteEl.href = college.website || '#';

    safeSetText('collegeDescription', college.description || 'No description available.');

    // Stats
    safeSetText('acceptanceRate', college.acceptance_rate ? `${college.acceptance_rate}%` : '--%');
    safeSetText('medianSAT', college.median_sat || 'N/A');
    safeSetText('medianACT', college.median_act || 'N/A');
    safeSetText('avgGPA', college.avg_gpa || 'N/A');

    // Admissions 
    safeSetText('totalEnrollment', college.enrollment ? college.enrollment.toLocaleString() : 'N/A');
    safeSetText('costOfAttendance', college.cost_of_attendance ? `$${college.cost_of_attendance.toLocaleString()}` : 'N/A');
    safeSetText('deadlineInfo', college.deadline_date ? new Date(college.deadline_date).toLocaleDateString() : 'TBD');
    safeSetText('testPolicy', college.test_policy || 'Test Optional');

    // Requirements Lists
    renderRequirements(college);

    // AI Insight
    renderAIInsight(college);

    // Header Background
    if (college.image_url) {
        const header = document.getElementById('collegeHeader');
        if (header) header.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.4), rgba(0,0,0,0.7)), url(${college.image_url})`;
    }

    // Chart
    renderEnrollmentChart(college);

    // Setup Add Button
    const addBtn = document.getElementById('addCollegeBtn');
    if (addBtn) addBtn.onclick = () => addCollegeToList(college.name);
}

function renderRequirements(college) {
    const quickList = document.getElementById('quickRequirementsList');
    const fullList = document.getElementById('fullRequirementsList');
    if (!quickList || !fullList) return;

    // Quick List (Dashboard style)
    const quickItems = [
        { label: 'Platform', val: college.application_platform || 'Common App', icon: '💻' },
        { label: 'Deadline', val: `${college.deadline_type || 'RD'}: ${college.deadline_date || 'TBD'}`, icon: '📅' },
        { label: 'Testing', val: college.test_policy || 'Optional', icon: '📝' },
        { label: 'Letters', val: `${college.lors_required || 0} Required`, icon: '✉️' }
    ];

    quickList.innerHTML = quickItems.map(item => `
        <li style="display: flex; align-items: center; gap: var(--space-md); margin-bottom: var(--space-md); padding: var(--space-sm); background: var(--gray-50); border-radius: var(--radius-md);">
            <span style="font-size: 18px;">${item.icon}</span>
            <div>
                <div style="font-size: var(--text-xs); color: var(--gray-500); text-transform: uppercase; font-weight: 700;">${item.label}</div>
                <div style="font-weight: 600; color: var(--gray-900);">${item.val}</div>
            </div>
        </li>
    `).join('');

    // Full List (Details style)
    const essays = college.essays || [];
    fullList.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: var(--space-lg);">
            <div class="sidebar-item">
                <div class="sidebar-icon">📑</div>
                <div>
                    <div style="font-weight: 700;">Application Platform</div>
                    <div style="color: var(--gray-600);">${college.application_platform || 'Common App'}</div>
                </div>
            </div>
            <div class="sidebar-item">
                <div class="sidebar-icon">⏰</div>
                <div>
                    <div style="font-weight: 700;">Deadlines</div>
                    <div style="color: var(--gray-600);">${college.deadline_type || 'RD'}: ${college.deadline_date || 'TBD'}</div>
                </div>
            </div>
            <div class="sidebar-item">
                <div class="sidebar-icon">✍️</div>
                <div>
                    <div style="font-weight: 700;">Essays Required</div>
                    <div style="color: var(--gray-600);">${essays.length} Supplements + Personal Statement</div>
                </div>
            </div>
            <div class="sidebar-item">
                <div class="sidebar-icon">🎨</div>
                <div>
                    <div style="font-weight: 700;">Portfolio</div>
                    <div style="color: var(--gray-600);">${college.portfolio_required ? 'Required for certain majors' : 'Not required'}</div>
                </div>
            </div>
        </div>
    `;

    // LOR Content
    const lorCountEl = document.getElementById('lorCount');
    if (lorCountEl) lorCountEl.textContent = `${college.lors_required || 0} LORs Required`;
}

function setupTabs() {
    const tabs = document.querySelectorAll('.tab-link');
    tabs.forEach(tab => {
        tab.onclick = () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const target = tab.getAttribute('data-tab');
            document.querySelectorAll('.tab-pane').forEach(p => p.style.display = 'none');
            const targetPane = document.getElementById(`${target}Tab`);
            if (targetPane) targetPane.style.display = 'block';

            if (target === 'workspace') {
                loadWorkspace();
            } else if (target === 'requirements') {
                renderTasks();
            } else if (target === 'documents') {
                renderDocuments();
            }
        };
    });
}

function checkUserStatus() {
    if (!currentCollege) return;
    const userCollege = userColleges.find(c => c.name.toLowerCase() === currentCollege.name.toLowerCase());
    const addBtn = document.getElementById('addCollegeBtn');

    if (userCollege) {
        if (addBtn) {
            addBtn.innerHTML = '✅ Added to List';
            addBtn.classList.replace('btn-primary', 'btn-ghost');
            addBtn.onclick = () => {
                const workspaceTab = document.querySelector('[data-tab="workspace"]');
                if (workspaceTab) workspaceTab.click();
            };
        }

        // Enable workspace
        const workspacePrompt = document.getElementById('workspacePrompt');
        const workspaceContent = document.getElementById('workspaceContent');
        if (workspacePrompt) workspacePrompt.style.display = 'none';
        if (workspaceContent) workspaceContent.style.display = 'block';

        // Render application progress header
        renderApplicationStatus(userCollege);
    } else {
        const workspacePrompt = document.getElementById('workspacePrompt');
        const workspaceContent = document.getElementById('workspaceContent');
        if (workspacePrompt) workspacePrompt.style.display = 'block';
        if (workspaceContent) workspaceContent.style.display = 'none';

        const statusCard = document.getElementById('applicationStatusCard');
        if (statusCard) statusCard.style.display = 'none';
    }
}

function renderApplicationStatus(userCollege) {
    const statusCard = document.getElementById('applicationStatusCard');
    if (!statusCard) return;

    statusCard.style.display = 'block';

    // Calculate progress
    const progress = calculateSmartProgress(userCollege, userEssays, userTasks);

    const progressVal = document.getElementById('headerProgressVal');
    const progressBar = document.getElementById('headerProgressBar');
    const deadlineCountdown = document.getElementById('headerDeadlineCountdown');

    if (progressVal) progressVal.textContent = `${progress}%`;
    if (progressBar) progressBar.style.width = `${progress}%`;

    // Countdown
    if (deadlineCountdown) {
        if (userCollege.deadline) {
            const deadline = new Date(userCollege.deadline);
            const now = new Date();
            const diff = deadline - now;
            const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

            if (days < 0) {
                deadlineCountdown.textContent = 'Deadline passed';
                deadlineCountdown.style.color = 'var(--error)';
            } else if (days === 0) {
                deadlineCountdown.textContent = 'Due TODAY';
                deadlineCountdown.style.color = 'var(--warning)';
            } else {
                deadlineCountdown.textContent = `${days} days left until deadline`;
            }
        } else {
            deadlineCountdown.textContent = 'Deadline TBD';
        }
    }
}

function calculateSmartProgress(college, allEssays, allTasks) {
    const collegeEssays = allEssays.filter(e => e.college_id === college.id);
    const collegeTasks = allTasks.filter(t => t.college_id === college.id);

    if (collegeEssays.length === 0 && collegeTasks.length === 0) return 0;

    let essayScore = 0;
    if (collegeEssays.length > 0) {
        const totalEssayProgress = collegeEssays.reduce((acc, essay) => {
            if (essay.is_completed) return acc + 1;
            const wordProgress = essay.word_limit > 0 ? Math.min(essay.word_count / essay.word_limit, 1) : 0;
            return acc + (wordProgress * 0.8);
        }, 0);
        essayScore = totalEssayProgress / collegeEssays.length;
    }

    let taskScore = 0;
    if (collegeTasks.length > 0) {
        const completedTasks = collegeTasks.filter(t => t.completed).length;
        taskScore = completedTasks / collegeTasks.length;
    }

    // Weighting: 40% Essays, 60% Tasks
    let essayWeight = 0.4;
    let taskWeight = 0.6;
    if (collegeEssays.length === 0) { taskWeight = 1.0; essayWeight = 0; }
    if (collegeTasks.length === 0) { essayWeight = 1.0; taskWeight = 0; }

    return Math.round((essayScore * essayWeight + taskScore * taskWeight) * 100);
}

function renderTasks() {
    const userCollege = userColleges.find(c => c.name.toLowerCase() === currentCollege.name.toLowerCase());
    if (!userCollege) return;

    const collegeTasks = userTasks.filter(t => t.college_id === userCollege.id);
    const listContainer = document.getElementById('collegeTasksList');
    if (!listContainer) return;

    if (collegeTasks.length === 0) {
        listContainer.innerHTML = '<p style="color: var(--gray-500); font-size: var(--text-sm); font-style: italic;">No specific tasks for this college yet. Try adding some from the Dashboard.</p>';
        return;
    }

    listContainer.innerHTML = collegeTasks.map(task => `
        <div class="card card-compact" style="display: flex; align-items: center; gap: var(--space-md); ${task.completed ? 'opacity: 0.7;' : ''}">
            <input type="checkbox" ${task.completed ? 'checked' : ''} 
                   onchange="window.handleToggleTask('${task.id}', this.checked)"
                   style="width: 18px; height: 18px; cursor: pointer;">
            <div style="flex: 1;">
                <div style="font-weight: 600; font-size: var(--text-sm); ${task.completed ? 'text-decoration: line-through;' : ''}">${task.title}</div>
                ${task.due_date ? `<div style="font-size: 11px; color: var(--gray-500);">Due: ${new Date(task.due_date).toLocaleDateString()}</div>` : ''}
            </div>
            <div class="badge ${task.priority === 'High' ? 'badge-error' : (task.priority === 'Medium' ? 'badge-warning' : 'badge-primary')}" style="font-size: 10px;">${task.priority}</div>
        </div>
    `).join('');
}

window.handleToggleTask = async (taskId, completed) => {
    try {
        const updated = await toggleTaskCompletion(taskId, completed);
        if (updated) {
            // Update local state
            const index = userTasks.findIndex(t => t.id === taskId);
            if (index !== -1) userTasks[index] = updated;

            // Re-render tasks and status
            renderTasks();
            const userCollege = userColleges.find(c => c.name.toLowerCase() === currentCollege.name.toLowerCase());
            renderApplicationStatus(userCollege);

            if (window.showNotification) window.showNotification('Task status updated!', 'success');
        }
    } catch (error) {
        console.error('Error toggling task:', error);
    }
};

function renderDocuments() {
    const listContainer = document.getElementById('collegeDocumentsGrid');
    const emptyMsg = document.getElementById('noDocumentsMsg');
    if (!listContainer || !emptyMsg) return;

    if (!userDocuments || userDocuments.length === 0) {
        listContainer.style.display = 'none';
        emptyMsg.style.display = 'block';
        return;
    }

    listContainer.style.display = 'grid';
    emptyMsg.style.display = 'none';

    listContainer.innerHTML = userDocuments.map(doc => `
        <div class="card card-compact" style="display: flex; flex-direction: column; gap: var(--space-sm); background: var(--white); border: 1px solid var(--gray-100);">
            <div style="display: flex; align-items: center; gap: var(--space-sm);">
                <span style="font-size: 20px;">${getFileIcon(doc.file_type)}</span>
                <div style="flex: 1; overflow: hidden;">
                    <div style="font-weight: 700; font-size: var(--text-sm); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${doc.name}">${doc.name}</div>
                    <div style="font-size: 10px; color: var(--gray-500);">${doc.category || 'General'}</div>
                </div>
            </div>
            <div style="display: flex; gap: var(--space-xs); margin-top: 4px;">
                <button class="btn btn-ghost btn-sm flex-1" style="font-size: 11px; padding: 4px;" onclick="window.viewDocument('${doc.file_path}')">View</button>
            </div>
        </div>
    `).join('');
}

function getFileIcon(type) {
    if (type?.includes('pdf')) return '📄';
    if (type?.includes('image')) return '🖼️';
    if (type?.includes('word') || type?.includes('officedocument')) return '📝';
    return '📁';
}

window.viewDocument = async (filePath) => {
    const { getDocumentUrl } = await import('./supabase-config.js');
    const url = await getDocumentUrl(filePath);
    if (url) {
        window.open(url, '_blank');
    } else {
        if (window.showNotification) window.showNotification('Could not open document.', 'error');
    }
};

async function addCollegeToList(name) {
    const btn = document.getElementById('addCollegeBtn');
    if (btn && btn.textContent.includes('Added')) return;

    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Adding...';
    }

    try {
        const response = await fetch(`${config.apiUrl}/api/colleges/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id, collegeName: name })
        });

        const result = await response.json();
        if (result.success) {
            if (window.showNotification) window.showNotification(`Successfully added ${name}!`, 'success');

            // Refresh local data
            const [colleges, essays] = await Promise.all([
                getUserColleges(currentUser.id),
                getUserEssays(currentUser.id)
            ]);
            userColleges = colleges;
            userEssays = essays;

            checkUserStatus();

            // Trigger essay creation on server if needed
            fetch(`${config.apiUrl}/api/essays/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: currentUser.id })
            }).then(async () => {
                userEssays = await getUserEssays(currentUser.id);
                const userCollege = userColleges.find(c => c.name.toLowerCase() === currentCollege.name.toLowerCase());
                renderApplicationStatus(userCollege);
            });

        } else {
            if (window.showNotification) window.showNotification('Could not add college: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Error adding college:', error);
    } finally {
        if (btn) {
            btn.disabled = false;
            if (!btn.textContent.includes('Added')) btn.textContent = '+ Add to List';
        }
    }
}

function loadWorkspace() {
    if (!currentCollege) return;
    const college = userColleges.find(c => c.name.toLowerCase() === currentCollege.name.toLowerCase());
    if (!college) return;

    const collegeEssays = userEssays.filter(e => e.college_id === college.id);
    const listContainer = document.getElementById('collegeEssaysList');
    if (!listContainer) return;

    if (collegeEssays.length === 0) {
        listContainer.innerHTML = '<p style="font-size: var(--text-xs); color: var(--gray-500); padding: var(--space-md);">No essays found for this college yet. Try syncing or wait a moment.</p>';
        return;
    }

    listContainer.innerHTML = collegeEssays.map(essay => `
        <div class="essay-nav-item ${selectedEssay?.id === essay.id ? 'active' : ''}" 
             onclick="selectEssay('${essay.id}')"
             style="padding: var(--space-md); border-radius: var(--radius-md); cursor: pointer; border: 1px solid var(--gray-100); transition: all 0.2s;">
            <div style="font-weight: 600; font-size: var(--text-sm);">${essay.title.replace(college.name + ' - ', '')}</div>
            <div style="font-size: 11px; color: var(--gray-500); margin-top: 4px;">
                ${essay.word_count || 0} / ${essay.word_limit || '---'} words
            </div>
        </div>
    `).join('');
}

window.selectEssay = async (essayId) => {
    selectedEssay = userEssays.find(e => e.id === essayId);
    if (!selectedEssay) return;

    // UI Updates
    const noEssayEl = document.getElementById('noEssaySelected');
    const editorContainer = document.getElementById('editorContainer');
    if (noEssayEl) noEssayEl.style.display = 'none';
    if (editorContainer) editorContainer.style.display = 'block';

    const typeBadge = document.getElementById('essayTypeBadge');
    const promptEl = document.getElementById('currentPrompt');
    const wordLimitEl = document.getElementById('wordLimitLabel');
    if (typeBadge) typeBadge.textContent = selectedEssay.essay_type || 'Supplemental';
    if (promptEl) promptEl.textContent = selectedEssay.prompt || 'No prompt provided.';
    if (wordLimitEl) wordLimitEl.textContent = `Max ${selectedEssay.word_limit || '---'} words`;

    const editor = document.getElementById('essayEditor');
    if (editor) editor.value = selectedEssay.content || '';

    updateEditorStats();
    loadWorkspace(); // Refresh active state in list

    // Setup Auto-save
    if (autoSaveInterval) clearInterval(autoSaveInterval);
    autoSaveInterval = setInterval(saveCurrentEssay, 5000);
};

async function saveCurrentEssay() {
    if (!selectedEssay) return;

    const editor = document.getElementById('essayEditor');
    if (!editor) return;
    const content = editor.value;
    if (content === selectedEssay.content) return;

    const status = document.getElementById('save-status');
    if (status) status.textContent = 'Saving...';

    try {
        const updated = await updateEssay(selectedEssay.id, {
            content,
            word_count: content.split(/\s+/).filter(w => w.length > 0).length,
            char_count: content.length
        });

        if (updated) {
            selectedEssay.content = content;
            selectedEssay.word_count = updated.word_count;
            if (status) status.textContent = 'Saved at ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            // Update in local list
            const index = userEssays.findIndex(e => e.id === selectedEssay.id);
            if (index !== -1) userEssays[index] = updated;
            loadWorkspace();

            // Update header progress
            const userCollege = userColleges.find(c => c.name.toLowerCase() === currentCollege.name.toLowerCase());
            renderApplicationStatus(userCollege);
        }
    } catch (error) {
        if (status) status.textContent = 'Error saving';
        console.error('Auto-save error:', error);
    }
}

function updateEditorStats() {
    const editor = document.getElementById('essayEditor');
    if (!editor) return;
    const content = editor.value;
    const words = content.split(/\s+/).filter(w => w.length > 0).length;
    const wordCountEl = document.getElementById('wordCount');
    if (wordCountEl) wordCountEl.textContent = words;

    if (selectedEssay && selectedEssay.word_limit) {
        const percent = Math.min((words / selectedEssay.word_limit) * 100, 100);
        const fill = document.getElementById('progressFill');
        if (fill) {
            fill.style.width = percent + '%';
            if (words > selectedEssay.word_limit) {
                fill.style.background = 'var(--error)';
            } else {
                fill.style.background = 'var(--primary-blue)';
            }
        }
    }
}

function setupIntelligenceReport() {
    const reportBtn = document.getElementById('intelligenceReportBtn');
    if (reportBtn) {
        reportBtn.onclick = async () => {
            if (!currentCollege) return;
            if (window.showNotification) window.showNotification(`Building Intelligence Report for ${currentCollege.name}...`, 'info');

            try {
                const response = await fetch(`${config.apiUrl}/api/colleges/research-deep`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userId: currentUser.id,
                        collegeName: currentCollege.name
                    })
                });

                if (!response.ok) throw new Error('Research failed');
                const data = await response.json();

                // We use showResearchModal from colleges.js if available, otherwise fallback
                if (window.showResearchModal) {
                    window.showResearchModal(data.findings);
                } else {
                    alert('Report generated! See console for data (UI component loading...)');
                    console.log('Intelligence Report:', data.findings);
                }
            } catch (error) {
                console.error('Research Error:', error);
                if (window.showNotification) window.showNotification('Failed to generate report.', 'error');
            }
        };
    }
}

document.getElementById('essayEditor')?.addEventListener('input', updateEditorStats);
document.getElementById('saveDraftBtn')?.addEventListener('click', saveCurrentEssay);

// Shared UI Helpers
function renderAIInsight(college) {
    const insights = [
        `${college.name} is known for its ${college.acceptance_rate < 10 ? 'highly competitive' : 'selective'} admissions environment. Successful applicants often demonstrate strong leadership and specific excellence in ${college.name.includes('Tech') || college.name.includes('Institute') ? 'STEM and innovation' : 'their chosen field of study'}.`,
        `Given the median SAT of ${college.median_sat || 'high range'}, focus on ensuring your score is within the 25th-75th percentile to be competitive.`,
        `Pro-tip: This college values "cultural fit" and ${college.acceptance_rate < 15 ? 'intellectual curiosity' : 'academic grit'}. Make sure your supplemental essays reflect this.`
    ];
    const insightEl = document.getElementById('aiInsight');
    if (insightEl) insightEl.textContent = insights.join(' ');
}

function renderEnrollmentChart(college) {
    const canvas = document.getElementById('enrollmentChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (enrollmentChart) {
        enrollmentChart.destroy();
    }

    enrollmentChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Admitted', 'Waitlisted', 'Denied'],
            datasets: [{
                data: [college.acceptance_rate || 10, 5, 100 - (college.acceptance_rate || 10) - 5],
                backgroundColor: [
                    '#5B8DEE', // Admitted
                    '#8B7BF7', // Waitlisted
                    '#E2E8F0'  // Denied
                ],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        usePointStyle: true,
                        padding: 20
                    }
                }
            }
        }
    });
}

function showResearchModal(findings) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(15, 23, 42, 0.85); display: flex; align-items: center; justify-content: center;
        z-index: 2000; backdrop-filter: blur(16px);
    `;

    const renderModule = (mod, icon, color) => {
        if (!mod || !mod.items) return '';
        const itemsHtml = mod.items.map(item => `
            <div style="margin-bottom: var(--space-md);">
                <div style="font-weight: 700; font-size: var(--text-sm); font-family: 'Outfit', sans-serif; color: var(--gray-900);">${item.title}</div>
                <div style="font-size: var(--text-sm); color: var(--gray-600); line-height: 1.5;">${item.content}</div>
            </div>
        `).join('');

        return `
            <div class="card" style="margin-bottom: var(--space-lg); border-left: 4px solid ${color};">
                <div style="display: flex; align-items: center; gap: var(--space-sm); margin-bottom: var(--space-md);">
                    <span style="font-size: 20px;">${icon}</span>
                    <h3 style="margin: 0; font-size: var(--text-md); text-transform: uppercase; letter-spacing: 0.05em; color: ${color};">${mod.headline}</h3>
                </div>
                ${itemsHtml}
            </div>
        `;
    };

    const modules = findings.modules;

    modal.innerHTML = `
        <div class="card" style="max-width: 800px; width: 95%; padding: 0; max-height: 90vh; overflow-y: auto; background: var(--gray-50); box-shadow: var(--shadow-2xl); border: 1px solid var(--gray-200);">
            <!-- Header Section -->
            <div style="position: sticky; top: 0; background: var(--white); padding: var(--space-xl) var(--space-2xl); border-bottom: 1px solid var(--gray-200); display: flex; justify-content: space-between; align-items: center; z-index: 10; backdrop-filter: blur(10px);">
                <div style="display: flex; align-items: center; gap: var(--space-md);">
                    <div style="width: 50px; height: 50px; background: var(--gradient-primary); border-radius: var(--radius-lg); display: flex; align-items: center; justify-content: center; font-size: 24px; color: white;">🕵️</div>
                    <div>
                        <h2 style="margin: 0; font-family: 'Outfit', sans-serif; font-size: var(--text-2xl); font-weight: 800; color: var(--gray-900);">${findings.college} Intelligence Report</h2>
                        <p style="margin: 0; font-size: var(--text-xs); color: var(--gray-500); text-transform: uppercase; letter-spacing: 0.1em; font-weight: 700;">Internal Personnel File: CONFIDENTIAL</p>
                    </div>
                </div>
                <button onclick="this.closest('.modal-overlay').remove()" style="background:none; border:none; font-size:24px; cursor:pointer;">×</button>
            </div>

            <!-- Content Section -->
            <div style="padding: var(--space-2xl);">
                <!-- Executive Summary -->
                <div class="card" style="background: var(--white); border: 1px dashed var(--primary-blue); margin-bottom: var(--space-xl);">
                    <h4 style="margin: 0 0 8px; font-size: var(--text-xs); color: var(--primary-blue); text-transform: uppercase;">Executive Summary</h4>
                    <p style="margin: 0; font-size: var(--text-md); font-weight: 500; font-style: italic; color: var(--gray-800);">${findings.summary}</p>
                </div>

                <!-- Grid for Modules -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-lg);">
                    <div style="display: flex; flex-direction: column;">
                        ${renderModule(modules.academics, '🎓', 'var(--primary-blue)')}
                        ${renderModule(modules.career, '💼', 'var(--success)')}
                    </div>
                    <div style="display: flex; flex-direction: column;">
                        ${renderModule(modules.culture, '🎉', 'var(--warning)')}
                        ${renderModule(modules.admissions, '🎯', 'var(--accent-purple)')}
                        
                        <!-- The Edge -->
                        <div class="card" style="background: var(--gray-100); color: var(--gray-900); border: 1px solid var(--gray-200);">
                            <div style="display: flex; align-items: center; gap: var(--space-sm); margin-bottom: var(--space-md);">
                                <span style="font-size: 20px;">⚔️</span>
                                <h3 style="margin: 0; font-size: var(--text-md); text-transform: uppercase; letter-spacing: 0.05em; color: var(--gray-900);">The Competitive Edge</h3>
                            </div>
                            <p style="font-size: var(--text-sm); line-height: 1.6; color: var(--gray-600); margin: 0;">${modules.edge.content}</p>
                        </div>
                    </div>
                </div>

                <div style="margin-top: var(--space-xl); text-align: center;">
                    <button class="btn btn-primary" style="height: 50px; width: 100%;" onclick="this.closest('.modal-overlay').remove()">Download Intelligence to Brain</button>
                    <p style="font-size: 10px; color: var(--gray-400); margin-top: var(--space-md);">Verified against 2024-2025 Admissions Data • AI-Generated Insight</p>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

// Make it available globally for the explorer button
window.showResearchModal = showResearchModal;
