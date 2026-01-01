import { getCurrentUser, getUserDocuments, uploadDocument, getDocumentUrl, deleteDocument } from './supabase-config.js';
import { updateNavbarUser } from './ui.js';
import config from './config.js';

let currentUser = null;
let documents = [];

// Notification helper (since main.js is not a module, we need to define it here or access via window)
function showNotification(message, type = 'info') {
    if (typeof window.showNotification === 'function') {
        window.showNotification(message, type);
    } else {
        console.log(`[${type.toUpperCase()}] ${message}`);
    }
}

document.addEventListener('DOMContentLoaded', async function () {
    currentUser = await getCurrentUser();
    if (!currentUser) {
        window.location.href = new URL('login.html', window.location.href).href;
        return;
    }

    updateNavbarUser(currentUser);
    await loadAndRenderDocuments();

    const fileInput = document.getElementById('fileInput');
    const uploadZone = document.querySelector('.upload-zone');

    if (fileInput) {
        fileInput.addEventListener('change', async function (e) {
            const files = Array.from(e.target.files);
            for (const file of files) {
                await handleUpload(file);
            }
        });
    }

    // Drag and drop and other listeners... (omitted but preserved in logic)
    if (uploadZone) {
        uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadZone.style.borderColor = 'var(--primary-blue)';
        });
        uploadZone.addEventListener('dragleave', () => {
            uploadZone.style.borderColor = 'var(--gray-300)';
        });
        uploadZone.addEventListener('drop', async (e) => {
            e.preventDefault();
            uploadZone.style.borderColor = 'var(--gray-300)';
            const files = Array.from(e.dataTransfer.files);
            for (const file of files) {
                await handleUpload(file);
            }
        });
    }

    // Filter logic
    document.querySelectorAll('.filter-tab').forEach(btn => {
        btn.addEventListener('click', function () {
            document.querySelectorAll('.filter-tab').forEach(b => {
                b.classList.remove('btn-primary', 'active');
                b.classList.add('btn-ghost');
            });
            this.classList.remove('btn-ghost');
            this.classList.add('btn-primary', 'active');

            const category = this.dataset.category;
            filterDocuments(category);
        });
    });

    // Modal close functions
    window.closeReviewModal = () => {
        document.getElementById('reviewModal').style.display = 'none';
    };

    // Make functions global for inline onclick
    window.viewFile = viewFile;
    window.deleteDoc = deleteDoc;
    window.reviewWithAI = reviewWithAI;
});

let pendingFile = null;

function showUploadModal(file) {
    pendingFile = file;
    document.getElementById('selectedFileName').textContent = file.name;
    document.getElementById('uploadModal').style.display = 'flex';
}

function closeUploadModal() {
    document.getElementById('uploadModal').style.display = 'none';
    pendingFile = null;
    document.getElementById('fileInput').value = ''; // Reset input
}

async function confirmUpload() {
    if (!pendingFile) return;

    const category = document.getElementById('docCategory').value;
    const file = pendingFile;

    closeUploadModal(); // Close first to show progress behind or notification

    showNotification(`Uploading ${file.name}...`, 'info');

    const doc = await uploadDocument(currentUser.id, file, category);
    if (doc) {
        showNotification(`${file.name} uploaded!`, 'success');
        await loadAndRenderDocuments();
    } else {
        showNotification('Upload failed.', 'error');
    }
}

// Make global
window.closeUploadModal = closeUploadModal;
window.confirmUpload = confirmUpload;

async function handleUpload(file) {
    // Instead of direct upload, show modal
    showUploadModal(file);
}

async function loadAndRenderDocuments() {
    documents = await getUserDocuments(currentUser.id);
    renderGrid(documents);
}

function renderGrid(docs) {
    const grid = document.querySelector('.file-grid');
    if (!grid) return;

    if (docs.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: var(--space-2xl); color: var(--gray-500);">No documents found.</div>';
        return;
    }

    grid.innerHTML = docs.map(doc => `
        <div class="file-card">
            <div class="file-icon">${getFileIcon(doc.category)}</div>
            <div class="file-name">${doc.name}</div>
            <div class="file-size">${(doc.file_size / 1024 / 1024).toFixed(2)} MB • ${doc.file_type.split('/')[1]?.toUpperCase() || 'FILE'}</div>
            <div style="margin-top: var(--space-md);">
                <span class="badge ${getCategoryClass(doc.category)}">${doc.category}</span>
            </div>
            <div style="display: flex; gap: var(--space-xs); margin-top: var(--space-md);">
                <button class="btn btn-sm btn-ghost" style="flex: 1;" onclick="viewFile('${doc.file_path}')">View</button>
                <button class="btn btn-sm btn-primary" onclick="reviewWithAI('${doc.name}', '${doc.category}')">AI Review</button>
                <button class="btn btn-sm btn-ghost" onclick="deleteDoc('${doc.id}', '${doc.file_path}')" title="Delete">🗑️</button>
            </div>
        </div>
    `).join('');
}

