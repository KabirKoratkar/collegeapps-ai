import { getCurrentUser, getUserTasks, getUserEssays, getUserColleges, getUserProfile } from './supabase-config.js';
import { updateNavbarUser, showLoading, hideLoading } from './ui.js';
import config from './config.js';

let currentUser = null;

document.addEventListener('DOMContentLoaded', async function () {
    showLoading('Waking up your command center...');

    currentUser = await getCurrentUser();
    if (!currentUser) {
        window.location.assign('login.html');
        return;
    }

    // Check for "Complete" profile (has graduation_year)
    if (currentUser.id && !currentUser.id.startsWith('dev-user-')) {
        const profile = await getUserProfile(currentUser.id);
        if (!profile || !profile.graduation_year) {
            console.log('Incomplete profile found, redirecting to onboarding...');
            window.location.assign('onboarding.html');
            return;
        }
        window.currentUserProfile = profile;
    }

    // UI Updates
    updateNavbarUser(currentUser, window.currentUserProfile);
    updateHeader(window.currentUserProfile);

    // Load Data
    const { tasks, essays, colleges } = await fetchDashboardData(currentUser.id);

    // Render Data
    renderDashboard(tasks, essays, colleges);

    hideLoading();

    // Generate AI Action Plan
    generateAIActionPlan(tasks, essays, colleges);
});

function updateHeader(profile = null) {
    const greeting = document.getElementById('greeting');
    const dateEl = document.getElementById('currentDate');

    if (greeting) {
        const hour = new Date().getHours();
        let intro = 'Good morning';
        if (hour >= 12 && hour < 17) intro = 'Good afternoon';
        if (hour >= 17) intro = 'Good evening';

        let name = 'Student';
        if (profile && profile.full_name) {
            name = profile.full_name.split(' ')[0];
        } else if (currentUser.user_metadata && currentUser.user_metadata.full_name) {
            name = currentUser.user_metadata.full_name.split(' ')[0];
        } else if (currentUser.email) {
            name = currentUser.email.split('@')[0];
        }

        greeting.textContent = `${intro}, ${name}! 🌟`;
    }

    if (dateEl) {
        dateEl.textContent = new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }
}

