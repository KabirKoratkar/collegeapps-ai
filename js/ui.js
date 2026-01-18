/**
 * UI Utilities
 * Handles global UI updates like the navbar user badge.
 */

import { signOut } from './supabase-config.js';

export function updateNavbarUser(user, profile = null) {
    const userBadge = document.getElementById('user-badge');
    if (!userBadge || !user) return;

    // Get name from profile metadata or use email
    const name = user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        profile?.full_name ||
        (user.email ? user.email.split('@')[0] : 'Student');

    // Check for premium/beta status
    let statusBadge = '';
    if (profile) {
        if (profile.is_beta) {
            statusBadge = ' <span class="badge badge-beta" style="background: var(--accent-purple); color: white; font-size: 10px; padding: 2px 6px; border-radius: 10px; margin-left: 5px;">BETA</span>';
        } else if (profile.is_premium) {
            statusBadge = ' <span class="badge badge-premium" style="background: var(--warning); color: var(--gray-800); font-size: 10px; padding: 2px 6px; border-radius: 10px; margin-left: 5px;">PRO</span>';
        }
    }

    userBadge.innerHTML = name + statusBadge;

    // Convert userNavItem into a dropdown container
    const userNavItem = document.getElementById('user-nav-item');
    if (userNavItem) {
        userNavItem.className = 'user-menu-container';
        userNavItem.style.cursor = 'pointer';
        userNavItem.title = 'Control Center';

        // Create Dropdown HTML
        const dropdown = document.createElement('div');
        dropdown.className = 'user-dropdown';
        dropdown.id = 'userDropdown';
        dropdown.innerHTML = `
            <div class="user-dropdown-header">
                <span class="user-name">${name}</span>
                <span class="user-email">${user.email}</span>
            </div>
            <div class="user-dropdown-divider"></div>
            <a href="settings.html" class="user-dropdown-item">
                <span>⚙️</span> Account Settings
            </a>
            <a href="dashboard.html" class="user-dropdown-item">
                <span>📊</span> My Dashboard
            </a>
            <a href="documents.html" class="user-dropdown-item">
                <span>📂</span> Document Vault
            </a>
            <div class="user-dropdown-divider"></div>
            <div class="user-dropdown-item" id="logoutBtn">
                <span>🚪</span> Sign Out
            </div>
        `;

        // Remove existing listeners by replacing the element or clearing innerHTML
        // but easier to just check if dropdown already exists
        if (!document.getElementById('userDropdown')) {
            userNavItem.appendChild(dropdown);

            userNavItem.addEventListener('click', (e) => {
                e.stopPropagation();
                dropdown.classList.toggle('active');
            });

            document.addEventListener('click', () => {
                dropdown.classList.remove('active');
            });

            const logoutBtn = dropdown.querySelector('#logoutBtn');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', async () => {
                    await signOut();
                    window.location.assign('index.html');
                });
            }
        }
    }
}

export function showLoading(message = 'Loading...') {
    if (window.showLoading) {
        window.showLoading(message);
    } else {
        console.warn('showLoading not found on window. Ensure main.js is loaded.');
    }
}

export function hideLoading() {
    if (window.hideLoading) {
        window.hideLoading();
    } else {
        console.warn('hideLoading not found on window. Ensure main.js is loaded.');
    }
}