function filterDocuments(category) {
    if (category === 'all') {
        renderGrid(documents);
    } else {
        const filtered = documents.filter(d => d.category.toLowerCase().includes(category.toLowerCase()));
        renderGrid(filtered);
    }
}

async function viewFile(filePath) {
    showNotification('Fetching document...', 'info');
    const url = await getDocumentUrl(filePath);
    if (url) {
        window.open(url, '_blank');
    } else {
        showNotification('Error opening file.', 'error');
    }
}

async function deleteDoc(id, path) {
    if (confirm('Are you sure you want to delete this document?')) {
        showNotification('Deleting...', 'info');
        const success = await deleteDocument(id, path);
        if (success) {
            showNotification('Document deleted.', 'success');
            await loadAndRenderDocuments();
        } else {
            showNotification('Error deleting document.', 'error');
        }
    }
}

async function reviewWithAI(name, category) {
    const modal = document.getElementById('reviewModal');
    const loading = document.getElementById('reviewLoading');
    const results = document.getElementById('reviewResults');
    const info = document.getElementById('reviewDocInfo');

    info.textContent = `${category} • ${name}`;
    modal.style.display = 'flex';
    loading.style.display = 'block';
    results.style.display = 'none';

    try {
        const response = await fetch(`${config.apiUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: `Analyze this student ${category} document: "${name}". 
                Since I don't have the text extraction yet, provide a high-level expert checklist of what a student should ensure is present in a top-tier version of this document. 
                Structure your response with:
                1. [STRENGTHS] (Common strengths in ${category}s)
                2. [CHECKLIST] (3-4 essential items for elite colleges)
                3. [ACTION] (One specific strategy to stand out)`,
                userId: currentUser.id,
                conversationHistory: []
            })
        });

        if (!response.ok) throw new Error('AI Server error');

        const data = await response.json();
        const feedback = data.response;

        loading.style.display = 'none';
        results.style.display = 'block';

        // Parse sections
        const strengths = feedback.match(/\[STRENGTHS\]([\s\S]*?)(?=\[|$)/i)?.[1]?.trim() || "Ready for review.";
        const checklist = feedback.match(/\[CHECKLIST\]([\s\S]*?)(?=\[|$)/i)?.[1]?.trim() || "Check formatting and impact.";
        const action = feedback.match(/\[ACTION\]([\s\S]*?)(?=\[|$)/i)?.[1]?.trim() || "Quantify your achievements.";

        results.innerHTML = `
            <div class="review-section">
                <h4 style="color: var(--success); margin-bottom: 8px;">✅ Common Strengths</h4>
                <p style="font-size: var(--text-sm); line-height: 1.5;">${strengths.replace(/\n/g, '<br>')}</p>
            </div>
            <div class="review-section mt-lg" style="border-top: 1px solid var(--gray-100); padding-top: var(--space-md);">
                <h4 style="color: var(--primary-blue); margin-bottom: 8px;">📋 Elite College Checklist</h4>
                <p style="font-size: var(--text-sm); line-height: 1.5;">${checklist.replace(/\n/g, '<br>')}</p>
            </div>
            <div class="review-section mt-lg" style="background: var(--gray-50); padding: var(--space-md); border-radius: var(--radius-md);">
                <h4 style="color: var(--accent-purple); margin-bottom: 4px;">🚀 Pro Tip to Stand Out</h4>
                <p style="font-size: var(--text-sm); font-weight: 500;">${action}</p>
            </div>
        `;

    } catch (error) {
        console.error('AI Review Error:', error);
        loading.innerHTML = `<p style="color: var(--error);">Error generating analysis. Please try again.</p>`;
    }
}

function getFileIcon(cat) {
    const icons = { 'Transcript': '📄', 'Resume': '📋', 'Award': '🏆', 'Certificate': '📜', 'Test Score': '📊', 'Essay Draft': '✍️' };
    return icons[cat] || '📄';
}

function getCategoryClass(cat) {
    const classes = { 'Transcript': 'badge-primary', 'Resume': 'badge-warning', 'Award': 'badge-success', 'Test Score': 'badge-info' };
    return classes[cat] || 'badge-ghost';
}
