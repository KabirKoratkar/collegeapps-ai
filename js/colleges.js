import { getCurrentUser, getUserColleges, addCollege, updateCollege, searchCollegeCatalog } from './supabase-config.js';
import { updateNavbarUser } from './ui.js';
import config from './config.js';

let currentUser = null;
let colleges = [];

// Export functions to global scope for HTML onclick
window.openAddCollegeModal = openAddCollegeModal;
window.getAIStrategy = getAIStrategy;
window.updateStatus = updateStatus;
window.addFromSearch = addFromSearch;

document.addEventListener('DOMContentLoaded', async function () {
    console.log('Colleges page loaded, initializing...');

    // Attach event listeners IMMEDIATELY to be responsive
    const addCollegeBtn = document.getElementById('addCollegeBtn');
    if (addCollegeBtn) {
        console.log('Attaching click listener to addCollegeBtn');
        addCollegeBtn.addEventListener('click', openAddCollegeModal);
    } else {
        console.warn('addCollegeBtn not found in DOM!');
    }

    currentUser = await getCurrentUser();
    if (!currentUser) {
        console.warn('No current user, redirecting to login...');
        window.location.href = new URL('login.html', window.location.href).href;
        return;
    }

    updateNavbarUser(currentUser);
    await loadAndRenderColleges();

    // Search logic
    const searchInput = document.getElementById('collegeSearchInput');
    const resultsContainer = document.getElementById('searchResults');

    if (searchInput) {
        searchInput.addEventListener('input', async (e) => {
            const query = e.target.value.trim();
            if (query.length < 2) {
                resultsContainer.style.display = 'none';
                return;
            }

            const results = await searchCollegeCatalog(query);
            renderSearchResults(results);
        });

        // Close search when clicking outside
        document.addEventListener('click', (e) => {
            if (!searchInput.contains(e.target) && !resultsContainer.contains(e.target)) {
                resultsContainer.style.display = 'none';
            }
        });
    }
});

