// Onboarding Flow JavaScript

let currentStep = 1;
const totalSteps = 3;
let colleges = [];

function showStep(step) {
    // Hide all steps
    for (let i = 1; i <= totalSteps; i++) {
        document.getElementById(`step${i}`).style.display = 'none';
        document.getElementById(`indicator${i}`).classList.remove('active');
    }

    // Show current step
    document.getElementById(`step${step}`).style.display = 'block';
    document.getElementById(`indicator${step}`).classList.add('active');

    // Update buttons
    const backBtn = document.getElementById('backBtn');
    const nextBtn = document.getElementById('nextBtn');
    const finishBtn = document.getElementById('finishBtn');

    backBtn.style.display = step > 1 ? 'block' : 'none';
    nextBtn.style.display = step < totalSteps ? 'block' : 'none';
    finishBtn.style.display = step === totalSteps ? 'block' : 'none';
}

function nextStep() {
    if (currentStep === 1) {
        const gradYear = document.getElementById('gradYear').value;
        if (!gradYear) {
            showNotification('Please select your graduation year', 'error');
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

function addCollege() {
    const input = document.getElementById('collegeInput');
    const collegeName = input.value.trim();

    if (!collegeName) {
        showNotification('Please enter a college name', 'error');
        return;
    }

    colleges.push(collegeName);

    // Add college tag
    const collegeList = document.getElementById('collegeList');
    const tag = document.createElement('div');
    tag.className = 'college-tag';
    tag.innerHTML = `
        ${collegeName}
        <span class="remove-college" onclick="removeCollege('${collegeName}')">×</span>
    `;
    collegeList.appendChild(tag);

    input.value = '';
    showNotification(`Added ${collegeName}`, 'success');
}

function removeCollege(collegeName) {
    colleges = colleges.filter(c => c !== collegeName);
    renderColleges();
    showNotification(`Removed ${collegeName}`, 'info');
}

function renderColleges() {
    const collegeList = document.getElementById('collegeList');
    collegeList.innerHTML = '';
    colleges.forEach(college => {
        const tag = document.createElement('div');
        tag.className = 'college-tag';
        tag.innerHTML = `
            ${college}
            <span class="remove-college" onclick="removeCollege('${college}')">×</span>
        `;
        collegeList.appendChild(tag);
    });
}

document.addEventListener('DOMContentLoaded', function () {
    const form = document.getElementById('onboardingForm');
    const collegeInput = document.getElementById('collegeInput');

    // Allow adding college with Enter key
    if (collegeInput) {
        collegeInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                addCollege();
            }
        });
    }

    // Handle form submission
    if (form) {
        form.addEventListener('submit', function (e) {
            e.preventDefault();

            const gradYear = document.getElementById('gradYear').value;
            const major = document.getElementById('intendedMajor').value;
            const deadlines = Array.from(document.querySelectorAll('input[name="deadline"]:checked'))
                .map(cb => cb.value);

            console.log('Onboarding Complete:', {
                gradYear,
                major,
                colleges,
                deadlines
            });

            showNotification('Setup complete! Redirecting to dashboard...', 'success');

            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 2000);
        });
    }

    // Initialize
    showStep(1);
});
