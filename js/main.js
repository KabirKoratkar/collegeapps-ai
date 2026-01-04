// Main JavaScript - Navigation and Global Functionality

// Mobile Menu Toggle
document.addEventListener('DOMContentLoaded', function () {
    const mobileToggle = document.getElementById('mobileToggle');
    const navLinks = document.querySelector('.navbar-links');

    if (mobileToggle) {
        mobileToggle.addEventListener('click', function () {
            navLinks.classList.toggle('active');
        });
    }

    // Smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            if (href !== '#' && href !== '') {
                e.preventDefault();
                const target = document.querySelector(href);
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            }
        });
    });

    // Theme Watcher (Sync with Settings changes)
    window.addEventListener('storage', (e) => {
        if (e.key === 'theme') {
            document.documentElement.setAttribute('data-theme', e.newValue);
        }
    });

    // Add active class to current page in navigation
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.navbar-link').forEach(link => {
        const href = link.getAttribute('href');
        if (href === currentPage || (currentPage === 'index.html' && href === '')) {
            link.classList.add('active');
        }
    });

    // Check if user is logged in for landing page CTA update
    if (currentPage === 'index.html' || currentPage === '') {
        const navLinks = document.getElementById('navLinks');
        const devUser = localStorage.getItem('dev_user');

        // We can't use await here easily without making the whole thing async, 
        // so we check localStorage or just let the page-specific scripts handle it.
        // For index.html, we'll do a quick check.
        if (devUser) {
            updateLandingNav();
        }
    }
});

async function updateLandingNav() {
    const navLinks = document.getElementById('navLinks');
    if (!navLinks) return;

    // We'll import dynamically to avoid polluting non-module script
    try {
        const { getCurrentUser } = await import('./supabase-config.js');
        const user = await getCurrentUser();
        if (user) {
            navLinks.innerHTML = `
                <li><a href="#features" class="navbar-link">Features</a></li>
                <li><a href="dashboard.html" class="navbar-link">Dashboard</a></li>
                <li><a href="ai-counselor.html" class="navbar-link">AI Counselor</a></li>
                <li><a href="dashboard.html" class="btn btn-primary btn-sm">Go to Dashboard</a></li>
            `;
        }
    } catch (e) {
        console.log('Not in module context or Supabase not ready');
    }
}

// Utility Functions
function showNotification(message, type = 'info') {
    // Premium notification system
    const notification = document.createElement('div');
    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️';
    const bg = type === 'success' ? 'var(--success)' : type === 'error' ? 'var(--error)' : type === 'warning' ? 'var(--warning)' : 'var(--primary-blue)';

    notification.style.cssText = `
        position: fixed;
        bottom: 30px;
        right: 30px;
        background: white;
        color: var(--gray-800);
        padding: 1rem 1.5rem;
        border-radius: var(--radius-xl);
        box-shadow: var(--shadow-2xl);
        z-index: 2000;
        display: flex;
        align-items: center;
        gap: var(--space-md);
        border-left: 5px solid ${bg};
        min-width: 300px;
        transform: translateX(400px);
        transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    `;

    notification.innerHTML = `
        <span style="font-size: 1.25rem;">${icon}</span>
        <div style="flex: 1;">
            <div style="font-weight: 700; font-size: var(--text-sm);">${type.charAt(0) + type.slice(1)}</div>
            <div style="font-size: var(--text-xs); color: var(--gray-500);">${message}</div>
        </div>
    `;

    document.body.appendChild(notification);

    // Trigger slide in
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 10);

    setTimeout(() => {
        notification.style.transform = 'translateX(400px)';
        setTimeout(() => notification.remove(), 400);
    }, 4000);
}

// Add animation styles
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);
// Loading Overlay Helpers
function showLoading(message = 'Loading...') {
    let overlay = document.getElementById('globalLoading');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'globalLoading';
        overlay.className = 'loading-overlay';
        overlay.innerHTML = `
            <div class="loading-logo">CollegeApps.ai</div>
            <div class="loading-bars">
                <div class="loading-bar"></div>
                <div class="loading-bar"></div>
                <div class="loading-bar"></div>
                <div class="loading-bar"></div>
            </div>
            <div style="color: var(--gray-600); font-weight: 500; font-size: var(--text-sm);">${message}</div>
        `;
        document.body.appendChild(overlay);
    } else {
        overlay.querySelector('div:last-child').textContent = message;
    }

    overlay.style.display = 'flex';
    // Small delay to trigger transition
    setTimeout(() => overlay.classList.add('active'), 10);
}

function hideLoading() {
    const overlay = document.getElementById('globalLoading');
    if (overlay) {
        overlay.classList.remove('active');
        setTimeout(() => {
            overlay.style.display = 'none';
        }, 400);
    }
}

// Export to window
window.showLoading = showLoading;
window.hideLoading = hideLoading;
window.showNotification = showNotification;

// Initialize AI Chat Widget for logged-in users (not on landing or counselor page)
document.addEventListener('DOMContentLoaded', async () => {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const excludedPages = ['index.html', 'login.html', 'signup.html', 'confirm-email.html', 'ai-counselor.html', 'onboarding.html'];

    if (!excludedPages.includes(currentPage)) {
        try {
            // We use dynamic import for the module
            const { getCurrentUser } = await import('./supabase-config.js');
            const user = await getCurrentUser();

            if (user) {
                const widgetScript = document.createElement('script');
                widgetScript.type = 'module';
                widgetScript.src = 'js/chat-widget.js';
                document.body.appendChild(widgetScript);
            }
        } catch (e) {
            console.error('Failed to load chat widget:', e);
        }
    }
});
