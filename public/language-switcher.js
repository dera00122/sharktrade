// language-switcher.js — full-site translation using Google's free Website Translator widget.
// Include this on any page with: <script src="language-switcher.js"></script>
//
// Placement: if the page has an element with id="langMenuSlot" (the hamburger/overlay
// menu on index.html has one), the switcher renders as a menu item there. Otherwise it
// falls back to a small floating pill in the top-left corner.

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
            #stLangMenuItem {
                display: flex; align-items: center; gap: 8px; cursor: pointer;
                color: inherit; font: inherit;
            }
            #stLangSwitcher i, #stLangMenuItem i { font-size: 0.75rem; }
            /* Hide Google's default banner/branding for a cleaner look */
            .goog-te-banner-frame, .skiptranslate > div:first-child { display: none !important; }
            body { top: 0 !important; }
            /* Positioned off-screen rather than display:none — a fully hidden element
               can't have its native dropdown opened programmatically, but an
               off-screen one still can. */
            #google_translate_element {
                position: absolute;
                top: -9999px;
                left: -9999px;
            }
            .goog-tooltip, .goog-tooltip:hover { display: none !important; }
            .goog-text-highlight { background: none !important; box-shadow: none !important; }
        `;
        document.head.appendChild(style);
    }

    function openTranslateDropdown(container) {
        const select = container.querySelector('select.goog-te-combo');
        if (select) {
            select.focus();
            select.click();
        }
    }

    function buildSwitcher() {
        injectStyles();

        // Hidden container Google Translate needs to attach its actual <select> to
        const container = document.createElement('div');
        container.id = 'google_translate_element';
        document.body.appendChild(container);

        const menuSlot = document.getElementById('langMenuSlot');
        if (menuSlot) {
            // Render as a menu item inside the existing hamburger/overlay menu
            menuSlot.innerHTML = `<i class="fa-solid fa-globe"></i> <span id="stLangMenuItem">Language: EN</span>`;
            menuSlot.style.cursor = 'pointer';
            menuSlot.addEventListener('click', () => openTranslateDropdown(container));
        } else {
            // Fallback: floating pill, top-left (only used on pages without a hamburger menu)
            const bar = document.createElement('div');
            bar.id = 'stLangSwitcher';
            bar.innerHTML = `<i class="fa-solid fa-globe"></i> <span>EN</span> <i class="fa-solid fa-chevron-down"></i>`;
            document.body.appendChild(bar);
            bar.addEventListener('click', () => openTranslateDropdown(container));
        }

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