function renderDashboard(tasks, essays, colleges) {
    // 1. Render Today's Tasks
    const taskCard = document.querySelector('.card:first-child .badge-primary')?.parentElement?.parentElement;
    if (taskCard) {
        const badge = taskCard.querySelector('.badge-primary');
        let taskContainer = taskCard.querySelector('.task-scroll-container');

        if (!taskContainer) {
            taskContainer = document.createElement('div');
            taskContainer.className = 'task-scroll-container';
            taskContainer.style.cssText = 'max-height: 400px; overflow-y: auto; padding-right: 5px;';
            taskCard.appendChild(taskContainer);
        } else {
            taskContainer.innerHTML = '';
        }

        const priorityScore = { 'High': 3, 'Medium': 2, 'Low': 1, 'General': 0 };
        const sortedTasks = tasks
            .filter(t => !t.completed)
            .sort((a, b) => {
                const pA = priorityScore[a.priority] || 0;
                const pB = priorityScore[b.priority] || 0;
                if (pA !== pB) return pB - pA;
                if (!a.due_date) return 1;
                if (!b.due_date) return -1;
                return new Date(a.due_date) - new Date(b.due_date);
            });

        badge.textContent = `${sortedTasks.length} tasks`;

        const sampleTasks = taskCard.querySelectorAll('.task-card:not(.task-scroll-container .task-card)');
        sampleTasks.forEach(t => t.remove());

        if (sortedTasks.length === 0) {
            taskContainer.innerHTML = `<p style="color: var(--gray-500); text-align: center; padding: var(--space-md);">All caught up!</p>`;
        } else {
            sortedTasks.forEach(task => {
                const card = document.createElement('div');
                card.className = 'task-card';
                card.style.cursor = 'pointer';
                card.style.marginBottom = 'var(--space-sm)';

                const priorityColor = task.priority === 'High' ? 'var(--error)' : (task.priority === 'Medium' ? 'var(--warning)' : 'var(--primary-blue)');
                const priorityLabel = task.priority || 'General';

                card.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
                        <h3 class="task-title" style="margin: 0;">${task.title}</h3>
                        <span class="badge" style="background: ${priorityColor}15; color: ${priorityColor}; border: 1px solid ${priorityColor}30; font-size: 10px; padding: 2px 6px;">${priorityLabel}</span>
                    </div>
                    <div class="task-meta">
                        <span>${task.category || 'General'}</span>
                        <span>⏰ ${task.due_date ? new Date(task.due_date).toLocaleDateString() : 'No due date'}</span>
                    </div>
                `;

                card.onclick = () => {
                    const category = (task.category || '').toLowerCase();
                    if (category.includes('essay')) window.location.href = 'essays.html';
                    else if (category.includes('document')) window.location.href = 'documents.html';
                    else if (category.includes('school') || category.includes('college')) window.location.href = 'colleges.html';
                    else window.location.href = 'calendar.html';
                };
                taskContainer.appendChild(card);
            });
        }
    }

    // 2. Render Deadlines
    renderDeadlines(colleges);

    // 3. Render Progress Widgets
    const widgets = document.querySelectorAll('.progress-widget');
    if (widgets.length >= 3) {
        const completedEssays = essays.filter(e => e.is_completed).length;
        updateWidget(widgets[0], completedEssays, essays.length);

        const completedTasks = tasks.filter(t => t.completed).length;
        updateWidget(widgets[1], completedTasks, tasks.length);

        const avgProgress = colleges.length > 0
            ? colleges.reduce((acc, c) => acc + (c.smartProgress || 0), 0) / colleges.length
            : 0;
        updateWidget(widgets[2], avgProgress, 100);
    }
}

function renderDeadlines(colleges) {
    const deadlineContainer = document.querySelector('.deadline-card')?.parentElement;
    if (!deadlineContainer) return;

    deadlineContainer.innerHTML = '';
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sortedColleges = colleges
        .filter(c => c.deadline)
        .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

    if (sortedColleges.length === 0) {
        deadlineContainer.innerHTML = `
            <div class="deadline-card mb-xl">
                <div class="deadline-days">0</div>
                <div class="deadline-label">Add a college to see your next deadline!</div>
            </div>
        `;
        return;
    }

    sortedColleges.forEach((c, index) => {
        const deadline = new Date(c.deadline);
        deadline.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));

        const card = document.createElement('div');
        card.className = 'deadline-card mb-md';
        card.style.cursor = 'pointer';

        let label = `Days Until ${c.name} ${c.deadline_type || 'Deadline'}`;
        let count = Math.max(0, diffDays);

        if (diffDays < 0) {
            card.style.opacity = '0.6';
            label = `${c.name} Deadline Passed`;
            count = 'PASSED';
        } else if (diffDays === 0) {
            card.style.boxShadow = '0 0 20px rgba(239, 68, 68, 0.4)';
            label = `${c.name} Deadline is TODAY!`;
            count = 'TODAY';
        } else if (diffDays <= 7) {
            card.style.background = 'linear-gradient(135deg, #ef4444 0%, #f87171 100%)';
        } else if (index !== 0) {
            card.style.background = 'var(--surface)';
            card.style.color = 'var(--gray-800)';
            card.style.borderColor = 'var(--border)';
        }


        card.innerHTML = `
            <div class="deadline-days" style="${typeof count === 'string' ? 'font-size: 1.5rem;' : ''}">${count}</div>
            <div class="deadline-label">${label}</div>
        `;

        card.onclick = () => window.location.href = `college-explorer.html?name=${encodeURIComponent(c.name)}`;
        deadlineContainer.appendChild(card);
    });
}

function updateWidget(widget, completed, total) {
    const label = widget.querySelector('.progress-label span:last-child');
    const bar = widget.querySelector('.progress-fill');
    const header = widget.querySelector('h3').textContent;

    if (label) {
        if (header.includes('Application')) label.textContent = `${Math.round(completed)}% AVG`;
        else label.textContent = `${completed}/${total || 0}`;
    }
    if (bar) {
        const percent = (completed / (total || (header.includes('Application') ? 100 : 1))) * 100;
        bar.style.width = `${percent}%`;
    }
}

async function fetchDashboardData(userId) {
    const [tasks, essays, colleges] = await Promise.all([
        getUserTasks(userId),
        getUserEssays(userId),
        getUserColleges(userId)
    ]);

    colleges.forEach(college => {
        college.smartProgress = calculateSmartProgress(college, essays, tasks);
    });

    return { tasks, essays, colleges };
}

function calculateSmartProgress(college, allEssays, allTasks) {
    const collegeEssays = allEssays.filter(e => e.college_id === college.id);
    const collegeTasks = allTasks.filter(t => t.college_id === college.id);

    if (collegeEssays.length === 0 && collegeTasks.length === 0) return 0;

    let essayWeight = collegeTasks.length === 0 ? 1.0 : 0.4;
    let taskWeight = collegeEssays.length === 0 ? 1.0 : 0.6;

    let essayScore = 0;
    if (collegeEssays.length > 0) {
        const progress = collegeEssays.reduce((acc, e) => {
            if (e.is_completed) return acc + 1;
            const wp = e.word_limit > 0 ? Math.min(e.word_count / e.word_limit, 1) : 0;
            return acc + (wp * 0.8);
        }, 0);
        essayScore = progress / collegeEssays.length;
    }

    let taskScore = 0;
    if (collegeTasks.length > 0) {
        taskScore = collegeTasks.filter(t => t.completed).length / collegeTasks.length;
    }

    return Math.round((essayScore * essayWeight + taskScore * taskWeight) * 100);
}

async function generateAIActionPlan(tasks, essays, colleges) {
    const planEl = document.getElementById('aiActionPlan');
    const breakdownEl = document.getElementById('aiStatsBreakdown');
    const container = document.getElementById('aiPlanContainer');
    if (!planEl || !breakdownEl) return;

    if (container) container.onclick = () => window.location.href = 'ai-counselor.html';

    const pendingTasks = tasks.filter(t => !t.completed);
    const pendingEssays = essays.filter(e => !e.is_completed);
    const upcomingDeadlines = colleges.filter(c => c.deadline && new Date(c.deadline) > new Date());

    breakdownEl.innerHTML = `
        <div class="hero-stat-item">
            <div class="stat-val">${pendingTasks.length}</div>
            <div class="stat-lbl">Tasks</div>
        </div>
        <div class="hero-stat-item">
            <div class="stat-val stat-purple">${pendingEssays.length}</div>
            <div class="stat-lbl">Essays</div>
        </div>
        <div class="hero-stat-item">
            <div class="stat-val stat-green">${upcomingDeadlines.length}</div>
            <div class="stat-lbl">Goals</div>
        </div>
    `;


    try {
        const profile = window.currentUserProfile || await getUserProfile(currentUser.id);
        const leeway = profile?.submission_leeway || 3;
        const intensity = profile?.intensity_level || 'Balanced';

        const statsStr = `Tasks: ${pendingTasks.length}, Essays: ${pendingEssays.length}, Colleges: ${colleges.length}, Next: ${upcomingDeadlines[0] ? upcomingDeadlines[0].name : 'None'}, Leeway: ${leeway} days, Strategy: ${intensity} pace`;

        const response = await fetch(`${config.apiUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: `Give me a 2-sentence tactical action plan for TODAY based on these stats: ${statsStr}. Focus on the student's preferred ${intensity} pace. Be direct and coach-like.`,
                userId: currentUser.id,
                conversationHistory: []
            })
        });

        if (!response.ok) throw new Error('AI Server error');
        const data = await response.json();
        planEl.textContent = data.response;
    } catch (error) {
        planEl.textContent = "Focus on your upcoming deadlines and high-priority tasks!";
    }
}

