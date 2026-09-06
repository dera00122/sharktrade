// api.js — shared fetch helper for the SharkTrade Pro demo frontend.
// All pages load this before their own inline script.

const API_BASE = ""; // same-origin, since Express serves the frontend too

function getToken() {
    return localStorage.getItem("st_token");
}

function setSession(token, user) {
    localStorage.setItem("st_token", token);
    localStorage.setItem("st_user", JSON.stringify(user));
}

function clearSession() {
    localStorage.removeItem("st_token");
    localStorage.removeItem("st_user");
}

function getCachedUser() {
    try {
        return JSON.parse(localStorage.getItem("st_user") || "null");
    } catch {
        return null;
    }
}

// Redirect to login if no token present. Call at the top of any protected page.
function requireLogin() {
    if (!getToken()) {
        window.location.href = "login.html";
        return false;
    }
    return true;
}

// Redirect to dashboard/admin if page requires admin role and user isn't one.
function requireAdminRole() {
    const user = getCachedUser();
    if (!getToken() || !user || user.role !== "admin") {
        window.location.href = "login.html";
        return false;
    }
    return true;
}

async function apiRequest(path, { method = "GET", body, auth = true } = {}) {
    const headers = { "Content-Type": "application/json" };
    if (auth) {
        const token = getToken();
        if (token) headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(API_BASE + path, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
    });

    let data = null;
    try { data = await res.json(); } catch { /* no body */ }

    if (res.status === 401) {
        clearSession();
        window.location.href = "login.html";
        throw new Error("Session expired");
    }

    if (!res.ok) {
        throw new Error((data && data.error) || `Request failed (${res.status})`);
    }

    return data;
}

async function apiUpload(path, formData) {
    const headers = {};
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(API_BASE + path, {
        method: "POST",
        headers,
        body: formData
    });

    let data = null;
    try { data = await res.json(); } catch { /* no body */ }

    if (res.status === 401) {
        clearSession();
        window.location.href = "login.html";
        throw new Error("Session expired");
    }
    if (!res.ok) {
        throw new Error((data && data.error) || `Upload failed (${res.status})`);
    }
    return data;
}

function formatMoney(n) {
    const num = Number(n) || 0;
    return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso.replace(" ", "T") + "Z");
    return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}
