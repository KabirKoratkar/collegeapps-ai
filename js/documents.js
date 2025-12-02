// Document Vault JavaScript

document.addEventListener('DOMContentLoaded', function () {
    const fileInput = document.getElementById('fileInput');
    const uploadZone = document.querySelector('.upload-zone');

    // File upload handling
    if (fileInput) {
        fileInput.addEventListener('change', function (e) {
            const files = Array.from(e.target.files);
            files.forEach(file => {
                console.log('Uploading:', file.name);
                showNotification(`Uploading ${file.name}...`, 'info');

                // Simulate upload
                setTimeout(() => {
                    showNotification(`${file.name} uploaded successfully!`, 'success');
                }, 1500);
            });
        });
    }

    // Drag and drop
    if (uploadZone) {
        uploadZone.addEventListener('dragover', function (e) {
            e.preventDefault();
            this.style.borderColor = 'var(--primary-blue)';
            this.style.background = 'rgba(91, 141, 238, 0.05)';
        });

        uploadZone.addEventListener('dragleave', function (e) {
            e.preventDefault();
            this.style.borderColor = 'var(--gray-300)';
            this.style.background = 'var(--gray-50)';
        });

        uploadZone.addEventListener('drop', function (e) {
            e.preventDefault();
            this.style.borderColor = 'var(--gray-300)';
            this.style.background = 'var(--gray-50)';

            const files = Array.from(e.dataTransfer.files);
            files.forEach(file => {
                console.log('Dropped file:', file.name);
                showNotification(`Uploading ${file.name}...`, 'info');
            });
        });
    }

    // File card actions
    document.querySelectorAll('.file-card .btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const fileName = this.closest('.file-card').querySelector('.file-name').textContent;
            const action = this.textContent.trim();

            if (action === 'View') {
                console.log('Viewing file:', fileName);
                showNotification(`Opening ${fileName}...`, 'info');
            } else if (action === '⋮') {
                console.log('File options for:', fileName);
                showNotification('File options coming soon!', 'info');
            }
        });
    });

    // Filter buttons
    document.querySelectorAll('.btn-ghost').forEach(btn => {
        if (btn.textContent.includes('📄') || btn.textContent.includes('📋') ||
            btn.textContent.includes('🏆') || btn.textContent.includes('📜') ||
            btn.textContent.includes('📊') || btn.textContent.includes('✍️')) {
            btn.addEventListener('click', function () {
                const filter = this.textContent.trim();
                console.log('Filtering by:', filter);
                showNotification(`Showing ${filter}`, 'info');
            });
        }
    });
});
