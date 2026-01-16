/**
 * Intelligence HUD (Wow Factor Component)
 * Simulates real-time agent orchestration visibility
 */

function createIntelHUD() {
    const hud = document.createElement('div');
    hud.className = 'intel-hud';
    hud.innerHTML = `
        <div class="intel-hud-header">
            <span>Systems Intelligence</span>
            <div class="hud-status-dot"></div>
        </div>
        <ul class="intel-log" id="intelLog">
            <li class="intel-log-item success">>> Local environment sync: OK</li>
        </ul>
    `;
    document.body.appendChild(hud);
}

function addIntelLog(message, type = 'process') {
    const log = document.getElementById('intelLog');
    if (!log) return;

    const li = document.createElement('li');
    li.className = `intel-log-item ${type}`;
    const time = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    li.innerHTML = `[${time}] ${message}`;

    log.insertBefore(li, log.firstChild);

    // Keep only last 6 items
    if (log.children.length > 6) {
        log.lastChild.remove();
    }
}

// Global hook for wow movements
window.addIntelLog = addIntelLog;

document.addEventListener('DOMContentLoaded', () => {
    createIntelHUD();

    // Initial sequence
    setTimeout(() => addIntelLog("Identity verified via Auth0", "success"), 1000);
    setTimeout(() => addIntelLog("AWS S3 Document Node: Bound", "success"), 2000);
    setTimeout(() => addIntelLog("Governance: Retool sync enabled", "process"), 3000);
    setTimeout(() => addIntelLog("Ready for User Input.", "process"), 4000);
});
