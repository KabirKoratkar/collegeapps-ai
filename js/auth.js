// Authentication JavaScript

document.addEventListener('DOMContentLoaded', function () {
    const signupForm = document.getElementById('signupForm');
    const loginForm = document.getElementById('loginForm');
    const googleBtn = document.querySelector('.google-btn');

    // Google Sign In
    if (googleBtn) {
        googleBtn.addEventListener('click', function () {
            showNotification('Google sign-in coming soon!', 'info');
            // In production, integrate with Google OAuth
        });
    }

    // Signup Form
    if (signupForm) {
        signupForm.addEventListener('submit', function (e) {
            e.preventDefault();

            const fullName = document.getElementById('fullName').value;
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            // Basic validation
            if (!fullName || !email || !password) {
                showNotification('Please fill in all fields', 'error');
                return;
            }

            if (password.length < 8) {
                showNotification('Password must be at least 8 characters', 'error');
                return;
            }

            // Simulate account creation
            console.log('Creating account for:', email);
            showNotification('Account created successfully!', 'success');

            // Redirect to onboarding
            setTimeout(() => {
                window.location.href = 'onboarding.html';
            }, 1500);
        });
    }

    // Login Form
    if (loginForm) {
        loginForm.addEventListener('submit', function (e) {
            e.preventDefault();

            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            if (!email || !password) {
                showNotification('Please fill in all fields', 'error');
                return;
            }

            // Simulate login
            console.log('Logging in:', email);
            showNotification('Login successful!', 'success');

            // Redirect to dashboard
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 1500);
        });
    }
});
