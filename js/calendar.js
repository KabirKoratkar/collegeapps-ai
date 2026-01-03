import { supabase, getCurrentUser, getUserProfile, upsertProfile } from './supabase-config.js';
import { updateNavbarUser } from './ui.js';

let currentDate = new Date();
let allEvents = [];
let filteredEvents = [];

// Initialize calendar on page load
document.addEventListener('DOMContentLoaded', async () => {
    const user = await getCurrentUser();
    if (!user) {
        window.location.href = new URL('login.html', window.location.href).href;
        return;
    }

    updateNavbarUser(user);

    await loadLeeway(user.id);
    await loadEvents();
    renderCalendar();
    setupEventListeners();
});

async function loadLeeway(userId) {
    const profile = await getUserProfile(userId);
    if (profile && profile.submission_leeway !== undefined) {
        const leewaySelect = document.getElementById('leewaySetting');
        if (leewaySelect) {
            leewaySelect.value = profile.submission_leeway;
        }
    }
}

// Setup event listeners
function setupEventListeners() {
    document.getElementById('prevMonth').addEventListener('click', () => navigateMonth(-1));
    document.getElementById('nextMonth').addEventListener('click', () => navigateMonth(1));
    document.getElementById('collegeFilter').addEventListener('change', applyFilters);
    document.getElementById('typeFilter').addEventListener('change', applyFilters);
    document.getElementById('leewaySetting').addEventListener('change', updateLeeway);
    document.getElementById('closeModal').addEventListener('click', closeModal);
    document.getElementById('modalOverlay').addEventListener('click', closeModal);

    // ESC key to close modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });
}

// Navigate to previous/next month
function navigateMonth(direction) {
    currentDate.setMonth(currentDate.getMonth() + direction);
    renderCalendar();
}

// Load all events from database
async function loadEvents() {
    try {
        const user = await getCurrentUser();
        if (!user) return;

        // Load tasks with due dates
        const { data: tasks, error: tasksError } = await supabase
            .from('tasks')
            .select('*, colleges(name)')
            .eq('user_id', user.id)
            .not('due_date', 'is', null)
            .order('due_date', { ascending: true });

        if (tasksError) throw tasksError;

        // Load college deadlines
        const { data: colleges, error: collegesError } = await supabase
            .from('colleges')
            .select('*')
            .eq('user_id', user.id)
            .not('deadline', 'is', null)
            .order('deadline', { ascending: true });

        if (collegesError) throw collegesError;

        // Load essays with deadlines (from tasks or colleges)
        const { data: essays, error: essaysError } = await supabase
            .from('essays')
            .select('*, colleges(name, deadline)')
            .eq('user_id', user.id);

        if (essaysError) throw essaysError;

        // Combine and format events
        allEvents = [];

        // Add college deadlines
        if (colleges) {
            colleges.forEach(college => {
                allEvents.push({
                    id: `deadline-${college.id}`,
                    type: 'deadline',
                    title: `${college.name} - ${college.deadline_type || 'Application'}`,
                    date: college.deadline,
                    college: college.name,
                    collegeId: college.id,
                    details: {
                        platform: college.application_platform,
                        deadlineType: college.deadline_type,
                        status: college.status
                    }
                });
            });
        }

        // Add tasks
        if (tasks) {
            tasks.forEach(task => {
                allEvents.push({
                    id: `task-${task.id}`,
                    type: 'task',
                    title: task.title,
                    date: task.due_date,
                    college: task.colleges?.name || 'General',
                    collegeId: task.college_id,
                    details: {
                        description: task.description,
                        category: task.category,
                        priority: task.priority,
                        completed: task.completed
                    }
                });
            });
        }

        // Add essays as tasks (if they have deadlines from their college)
        if (essays) {
            essays.forEach(essay => {
                if (essay.colleges?.deadline) {
                    allEvents.push({
                        id: `essay-${essay.id}`,
                        type: 'essay',
                        title: essay.title,
                        date: essay.colleges.deadline,
                        college: essay.colleges.name,
                        collegeId: essay.college_id,
                        details: {
                            essayType: essay.essay_type,
                            wordLimit: essay.word_limit,
                            wordCount: essay.word_count,
                            completed: essay.is_completed
                        }
                    });
                }
            });
        }

        filteredEvents = [...allEvents];
        populateCollegeFilter();

    } catch (error) {
        console.error('Error loading events:', error);
        showNotification('Failed to load calendar events', 'error');
    }
}

// Populate college filter dropdown
function populateCollegeFilter() {
    const collegeFilter = document.getElementById('collegeFilter');
    const colleges = [...new Set(allEvents.map(e => e.college))].sort();

    // Clear existing options except "All Colleges"
    collegeFilter.innerHTML = '<option value="all">All Colleges</option>';

    colleges.forEach(college => {
        const option = document.createElement('option');
        option.value = college;
        option.textContent = college;
        collegeFilter.appendChild(option);
    });
}

