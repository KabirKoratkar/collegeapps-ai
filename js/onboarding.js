import { getCurrentUser, upsertProfile, addCollege as supabaseAddCollege, getUserProfile, searchCollegeCatalog } from './supabase-config.js';
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

    // If no user found immediately, wait a moment and try one more time
    if (!currentUser) {
        console.log('No session found, waiting briefly...');
        await new Promise(resolve => setTimeout(resolve, 1500));
        currentUser = await getCurrentUser();
    }

    if (!currentUser) {
        console.log('Final check: No session found, redirecting to login');
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

    // Setup Autocomplete for both Colleges and Majors
    setupCollegeSearch();
    setupMajorSearch();
}

function setupMajorSearch() {
    const input = document.getElementById('intendedMajor');
    const container = document.getElementById('majorSearchResults');

    if (!input || !container) return;

    const majors = [
        { name: 'Computer Science', abbrev: ['cs', 'comp sci'] },
        { name: 'Mechanical Engineering', abbrev: ['me', 'mech e'] },
        { name: 'Electrical Engineering', abbrev: ['ee', 'elec e'] },
        { name: 'Bioengineering', abbrev: ['bioe', 'bio e'] },
        { name: 'Chemical Engineering', abbrev: ['cheme', 'chem e'] },
        { name: 'Aerospace Engineering', abbrev: ['aero'] },
        { name: 'Biology', abbrev: ['bio'] },
        { name: 'Chemistry', abbrev: ['chem'] },
        { name: 'Physics', abbrev: ['phys'] },
        { name: 'Mathematics', abbrev: ['math'] },
        { name: 'Economics', abbrev: ['econ'] },
        { name: 'Psychology', abbrev: ['psych'] },
        { name: 'Political Science', abbrev: ['poli sci', 'polsci'] },
        { name: 'International Relations', abbrev: ['ir'] },
        { name: 'Business Administration', abbrev: ['biz', 'business'] },
        { name: 'Finance', abbrev: ['fin'] },
        { name: 'Marketing', abbrev: ['mktg'] },
        { name: 'Public Policy', abbrev: ['pub pol'] },
        { name: 'Nursing', abbrev: [] },
        { name: 'Architecture', abbrev: ['arch'] },
        { name: 'Graphic Design', abbrev: ['design'] },
        { name: 'Pre-Med', abbrev: [] },
        { name: 'Pre-Law', abbrev: [] },
        { name: 'English', abbrev: [] },
        { name: 'History', abbrev: [] },
        { name: 'Philosophy', abbrev: ['phil'] }
    ];

    input.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        if (query.length < 1) {
            container.style.display = 'none';
            return;
        }

        const filtered = majors.filter(m =>
            m.name.toLowerCase().includes(query) ||
            m.abbrev.some(a => a.includes(query))
        ).slice(0, 8);

        renderMajorDropdown(filtered, container);
    });

    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !container.contains(e.target)) {
            container.style.display = 'none';
        }
    });
}

function renderMajorDropdown(results, container) {
    if (results.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.innerHTML = results.map(m => `
        <div class="search-item" 
             style="padding: 10px; cursor: pointer; border-bottom: 1px solid var(--gray-50); font-size: 14px;" 
             onclick="selectMajor('${m.name}')">
            <strong>${m.name}</strong>
        </div>
    `).join('');
    container.style.display = 'block';
}

window.selectMajor = (name) => {
    const input = document.getElementById('intendedMajor');
    const container = document.getElementById('majorSearchResults');
    if (input) input.value = name;
    if (container) container.style.display = 'none';
};

function setupCollegeSearch() {
    const input = document.getElementById('collegeInput');
    const container = document.getElementById('onboardingSearchResults');

    if (!input || !container) return;

    input.addEventListener('input', async (e) => {
        const query = e.target.value.trim();
        if (query.length < 2) {
            container.style.display = 'none';
            return;
        }

        const results = await searchCollegeCatalog(query);
        renderSearchDropdown(results, container);
    });

    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !container.contains(e.target)) {
            container.style.display = 'none';
        }
    });
}

function renderSearchDropdown(results, container) {
    const query = document.getElementById('collegeInput').value.trim();

    if (results.length === 0) {
        container.innerHTML = `
            <div style="padding: 12px; border-bottom: 1px solid var(--gray-50);">
                <div style="font-size: 13px; color: var(--gray-500); margin-bottom: 8px;">No colleges found matching "${query}"</div>
                <button onclick="selectOnboardingCollege('${query.replace(/'/g, "\\'")}')" 
                        class="btn btn-ghost btn-sm" 
                        style="width: 100%; border: 1px dashed var(--gray-300); color: var(--primary-blue);">
                    + Add "${query}" Anyway (AI will research)
                </button>
            </div>
        `;
    } else {
        let html = results.map(c => `
            <div class="search-item" 
                 style="padding: 10px; cursor: pointer; border-bottom: 1px solid var(--gray-50);" 
                 onclick="selectOnboardingCollege('${c.name.replace(/'/g, "\\'")}')">
                <div style="font-weight: 700; font-size: 14px; color: var(--gray-800);">${c.name}</div>
                <div style="font-size: 11px; color: var(--gray-500);">${c.location || 'University'}</div>
            </div>
        `).join('');

        // Add "Add manually" option at the bottom even if there are results
        html += `
            <div style="padding: 8px; background: var(--gray-50); text-align: center;">
                <button onclick="selectOnboardingCollege('${query.replace(/'/g, "\\'")}')" 
                        style="background: none; border: none; color: var(--gray-400); font-size: 10px; cursor: pointer; text-decoration: underline;">
                    Don't see it? Add "${query}" manually
                </button>
            </div>
        `;
        container.innerHTML = html;
    }
    container.style.display = 'block';
}

window.selectOnboardingCollege = (name) => {
    const input = document.getElementById('collegeInput');
    const container = document.getElementById('onboardingSearchResults');
    if (input) input.value = name;
    if (container) container.style.display = 'none';
    addCollegeToList();
};

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

    const finishBtn = document.getElementById('finishBtn');
    if (!planLoading || !planDisplay) return;

    try {
        if (finishBtn) {
            finishBtn.disabled = true;
            finishBtn.style.opacity = '0.5';
            finishBtn.innerHTML = 'Generating your plan...';
        }
        const gradYear = document.getElementById('gradYear').value;
        const major = document.getElementById('intendedMajor').value;
        const fullName = document.getElementById('fullName').value;
        const leeway = document.getElementById('submissionLeeway').value;

        const response = await fetch(`${config.apiUrl}/api/onboarding/plan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: currentUser.id,
                colleges: selectedColleges,
                profile: {
                    graduation_year: gradYear,
                    intended_major: major,
                    full_name: fullName,
                    submission_leeway: leeway
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

        if (finishBtn) {
            finishBtn.disabled = false;
            finishBtn.style.opacity = '1';
            finishBtn.innerHTML = 'Finish Setup & Enter Dashboard →';
        }


    } catch (error) {
        console.error('Plan Generation Error:', error);
        planLoading.innerHTML = `<p style="color: var(--error);">Failed to generate your plan: ${error.message}. But don't worry, you can still finish setup!</p>`;


        if (finishBtn) {
            finishBtn.disabled = false;
            finishBtn.style.opacity = '1';
            finishBtn.innerHTML = 'Finish Setup Anyway →';
        }

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
                    planned_deadlines: selectedDeadlines,
                    submission_leeway: parseInt(document.getElementById('submissionLeeway').value)
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

                if (window.showNotification) window.showNotification('Setup complete! Welcome to Waypoint', 'success');

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
