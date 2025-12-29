import { getCurrentUser, upsertProfile, addCollege as supabaseAddCollege } from './supabase-config.js';

let currentStep = 1;
const totalSteps = 3;
let selectedColleges = [];
let currentUser = null;

async function init() {
    currentUser = await getCurrentUser();
    if (!currentUser) {
        window.location.assign('login.html');
        return;
    }
    showStep(1);
}

function showStep(step) {
    // Hide all steps
    for (let i = 1; i <= totalSteps; i++) {
        const stepEl = document.getElementById(`step${i}`);
        const indicatorEl = document.getElementById(`indicator${i}`);
        if (stepEl) stepEl.style.display = 'none';
        if (indicatorEl) indicatorEl.classList.remove('active');
    }

    // Show current step
    const currentStepEl = document.getElementById(`step${step}`);
    const currentIndicatorEl = document.getElementById(`indicator${step}`);
    if (currentStepEl) currentStepEl.style.display = 'block';
    if (currentIndicatorEl) currentIndicatorEl.classList.add('active');

    // Update buttons
    const backBtn = document.getElementById('backBtn');
    const nextBtn = document.getElementById('nextBtn');
    const finishBtn = document.getElementById('finishBtn');

    if (backBtn) backBtn.style.display = step > 1 ? 'block' : 'none';
    if (nextBtn) nextBtn.style.display = step < totalSteps ? 'block' : 'none';
    if (finishBtn) finishBtn.style.display = step === totalSteps ? 'block' : 'none';
}

function nextStep() {
    if (currentStep === 1) {
        const fullName = document.getElementById('fullName').value;
        const gradYear = document.getElementById('gradYear').value;

        if (!fullName) {
            if (window.showNotification) window.showNotification('Please enter your full name', 'error');
            else alert('Please enter your full name');
            return;
        }

        if (!gradYear) {
            if (window.showNotification) window.showNotification('Please select your graduation year', 'error');
            else alert('Please select your graduation year');
            return;
        }
    }

    if (currentStep < totalSteps) {
        currentStep++;
        showStep(currentStep);
    }
}

function prevStep() {
    if (currentStep > 1) {
        currentStep--;
        showStep(currentStep);
    }
}

function addCollegeToList() {
    const input = document.getElementById('collegeInput');
    const collegeName = input.value.trim();

    if (!collegeName) {
        if (window.showNotification) window.showNotification('Please enter a college name', 'error');
        return;
    }

    selectedColleges.push(collegeName);
    renderColleges();

    input.value = '';
    if (window.showNotification) window.showNotification(`Added ${collegeName}`, 'success');
}

function removeCollege(collegeName) {
    selectedColleges = selectedColleges.filter(c => c !== collegeName);
    renderColleges();
    if (window.showNotification) window.showNotification(`Removed ${collegeName}`, 'info');
}

function renderColleges() {
    const collegeList = document.getElementById('collegeList');
    if (!collegeList) return;

    collegeList.innerHTML = '';
    selectedColleges.forEach(college => {
        const tag = document.createElement('div');
        tag.className = 'college-tag';
        tag.innerHTML = `
            ${college}
            <span class="remove-college" data-college="${college}" style="cursor:pointer; margin-left: 8px;">×</span>
        `;
        collegeList.appendChild(tag);
    });

    // Add click listeners to remove buttons
    collegeList.querySelectorAll('.remove-college').forEach(btn => {
        btn.onclick = () => removeCollege(btn.dataset.college);
    });
}

document.addEventListener('DOMContentLoaded', async function () {
    await init();

    const form = document.getElementById('onboardingForm');
    const collegeInput = document.getElementById('collegeInput');

    // Export functions to window for HTML onclick
    window.nextStep = nextStep;
    window.prevStep = prevStep;
    window.addCollege = addCollegeToList; // Rename for the button

    // Allow adding college with Enter key
    if (collegeInput) {
        collegeInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                addCollegeToList();
            }
        });
    }

    // Handle form submission
    if (form) {
        form.addEventListener('submit', async function (e) {
            e.preventDefault();

            const gradYear = document.getElementById('gradYear').value;
            const major = document.getElementById('intendedMajor').value;
            const fullName = document.getElementById('fullName').value;
            const location = document.getElementById('location').value;
            const birthDate = document.getElementById('birthDate').value;

            // Collect deadlines
            const selectedDeadlines = Array.from(document.querySelectorAll('input[name="deadline"]:checked'))
                .map(cb => cb.value);

            if (window.showNotification) window.showNotification('Saving your profile...', 'info');

            try {
                // 1. Create/Update Profile
                // Note: Ensure your database has 'location', 'birth_date', and 'planned_deadlines' columns
                const profileData = {
                    id: currentUser.id,
                    email: currentUser.email,
                    graduation_year: parseInt(gradYear),
                    intended_major: major,
                    full_name: fullName,
                    planned_deadlines: selectedDeadlines
                };

                if (location) profileData.location = location;
                if (birthDate) profileData.birth_date = birthDate;

                await upsertProfile(profileData);

                // 2. Add Colleges
                for (const name of selectedColleges) {
                    await supabaseAddCollege(currentUser.id, name);
                }

                if (window.showNotification) window.showNotification('Setup complete! Welcome to CollegeApps.ai', 'success');

                // Redirect to dashboard
                setTimeout(() => {
                    window.location.assign('dashboard.html');
                }, 1500);
            } catch (error) {
                console.error('Onboarding Error:', error);
                if (window.showNotification) window.showNotification('Something went wrong. Please try again.', 'error');
            }
        });
    }
});