// Apply filters
function applyFilters() {
    const collegeFilter = document.getElementById('collegeFilter').value;
    const typeFilter = document.getElementById('typeFilter').value;

    filteredEvents = allEvents.filter(event => {
        const matchesCollege = collegeFilter === 'all' || event.college === collegeFilter;
        const matchesType = typeFilter === 'all' || event.type === typeFilter;
        return matchesCollege && matchesType;
    });

    renderCalendar();
}

// Render calendar for current month
function renderCalendar() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    // Update month title
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    document.getElementById('currentMonth').textContent = `${monthNames[month]} ${year}`;

    // Get first day of month and number of days
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const grid = document.getElementById('calendarGrid');
    grid.innerHTML = '';

    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

    // Add days from previous month
    for (let i = firstDay - 1; i >= 0; i--) {
        const day = daysInPrevMonth - i;
        const cell = createDayCell(day, year, month - 1, true);
        grid.appendChild(cell);
    }

    // Add days of current month
    for (let day = 1; day <= daysInMonth; day++) {
        const isToday = isCurrentMonth && day === today.getDate();
        const cell = createDayCell(day, year, month, false, isToday);
        grid.appendChild(cell);
    }

    // Add days from next month to fill grid
    const totalCells = grid.children.length;
    const remainingCells = 42 - totalCells; // 6 rows × 7 days
    for (let day = 1; day <= remainingCells; day++) {
        const cell = createDayCell(day, year, month + 1, true);
        grid.appendChild(cell);
    }
}

// Create a day cell
function createDayCell(day, year, month, isOtherMonth, isToday = false) {
    const cell = document.createElement('div');
    cell.className = 'calendar-day';
    if (isOtherMonth) cell.classList.add('other-month');
    if (isToday) cell.classList.add('today');

    const dayNumber = document.createElement('div');
    dayNumber.className = 'calendar-day-number';
    dayNumber.textContent = day;
    cell.appendChild(dayNumber);

    // Get events for this day
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayEvents = getEventsForDate(dateStr);

    if (dayEvents.length > 0) {
        const eventsContainer = document.createElement('div');
        eventsContainer.className = 'calendar-events';

        // Show up to 3 events
        const visibleEvents = dayEvents.slice(0, 3);
        visibleEvents.forEach(event => {
            const eventEl = createEventElement(event);
            eventsContainer.appendChild(eventEl);
        });

        // Show "+X more" if there are more events
        if (dayEvents.length > 3) {
            const moreEl = document.createElement('div');
            moreEl.className = 'calendar-event-more';
            moreEl.textContent = `+${dayEvents.length - 3} more`;
            moreEl.addEventListener('click', (e) => {
                e.stopPropagation();
                showDayEvents(dateStr, dayEvents);
            });
            eventsContainer.appendChild(moreEl);
        }

        cell.appendChild(eventsContainer);
    }

    return cell;
}

// Create event element
function createEventElement(event) {
    const eventEl = document.createElement('div');
    eventEl.className = `calendar-event event-${event.type}`;
    eventEl.textContent = event.title;
    eventEl.title = event.title; // Tooltip
    eventEl.addEventListener('click', (e) => {
        e.stopPropagation();
        showEventDetails(event);
    });
    return eventEl;
}

// Get events for a specific date
function getEventsForDate(dateStr) {
    return filteredEvents.filter(event => event.date === dateStr);
}

// Show all events for a day in modal
function showDayEvents(dateStr, events) {
    const modal = document.getElementById('eventModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');

    const date = new Date(dateStr + 'T00:00:00');
    const dateFormatted = date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    modalTitle.textContent = `Events on ${dateFormatted}`;

    modalBody.innerHTML = events.map(event => `
        <div class="event-detail-row" style="cursor: pointer; padding: var(--space-md); border-radius: var(--radius-md); transition: background var(--transition-fast);" 
             onmouseover="this.style.background='var(--gray-50)'" 
             onmouseout="this.style.background='transparent'"
             onclick="document.getElementById('eventModal').style.display='none'; setTimeout(() => showEventDetails(${JSON.stringify(event).replace(/"/g, '&quot;')}), 100)">
            <div class="event-type-badge event-${event.type}" style="background: ${getEventColor(event.type)}; color: white;">
                ${event.type.charAt(0).toUpperCase() + event.type.slice(1)}
            </div>
            <div style="margin-top: var(--space-sm); font-weight: 600; color: var(--gray-900);">
                ${event.title}
            </div>
            <div style="margin-top: var(--space-xs); font-size: var(--text-sm); color: var(--gray-600);">
                ${event.college}
            </div>
        </div>
    `).join('');

    modal.classList.add('active');
}

