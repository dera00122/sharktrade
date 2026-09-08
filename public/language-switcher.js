// language-switcher.js — full-site translation using Google's free Website Translator widget.
// Include this on any page with: <script src="language-switcher.js"></script>
// It injects a small flag/language dropdown, matching the EN dropdown style used as reference.

(function () {
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
            #stLangSwitcher i { font-size: 0.75rem; transition: transform 0.2s; }
            #stLangSwitcher.open i { transform: rotate(180deg); }
            /* Hide Google's default banner/branding for a cleaner look */
            .goog-te-banner-frame, .skiptranslate > div:first-child { display: none !important; }
            body { top: 0 !important; }
            #google_translate_element { display: none; }
            .goog-tooltip, .goog-tooltip:hover { display: none !important; }
            .goog-text-highlight { background: none !important; box-shadow: none !important; }
        `;
        document.head.appendChild(style);
    }

    function buildSwitcher() {
        if (document.getElementById('stLangSwitcher')) return;
        injectStyles();

        const bar = document.createElement('div');
        bar.id = 'stLangSwitcher';
        bar.innerHTML = `<i class="fa-solid fa-globe"></i> <span>EN</span> <i class="fa-solid fa-chevron-down"></i>`;
        document.body.appendChild(bar);

        // Hidden container Google Translate needs to attach its actual <select> to
        const container = document.createElement('div');
        container.id = 'google_translate_element';
        document.body.appendChild(container);

        bar.addEventListener('click', () => {
            // Once Google's widget has loaded, it renders a real <select> inside
            // #google_translate_element — clicking our button opens/focuses it.
            const select = container.querySelector('select.goog-te-combo');
            if (select) {
                select.focus();
                select.click();
            }
        });

        // Load the Google Translate script
        window.googleTranslateElementInit = function () {
            new google.translate.TranslateElement(
                { pageLanguage: 'en', autoDisplay: false },
                'google_translate_element'
            );
        };
        const script = document.createElement('script');
        script.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
        document.body.appendChild(script);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', buildSwitcher);
    } else {
        buildSwitcher();
    }
})();