function renderSearchResults(results) {
    const resultsContainer = document.getElementById('searchResults');
    if (!resultsContainer) return;

    if (results.length === 0) {
        resultsContainer.innerHTML = '<div style="padding: var(--space-md); color: var(--gray-500); text-align: center;">No colleges found. Try a different name?</div>';
    } else {
        resultsContainer.innerHTML = results.map(c => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: var(--space-md); border-bottom: 1px solid var(--gray-100); cursor: pointer;" class="search-item">
                <div>
                    <div style="font-weight: 600; color: var(--gray-800);">${c.name}</div>
                    <div style="font-size: var(--text-xs); color: var(--gray-500);">${c.application_platform || 'Common App'} • ${c.deadline_type || 'RD'} Deadline</div>
                </div>
                <button class="btn btn-sm btn-ghost" onclick="addFromSearch('${c.name}')" style="color: var(--primary-blue);">+ Add</button>
            </div>
        `).join('');
    }
    resultsContainer.style.display = 'block';
}

async function addFromSearch(name) {
    const resultsContainer = document.getElementById('searchResults');
    resultsContainer.style.display = 'none';
    const searchInput = document.getElementById('collegeSearchInput');
    if (searchInput) searchInput.value = '';

    await performAddCollege(name);
}

async function performAddCollege(collegeName) {
    const btn = document.getElementById('addCollegeBtn');
    const originalText = btn ? btn.innerHTML : '+ Add College';

    try {
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="loading-spinner"></span> Adding...';
        }

        showNotification(`Adding ${collegeName}...`, 'info');
        console.log(`Adding college: ${collegeName}`);

        const newCollege = await addCollege(currentUser.id, collegeName);

        if (newCollege) {
            console.log('College added successfully:', newCollege);
            showNotification(`${collegeName} added successfully!`, 'success');
            await loadAndRenderColleges();
        } else {
            throw new Error('Failed to add college - no response from server');
        }
    } catch (error) {
        console.error('Error adding college:', error);
        showNotification(`Error adding ${collegeName}: ${error.message}`, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
}

async function loadAndRenderColleges() {
    const { colleges, tasks, essays } = await fetchCollegesData(currentUser.id);
    const tbody = document.querySelector('.college-table tbody');

    // Update summary counts
    updateSummary(colleges);

    if (colleges.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: var(--space-xl);">No colleges added yet. Use the "Add College" button or ask the AI Counselor!</td></tr>';
        return;
    }

    tbody.innerHTML = colleges.map(c => {
        const progress = calculateSmartProgress(c, essays, tasks);
        const progressColor = progress === 100 ? 'var(--success)' : (progress > 50 ? 'var(--primary-blue)' : 'var(--warning)');

        return `
            <tr data-id="${c.id}">
                <td>
                    <div style="display: flex; align-items: center; gap: var(--space-sm);">
                        <strong>${c.name}</strong>
                        <button class="btn btn-sm btn-ghost" onclick="getAIStrategy('${c.name}')" title="Get AI Strategy">✨</button>
                    </div>
                </td>
                <td><span class="badge">${c.application_platform || 'TBD'}</span></td>
                <td>${essays.filter(e => e.college_id === c.id).length} essays</td>
                <td><span class="badge ${getTestPolicyClass(c.test_policy)}">${c.test_policy || 'Unknown'}</span></td>
                <td>${c.lors_required || 0}</td>
                <td>${c.deadline ? new Date(c.deadline).toLocaleDateString() : 'TBD'}</td>
                <td>
                    <div style="display: flex; flex-direction: column; gap: 4px; min-width: 120px;">
                        <div style="display: flex; justify-content: space-between; font-size: var(--text-xs); font-weight: 600;">
                            <span>${progress}%</span>
                            <span>${progress === 100 ? 'Ready' : 'In Progress'}</span>
                        </div>
                        <div style="width: 100%; height: 6px; background: var(--gray-100); border-radius: 3px; overflow: hidden;">
                            <div style="width: ${progress}%; height: 100%; background: ${progressColor}; transition: width 0.3s ease;"></div>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

async function fetchCollegesData(userId) {
    const [colleges, tasks, essays] = await Promise.all([
        getUserColleges(userId),
        getUserTasks(userId),
        getUserEssays(userId)
    ]);
    return { colleges, tasks, essays };
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

function updateSummary(collegesList) {
    const total = collegesList.length;
    const reach = collegesList.filter(c => c.type === 'Reach').length;
    const target = collegesList.filter(c => c.type === 'Target').length;
    const safety = collegesList.filter(c => c.type === 'Safety').length;

    const cards = document.querySelectorAll('.grid-4 .card div:first-child');
    if (cards.length >= 4) {
        cards[0].textContent = total;
        cards[1].textContent = reach || colleges.filter(c => c.name.includes('Stanford') || c.name.includes('MIT')).length; // Fallback heuristic
        cards[2].textContent = target;
        cards[3].textContent = safety;
    }
}

async function updateStatus(id, status) {
    const updated = await updateCollege(id, { status });
    if (updated) {
        showNotification('Status updated!', 'success');
    }
}

async function openAddCollegeModal() {
    const collegeName = prompt('Enter college name (e.g., Stanford University):');
    if (!collegeName) return;
    await performAddCollege(collegeName);
}

async function getAIStrategy(collegeName) {
    showNotification(`Building success strategy for ${collegeName}...`, 'info');

    try {
        const response = await fetch(`${config.apiUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: `Give me a comprehensive Success Strategy for applying to ${collegeName}. 
                Please include:
                1. The Game Plan (Key steps and focus areas)
                2. How to Stand Out (What they value most)
                3. Critical Advice (Personalized tips to maximize chances)
                
                Keep it structured and very actionable. Use clear headers.`,
                userId: currentUser.id,
                conversationHistory: []
            })
        });

        if (!response.ok) throw new Error('AI Server error');

        const data = await response.json();
        showAIModal(`${collegeName} Success Strategy`, data.response);
    } catch (error) {
        console.error('AI Strategy Error:', error);
        showNotification('Could not get AI strategy. Is the server running?', 'error');
    }
}

function showAIModal(title, content) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center;
        z-index: 2000; backdrop-filter: blur(8px);
    `;

    // Process markdown-like headers
    const formattedContent = content
        .replace(/### (.*)/g, '<h3 style="color: var(--primary-blue); margin-top: var(--space-lg); margin-bottom: var(--space-sm);">$1</h3>')
        .replace(/## (.*)/g, '<h2 style="color: var(--primary-blue); margin-top: var(--space-xl); margin-bottom: var(--space-md);">$1</h2>')
        .replace(/\n/g, '<br>');

    modal.innerHTML = `
        <div class="card" style="max-width: 650px; width: 90%; padding: var(--space-2xl); max-height: 85vh; overflow-y: auto; position: relative;">
            <button onclick="this.closest('.modal-overlay').remove()" style="position: absolute; top: 20px; right: 20px; background: none; border: none; font-size: 24px; cursor: pointer; color: var(--gray-400);">×</button>
            <div style="display: flex; align-items: center; gap: var(--space-md); margin-bottom: var(--space-xl);">
                <span style="font-size: 32px;">✨</span>
                <h1 style="font-size: var(--text-2xl); font-weight: 800; margin: 0;">${title}</h1>
            </div>
            <div style="line-height: 1.8; color: var(--gray-700); font-size: var(--text-md);">
                ${formattedContent}
            </div>
            <div style="margin-top: var(--space-2xl); display: flex; gap: var(--space-md);">
                <button class="btn btn-primary flex-1" onclick="this.closest('.modal-overlay').remove()">Got it, let's win!</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

function getTestPolicyClass(policy) {
    if (!policy) return '';
    if (policy.includes('Optional')) return 'badge-warning';
    if (policy.includes('Blind')) return 'badge-success';
    return 'badge-info';
}