// Show event details in modal
function showEventDetails(event) {
    const modal = document.getElementById('eventModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');

    modalTitle.textContent = event.title;

    const date = new Date(event.date + 'T00:00:00');
    const dateFormatted = date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    let detailsHTML = `
        <div class="event-detail-row">
            <div class="event-detail-label">Event Type</div>
            <div class="event-type-badge event-${event.type}" style="background: ${getEventColor(event.type)}; color: white;">
                ${event.type.charAt(0).toUpperCase() + event.type.slice(1)}
            </div>
        </div>
        <div class="event-detail-row">
            <div class="event-detail-label">Date</div>
            <div class="event-detail-value">${dateFormatted}</div>
        </div>
        <div class="event-detail-row">
            <div class="event-detail-label">College</div>
            <div class="event-detail-value">${event.college}</div>
        </div>
    `;

    // Add type-specific details
    if (event.type === 'deadline' && event.details) {
        if (event.details.platform) {
            detailsHTML += `
                <div class="event-detail-row">
                    <div class="event-detail-label">Platform</div>
                    <div class="event-detail-value">${event.details.platform}</div>
                </div>
            `;
        }
        if (event.details.deadlineType) {
            detailsHTML += `
                <div class="event-detail-row">
                    <div class="event-detail-label">Deadline Type</div>
                    <div class="event-detail-value">${event.details.deadlineType}</div>
                </div>
            `;
        }
        if (event.details.status) {
            detailsHTML += `
                <div class="event-detail-row">
                    <div class="event-detail-label">Status</div>
                    <div class="event-detail-value">${event.details.status}</div>
                </div>
            `;
        }
    } else if (event.type === 'task' && event.details) {
        if (event.details.description) {
            detailsHTML += `
                <div class="event-detail-row">
                    <div class="event-detail-label">Description</div>
                    <div class="event-detail-value">${event.details.description}</div>
                </div>
            `;
        }
        if (event.details.category) {
            detailsHTML += `
                <div class="event-detail-row">
                    <div class="event-detail-label">Category</div>
                    <div class="event-detail-value">${event.details.category}</div>
                </div>
            `;
        }
        if (event.details.priority) {
            detailsHTML += `
                <div class="event-detail-row">
                    <div class="event-detail-label">Priority</div>
                    <div class="event-detail-value">${event.details.priority}</div>
                </div>
            `;
        }
        detailsHTML += `
            <div class="event-detail-row">
                <div class="event-detail-label">Status</div>
                <div class="event-detail-value">${event.details.completed ? '✅ Completed' : '⏳ Pending'}</div>
            </div>
        `;
    } else if (event.type === 'essay' && event.details) {
        if (event.details.essayType) {
            detailsHTML += `
                <div class="event-detail-row">
                    <div class="event-detail-label">Essay Type</div>
                    <div class="event-detail-value">${event.details.essayType}</div>
                </div>
            `;
        }
        if (event.details.wordLimit) {
            detailsHTML += `
                <div class="event-detail-row">
                    <div class="event-detail-label">Word Count</div>
                    <div class="event-detail-value">${event.details.wordCount || 0} / ${event.details.wordLimit} words</div>
                </div>
            `;
        }
        detailsHTML += `
            <div class="event-detail-row">
                <div class="event-detail-label">Status</div>
                <div class="event-detail-value">${event.details.completed ? '✅ Completed' : '✍️ In Progress'}</div>
            </div>
        `;
    }

    // Add quick action buttons
    detailsHTML += `
        <div style="margin-top: var(--space-xl); display: flex; gap: var(--space-sm);">
            ${getActionButton(event)}
        </div>
    `;

    modalBody.innerHTML = detailsHTML;
    modal.classList.add('active');
}

// Get action button based on event type
function getActionButton(event) {
    if (event.type === 'deadline') {
        return `<a href="colleges.html" class="btn btn-primary" style="flex: 1;">View College</a>`;
    } else if (event.type === 'essay') {
        return `<a href="essays.html" class="btn btn-primary" style="flex: 1;">Edit Essay</a>`;
    } else if (event.type === 'task') {
        return `<a href="dashboard.html" class="btn btn-primary" style="flex: 1;">View Task</a>`;
    }
    return '';
}

// Get event color
function getEventColor(type) {
    const colors = {
        deadline: '#EF4444',
        essay: '#5B8DEE',
        task: '#8B7BF7'
    };
    return colors[type] || '#7A8699';
}

// Close modal
function closeModal() {
    const modal = document.getElementById('eventModal');
    modal.classList.remove('active');
}

// Show notification
function showNotification(message, type = 'info') {
    // Reuse existing notification system from main.js if available
    console.log(`[${type.toUpperCase()}] ${message}`);
}
async function updateLeeway(e) {
    const leeway = parseInt(e.target.value);
    const user = await getCurrentUser();
    if (!user) return;

    try {
        await upsertProfile({ id: user.id, submission_leeway: leeway });
        if (window.showNotification) {
            window.showNotification(`Target leeway updated to ${leeway} days.`, 'success');
        } else {
            console.log(`Leeway updated to ${leeway}`);
        }

        // Note: In a real app, you might want to adjust existing "submission" tasks here.
        // For now, we update the profile so future AI planning respects it.
    } catch (error) {
        console.error('Error updating leeway:', error);
    }
}
