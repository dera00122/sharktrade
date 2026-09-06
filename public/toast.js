// toast.js — lightweight toast notification, drop-in replacement for alert().
//
// USAGE:
//   showToast("Deposit submitted!");                  // default (neutral/gold)
//   showToast("Withdrawal approved!", "success");      // green
//   showToast("Something went wrong", "error");        // red
//   showToast("Check your details", "warning");        // amber
//
// Include this file with a <script src="toast.js"></script> tag, then
// replace alert("message") with showToast("message") anywhere you want
// the nicer popup instead of the browser's default alert box.

(function () {
    function injectStyles() {
        if (document.getElementById('stToastStyles')) return;
        const style = document.createElement('style');
        style.id = 'stToastStyles';
        style.textContent = `
            #stToastContainer {
                position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
                z-index: 99999; display: flex; flex-direction: column; gap: 10px;
                width: 90%; max-width: 380px; pointer-events: none;
            }
            .st-toast {
                background: #14161a; border: 1px solid rgba(255,255,255,0.1);
                border-left: 4px solid #c8a86a; border-radius: 10px;
                padding: 14px 16px; color: #fff; font-family: 'Segoe UI', sans-serif;
                font-size: 0.85rem; line-height: 1.4; box-shadow: 0 10px 30px rgba(0,0,0,0.5);
                display: flex; align-items: flex-start; gap: 10px;
                opacity: 0; transform: translateY(-12px);
                animation: stToastIn 0.25s ease forwards;
                pointer-events: auto;
            }
            .st-toast.success { border-left-color: #00e676; }
            .st-toast.error { border-left-color: #ff5252; }
            .st-toast.warning { border-left-color: #ffc107; }
            .st-toast i.st-toast-icon { margin-top: 1px; }
            .st-toast.success i.st-toast-icon { color: #00e676; }
            .st-toast.error i.st-toast-icon { color: #ff5252; }
            .st-toast.warning i.st-toast-icon { color: #ffc107; }
            .st-toast:not(.success):not(.error):not(.warning) i.st-toast-icon { color: #c8a86a; }
            .st-toast .st-toast-msg { flex: 1; }
            .st-toast .st-toast-close { cursor: pointer; color: #666; font-size: 1rem; line-height: 1; margin-left: 4px; }
            .st-toast.st-toast-out { animation: stToastOut 0.2s ease forwards; }

            @keyframes stToastIn {
                to { opacity: 1; transform: translateY(0); }
            }
            @keyframes stToastOut {
                to { opacity: 0; transform: translateY(-12px); }
            }
        `;
        document.head.appendChild(style);
    }

    function getContainer() {
        let container = document.getElementById('stToastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'stToastContainer';
            document.body.appendChild(container);
        }
        return container;
    }

    const ICONS = {
        success: 'fa-circle-check',
        error: 'fa-circle-exclamation',
        warning: 'fa-triangle-exclamation',
        default: 'fa-circle-info'
    };

    // duration in ms; pass 0 to keep it on screen until manually closed
    window.showToast = function (message, type = 'default', duration = 4000) {
        injectStyles();
        const container = getContainer();

        const toast = document.createElement('div');
        toast.className = `st-toast ${type !== 'default' ? type : ''}`.trim();
        toast.innerHTML = `
            <i class="fa-solid ${ICONS[type] || ICONS.default} st-toast-icon"></i>
            <span class="st-toast-msg"></span>
            <span class="st-toast-close">&times;</span>
        `;
        toast.querySelector('.st-toast-msg').textContent = message;

        function remove() {
            toast.classList.add('st-toast-out');
            setTimeout(() => toast.remove(), 200);
        }

        toast.querySelector('.st-toast-close').addEventListener('click', remove);
        container.appendChild(toast);

        if (duration > 0) setTimeout(remove, duration);
    };
})();
