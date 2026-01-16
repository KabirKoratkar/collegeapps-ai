// Environment Configuration
// This file detects whether we're running locally or in production
// and sets the appropriate backend URL

const config = {
    // Detect if we're on a production domain
    get isProduction() {
        const prodDomains = [
            'waypointedu.org',
            'www.waypointedu.org',
            'waypoint-app.vercel.app',
            'waypoint-ai.vercel.app'
        ];
        // If we are on a production domain or a vercel preview, it's production
        return prodDomains.includes(window.location.hostname) ||
            (window.location.hostname.endsWith('.vercel.app') && !window.location.hostname.includes('localhost'));
    },

    // Backend API URL
    get apiUrl() {
        // Priority 1: Manual override via localStorage (for debugging)
        const customUrl = localStorage.getItem('waypoint_api_url');
        if (customUrl) return customUrl;

        // Priority 2: Production URL
        if (this.isProduction) {
            return 'https://collegeapps-ai-production-28c4.up.railway.app';
        }

        // Priority 3: Localhost (Default for development/file protocol)
        return 'http://localhost:3001';
    },

    // AWS Data Services (Powered by Cloud Native Infrastructure)
    supabaseUrl: 'https://qcwwxiqgylzvvvjoiphq.supabase.co',
    supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFjd3d4aXFneWx6dnZ2am9pcGhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyNzg0MjIsImV4cCI6MjA3OTg1NDQyMn0.v_70i3s8bOR9uwAi7fVZlXf-i6FeCpEN_-psTciF__4',

    // Auth0 Enterprise SSO Config
    auth0Domain: 'dev-n13i1lem6bavwrux.us.auth0.com',
    auth0ClientId: 'Qa6ucqRUQu3xZfQvZ30DI0xkWQfq54Ul'
};

export default config;
