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

    hideLoading();

    // UI Updates
    // Basic UI
    updateNavbarUser(currentUser);
    updateHeader(window.currentUserProfile);

    hideLoading();

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

        // Priority 1: Profile full_name
        // Priority 2: User metadata full_name
        // Priority 3: Email prefix
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
    const taskContainer = document.querySelector('.card:first-child .badge-primary')?.parentElement?.parentElement;
    if (taskContainer) {
        const badge = taskContainer.querySelector('.badge-primary');
        const incompleteTasks = tasks.filter(t => !t.completed);
        badge.textContent = `${incompleteTasks.length} tasks`;

        // Clear sample tasks
        const sampleTasks = taskContainer.querySelectorAll('.task-card');
        sampleTasks.forEach(t => t.remove());

        if (incompleteTasks.length === 0) {
            const empty = document.createElement('p');
            empty.style.color = 'var(--gray-500)';
            empty.style.textAlign = 'center';
            empty.style.padding = 'var(--space-md)';
            empty.textContent = 'All caught up! Add a new task to stay on track.';
            taskContainer.appendChild(empty);
        } else {
            incompleteTasks.slice(0, 3).forEach(task => {
                const card = document.createElement('div');
                card.className = 'task-card';
                card.style.cursor = 'pointer';
                card.innerHTML = `
                    <h3 class="task-title">${task.title}</h3>
                    <div class="task-meta">
                        <span>${task.category || 'General'}</span>
                        <span>⏰ ${task.due_date ? 'Due ' + new Date(task.due_date).toLocaleDateString() : 'No due date'}</span>
                    </div>
                `;

                // Add click listener to navigate to relevant section
                card.onclick = () => {
                    const category = (task.category || '').toLowerCase();
                    if (category.includes('essay')) {
                        window.location.href = 'essays.html';
                    } else if (category.includes('document')) {
                        window.location.href = 'documents.html';
                    } else if (category.includes('school') || category.includes('college')) {
                        window.location.href = 'colleges.html';
                    } else {
                        // Default to calendar or task-related view if available
                        window.location.href = 'calendar.html';
                    }
                };

                taskContainer.appendChild(card);
            });
        }
    }

    // 2. Render Progress Widgets
    const widgets = document.querySelectorAll('.progress-widget');
    if (widgets.length >= 3) {
        // Essays
        const completedEssays = essays.filter(e => e.is_completed).length;
        updateWidget(widgets[0], completedEssays, essays.length);

        // Tasks
        const completedTasks = tasks.filter(t => t.completed).length;
        updateWidget(widgets[1], completedTasks, tasks.length);

        // Application Progress (Average of all colleges)
        const avgProgress = colleges.length > 0
            ? colleges.reduce((acc, c) => acc + (c.smartProgress || 0), 0) / colleges.length
            : 0;
        updateWidget(widgets[2], avgProgress, 100);
    }
}

function updateWidget(widget, completed, total) {
    const label = widget.querySelector('.progress-label span:last-child');
    const bar = widget.querySelector('.progress-fill');

    if (label) {
        // Find if we are showing percentage or counts
        const header = widget.querySelector('h3').textContent;
        if (header.includes('Application')) {
            label.textContent = `${Math.round(completed)}% AVG`;
        } else {
            label.textContent = `${completed}/${total || 0}`;
        }
    }
    if (bar) bar.style.width = `${(completed / (total || (header.includes('Application') ? 100 : 1))) * 100}%`;
}

async function fetchDashboardData(userId) {
    const [tasks, essays, colleges] = await Promise.all([
        getUserTasks(userId),
        getUserEssays(userId),
        getUserColleges(userId)
    ]);

    // Calculate smart progress for each college
    colleges.forEach(college => {
        college.smartProgress = calculateSmartProgress(college, essays, tasks);
    });

    return { tasks, essays, colleges };
}

function calculateSmartProgress(college, allEssays, allTasks) {
    const collegeEssays = allEssays.filter(e => e.college_id === college.id);
    const collegeTasks = allTasks.filter(t => t.college_id === college.id);

    if (collegeEssays.length === 0 && collegeTasks.length === 0) return 0;

    // Weighting: 40% Essays, 60% Tasks
    let essayWeight = 0.4;
    let taskWeight = 0.6;

    // Adjust if one category is empty
    if (collegeEssays.length === 0) { taskWeight = 1.0; essayWeight = 0; }
    if (collegeTasks.length === 0) { essayWeight = 1.0; taskWeight = 0; }

    // Calculate Essay Score
    let essayScore = 0;
    if (collegeEssays.length > 0) {
        const totalEssayProgress = collegeEssays.reduce((acc, essay) => {
            if (essay.is_completed) return acc + 1;
            // Partial progress based on word count (capped at 1)
            const wordProgress = essay.word_limit > 0 ? Math.min(essay.word_count / essay.word_limit, 1) : 0;
            return acc + (wordProgress * 0.8); // Non-completed capped at 80%
        }, 0);
        essayScore = totalEssayProgress / collegeEssays.length;
    }

    // Calculate Task Score
    let taskScore = 0;
    if (collegeTasks.length > 0) {
        const completedTasks = collegeTasks.filter(t => t.completed).length;
        taskScore = completedTasks / collegeTasks.length;
    }

    return Math.round((essayScore * essayWeight + taskScore * taskWeight) * 100);
}

async function generateAIActionPlan(tasks, essays, colleges) {
    const planEl = document.getElementById('aiActionPlan');
    if (!planEl) return;

    try {
        const stats = {
            todo: tasks.filter(t => !t.completed).length,
            essaysPending: essays.filter(e => !e.is_completed).length,
            colleges: colleges.length
        };

        const response = await fetch(`${config.apiUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: `Based on my college application status (Pending Tasks: ${stats.todo}, Essays In Progress: ${stats.essaysPending}, Total Colleges: ${stats.colleges}), give me a one-sentence "priority of the day" for my college applications. Be motivating!`,
                userId: currentUser.id,
                conversationHistory: []
            })
        });

        if (!response.ok) throw new Error('AI Server error');

        const data = await response.json();
        planEl.textContent = data.response;
    } catch (error) {
        console.error('AI Plan Error:', error);
        planEl.textContent = "Focus on your upcoming deadlines! Check your calendar for what's due next.";
    }
}
