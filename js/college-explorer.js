import config from './config.js';
import { getCurrentUser, getUserProfile } from './supabase-config.js';
import { updateNavbarUser } from './ui.js';

let enrollmentChart = null;

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const collegeName = urlParams.get('name');

    if (!collegeName) {
        window.location.href = 'colleges.html';
        return;
    }

    const profile = await getUserProfile(user.id);
    updateNavbarUser(user, profile);

    try {
        await fetchAndRenderCollegeData(collegeName);
    } catch (error) {
        console.error('Error loading college data:', error);
        if (window.showNotification) window.showNotification('Could not lead college data. Please try again.', 'error');
        window.location.href = 'colleges.html';
    } finally {
        document.getElementById('loadingOverlay').style.display = 'none';
    }
});

async function fetchAndRenderCollegeData(name) {
    // Call our new research endpoint
    const response = await fetch(`${config.apiUrl}/api/colleges/research?name=${encodeURIComponent(name)}`);
    const data = await response.json();

    if (!data.success) {
        throw new Error(data.error || 'Failed to fetch college data');
    }

    const college = data.college;

    // Update UI Elements
    document.getElementById('collegeName').textContent = college.name;
    document.title = `${college.name} - College Explorer`;

    document.getElementById('collegeLocation').textContent = college.location || 'Location Unknown';
    document.getElementById('collegeWebsite').href = college.website || '#';
    document.getElementById('collegeDescription').textContent = college.description || 'No description available.';

    // Stats
    document.getElementById('acceptanceRate').textContent = college.acceptance_rate ? `${college.acceptance_rate}%` : '--%';
    document.getElementById('medianSAT').textContent = college.median_sat || 'N/A';
    document.getElementById('medianACT').textContent = college.median_act || 'N/A';
    document.getElementById('avgGPA').textContent = college.avg_gpa || 'N/A';

    // Detail Sidebar
    document.getElementById('totalEnrollment').textContent = college.enrollment ? college.enrollment.toLocaleString() : 'N/A';
    document.getElementById('costOfAttendance').textContent = college.cost_of_attendance ? `$${college.cost_of_attendance.toLocaleString()}` : 'N/A';

    // Header Style
    if (college.image_url) {
        document.getElementById('collegeHeader').style.backgroundImage = `linear-gradient(rgba(0,0,0,0.4), rgba(0,0,0,0.7)), url(${college.image_url})`;
    }

    // AI Insight (Placeholder for now, could be its own endpoint or handled in first chat)
    renderAIInsight(college);

    // Render Charts
    renderEnrollmentChart(college);

    // Setup Buttons
    const addBtn = document.getElementById('addCollegeBtn');
    addBtn.onclick = () => addCollege(college.name);

    const intelBtn = document.getElementById('intelligenceReportBtn');
    if (intelBtn) {
        intelBtn.onclick = () => generateIntelligenceReport(college.name);
    }
}

