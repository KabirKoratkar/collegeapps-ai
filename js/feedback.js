/**
 * Feedback & Ticket System for Waypoint
 * Handles user recommendations, bug reports, and beta feedback.
 */

import { getCurrentUser } from './supabase-config.js';
import config from './config.js';

class FeedbackSystem {
    constructor() {
        this.userId = null;
        this.userEmail = null;
        this.selectedType = 'Recommendation';
        this.apiUrl = config.apiUrl;
        this.init();
    }

    async init() {
        // Get user info
        try {
            const user = await getCurrentUser();
            if (user) {
                this.userId = user.id;
                this.userEmail = user.email;
            }
        } catch (e) {
            console.log('Feedback loaded in unauthenticated context');
        }

        this.injectStyles();
        this.injectHTML();
        this.bindEvents();
    }

    injectStyles() {
        if (!document.querySelector('link[href*="feedback.css"]')) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'css/feedback.css';
            document.head.appendChild(link);
        }
    }

    injectHTML() {
        // Floating Button
        const widget = document.createElement('div');
        widget.className = 'feedback-widget';
        widget.innerHTML = `
            <button class="feedback-btn" id="openFeedbackBtn" title="Send Feedback">
                <span>💭</span>
            </button>
        `;
        document.body.appendChild(widget);

        // Modal
        const modal = document.createElement('div');
        modal.className = 'modal feedback-modal';
        modal.id = 'feedbackModal';
        modal.innerHTML = `
            <div class="modal-overlay" id="feedbackOverlay"></div>
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Share your thoughts 🚀</h3>
                    <button class="modal-close" id="closeFeedbackBtn">&times;</button>
                </div>
                <div class="modal-body">
                    <div id="feedbackFormStep">
                        <p class="mb-xl" style="color: var(--gray-600);">We're in beta! Tell us how we can make Waypoint better for you.</p>
                        
                        <div class="feedback-type-grid">
                            <div class="feedback-type-option active" data-type="Recommendation">
                                <span class="feedback-type-icon">💡</span>
                                <span class="feedback-type-label">Recommendation</span>
                            </div>
                            <div class="feedback-type-option" data-type="Bug">
                                <span class="feedback-type-icon">🐛</span>
                                <span class="feedback-type-label">Bug Report</span>
                            </div>
                            <div class="feedback-type-option" data-type="Question">
                                <span class="feedback-type-icon">❓</span>
                                <span class="feedback-type-label">Question</span>
                            </div>
                            <div class="feedback-type-option" data-type="Other">
                                <span class="feedback-type-icon">✨</span>
                                <span class="feedback-type-label">Other</span>
                            </div>
                        </div>

                        <div class="input-group">
                            <label class="input-label">Subject</label>
                            <input type="text" id="feedbackSubject" class="input" placeholder="What's this about?">
                        </div>

                        <div class="input-group">
                            <label class="input-label">Your Message</label>
                            <textarea id="feedbackMessage" class="input textarea" placeholder="Describe your recommendation or issue in detail..."></textarea>
                        </div>

                        <div style="display: flex; justify-content: flex-end; gap: var(--space-md); margin-top: var(--space-xl);">
                            <button class="btn btn-ghost" id="cancelFeedbackBtn">Cancel</button>
                            <button class="btn btn-primary" id="submitFeedbackBtn">Submit Report</button>
                        </div>
                    </div>

                    <div id="feedbackSuccessStep" style="display: none;">
                        <div class="feedback-success-state">
                            <span class="success-icon-anim">📩</span>
                            <h2 style="font-size: var(--text-2xl); font-weight: 800; margin-bottom: var(--space-md);">Sent to Kabir!</h2>
                            <p style="color: var(--gray-600); line-height: 1.6;">Thank you for your feedback. We'll look into this immediately to make Waypoint even better.</p>
                            <button class="btn btn-primary mt-2xl" style="width: 100%;" id="finishFeedbackBtn">Got it</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    bindEvents() {
        const modal = document.getElementById('feedbackModal');
        const openBtn = document.getElementById('openFeedbackBtn');
        const closeBtn = document.getElementById('closeFeedbackBtn');
        const overlay = document.getElementById('feedbackOverlay');
        const cancelBtn = document.getElementById('cancelFeedbackBtn');
        const submitBtn = document.getElementById('submitFeedbackBtn');
        const finishBtn = document.getElementById('finishFeedbackBtn');

        const typeOptions = document.querySelectorAll('.feedback-type-option');

        // Toggle Modal
        const toggleModal = (show) => {
            if (show) {
                modal.classList.add('active');
                document.getElementById('feedbackFormStep').style.display = 'block';
                document.getElementById('feedbackSuccessStep').style.display = 'none';
                document.getElementById('feedbackMessage').value = '';
                document.getElementById('feedbackSubject').value = '';
            } else {
                modal.classList.remove('active');
            }
        };

        openBtn.addEventListener('click', () => toggleModal(true));
        closeBtn.addEventListener('click', () => toggleModal(false));
        overlay.addEventListener('click', () => toggleModal(false));
        cancelBtn.addEventListener('click', () => toggleModal(false));
        finishBtn.addEventListener('click', () => toggleModal(false));

        // Type Selection
        typeOptions.forEach(opt => {
            opt.addEventListener('click', () => {
                typeOptions.forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                this.selectedType = opt.dataset.type;
            });
        });

        // Submit Logic
        submitBtn.addEventListener('click', async () => {
            const subject = document.getElementById('feedbackSubject').value.trim();
            const message = document.getElementById('feedbackMessage').value.trim();

            if (!message) {
                window.showNotification('Please enter a message', 'error');
                return;
            }

            submitBtn.disabled = true;
            submitBtn.innerHTML = '<div class="loading-spinner-small"></div> Sending...';

            try {
                // Use the backend API
                const response = await fetch(`${this.apiUrl}/api/feedback`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userId: this.userId,
                        email: this.userEmail || 'anonymous@waypoint.app',
                        subject: subject,
                        message: message,
                        type: this.selectedType
                    })
                });

                const result = await response.json();

                if (result.success) {
                    document.getElementById('feedbackFormStep').style.display = 'none';
                    document.getElementById('feedbackSuccessStep').style.display = 'block';
                } else {
                    throw new Error(result.error || 'Failed to submit');
                }
            } catch (err) {
                console.error('Feedback submission error:', err);
                window.showNotification('Could not connect to service. Try again later.', 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerText = 'Submit Report';
            }
        });
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new FeedbackSystem();
});
