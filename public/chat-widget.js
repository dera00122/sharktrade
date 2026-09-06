// chat-widget.js — in-house support chat bubble.
// Requires api.js to be loaded first on the page. Only shows once the user is logged in.

(function () {
    let panelOpen = false;

    function injectStyles() {
        if (document.getElementById('stChatStyles')) return;
        const style = document.createElement('style');
        style.id = 'stChatStyles';
        style.textContent = `
            #stChatBubble {
                position: fixed; bottom: 20px; right: 20px; width: 56px; height: 56px;
                border-radius: 50%; background: linear-gradient(145deg, #c8a86a, #8a713f);
                display: flex; align-items: center; justify-content: center; cursor: pointer;
                box-shadow: 0 6px 20px rgba(0,0,0,0.4); z-index: 9998; font-size: 1.3rem; color: #000;
            }
            #stChatBadge {
                position: absolute; top: -4px; right: -4px; background: #ff5252; color: #fff;
                font-size: 0.65rem; font-weight: 800; min-width: 18px; height: 18px; border-radius: 9px;
                align-items: center; justify-content: center; padding: 0 4px; display: none;
            }
            #stChatPanel {
                position: fixed; bottom: 88px; right: 20px; width: 320px; max-width: calc(100vw - 40px);
                height: 420px; max-height: calc(100vh - 140px); background: #0b0d10; border: 1px solid #333;
                border-radius: 14px; z-index: 9998; display: none; flex-direction: column; overflow: hidden;
                box-shadow: 0 10px 40px rgba(0,0,0,0.6); font-family: 'Segoe UI', sans-serif;
            }
            .st-chat-header {
                background: #14161a; color: #c8a86a; padding: 14px 16px; font-weight: 700;
                font-size: 0.9rem; display: flex; justify-content: space-between; align-items: center;
                border-bottom: 1px solid #222;
            }
            .st-chat-close { cursor: pointer; color: #888; font-size: 1.2rem; line-height: 1; }
            .st-chat-messages { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
            .st-msg { display: flex; flex-direction: column; max-width: 80%; }
            .st-msg-user { align-self: flex-end; align-items: flex-end; }
            .st-msg-admin { align-self: flex-start; align-items: flex-start; }
            .st-msg-bubble { padding: 9px 12px; border-radius: 12px; font-size: 0.82rem; line-height: 1.4; word-break: break-word; }
            .st-msg-user .st-msg-bubble { background: #c8a86a; color: #000; border-bottom-right-radius: 3px; }
            .st-msg-admin .st-msg-bubble { background: #1a1d21; color: #eee; border-bottom-left-radius: 3px; }
            .st-msg-time { font-size: 0.65rem; color: #666; margin-top: 3px; }
            .st-chat-input-row { display: flex; border-top: 1px solid #222; padding: 10px; gap: 8px; }
            .st-chat-input-row input {
                flex: 1; background: #1a1a1a; border: 1px solid #333; color: #fff;
                padding: 10px 12px; border-radius: 20px; font-size: 0.82rem; outline: none;
            }
            .st-chat-input-row button {
                width: 38px; height: 38px; border-radius: 50%; background: #c8a86a; border: none;
                color: #000; cursor: pointer; flex-shrink: 0;
            }
            @media (max-width: 420px) {
                #stChatPanel { right: 10px; left: 10px; width: auto; bottom: 84px; }
                #stChatBubble { right: 16px; bottom: 16px; }
            }
        `;
        document.head.appendChild(style);
    }

    function buildWidget() {
        if (document.getElementById('stChatBubble')) return;

        injectStyles();

        // Reserve space at the bottom of the page so the fixed bubble never sits on
        // top of real content (e.g. the last card in a list).
        document.body.style.paddingBottom = (parseInt(getComputedStyle(document.body).paddingBottom) || 0) + 90 + 'px';

        const bubble = document.createElement('div');
        bubble.id = 'stChatBubble';
        bubble.innerHTML = `<i class="fa-solid fa-headset"></i><span id="stChatBadge"></span>`;

        const panel = document.createElement('div');
        panel.id = 'stChatPanel';
        panel.innerHTML = `
            <div class="st-chat-header">
                <span>Support Chat</span>
                <span class="st-chat-close" id="stChatClose">&times;</span>
            </div>
            <div class="st-chat-messages" id="stChatMessages"></div>
            <div class="st-chat-input-row">
                <input type="text" id="stChatInput" placeholder="Type a message...">
                <button id="stChatSend"><i class="fa-solid fa-paper-plane"></i></button>
            </div>
        `;

        document.body.appendChild(bubble);
        document.body.appendChild(panel);

        bubble.addEventListener('click', togglePanel);
        document.getElementById('stChatClose').addEventListener('click', togglePanel);
        document.getElementById('stChatSend').addEventListener('click', sendMessage);
        document.getElementById('stChatInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });
    }

    function togglePanel() {
        panelOpen = !panelOpen;
        document.getElementById('stChatPanel').style.display = panelOpen ? 'flex' : 'none';
        if (panelOpen) {
            loadMessages();
            document.getElementById('stChatBadge').style.display = 'none';
        }
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function formatChatTime(iso) {
        const d = new Date(iso.replace(' ', 'T') + 'Z');
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    async function loadMessages() {
        try {
            const { messages } = await apiRequest('/api/user/chat');
            const container = document.getElementById('stChatMessages');
            if (!container) return;

            if (messages.length === 0) {
                container.innerHTML = `<p style="text-align:center; color:#666; font-size:0.8rem; margin-top:20px;">Send us a message and our team will respond shortly.</p>`;
                return;
            }

            container.innerHTML = messages.map(m => `
                <div class="st-msg ${m.sender === 'user' ? 'st-msg-user' : 'st-msg-admin'}">
                    <div class="st-msg-bubble">${escapeHtml(m.message)}</div>
                    <div class="st-msg-time">${formatChatTime(m.created_at)}</div>
                </div>
            `).join('');
            container.scrollTop = container.scrollHeight;
        } catch (err) {
            // silent — e.g. session expired mid-poll
        }
    }

    async function sendMessage() {
        const input = document.getElementById('stChatInput');
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        try {
            await apiRequest('/api/user/chat', { method: 'POST', body: { message: text } });
            loadMessages();
        } catch (err) {
            alert('Failed to send message. Please try again.');
        }
    }

    async function pollBadge() {
        try {
            const summary = await apiRequest('/api/user/summary');
            const badge = document.getElementById('stChatBadge');
            if (!badge) return;
            if (summary.unreadChatCount > 0 && !panelOpen) {
                badge.textContent = summary.unreadChatCount;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        } catch (err) {
            // silent — e.g. not logged in
        }
    }

    function init() {
        if (typeof getToken !== 'function' || !getToken()) return; // widget only shows for logged-in users
        buildWidget();
        pollBadge();
        setInterval(() => {
            pollBadge();
            if (panelOpen) loadMessages();
        }, 5000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