async function generateIntelligenceReport(collegeName) {
    const btn = document.getElementById('intelligenceReportBtn');
    const originalText = btn.innerHTML;

    try {
        btn.disabled = true;
        btn.innerHTML = '<span class="loading-spinner">🕵️</span> Investigating...';

        const user = await getCurrentUser();
        const response = await fetch(`${config.apiUrl}/api/colleges/research-deep`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: user.id,
                collegeName: collegeName
            })
        });

        if (!response.ok) throw new Error('Research failed');

        const data = await response.json();
        showIntelligenceModal(data.findings);
    } catch (error) {
        console.error('Intelligence Error:', error);
        if (window.showNotification) window.showNotification('Could not generate report. Is the AI server running?', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

function showIntelligenceModal(findings) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(15, 23, 42, 0.85); display: flex; align-items: center; justify-content: center;
        z-index: 2000; backdrop-filter: blur(16px);
    `;

    const renderModule = (mod, icon, color) => {
        if (!mod || !mod.items) return '';
        const itemsHtml = mod.items.map(item => `
            <div style="margin-bottom: var(--space-md);">
                <div style="font-weight: 700; font-size: var(--text-sm); font-family: 'Outfit', sans-serif; color: var(--gray-900);">${item.title}</div>
                <div style="font-size: var(--text-sm); color: var(--gray-600); line-height: 1.5;">${item.content}</div>
            </div>
        `).join('');

        return `
            <div class="card" style="margin-bottom: var(--space-lg); border-left: 4px solid ${color}; background: var(--white); padding: var(--space-lg); border-radius: var(--radius-lg);">
                <div style="display: flex; align-items: center; gap: var(--space-sm); margin-bottom: var(--space-md);">
                    <span style="font-size: 20px;">${icon}</span>
                    <h3 style="margin: 0; font-size: var(--text-md); text-transform: uppercase; letter-spacing: 0.05em; color: ${color}; font-family: 'Outfit', sans-serif;">${mod.headline}</h3>
                </div>
                ${itemsHtml}
            </div>
        `;
    };

    const modules = findings.modules;

    modal.innerHTML = `
        <div class="card" style="max-width: 800px; width: 95%; padding: 0; max-height: 90vh; overflow-y: auto; background: var(--gray-50); box-shadow: var(--shadow-2xl); border: 1px solid var(--gray-200);">
            <div style="position: sticky; top: 0; background: var(--white); padding: var(--space-xl) var(--space-2xl); border-bottom: 1px solid var(--gray-200); display: flex; justify-content: space-between; align-items: center; z-index: 10; backdrop-filter: blur(10px);">
                <div style="display: flex; align-items: center; gap: var(--space-md);">
                    <div style="width: 50px; height: 50px; background: var(--gradient-primary); border-radius: var(--radius-lg); display: flex; align-items: center; justify-content: center; font-size: 24px; color: white;">🕵️</div>
                    <div>
                        <h2 style="margin: 0; font-family: 'Outfit', sans-serif; font-size: var(--text-2xl); font-weight: 800; color: var(--gray-900);">${findings.college} Intelligence Report</h2>
                        <p style="margin: 0; font-size: var(--text-xs); color: var(--gray-500); text-transform: uppercase; letter-spacing: 0.1em; font-weight: 700;">Internal Personnel File: CONFIDENTIAL</p>
                    </div>
                </div>
                <button onclick="this.closest('.modal-overlay').remove()" style="background: var(--gray-100); border: none; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; color: var(--gray-600);">×</button>
            </div>

            <div style="padding: var(--space-2xl);">
                <div class="card" style="border: 1px dashed var(--primary-blue); margin-bottom: var(--space-xl); background: var(--white); padding: var(--space-lg);">
                    <h4 style="margin: 0 0 8px; font-size: var(--text-xs); color: var(--primary-blue); text-transform: uppercase;">Executive Summary</h4>
                    <p style="margin: 0; font-size: var(--text-md); font-weight: 500; font-style: italic; color: var(--gray-800);">${findings.summary}</p>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-lg);">
                    <div style="display: flex; flex-direction: column;">
                        ${renderModule(modules.academics, '🎓', 'var(--primary-blue)')}
                        ${renderModule(modules.career, '💼', 'var(--success)')}
                    </div>
                    <div style="display: flex; flex-direction: column;">
                        ${renderModule(modules.culture, '🎉', 'var(--warning)')}
                        ${renderModule(modules.admissions, '🎯', 'var(--accent-purple)')}
                        
                        <div class="card" style="background: var(--gray-100); color: var(--gray-900); border: 1px solid var(--gray-200); padding: var(--space-lg); border-radius: var(--radius-lg);">
                            <div style="display: flex; align-items: center; gap: var(--space-sm); margin-bottom: var(--space-md);">
                                <span style="font-size: 20px;">⚔️</span>
                                <h3 style="margin: 0; font-size: var(--text-md); text-transform: uppercase; letter-spacing: 0.05em; color: var(--gray-900); font-family: 'Outfit', sans-serif;">The Competitive Edge</h3>
                            </div>
                            <p style="font-size: var(--text-sm); line-height: 1.6; color: var(--gray-600); margin: 0;">${modules.edge.content}</p>
                        </div>
                    </div>
                </div>

                <div style="margin-top: var(--space-xl); text-align: center;">
                    <button class="btn btn-primary w-full" style="height: 50px;" onclick="this.closest('.modal-overlay').remove()">Download Intelligence to Brain</button>
                    <p style="font-size: 10px; color: var(--gray-400); margin-top: var(--space-md);">Verified against 2024-2025 Admissions Data • AI-Generated Insight</p>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

function renderAIInsight(college) {
    const insights = [
        `${college.name} is known for its ${college.acceptance_rate < 10 ? 'highly competitive' : 'selective'} admissions environment. Successful applicants often demonstrate strong leadership and specific excellence in ${college.name.includes('Tech') || college.name.includes('Institute') ? 'STEM and innovation' : 'their chosen field of study'}.`,
        `Given the median SAT of ${college.median_sat || 'high range'}, focus on ensuring your score is within the 25th-75th percentile to be competitive.`,
        `Pro-tip: This college values "cultural fit" and ${college.acceptance_rate < 15 ? 'intellectual curiosity' : 'academic grit'}. Make sure your supplemental essays reflect this.`
    ];
    document.getElementById('aiInsight').textContent = insights.join(' ');
}

function renderEnrollmentChart(college) {
    const ctx = document.getElementById('enrollmentChart').getContext('2d');

    if (enrollmentChart) {
        enrollmentChart.destroy();
    }

    enrollmentChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Admitted', 'Waitlisted', 'Denied'],
            datasets: [{
                data: [college.acceptance_rate || 10, 5, 100 - (college.acceptance_rate || 10) - 5],
                backgroundColor: [
                    '#5B8DEE', // Admitted
                    '#8B7BF7', // Waitlisted
                    '#E2E8F0'  // Denied
                ],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        usePointStyle: true,
                        padding: 20
                    }
                }
            }
        }
    });
}

async function addCollege(name) {
    const btn = document.getElementById('addCollegeBtn');
    btn.disabled = true;
    btn.textContent = 'Adding...';

    try {
        const user = await getCurrentUser();
        const response = await fetch(`${config.apiUrl}/api/colleges/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id, collegeName: name })
        });

        const result = await response.json();
        if (result.success) {
            if (window.showNotification) window.showNotification(`Successfully added ${name} to your list!`, 'success');
            setTimeout(() => window.location.href = 'colleges.html', 1500);
        } else {
            if (window.showNotification) window.showNotification('Could not add college: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Error adding college:', error);
        if (window.showNotification) window.showNotification('An error occurred. Please try again.', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '+ Add to List';
    }
}
