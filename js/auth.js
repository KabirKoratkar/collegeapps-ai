import { signUp, signIn, signInWithGoogle, resendConfirmationEmail } from './supabase-config.js';

// DEV MODE: Set to true for local testing without Supabase email confirmation
const DEV_MODE = false;

// Create a mock user session for development
function createDevSession(email, fullName) {
    const mockUser = {
        id: 'dev-user-' + Date.now(),
        email: email,
        full_name: fullName,
        created_at: new Date().toISOString()
    };
    localStorage.setItem('dev_user', JSON.stringify(mockUser));
    return mockUser;
}

import Config from './config.js';

// Auth0 Configuration (Enterprise SSO)
const auth0Config = {
    domain: Config.auth0Domain,
    clientId: Config.auth0ClientId,
    audience: `https://${Config.auth0Domain}/userinfo`
};

// Initialize Auth0 WebAuth
let webAuth = null;
if (typeof auth0 !== 'undefined') {
    const currentRedirectUri = window.location.origin + '/callback.html';
    console.log('[AUTH] Initializing Auth0 with Redirect URI:', currentRedirectUri);

    webAuth = new auth0.WebAuth({
        domain: auth0Config.domain,
        clientID: auth0Config.clientId,
        redirectUri: currentRedirectUri,
        responseType: 'token id_token',
        scope: 'openid profile email'
    });
}

document.addEventListener('DOMContentLoaded', function () {
    const signupForm = document.getElementById('signupForm');
    const loginForm = document.getElementById('loginForm');
    const googleBtn = document.querySelector('.google-btn');
    const auth0Btn = document.getElementById('auth0Btn');

    // Auth0 Login
    if (auth0Btn) {
        auth0Btn.addEventListener('click', function () {
            if (webAuth) {
                webAuth.authorize();
            } else {
                showNotification('Auth0 SDK not loaded', 'error');
            }
        });
    }

    // Google Sign In
    if (googleBtn) {
        googleBtn.addEventListener('click', async function () {
            console.log('Google Sign-In clicked');
            showNotification('Connecting to Google...', 'info');

            try {
                // If on signup page, redirect to onboarding after Google auth
                const nextPath = window.location.pathname.includes('signup.html')
                    ? 'onboarding.html'
                    : 'dashboard.html';

                const result = await signInWithGoogle(nextPath);
                console.log('OAuth Start Result:', result);
            } catch (err) {
                console.error('OAuth Error:', err);
                showNotification('Connection error: ' + err.message, 'error');
            }
        });
    }

    // Signup Form
    if (signupForm) {
        signupForm.addEventListener('submit', async function (e) {
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

            showLoading('Creating your account...');

            if (DEV_MODE) {
                // Dev mode: create mock session
                console.log('[DEV MODE] Creating mock account for:', email);
                createDevSession(email, fullName);
                showNotification('Account created! (Dev Mode)', 'success');
                setTimeout(() => {
                    window.location.assign('onboarding.html');
                }, 1000);
            } else {
                // Production: use Supabase
                console.log('Creating account for:', email);
                try {
                    const result = await signUp(email, password, fullName);
                    if (result) {
                        showNotification('Account created successfully!', 'success');
                        setTimeout(() => {
                            window.location.assign(`confirm-email.html?email=${encodeURIComponent(email)}`);
                        }, 1500);
                    }
                } catch (err) {
                    console.error('Signup Failure:', err);
                    showNotification(err.message, 'error');
                    hideLoading();
                }
            }
        });
    }

    // Login Form
    if (loginForm) {
        loginForm.addEventListener('submit', async function (e) {
            e.preventDefault();

            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            if (!email || !password) {
                showNotification('Please fill in all fields', 'error');
                return;
            }

            showLoading('Logging you in...');

            // Check if DEV_MODE is active via localStorage
            const isDevModeActive = localStorage.getItem('dev_mode_active') === 'true';

            if (isDevModeActive) {
                // Dev mode: create mock session
                console.log('[DEV MODE] Logging in:', email);
                createDevSession(email, 'Dev User');
                showNotification('Login successful! (Mock Mode)', 'success');
                setTimeout(() => {
                    window.location.assign('dashboard.html');
                }, 1000);
            } else {
                // Production: use Supabase
                console.log('Logging in:', email);
                try {
                    const result = await signIn(email, password);
                    if (result) {
                        showNotification('Login successful!', 'success');
                        setTimeout(() => {
                            window.location.assign('dashboard.html');
                        }, 1500);
                    }
                } catch (err) {
                    console.error('Login Failure:', err);

                    // Handle "Email not confirmed" specifically
                    if (err.message.includes('Email not confirmed')) {
                        showNotification('Email not confirmed. Please check your inbox and verify your account before logging in.', 'warning');
                    } else {
                        showNotification('Login failed: ' + err.message, 'error');
                    }
                    hideLoading();
                }
            }
        });
    }

    // Dev Mode Toggle Listener (Secure check for launch)
    const toggleDevMode = document.getElementById('toggleDevMode');
    const devModeLink = document.getElementById('devModeLink');
    const urlParams = new URLSearchParams(window.location.search);
    const isDebugMode = urlParams.get('debug') === 'true';

    if (toggleDevMode && devModeLink) {
        // Only show the dev mode container if ?debug=true is in the URL
        if (isDebugMode) {
            devModeLink.style.display = 'block';
        } else {
            devModeLink.style.display = 'none';
        }

        toggleDevMode.addEventListener('click', function (e) {
            e.preventDefault();
            const isActive = localStorage.getItem('dev_mode_active') === 'true';
            localStorage.setItem('dev_mode_active', !isActive);

            if (!isActive) {
                showNotification('Mock Mode enabled! You can now log in with any credentials.', 'success');
                this.textContent = 'Disable Dev Mode';
                this.style.color = 'var(--success)';
            } else {
                showNotification('Mock Mode disabled. Real authentication required.', 'info');
                this.textContent = 'Use Dev Mode (Bypass)';
                this.style.color = 'var(--primary-blue)';
            }
        });

        // Initialize display
        if (localStorage.getItem('dev_mode_active') === 'true') {
            toggleDevMode.textContent = 'Disable Dev Mode';
            toggleDevMode.style.color = 'var(--success)';
        }
    }
});
