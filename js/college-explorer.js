import config from './config.js';
import {
    getCurrentUser,
    getUserProfile,
    getUserColleges,
    getUserEssays,
    updateEssay
} from './supabase-config.js';
import { updateNavbarUser } from './ui.js';

let enrollmentChart = null;
let currentCollege = null;
let userColleges = [];
let userEssays = [];
let selectedEssay = null;
let autoSaveInterval = null;

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const collegeName = urlParams.get('name');

    if (!collegeName) {
        window.location.href = 'colleges.html';
        return;
    }

    const user = await getCurrentUser();
    if (!user) {
        window.location.href = 'login.html';
        return;
    }

    const profile = await getUserProfile(user.id);
    updateNavbarUser(user, profile);

    try {
        // Parallel load college data and user's context
        const [researchData, colleges, essays] = await Promise.all([
            fetch(`${config.apiUrl}/api/colleges/research?name=${encodeURIComponent(collegeName)}`).then(r => r.json()),
            getUserColleges(user.id),
            getUserEssays(user.id)
        ]);

        if (!researchData.success) throw new Error(researchData.error || 'Failed to fetch college data');

        currentCollege = researchData.college;
        userColleges = colleges;
        userEssays = essays;

        renderCollegeData(currentCollege);
        setupTabs();
        checkUserStatus();

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
    document.getElementById('collegeName').textContent = college.name;
    document.title = `${college.name} - Waypoint Explorer`;
    document.getElementById('collegeLocation').textContent = college.location || 'Location Unknown';
    document.getElementById('collegeWebsite').href = college.website || '#';
    document.getElementById('collegeDescription').textContent = college.description || 'No description available.';

    // Stats
    document.getElementById('acceptanceRate').textContent = college.acceptance_rate ? `${college.acceptance_rate}%` : '--%';
    document.getElementById('medianSAT').textContent = college.median_sat || 'N/A';
    document.getElementById('medianACT').textContent = college.median_act || 'N/A';
    document.getElementById('avgGPA').textContent = college.avg_gpa || 'N/A';

    // Admissions 
    document.getElementById('totalEnrollment').textContent = college.enrollment ? college.enrollment.toLocaleString() : 'N/A';
    document.getElementById('costOfAttendance').textContent = college.cost_of_attendance ? `$${college.cost_of_attendance.toLocaleString()}` : 'N/A';
    document.getElementById('deadlineInfo').textContent = college.deadline_date ? new Date(college.deadline_date).toLocaleDateString() : 'TBD';
    document.getElementById('testPolicy').textContent = college.test_policy || 'Test Optional';

    // Requirements Lists
    renderRequirements(college);

    // AI Insight
    renderAIInsight(college);

    // Header Background
    if (college.image_url) {
        document.getElementById('collegeHeader').style.backgroundImage = `linear-gradient(rgba(0,0,0,0.4), rgba(0,0,0,0.7)), url(${college.image_url})`;
    }

    // Chart
    renderEnrollmentChart(college);

    // Setup Add Button
    const addBtn = document.getElementById('addCollegeBtn');
    addBtn.onclick = () => addCollegeToList(college.name);
}

function renderRequirements(college) {
    const quickList = document.getElementById('quickRequirementsList');
    const fullList = document.getElementById('fullRequirementsList');

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
    document.getElementById('lorCount').textContent = `${college.lors_required || 0} LORs Required`;
}

function setupTabs() {
    const tabs = document.querySelectorAll('.tab-link');
    tabs.forEach(tab => {
        tab.onclick = () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const target = tab.getAttribute('data-tab');
            document.querySelectorAll('.tab-pane').forEach(p => p.style.display = 'none');
            document.getElementById(`${target}Tab`).style.display = 'block';

            if (target === 'workspace') {
                loadWorkspace();
            }
        };
    });
}

