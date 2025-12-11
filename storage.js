// Storage helpers (global)
window.USER_STORAGE_KEY = 'chicago_ai_user_v1';
window.STORAGE_KEYS = {
    profile: 'chicago_ai_profile_v1',
    itinerary: 'chicago_ai_itinerary_v1',
    trips: 'chicago_ai_trips_v1',
    favorites: 'chicago_ai_favorites_v1',
    settings: 'chicago_ai_settings_v1'
};

window.DEFAULT_PROFILE = {
    startDate: null,
    endDate: null,
    likedTags: [],
    tempo: 50,
    price: 50,
    transportation: 50,
    tourGuide: false,
    avatarColor: '#EAB308',
    city: 'Chicago'
};

window.loadUser = function loadUser() {
    try {
        const raw = localStorage.getItem(window.USER_STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (e) { return null; }
};
window.saveUser = function saveUser(user) {
    if (!user) return;
    const safe = { ...user };
    delete safe.hash;
    delete safe.salt;
    try { localStorage.setItem(window.USER_STORAGE_KEY, JSON.stringify(safe)); } catch (e) {}
};

window.loadProfile = function loadProfile() {
    try {
        const raw = localStorage.getItem(window.STORAGE_KEYS.profile);
        if (!raw) return { ...window.DEFAULT_PROFILE };
        const saved = JSON.parse(raw);
        return { ...window.DEFAULT_PROFILE, ...saved };
    } catch (e) {
        return { ...window.DEFAULT_PROFILE };
    }
};
window.saveProfile = function saveProfile(profile) {
    try { localStorage.setItem(window.STORAGE_KEYS.profile, JSON.stringify(profile)); } catch (e) {}
};
window.saveItinerary = function saveItinerary(itinerary) {
    try { localStorage.setItem(window.STORAGE_KEYS.itinerary, JSON.stringify(itinerary)); } catch (e) {}
};
window.loadItinerary = function loadItinerary() {
    try {
        const raw = localStorage.getItem(window.STORAGE_KEYS.itinerary);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (e) { return null; }
};
window.loadTrips = function loadTrips() {
    try {
        const raw = localStorage.getItem(window.STORAGE_KEYS.trips);
        if (!raw) return [];
        return JSON.parse(raw);
    } catch (e) { return []; }
};
window.saveTrips = function saveTrips(trips) {
    try { localStorage.setItem(window.STORAGE_KEYS.trips, JSON.stringify(trips)); } catch (e) {}
};
window.loadFavorites = function loadFavorites() {
    try {
        const raw = localStorage.getItem(window.STORAGE_KEYS.favorites);
        if (!raw) return [];
        return JSON.parse(raw);
    } catch (e) { return []; }
};
window.saveFavorites = function saveFavorites(favs) {
    try { localStorage.setItem(window.STORAGE_KEYS.favorites, JSON.stringify(favs)); } catch (e) {}
};
window.loadSettingsStore = function loadSettingsStore() {
    try {
        const raw = localStorage.getItem(window.STORAGE_KEYS.settings);
        if (!raw) return { theme: 'gold', priceAlerts: false, weatherAlerts: false, dailyReminder: false };
        return JSON.parse(raw);
    } catch (e) {
        return { theme: 'gold', priceAlerts: false, weatherAlerts: false, dailyReminder: false };
    }
};
window.saveSettingsStore = function saveSettingsStore(data) {
    try { localStorage.setItem(window.STORAGE_KEYS.settings, JSON.stringify(data)); } catch (e) {}
};

const CHECKIN_KEY = 'planner_checkins_v1';
window.loadCheckins = () => { try { return JSON.parse(localStorage.getItem(CHECKIN_KEY)) || {}; } catch (e) { return {}; } };
window.saveCheckins = (data) => { try { localStorage.setItem(CHECKIN_KEY, JSON.stringify(data)); } catch (e) {} };

const BOOKINGS_KEY = 'planner_bookings_v1';
window.loadBookings = () => { try { return JSON.parse(localStorage.getItem(BOOKINGS_KEY)) || {}; } catch (e) { return {}; } };
window.saveBookings = (data) => { try { localStorage.setItem(BOOKINGS_KEY, JSON.stringify(data)); } catch (e) {} };
