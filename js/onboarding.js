import { getCurrentUser, upsertProfile, addCollege as supabaseAddCollege, getUserProfile } from './supabase-config.js';
import config from './config.js';

let currentStep = 1;
const totalSteps = 4;
let selectedColleges = [];
let currentUser = null;

async function init() {
    showLoading('Securing your session...');

    // 1. Wait a moment for Supabase to process hash from URL (email confirmation links)
    if (window.location.hash || window.location.search.includes('access_token')) {
        console.log('Detected auth token in URL, waiting for session...');
        // Small delay to allow Supabase client to catch the hash
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    currentUser = await getCurrentUser();

    if (!currentUser) {
        window.location.assign('login.html');
        return;
    }

    // Strict Email Confirmation Check (unless mock user)
    const isMockUser = currentUser.id && currentUser.id.startsWith('dev-user-');
    if (!isMockUser && !currentUser.email_confirmed_at) {
        window.location.assign(`confirm-email.html?email=${encodeURIComponent(currentUser.email)}`);
        return;
    }

    // 2. Check if already onboarded (Profile complete)
    try {
        const profile = await getUserProfile(currentUser.id);
        if (profile && profile.graduation_year) {
            console.log('Profile already complete, skipping onboarding...');
            window.location.assign('dashboard.html');
            return;
        }
    } catch (err) {
        console.log('No profile yet or error fetching, proceeding to onboarding steps');
    }

    hideLoading();
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

        // If we just moved to step 4, trigger plan generation
        if (currentStep === 4) {
            generateAIPlan();
        }
    }
}

async function generateAIPlan() {
    const planLoading = document.getElementById('planLoading');
    const planDisplay = document.getElementById('planDisplay');
    const planSummary = document.getElementById('planSummary');
    const tasksContainer = document.getElementById('tasksContainer');

    if (!planLoading || !planDisplay) return;

    try {
        const gradYear = document.getElementById('gradYear').value;
        const major = document.getElementById('intendedMajor').value;
        const fullName = document.getElementById('fullName').value;

        const response = await fetch(`${config.apiUrl}/api/onboarding/plan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: currentUser.id,
                colleges: selectedColleges,
                profile: {
                    graduation_year: gradYear,
                    intended_major: major,
                    full_name: fullName
                }
            })
        });

        if (!response.ok) throw new Error('Failed to generate plan');

        const data = await response.json();
        const plan = data.plan;

        // Populate UI
        planSummary.textContent = plan.summary;
        tasksContainer.innerHTML = '';

        plan.tasks.forEach(task => {
            const taskEl = document.createElement('div');
            taskEl.className = 'task-card';
            taskEl.style.padding = 'var(--space-md)';
            taskEl.style.marginBottom = 'var(--space-sm)';

            // Priority color
            let borderColor = 'var(--primary-blue)';
            if (task.priority === 'High') borderColor = 'var(--error)';
            if (task.priority === 'Medium') borderColor = 'var(--warning)';

            taskEl.style.borderLeft = `4px solid ${borderColor}`;

            taskEl.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
                    <h5 style="margin: 0; font-size: var(--text-base); font-weight: 700;">${task.title}</h5>
                    <span class="badge" style="font-size: 10px;">${task.category}</span>
                </div>
                <p style="margin: 0 0 8px; font-size: var(--text-xs); color: var(--gray-600);">${task.description}</p>
                <div style="font-size: 10px; font-weight: 600; color: var(--gray-500);">📅 Due: ${new Date(task.dueDate).toLocaleDateString()}</div>
            `;
            tasksContainer.appendChild(taskEl);
        });

        planLoading.style.display = 'none';
        planDisplay.style.display = 'block';

    } catch (error) {
        console.error('Plan Generation Error:', error);
        planLoading.innerHTML = `<p style="color: var(--error);">Failed to generate your plan. But don't worry, you can still finish setup!</p>`;
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

                console.log('Creating profile...', profileData);
                await upsertProfile(profileData);

                console.log('Profile created successfully');

                // 2. Add Colleges
                for (const name of selectedColleges) {
                    await supabaseAddCollege(currentUser.id, name);
                }

                if (window.showNotification) window.showNotification('Setup complete! Welcome to CollegeApps.ai', 'success');

                // 3. Verify profile exists before redirecting
                console.log('Verifying profile...');
                const verifyProfile = await getUserProfile(currentUser.id);
                if (!verifyProfile) {
                    console.error('Profile verification failed');
                    throw new Error('Profile was not saved correctly. Please try again.');
                }

                console.log('Profile verified, redirecting to dashboard...');

                // Redirect to dashboard
                setTimeout(() => {
                    window.location.assign('dashboard.html');
                }, 1500);
            } catch (error) {
                console.error('Onboarding Error:', error);
                if (window.showNotification) window.showNotification('Error: ' + error.message, 'error');
            }
        });
    }
});
