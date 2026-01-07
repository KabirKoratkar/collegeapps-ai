// Environment Configuration
// This file detects whether we're running locally or in production
// and sets the appropriate backend URL

const config = {
    // Detect if we're on a production domain
    get isProduction() {
        const prodDomains = [
            'waypoint-app.vercel.app',
            'waypointedu.org',
            'www.waypointedu.org',
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
            return 'https://waypoint-api-production.up.railway.app';
        }

        // Priority 3: Localhost (Default for development/file protocol)
        return 'http://localhost:3001';
    },

    // Supabase Config (Public credentials)
    supabaseUrl: 'https://qcwwxiqgylzvvvjoiphq.supabase.co',
    supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFjd3d4aXFneWx6dnZ2am9pcGhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyNzg0MjIsImV4cCI6MjA3OTg1NDQyMn0.v_70i3s8bOR9uwAi7fVZlXf-i6FeCpEN_-psTciF__4'
};

export default config;
