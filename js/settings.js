import { getCurrentUser, getUserProfile, upsertProfile, supabase } from './supabase-config.js';
import { updateNavbarUser } from './ui.js';
import config from './config.js';

let currentUser = null;

document.addEventListener('DOMContentLoaded', async function () {
    currentUser = await getCurrentUser();
    if (!currentUser) {
        window.location.assign('login.html');
        return;
    }

    const profile = await getUserProfile(currentUser.id);
    updateNavbarUser(currentUser, profile);
    await loadSettings(profile);
    setupEventListeners();
    checkPaymentStatus();
});

async function loadSettings(profile = null) {
    if (!profile) profile = await getUserProfile(currentUser.id);
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

    // Membership Status
    const membershipTier = document.getElementById('membershipTier');
    const membershipDesc = document.getElementById('membershipDescription');
    const membershipIcon = document.getElementById('membershipIcon');
    const upgradeBtn = document.getElementById('upgradeBtn');

    if (profile.is_beta) {
        membershipTier.textContent = 'Beta Tester (VIP)';
        membershipDesc.textContent = 'Early access enabled. All premium features are free.';
        membershipIcon.textContent = '🚀';
        membershipIcon.style.background = 'var(--accent-purple)';
        membershipIcon.style.color = 'white';
        upgradeBtn.style.display = 'none';
        document.getElementById('subscriptionStatus').style.border = '1px solid var(--accent-purple)';
    } else if (profile.is_premium) {
        membershipTier.textContent = 'Pro Member';
        membershipDesc.textContent = 'Next-gen tools unlocked. Good luck with apps!';
        membershipIcon.textContent = '💎';
        membershipIcon.style.background = 'var(--warning)';
        upgradeBtn.textContent = 'Manage Plan';
    } else {
        membershipTier.textContent = 'Free Account';
        membershipDesc.textContent = 'Limited access to AI features';
        membershipIcon.textContent = '👤';
    }

    // Toggle Pro Hero Banner
    const proHero = document.getElementById('proHero');
    if (proHero) {
        proHero.style.display = (profile.is_premium || profile.is_beta) ? 'none' : 'block';
    }
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

    // Upgrade to Pro
    const upgradeBtn = document.getElementById('upgradeBtn');
    if (upgradeBtn) {
        upgradeBtn.addEventListener('click', handleUpgrade);
    }

    const mainUpgradeBtn = document.getElementById('mainUpgradeBtn');
    if (mainUpgradeBtn) {
        mainUpgradeBtn.addEventListener('click', handleUpgrade);
    }

    // Theme Watcher (Sync with other tabs)
    window.addEventListener('storage', (e) => {
        if (e.key === 'theme') {
            const toggle = document.getElementById('darkModeToggle');
            if (toggle) toggle.checked = (e.newValue === 'dark');
        }
    });
}

async function handleUpgrade() {
    const upgradeBtn = document.getElementById('upgradeBtn');
    const originalText = upgradeBtn.textContent;

    // Fetch latest profile to be sure
    const profile = await getUserProfile(currentUser.id);
    const isPremium = profile?.is_premium;

    try {
        upgradeBtn.disabled = true;
        upgradeBtn.innerHTML = `<span class="loading-spinner"></span> ${isPremium ? 'Opening portal...' : 'Securely connecting...'}`;

        const endpoint = isPremium ? 'create-portal-session' : 'create-checkout-session';

        const response = await fetch(`${config.apiUrl}/api/payments/${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId: currentUser.id,
                email: currentUser.email
            })
        });

        const data = await response.json();

        if (data.url) {
            window.location.href = data.url;
        } else {
            throw new Error(data.error || 'Failed to connect to billing provider');
        }
    } catch (error) {
        console.error('Upgrade/Portal error:', error);
        showNotification('Billing error: ' + error.message, 'error');
        upgradeBtn.disabled = false;
        upgradeBtn.textContent = originalText;
    }
}

async function checkPaymentStatus() {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('payment');

    if (paymentStatus === 'success') {
        showNotification('🎉 Welcome to Waypoint Pro! Your account has been upgraded.', 'success');

        // Wait a bit for the webhook to potentially finish and then refresh data
        setTimeout(async () => {
            const profile = await getUserProfile(currentUser.id);
            await loadSettings(profile);
            updateNavbarUser(currentUser, profile);
        }, 1500);

        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
    } else if (paymentStatus === 'cancel') {
        showNotification('Payment cancelled. Let us know if you had any trouble!', 'info');
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}



function showNotification(message, type = 'info') {
    if (window.showNotification) {
        window.showNotification(message, type);
    } else {
        alert(message);
    }
}
