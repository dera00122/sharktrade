// language-switcher.js — reliable full-site translation.
// Instead of hijacking Google's hidden Translate widget (blocked by mobile browsers as an
// anti-abuse measure), this shows a real dropdown of languages. Picking one opens the current
// page through Google Translate's public proxy in a new tab — always works, no tricks.

(function () {
    const LANGUAGES = [
        { code: 'en', name: 'English', flag: '🇬🇧' },
        { code: 'af', name: 'Afrikaans', flag: '🇿🇦' },
        { code: 'sq', name: 'Albanian', flag: '🇦🇱' },
        { code: 'am', name: 'Amharic', flag: '🇪🇹' },
        { code: 'ar', name: 'Arabic', flag: '🇸🇦' },
        { code: 'hy', name: 'Armenian', flag: '🇦🇲' },
        { code: 'az', name: 'Azerbaijani', flag: '🇦🇿' },
        { code: 'bn', name: 'Bengali', flag: '🇧🇩' },
        { code: 'bg', name: 'Bulgarian', flag: '🇧🇬' },
        { code: 'zh-CN', name: 'Chinese (Simplified)', flag: '🇨🇳' },
        { code: 'hr', name: 'Croatian', flag: '🇭🇷' },
        { code: 'cs', name: 'Czech', flag: '🇨🇿' },
        { code: 'da', name: 'Danish', flag: '🇩🇰' },
        { code: 'nl', name: 'Dutch', flag: '🇳🇱' },
        { code: 'fi', name: 'Finnish', flag: '🇫🇮' },
        { code: 'fr', name: 'French', flag: '🇫🇷' },
        { code: 'de', name: 'German', flag: '🇩🇪' },
        { code: 'el', name: 'Greek', flag: '🇬🇷' },
        { code: 'ha', name: 'Hausa', flag: '🇳🇬' },
        { code: 'he', name: 'Hebrew', flag: '🇮🇱' },
        { code: 'hi', name: 'Hindi', flag: '🇮🇳' },
        { code: 'hu', name: 'Hungarian', flag: '🇭🇺' },
        { code: 'id', name: 'Indonesian', flag: '🇮🇩' },
        { code: 'ig', name: 'Igbo', flag: '🇳🇬' },
        { code: 'it', name: 'Italian', flag: '🇮🇹' },
        { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
        { code: 'ko', name: 'Korean', flag: '🇰🇷' },
        { code: 'ms', name: 'Malay', flag: '🇲🇾' },
        { code: 'no', name: 'Norwegian', flag: '🇳🇴' },
        { code: 'fa', name: 'Persian', flag: '🇮🇷' },
        { code: 'pl', name: 'Polish', flag: '🇵🇱' },
        { code: 'pt', name: 'Portuguese', flag: '🇵🇹' },
        { code: 'pa', name: 'Punjabi', flag: '🇮🇳' },
        { code: 'ro', name: 'Romanian', flag: '🇷🇴' },
        { code: 'ru', name: 'Russian', flag: '🇷🇺' },
        { code: 'sw', name: 'Swahili', flag: '🇰🇪' },
        { code: 'es', name: 'Spanish', flag: '🇪🇸' },
        { code: 'sv', name: 'Swedish', flag: '🇸🇪' },
        { code: 'tl', name: 'Tagalog', flag: '🇵🇭' },
        { code: 'th', name: 'Thai', flag: '🇹🇭' },
        { code: 'tr', name: 'Turkish', flag: '🇹🇷' },
        { code: 'uk', name: 'Ukrainian', flag: '🇺🇦' },
        { code: 'ur', name: 'Urdu', flag: '🇵🇰' },
        { code: 'vi', name: 'Vietnamese', flag: '🇻🇳' },
        { code: 'yo', name: 'Yoruba', flag: '🇳🇬' },
        { code: 'zu', name: 'Zulu', flag: '🇿🇦' }
    ];

    function injectStyles() {
        if (document.getElementById('stLangStyles')) return;
        const style = document.createElement('style');
        style.id = 'stLangStyles';
        style.textContent = `
            #stLangSwitcher {
                position: fixed; top: 16px; left: 16px; z-index: 9996;
                background: #fff; border-radius: 8px; padding: 10px 14px;
                display: flex; align-items: center; gap: 8px; cursor: pointer;
                box-shadow: 0 4px 16px rgba(0,0,0,0.25); font-family: 'Segoe UI', sans-serif;
                font-weight: 700; font-size: 0.9rem; color: #111;
            }
            #stLangMenuItem {
                display: flex; align-items: center; gap: 8px; cursor: pointer;
                color: inherit; font: inherit;
            }
            #stLangSwitcher i, #stLangMenuItem i { font-size: 0.75rem; }

            #stLangOverlay {
                display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5);
                z-index: 99990; align-items: flex-start; justify-content: center; padding-top: 70px;
            }
            #stLangOverlay.open { display: flex; }
            #stLangPanel {
                background: #fff; border-radius: 14px; width: 90%; max-width: 340px;
                max-height: 70vh; overflow: hidden; display: flex; flex-direction: column;
                box-shadow: 0 20px 60px rgba(0,0,0,0.5); font-family: 'Segoe UI', sans-serif;
            }
            #stLangPanelHeader {
                padding: 14px 16px; border-bottom: 1px solid #eee; display: flex;
                justify-content: space-between; align-items: center; font-weight: 700; color: #111;
            }
            #stLangPanelClose { cursor: pointer; color: #888; font-size: 1.2rem; }
            #stLangSearch {
                margin: 10px 14px; padding: 9px 12px; border: 1px solid #ddd; border-radius: 8px;
                font-size: 0.85rem; outline: none;
            }
            #stLangList { overflow-y: auto; padding: 4px 0 10px; }
            .st-lang-item {
                display: flex; align-items: center; gap: 12px; padding: 11px 18px;
                cursor: pointer; color: #222; font-size: 0.95rem; text-decoration: none;
            }
            .st-lang-item:hover { background: #f5f5f5; }
            .st-lang-item .flag { font-size: 1.3rem; }
            .st-lang-item.current { font-weight: 700; }
        `;
        document.head.appendChild(style);
    }

    function buildPanel() {
        const overlay = document.createElement('div');
        overlay.id = 'stLangOverlay';
        overlay.innerHTML = `
            <div id="stLangPanel">
                <div id="stLangPanelHeader">
                    <span>Choose Language</span>
                    <span id="stLangPanelClose">&times;</span>
                </div>
                <input type="text" id="stLangSearch" placeholder="Search languages...">
                <div id="stLangList"></div>
            </div>
        `;
        document.body.appendChild(overlay);

        const listEl = overlay.querySelector('#stLangList');
        function renderList(filter = '') {
            const q = filter.toLowerCase();
            const filtered = LANGUAGES.filter(l => l.name.toLowerCase().includes(q));
            listEl.innerHTML = filtered.map(l => `
                <a class="st-lang-item ${l.code === 'en' ? 'current' : ''}" data-code="${l.code}">
                    <span class="flag">${l.flag}</span> ${l.name}
                </a>
            `).join('');
        }
        renderList();

        overlay.querySelector('#stLangSearch').addEventListener('input', (e) => renderList(e.target.value));
        overlay.querySelector('#stLangPanelClose').addEventListener('click', () => overlay.classList.remove('open'));
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('open'); });

        listEl.addEventListener('click', (e) => {
            const item = e.target.closest('.st-lang-item');
            if (!item) return;
            const code = item.dataset.code;
            overlay.classList.remove('open');
            if (code === 'en') return; // already English, nothing to do

            const pageUrl = window.location.href;
            const translateUrl = `https://translate.google.com/translate?sl=en&tl=${code}&u=${encodeURIComponent(pageUrl)}`;
            window.open(translateUrl, '_blank');
        });

        return overlay;
    }

    function buildSwitcher() {
        injectStyles();
        const overlay = buildPanel();

        const menuSlot = document.getElementById('langMenuSlot');
        if (menuSlot) {
            menuSlot.innerHTML = `<i class="fa-solid fa-globe"></i> <span id="stLangMenuItem">Language: EN</span>`;
            menuSlot.style.cursor = 'pointer';
            menuSlot.addEventListener('click', () => overlay.classList.add('open'));
        } else {
            const bar = document.createElement('div');
            bar.id = 'stLangSwitcher';
            bar.innerHTML = `<i class="fa-solid fa-globe"></i> <span>EN</span> <i class="fa-solid fa-chevron-down"></i>`;
            document.body.appendChild(bar);
            bar.addEventListener('click', () => overlay.classList.add('open'));
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', buildSwitcher);
    } else {
        buildSwitcher();
    }
})();
