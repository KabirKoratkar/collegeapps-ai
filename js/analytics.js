/**
 * Analytics Dashboard Logic
 * Handles data fetching and chart rendering for the analytics page.
 */

import { getCurrentUser, getUserProfile, getUserColleges, getUserEssays, getUserTasks, getUserConversations, getEssayComments, supabase } from './supabase-config.js';
import { updateNavbarUser } from './ui.js';

document.addEventListener('DOMContentLoaded', async () => {
    console.log('📊 Analytics initializing...');

    try {
        const user = await getCurrentUser();
        let colleges = [];
        let essays = [];
        let tasks = [];

        if (user) {
            const profile = await getUserProfile(user.id);
            updateNavbarUser(user, profile);

            colleges = await getUserColleges(user.id);
            essays = await getUserEssays(user.id);
            tasks = await getUserTasks(user.id);

            // Get activity data
            const activityData = await fetchActivityData(user.id);
            console.log(`Found ${colleges.length} colleges, ${essays.length} essays, ${tasks.length} tasks`);

            updateSummaryStats(colleges, essays, tasks);
            renderCollegeBreakdown(colleges);
            renderAppStatus(colleges);
            renderActivity(activityData);
            renderEssayProgress(essays);
        } else {
            console.log('No user found, using default view');
            renderCollegeBreakdown([]);
            renderAppStatus([]);
            renderActivity({});
            renderEssayProgress([]);
        }

    } catch (error) {
        console.error('Error initializing analytics:', error);
    }
});

function updateSummaryStats(colleges, essays, tasks) {
    const completionCard = document.querySelector('.stats-summary .card:nth-child(1) div:last-child');
    const daysCard = document.querySelector('.stats-summary .card:nth-child(2) div:last-child');
    const essaysCard = document.querySelector('.stats-summary .card:nth-child(3) div:last-child');
    const tasksCard = document.querySelector('.stats-summary .card:nth-child(4) div:last-child');

    if (completionCard) {
        const totalProgress = colleges.reduce((acc, c) => {
            const progress = calculateSmartProgress(c, essays, tasks);
            return acc + progress;
        }, 0);
        const percent = colleges.length > 0 ? Math.round(totalProgress / colleges.length) : 0;
        completionCard.textContent = `${percent}%`;
    }

    if (daysCard) {
        // Calculate days to nearest deadline
        const now = new Date();
        const futureDeadlines = colleges
            .filter(c => c.deadline && new Date(c.deadline) > now)
            .map(c => new Date(c.deadline));

        if (futureDeadlines.length > 0) {
            const nearest = new Date(Math.min(...futureDeadlines));
            const diffTime = Math.abs(nearest - now);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            daysCard.textContent = diffDays;
        } else {
            daysCard.textContent = '--';
        }
    }

    if (essaysCard) {
        const drafted = essays.filter(e => e.word_count > 100).length;
        essaysCard.textContent = `${drafted} / ${essays.length || 0}`;
    }

    if (tasksCard) {
        const done = tasks.filter(t => t.completed).length;
        tasksCard.textContent = `${done} / ${tasks.length || 0}`;
    }
}

function renderCollegeBreakdown(colleges) {
    const ctx = document.getElementById('collegeBreakdownChart').getContext('2d');

    const types = { 'Reach': 0, 'Target': 0, 'Safety': 0 };
    colleges.forEach(c => {
        let type = c.type;
        if (!type) {
            type = (c.name.includes('Stanford') || c.name.includes('MIT') || c.name.includes('Harvard')) ? 'Reach' : 'Target';
        }
        if (types[type] !== undefined) {
            types[type]++;
        } else {
            // Default to Target if type is unknown
            types['Target']++;
        }
    });

    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Reach', 'Target', 'Safety'],
            datasets: [{
                data: [types['Reach'], types['Target'], types['Safety']],
                backgroundColor: ['#8B7BF7', '#5B8DEE', '#10B981'],
                borderWidth: 0,
                hoverOffset: 10
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        usePointStyle: true,
                        padding: 20,
                        font: { family: 'Inter' }
                    }
                }
            },
            cutout: '70%'
        }
    });
}

