// Environment Configuration
// This file detects whether we're running locally or in production
// and sets the appropriate backend URL

const config = {
    // Detect if we're on localhost or production
    isProduction: window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1',

    // Backend API URL - will be updated after Railway deployment
    get apiUrl() {
        if (this.isProduction) {
            // TODO: Replace this with your Railway backend URL after deployment
            return 'https://your-railway-app.railway.app';
        } else {
            return 'http://localhost:3001';
        }
    }
};

export default config;
