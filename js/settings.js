import { getCurrentUser, getUserProfile, upsertProfile, supabase } from './supabase-config.js';
import { updateNavbarUser } from './ui.js';

let currentUser = null;

document.addEventListener('DOMContentLoaded', async function () {
    currentUser = await getCurrentUser();
    if (!currentUser) {
        window.location.assign('login.html');
        return;
    }

    updateNavbarUser(currentUser);
    await loadSettings();
    setupEventListeners();
});

async function loadSettings() {
    const profile = await getUserProfile(currentUser.id);
    if (!profile) return;

    // Planner Settings
    if (profile.submission_leeway !== undefined) {
        document.getElementById('subLeeway').value = profile.submission_leeway;
    }
    if (profile.intensity_level) {
        document.getElementById('writingIntensity').value = profile.intensity_level;
    }
    if (profile.work_weekends !== undefined) {
        document.getElementById('workWeekends').checked = profile.work_weekends;
    }

    // Theme Setting
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    document.getElementById('darkModeToggle').checked = (currentTheme === 'dark');

    // Profile Settings
    document.getElementById('profName').value = profile.full_name || '';
    document.getElementById('profMajor').value = profile.intended_major || '';
}

function setupEventListeners() {
    // Tab Switching
    const tabs = document.querySelectorAll('.settings-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.tab;

            // Update buttons
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Update content
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            document.getElementById(`${target}Tab`).classList.add('active');
        });
    });

    // Save Profile
    document.getElementById('saveProfile').addEventListener('click', async () => {
        const name = document.getElementById('profName').value;
        const major = document.getElementById('profMajor').value;

        try {
            await upsertProfile({
                id: currentUser.id,
                email: currentUser.email,
                full_name: name,
                intended_major: major
            });
            showNotification('Profile updated successfully!', 'success');
        } catch (e) {
            showNotification('Error saving profile: ' + e.message, 'error');
        }
    });

    // Save & Re-sync Strategy
    document.getElementById('saveAndSync').addEventListener('click', async () => {
        const subLeeway = parseInt(document.getElementById('subLeeway').value);
        const intensity = document.getElementById('writingIntensity').value;
        const workWeekends = document.getElementById('workWeekends').checked;

        const syncBtn = document.getElementById('saveAndSync');
        const originalText = syncBtn.innerHTML;

        try {
            syncBtn.disabled = true;
            syncBtn.innerHTML = '<span class="loading-spinner"></span> Syncing...';

            // 1. Save preferences
            await upsertProfile({
                id: currentUser.id,
                email: currentUser.email,
                submission_leeway: subLeeway,
                intensity_level: intensity,
                work_weekends: workWeekends
            });

            // 2. Here we would ideally call an AI endpoint to re-adjust dates
            // For MVP, we'll notify them that future AI planning will follow these rules
            showNotification('Planner preferences saved! Your application strategy is updated.', 'success');

            setTimeout(() => {
                window.location.href = 'calendar.html';
            }, 1000);

        } catch (e) {
            showNotification('Error syncing strategy: ' + e.message, 'error');
        } finally {
            syncBtn.disabled = false;
            syncBtn.innerHTML = originalText;
        }
    });

    // Theme Toggle
    document.getElementById('darkModeToggle').addEventListener('change', (e) => {
        const newTheme = e.target.checked ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    });

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', async () => {
        await supabase.auth.signOut();
        localStorage.removeItem('dev_user');
        window.location.assign('index.html');
    });
}

function showNotification(message, type = 'info') {
    if (window.showNotification) {
        window.showNotification(message, type);
    } else {
        alert(message);
    }
}
