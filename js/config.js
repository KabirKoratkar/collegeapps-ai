// Environment Configuration
// This file detects whether we're running locally or in production
// and sets the appropriate backend URL

const config = {
    // Detect if we're on localhost or production
    isProduction: !['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(window.location.hostname) && !window.location.hostname.startsWith('192.168.') && !window.location.hostname.startsWith('10.'),

    // Backend API URL
    get apiUrl() {
        if (this.isProduction) {
            // Priority: Check if a custom backend URL is set in localStorage (for quick testing)
            const customUrl = localStorage.getItem('waypoint_api_url');
            if (customUrl) return customUrl;

            // Default production URL - Update this after your first deployment
            return 'https://waypoint-api-production.up.railway.app';
        } else {
            return 'http://localhost:3001';
        }
    },

    // Supabase Config (Public credentials)
    supabaseUrl: 'https://qcwwxiqgylzvvvjoiphq.supabase.co',
    supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFjd3d4aXFneWx6dnZ2am9pcGhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyNzg0MjIsImV4cCI6MjA3OTg1NDQyMn0.v_70i3s8bOR9uwAi7fVZlXf-i6FeCpEN_-psTciF__4'
};

export default config;
