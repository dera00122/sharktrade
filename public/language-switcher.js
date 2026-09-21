// language-switcher.js — real Google Translate widget, shown visibly (not hidden).
//
// Earlier attempts tried to hide Google's dropdown and open it programmatically from a
// custom button — mobile browsers block that as an anti-abuse measure, which is why it
// silently did nothing. The fix: let Google's own dropdown render for real and be tapped
// directly. Once picked, Google stores the choice in a cookie and every page on this site
// auto-applies it on load — no new tab, no lost login session, works everywhere.
//
// Placement: if the page has an element with id="langMenuSlot" (index.html's hamburger
// menu), the real widget renders there. Otherwise it renders as a slim bar across the very
// top of the page (content shifts down to make room) — this works on every inner page
// regardless of what's already sitting in the top-left or top-right corner.

(function () {
    function injectStyles() {
        if (document.getElementById('stLangStyles')) return;
        const style = document.createElement('style');
        style.id = 'stLangStyles';
        style.textContent = `
            /* Hide Google's top banner iframe (the thing that pushes page content down)
               and its branding link — keep only the actual language <select>. */
            .goog-te-banner-frame { display: none !important; }
            body { top: 0 !important; }
            .goog-logo-link { display: none !important; }

            #stLangBox {
                position: fixed; top: 0; left: 0; right: 0; z-index: 9996;
                height: 34px; background: #0d0f12; border-bottom: 1px solid rgba(255,255,255,0.1);
                display: flex; align-items: center; justify-content: flex-end;
                padding: 0 16px; font-family: 'Segoe UI', sans-serif;
            }
            body.st-lang-padded { padding-top: 34px; }
            #stLangBox i { color: #c8a86a; font-size: 0.8rem; margin-right: 6px; }
            #stLangBox .goog-te-combo {
                border: none; outline: none; background: transparent;
                font-family: 'Segoe UI', sans-serif; font-weight: 700; font-size: 0.8rem;
                color: #ccc; cursor: pointer;
            }

            #langMenuSlot .goog-te-combo {
                background: transparent; color: #FFFFFF; border: none; outline: none;
                font-family: 'Segoe UI', sans-serif; font-weight: 400; font-size: 2.2rem;
                letter-spacing: -0.5px; cursor: pointer; width: 100%;
            }
            #langMenuSlot .goog-te-combo option { color: #000; font-size: 1rem; }
        `;
        document.head.appendChild(style);
    }

    function buildSwitcher() {
        injectStyles();

        const menuSlot = document.getElementById('langMenuSlot');
        let hostEl;

        if (menuSlot) {
            hostEl = menuSlot;
            hostEl.innerHTML = `<i class="fa-solid fa-globe"></i> `;
        } else {
            hostEl = document.createElement('div');
            hostEl.id = 'stLangBox';
            hostEl.innerHTML = `<i class="fa-solid fa-globe"></i>`;
            document.body.appendChild(hostEl);
            document.body.classList.add('st-lang-padded');
        }

        const widgetContainer = document.createElement('div');
        widgetContainer.id = 'google_translate_element';
        hostEl.appendChild(widgetContainer);

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
