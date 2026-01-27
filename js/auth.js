import { signUp, signIn, signInWithGoogle, resendConfirmationEmail } from './supabase-config.js';
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
    const googleBtn = document.getElementById('googleBtn');
    const auth0Btn = document.getElementById('auth0Btn');
    const devModeToggle = document.getElementById('toggleDevMode');

    // Dev Mode Bypass
    if (devModeToggle) {
        devModeToggle.addEventListener('click', (e) => {
            e.preventDefault();
            const mockUser = {
                id: 'dev-user-enterprise',
                email: 'demo@waypoint.com',
                user_metadata: { full_name: 'Demo Student' },
                aud: 'authenticated',
                role: 'authenticated'
            };
            localStorage.setItem('dev_user', JSON.stringify(mockUser));

            // Set theme to dark for effect
            localStorage.setItem('theme', 'dark');

            showNotification('Dev Mode Activated! Redirecting...', 'success');
            setTimeout(() => {
                window.location.assign('dashboard.html');
            }, 800);
        });
    }

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
            try {
                const nextPath = window.location.pathname.includes('signup.html')
                    ? 'onboarding.html'
                    : 'dashboard.html';

                await signInWithGoogle(nextPath);
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

            try {
                const result = await signUp(email, password, fullName);
                if (result) {
                    window.location.assign(`confirm-email.html?email=${encodeURIComponent(email)}`);
                }
            } catch (err) {
                showNotification(err.message, 'error');
            }
        });
    }

    // Login Form
    if (loginForm) {
        loginForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            try {
                const result = await signIn(email, password);
                if (result) {
                    window.location.assign('dashboard.html');
                }
            } catch (err) {
                showNotification(err.message, 'error');
            }
        });
    }
});

function showNotification(msg, type) {
    if (window.showNotification) {
        window.showNotification(msg, type);
    } else {
        alert(msg);
    }
}
