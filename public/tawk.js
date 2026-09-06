// tawk.js — Tawk.to live chat widget embed.
//
// TO ACTIVATE:
// 1. Create a free account at https://www.tawk.to
// 2. Create a "Property" for this site — Tawk.to gives you a Property ID and Widget ID
// 3. Replace the two placeholder values below with your real IDs
// 4. Reload any page that includes this script (see bottom of <body> in dashboard.html,
//    index.html, support.html, etc.) — the chat bubble will appear automatically.
//
// Until you fill these in, this script does nothing (no bubble will show).

const TAWK_PROPERTY_ID = "REPLACE_WITH_YOUR_PROPERTY_ID";
const TAWK_WIDGET_ID = "REPLACE_WITH_YOUR_WIDGET_ID";

if (TAWK_PROPERTY_ID !== "REPLACE_WITH_YOUR_PROPERTY_ID" && TAWK_WIDGET_ID !== "REPLACE_WITH_YOUR_WIDGET_ID") {
    var Tawk_API = Tawk_API || {};
    var Tawk_LoadStart = new Date();
    (function () {
        var s1 = document.createElement("script");
        var s0 = document.getElementsByTagName("script")[0];
        s1.async = true;
        s1.src = `https://embed.tawk.to/${TAWK_PROPERTY_ID}/${TAWK_WIDGET_ID}`;
        s1.charset = "UTF-8";
        s1.setAttribute("crossorigin", "*");
        s0.parentNode.insertBefore(s1, s0);
    })();
} else {
    console.info("[tawk.js] Live chat is not active yet — add your Tawk.to Property ID and Widget ID in public/tawk.js to enable it.");
}