function renderAppStatus(colleges) {
    const ctx = document.getElementById('appStatusChart').getContext('2d');

    const statusCounts = { 'Not Started': 0, 'In Progress': 0, 'Completed': 0 };
    colleges.forEach(c => {
        const progress = calculateSmartProgress(c, [], []); // Basic check with no essays/tasks for now if not available
        let status = 'Not Started';
        if (progress === 100) status = 'Completed';
        else if (progress > 0) status = 'In Progress';
        statusCounts[status]++;
    });

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Not Started', 'In Progress', 'Completed'],
            datasets: [{
                label: 'Colleges',
                data: [statusCounts['Not Started'], statusCounts['In Progress'], statusCounts['Completed']],
                backgroundColor: ['#EF4444', '#F59E0B', '#10B981'],
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { stepSize: 1 }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

async function fetchActivityData(userId) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const { data: convData } = await supabase
        .from('conversations')
        .select('created_at')
        .eq('user_id', userId)
        .eq('role', 'user')
        .gte('created_at', sevenDaysAgo.toISOString());

    const { data: essayVers } = await supabase
        .from('essay_versions')
        .select('created_at')
        .eq('user_id', userId)
        .gte('created_at', sevenDaysAgo.toISOString());

    const { data: comments } = await supabase
        .from('essay_comments')
        .select('created_at')
        .eq('user_id', userId)
        .gte('created_at', sevenDaysAgo.toISOString());

    const activityByDay = {};
    const allActivity = [...(convData || []), ...(essayVers || []), ...(comments || [])];

    allActivity.forEach(a => {
        const day = new Date(a.created_at).toLocaleDateString('en-US', { weekday: 'short' });
        activityByDay[day] = (activityByDay[day] || 0) + 1;
    });

    return activityByDay;
}

function renderActivity(activityData) {
    const ctx = document.getElementById('activityChart').getContext('2d');

    const days = [];
    const sessions = [];
    const now = new Date();

    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(now.getDate() - i);
        const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short' });
        days.push(dayLabel);
        sessions.push(activityData[dayLabel] || 0);
    }

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: days,
            datasets: [{
                label: 'Interactions (Chat, Saves, Comments)',
                data: sessions,
                fill: true,
                borderColor: '#5B8DEE',
                backgroundColor: 'rgba(91, 141, 238, 0.1)',
                tension: 0.4,
                pointRadius: 4,
                pointBackgroundColor: '#5B8DEE'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { stepSize: 1 }
                }
            }
        }
    });
}

function renderEssayProgress(essays) {
    const list = document.getElementById('essayProgressList');
    if (!list) return;

    if (!essays || essays.length === 0) {
        list.innerHTML = '<p class="empty-state">No essays found. Add a college to see its requirements.</p>';
        return;
    }

    list.innerHTML = essays.map(essay => {
        const wordCount = essay.word_count || 0;
        const wordLimit = essay.word_limit || 650;
        const progress = Math.min((wordCount / wordLimit) * 100, 100);

        let statusLabel = 'Not Started';
        let statusClass = 'badge-ghost';

        if (essay.is_completed) {
            statusLabel = 'Finalized';
            statusClass = 'badge-success';
        } else if (wordCount > 50) {
            statusLabel = 'Drafted';
            statusClass = 'badge-primary';
        }

        return `
            <div style="background: var(--gray-50); padding: var(--space-md); border-radius: var(--radius-lg); border: 1px solid var(--gray-100);">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: var(--space-sm);">
                    <div style="flex: 1;">
                        <div style="font-weight: 700; font-size: var(--text-base); color: var(--gray-900);">${essay.title}</div>
                        <div style="font-size: var(--text-xs); color: var(--gray-500);">${essay.colleges?.name || ''}</div>
                    </div>
                    <span class="badge ${statusClass}">${statusLabel}</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <span style="font-size: var(--text-xs); font-weight: 600; color: var(--gray-600);">${wordCount} / ${wordLimit} words</span>
                    <span style="font-size: var(--text-xs); color: var(--gray-400);">${Math.round(progress)}%</span>
                </div>
                <div class="progress-bar" style="height: 6px;">
                    <div class="progress-fill" style="width: ${progress}%; background: ${essay.is_completed ? 'var(--success)' : 'var(--primary-blue)'};"></div>
                </div>
            </div>
        `;
    }).join('');
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

    let essayWeight = 0.4;
    let taskWeight = 0.6;
    if (collegeEssays.length === 0) { taskWeight = 1.0; essayWeight = 0; }
    if (collegeTasks.length === 0) { essayWeight = 1.0; taskWeight = 0; }

    return Math.round((essayScore * essayWeight + taskScore * taskWeight) * 100);
}
