import { getCurrentUser, getUserTasks, getUserEssays, getUserColleges, getUserProfile } from './supabase-config.js';
import { updateNavbarUser } from './ui.js';
import config from './config.js';

let currentUser = null;

document.addEventListener('DOMContentLoaded', async function () {
    currentUser = await getCurrentUser();
    if (!currentUser) {
        window.location.assign('login.html');
        return;
    }

    // Check if profile exists (if not, they need onboarding)
    // Only check for real users, skip for dev-mode mock users
    if (!currentUser.id.startsWith('dev-user-')) {
        const profile = await getUserProfile(currentUser.id);
        if (!profile) {
            console.log('No profile found, redirecting to onboarding...');
            window.location.assign('onboarding.html');
            return;
        }
        window.currentUserProfile = profile;
    }

    // Update Basic UI
    updateNavbarUser(currentUser);
    updateHeader(window.currentUserProfile);

    // Load Data
    const tasks = await getUserTasks(currentUser.id);
    const essays = await getUserEssays(currentUser.id);
    const colleges = await getUserColleges(currentUser.id);

    // Render Data
    renderDashboard(tasks, essays, colleges);

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
                card.innerHTML = `
                    <h3 class="task-title">${task.title}</h3>
                    <div class="task-meta">
                        <span>${task.category || 'General'}</span>
                        <span>⏰ ${task.due_date ? 'Due ' + new Date(task.due_date).toLocaleDateString() : 'No due date'}</span>
                    </div>
                `;
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

        // Colleges
        const completedColleges = colleges.filter(c => c.status === 'Completed').length;
        updateWidget(widgets[2], completedColleges, colleges.length);
    }
}

function updateWidget(widget, completed, total) {
    const label = widget.querySelector('.progress-label span:last-child');
    const bar = widget.querySelector('.progress-fill');

    if (label) label.textContent = `${completed}/${total || 1}`;
    if (bar) bar.style.width = `${(completed / (total || 1)) * 100}%`;
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
