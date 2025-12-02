// College List JavaScript

function openAddCollegeModal() {
    const collegeName = prompt('Enter college name:');
    if (collegeName) {
        console.log('Adding college:', collegeName);
        showNotification(`${collegeName} added to your list!`, 'success');
        // In production, add to backend and refresh table
    }
}

document.addEventListener('DOMContentLoaded', function () {
    // Make table rows clickable
    const tableRows = document.querySelectorAll('.college-table tbody tr');
    tableRows.forEach(row => {
        row.style.cursor = 'pointer';
        row.addEventListener('click', function (e) {
            // Don't trigger if clicking on a button or badge
            if (e.target.tagName === 'BUTTON' || e.target.classList.contains('badge')) {
                return;
            }
            const collegeName = this.querySelector('strong').textContent;
            console.log('Viewing details for:', collegeName);
            showNotification(`Viewing ${collegeName} details`, 'info');
        });
    });
});
