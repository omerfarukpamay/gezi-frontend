// API helpers (global)
window.API_BASE = 'https://gezi-backend.onrender.com';

window.getAuthToken = function getAuthToken() {
    try { return sessionStorage.getItem('auth_token'); } catch (e) { return null; }
};

window.setSessionToken = function setSessionToken(token) {
    try {
        let toStore = token;
        if (!toStore) {
            const arr = new Uint8Array(16);
            crypto.getRandomValues(arr);
            toStore = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
        }
        if (toStore) sessionStorage.setItem('auth_token', toStore);
        return toStore;
    } catch (e) { return null; }
};

window.clearSessionToken = function clearSessionToken() {
    try { sessionStorage.removeItem('auth_token'); } catch (e) {}
};

window.apiRequest = async function apiRequest(path, { method = 'GET', body } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    const token = window.getAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${window.API_BASE}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const msg = data?.error || data?.message || `Request failed (${res.status})`;
        throw new Error(msg);
    }
    return data;
};