function checkUserStatus() {
    const existing = userColleges.find(c => c.name.toLowerCase() === currentCollege.name.toLowerCase());
    const addBtn = document.getElementById('addCollegeBtn');

    if (existing) {
        addBtn.innerHTML = '✅ Added to List';
        addBtn.classList.replace('btn-primary', 'btn-ghost');
        addBtn.onclick = () => {
            document.querySelector('[data-tab="workspace"]').click();
        };

        // Enable workspace
        document.getElementById('workspacePrompt').style.display = 'none';
        document.getElementById('workspaceContent').style.display = 'block';
    } else {
        document.getElementById('workspacePrompt').style.display = 'block';
        document.getElementById('workspaceContent').style.display = 'none';
    }
}

async function addCollegeToList(name) {
    const btn = document.getElementById('addCollegeBtn');
    if (btn.textContent.includes('Added')) return;

    btn.disabled = true;
    btn.textContent = 'Adding...';

    try {
        const user = await getCurrentUser();
        const response = await fetch(`${config.apiUrl}/api/colleges/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id, collegeName: name })
        });

        const result = await response.json();
        if (result.success) {
            if (window.showNotification) window.showNotification(`Successfully added ${name}!`, 'success');

            // Refresh local data
            userColleges = await getUserColleges(user.id);
            userEssays = await getUserEssays(user.id);

            checkUserStatus();

            // Trigger essay creation on server if needed
            fetch(`${config.apiUrl}/api/essays/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id })
            }).then(() => getUserEssays(user.id).then(essays => { userEssays = essays; }));

        } else {
            if (window.showNotification) window.showNotification('Could not add college: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Error adding college:', error);
    } finally {
        btn.disabled = false;
        if (!btn.textContent.includes('Added')) btn.textContent = '+ Add to List';
    }
}

function loadWorkspace() {
    const college = userColleges.find(c => c.name.toLowerCase() === currentCollege.name.toLowerCase());
    if (!college) return;

    const collegeEssays = userEssays.filter(e => e.college_id === college.id);
    const listContainer = document.getElementById('collegeEssaysList');

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
    document.getElementById('noEssaySelected').style.display = 'none';
    document.getElementById('editorContainer').style.display = 'block';

    document.getElementById('essayTypeBadge').textContent = selectedEssay.essay_type || 'Supplemental';
    document.getElementById('currentPrompt').textContent = selectedEssay.prompt || 'No prompt provided.';
    document.getElementById('wordLimitLabel').textContent = `Max ${selectedEssay.word_limit || '---'} words`;

    const editor = document.getElementById('essayEditor');
    editor.value = selectedEssay.content || '';

    updateEditorStats();
    loadWorkspace(); // Refresh active state in list

    // Setup Auto-save
    if (autoSaveInterval) clearInterval(autoSaveInterval);
    autoSaveInterval = setInterval(saveCurrentEssay, 5000);
};

async function saveCurrentEssay() {
    if (!selectedEssay) return;

    const content = document.getElementById('essayEditor').value;
    if (content === selectedEssay.content) return;

    const status = document.getElementById('save-status');
    status.textContent = 'Saving...';

    try {
        const updated = await updateEssay(selectedEssay.id, {
            content,
            word_count: content.split(/\s+/).filter(w => w.length > 0).length,
            char_count: content.length
        });

        if (updated) {
            selectedEssay.content = content;
            selectedEssay.word_count = updated.word_count;
            status.textContent = 'Saved at ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            // Update in local list
            const index = userEssays.findIndex(e => e.id === selectedEssay.id);
            if (index !== -1) userEssays[index] = updated;
            loadWorkspace();
        }
    } catch (error) {
        status.textContent = 'Error saving';
        console.error('Auto-save error:', error);
    }
}

function updateEditorStats() {
    const content = document.getElementById('essayEditor').value;
    const words = content.split(/\s+/).filter(w => w.length > 0).length;
    document.getElementById('wordCount').textContent = words;

    if (selectedEssay && selectedEssay.word_limit) {
        const percent = Math.min((words / selectedEssay.word_limit) * 100, 100);
        document.getElementById('progressFill').style.width = percent + '%';
        if (words > selectedEssay.word_limit) {
            document.getElementById('progressFill').style.background = 'var(--error)';
        } else {
            document.getElementById('progressFill').style.background = 'var(--primary-blue)';
        }
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
