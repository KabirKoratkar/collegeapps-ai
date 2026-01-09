/**
 * UI Utilities
 * Handles global UI updates like the navbar user badge.
 */

import { signOut } from './supabase-config.js';

export function updateNavbarUser(user, profile = null) {
    const userBadge = document.getElementById('user-badge');
    if (!userBadge || !user) return;

    // Get name from profile metadata or use email
    const name = user.user_metadata?.full_name || profile?.full_name || user.email.split('@')[0];

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

    // Add a logout listener to the parent item if we want
    const userNavItem = document.getElementById('user-nav-item');
    if (userNavItem) {
        userNavItem.style.cursor = 'pointer';
        userNavItem.title = 'Click to Sign Out';
        userNavItem.addEventListener('click', async () => {
            if (confirm('Are you sure you want to sign out?')) {
                await signOut();
                window.location.href = new URL('index.html', window.location.href).href;
            }
        });
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
