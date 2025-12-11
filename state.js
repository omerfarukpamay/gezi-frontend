// Shared state and constants for the planner app
const initialProfile = window.loadProfile();

export const experiences = [
    { id: 1, title: "Luxury Helicopter Tour", category: "Adventure", price: 3, img: "https://images.unsplash.com/photo-1540962351504-03099e0a754b?q=80&fm=jpg&crop=entropy&cs=tinysrgb&w=600", tag: "luxury", details: "A 30-minute private helicopter ride offering unmatched views of the Magnificent Mile and Lake Michigan.", insta: "Best shot is the tilt-shift view looking straight down at The Loop. Use a wide-angle lens!", time: "10:00", duration: "45 min", lat: 41.8842, lng: -87.6258, requiresBooking: true },
    { id: 2, title: "Deep Dish Pizza (Lou Malnati's)", category: "Food", price: 2, img: "https://images.unsplash.com/photo-1619860167683-176375037549?q=80&fm=jpg&crop=entropy&cs=tinysrgb&w=600", tag: "food_mid", details: "Experience authentic Chicago-style deep-dish pizza. Recommended: Buttercrust with sausage.", insta: "Get a close-up of the cheese pull before you slice the pie! Make sure the tomato sauce looks vibrant.", time: "12:30", duration: "1 hr 15 min", lat: 41.8938, lng: -87.6276, requiresBooking: false },
    { id: 3, title: "Alinea (3-Star Michelin)", category: "Fine Dining", price: 3, img: "https://images.unsplash.com/photo-1559339352-11d035aa65de?q=80&fm=jpg&crop=entropy&cs=tinysrgb&w=600", tag: "luxury_food", details: "World-renowned culinary experience. This is an evening activity requiring formal attire and advance booking.", insta: "Capture the artistic presentation of the floating dessert course. Use soft, directional lighting.", time: "19:00", duration: "3 hr", lat: 41.9161, lng: -87.6483, requiresBooking: true }
];

export const CITY_OPTIONS = [
    { id: 'chicago', label: 'Chicago', region: 'Illinois, USA' }
];

export const state = {
    currentUser: null,
    userProfile: initialProfile,
    selectedDates: [],
    likedTags: [...(initialProfile.likedTags || [])],
    userBudgetScore: 0,
    currentIndex: 0,
    userPreferences: {
        tempo: initialProfile.tempo,
        price: initialProfile.price,
        transportation: initialProfile.transportation,
        tourGuide: initialProfile.tourGuide
    },
    evaluationSetupDone: false,
    currentDayMapData: { dayNumber: 1, activities: [] },
    currentItinerary: null,
    tripDates: [],
    authMode: 'login',
    favorites: window.loadFavorites(),
    settingsStore: window.loadSettingsStore(),
    lastAiContext: null,
    assistantOpen: false,
    assistantFullscreen: false,
    assistantState: 'mid',
    assistantChatMode: false,
    assistantDragStartY: null,
    assistantDragActive: false,
    assistantMode: 'idle',
    assistantSelectedActivity: null,
    assistantPendingSave: false,
    assistantLastChangeMessage: '',
    assistantLastSnapshot: null,
    activeDayIndex: 0,
    dayMapInstance: null,
    dayMapMarkers: null,
    checkins: window.loadCheckins(),
    bookings: window.loadBookings(),
    changeHistory: {}
};

export const cleanText = (str) => (str || '').replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim();
export const cleanTextMultiline = (str) => (str || '').replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ' ').replace(/[ ]{2,}/g, ' ').trim();
export const timeToMinutes = (timeStr) => {
    if (!timeStr || typeof timeStr !== 'string') return null;
    const match = timeStr.trim().match(/(\d{1,2}):(\d{2})/);
    if (!match) return null;
    return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
};
export const durationToMinutes = (str) => {
    if (!str) return 60;
    const m = String(str).match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 60;
};

export const saveCheckins = window.saveCheckins;

const bindGlobal = (key) => {
    Object.defineProperty(globalThis, key, {
        configurable: true,
        enumerable: true,
        get() { return state[key]; },
        set(v) { state[key] = v; }
    });
};

[
    'currentUser',
    'userProfile',
    'selectedDates',
    'likedTags',
    'userBudgetScore',
    'currentIndex',
    'userPreferences',
    'evaluationSetupDone',
    'currentDayMapData',
    'currentItinerary',
    'tripDates',
    'authMode',
    'favorites',
    'settingsStore',
    'lastAiContext',
    'assistantOpen',
    'assistantFullscreen',
    'assistantState',
    'assistantChatMode',
    'assistantDragStartY',
    'assistantDragActive',
    'assistantMode',
    'assistantSelectedActivity',
    'assistantPendingSave',
    'assistantLastChangeMessage',
    'assistantLastSnapshot',
    'activeDayIndex',
    'dayMapInstance',
    'dayMapMarkers',
    'checkins',
    'bookings',
    'changeHistory'
].forEach(bindGlobal);
