/* --------- DATA: 3 TEST EXPERIENCES ---------- */
    const experiences = [
        { id: 1, title: "Luxury Helicopter Tour", category: "Adventure", price: 3, img: "https://images.unsplash.com/photo-1540962351504-03099e0a754b?q=80&fm=jpg&crop=entropy&cs=tinysrgb&w=600", tag: "luxury", details: "A 30-minute private helicopter ride offering unmatched views of the Magnificent Mile and Lake Michigan.", insta: "Best shot is the tilt-shift view looking straight down at The Loop. Use a wide-angle lens!", time: "10:00", duration: "45 min", lat: 41.8842, lng: -87.6258 },
        { id: 2, title: "Deep Dish Pizza (Lou Malnati's)", category: "Food", price: 2, img: "https://images.unsplash.com/photo-1619860167683-176375037549?q=80&fm=jpg&crop=entropy&cs=tinysrgb&w=600", tag: "food_mid", details: "Experience authentic Chicago-style deep-dish pizza. Recommended: Buttercrust with sausage.", insta: "Get a close-up of the cheese pull before you slice the pie! Make sure the tomato sauce looks vibrant.", time: "12:30", duration: "1 hr 15 min", lat: 41.8938, lng: -87.6276 },
        { id: 3, title: "Alinea (3-Star Michelin)", category: "Fine Dining", price: 3, img: "https://images.unsplash.com/photo-1559339352-11d035aa65de?q=80&fm=jpg&crop=entropy&cs=tinysrgb&w=600", tag: "luxury_food", details: "World-renowned culinary experience. This is an evening activity requiring formal attire and advance booking.", insta: "Capture the artistic presentation of the floating dessert course. Use soft, directional lighting.", time: "19:00", duration: "3 hr", lat: 41.9161, lng: -87.6483 }
    ];

    const USER_STORAGE_KEY = 'chicago_ai_user_v1';
    const STORAGE_KEYS = {
        profile: 'chicago_ai_profile_v1',
        itinerary: 'chicago_ai_itinerary_v1',
        trips: 'chicago_ai_trips_v1',
        favorites: 'chicago_ai_favorites_v1',
        settings: 'chicago_ai_settings_v1'
    };

    const DEFAULT_PROFILE = {
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

    const CITY_OPTIONS = [
        { id: 'chicago', label: 'Chicago', region: 'Illinois, USA' }
    ];

    /* ---------- LOCAL STORAGE HELPERS ---------- */
    function loadUser() {
        try {
            const raw = localStorage.getItem(USER_STORAGE_KEY);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (e) { return null; }
    }
    function saveUser(user) {
        if (!user) return;
        // avoid storing sensitive fields
        const safe = { ...user };
        delete safe.hash;
        delete safe.salt;
        try { localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(safe)); } catch (e) {}
    }
    const API_BASE = 'https://gezi-backend.onrender.com';

    function getAuthToken() {
        try { return sessionStorage.getItem('auth_token'); } catch (e) { return null; }
    }
    function setSessionToken(token) {
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
    }
    function clearSessionToken() {
        try { sessionStorage.removeItem('auth_token'); } catch (e) {}
    }

    async function apiRequest(path, { method = 'GET', body } = {}) {
        const headers = { 'Content-Type': 'application/json' };
        const token = getAuthToken();
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch(`${API_BASE}${path}`, {
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
    }

    async function hydrateSessionFromToken() {
        const token = getAuthToken();
        if (!token) return false;
        try {
            const { user } = await apiRequest('/api/me');
            currentUser = user;
            saveUser(user);
            return true;
        } catch (e) {
            clearSessionToken();
            return false;
        }
    }

    function loadProfile() {
        try {
            const raw = localStorage.getItem(STORAGE_KEYS.profile);
            if (!raw) return { ...DEFAULT_PROFILE };
            const saved = JSON.parse(raw);
            return { ...DEFAULT_PROFILE, ...saved };
        } catch (e) {
            return { ...DEFAULT_PROFILE };
        }
    }
    function saveProfile(profile) {
        try { localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(profile)); } catch (e) {}
    }
    function saveItinerary(itinerary) {
        try { localStorage.setItem(STORAGE_KEYS.itinerary, JSON.stringify(itinerary)); } catch (e) {}
    }
    function loadItinerary() {
        try {
            const raw = localStorage.getItem(STORAGE_KEYS.itinerary);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (e) { return null; }
    }
    function loadTrips() {
        try {
            const raw = localStorage.getItem(STORAGE_KEYS.trips);
            if (!raw) return [];
            return JSON.parse(raw);
        } catch (e) { return []; }
    }
    function saveTrips(trips) {
        try { localStorage.setItem(STORAGE_KEYS.trips, JSON.stringify(trips)); } catch (e) {}
    }
    function loadFavorites() {
        try {
            const raw = localStorage.getItem(STORAGE_KEYS.favorites);
            if (!raw) return [];
            return JSON.parse(raw);
        } catch (e) { return []; }
    }
    function saveFavorites(favs) {
        try { localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify(favs)); } catch (e) {}
    }
    function loadSettingsStore() {
        try {
            const raw = localStorage.getItem(STORAGE_KEYS.settings);
            if (!raw) return { theme: 'gold', priceAlerts: false, weatherAlerts: false, dailyReminder: false };
            return JSON.parse(raw);
        } catch (e) {
            return { theme: 'gold', priceAlerts: false, weatherAlerts: false, dailyReminder: false };
        }
    }
    function saveSettingsStore(data) {
        try { localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(data)); } catch (e) {}
    }

    let currentUser = null;
    let userProfile = loadProfile();

    let selectedDates = [];
    let likedTags = [...(userProfile.likedTags || [])];
    let userBudgetScore = 0;
    let currentIndex = 0;

    let userPreferences = {
        tempo: userProfile.tempo,
        price: userProfile.price,
        transportation: userProfile.transportation,
        tourGuide: userProfile.tourGuide
    };

    let evaluationSetupDone = false;
    let currentDayMapData = { dayNumber: 1, activities: [] };
    let currentItinerary = null;
    let tripDates = [];
    let authMode = 'login';
    let toastTimeout = null;
    let favorites = loadFavorites();
    let settingsStore = loadSettingsStore();
    let lastAiContext = null;
    let assistantOpen = false;
    let assistantFullscreen = false;
    let assistantDragStartY = null;
    let assistantDragActive = false;
    let dayMapInstance = null;
    let dayMapMarkers = null;
    const CHECKIN_KEY = 'planner_checkins_v1';
    const loadCheckins = () => { try { return JSON.parse(localStorage.getItem(CHECKIN_KEY)) || {}; } catch (e) { return {}; } };
    const saveCheckins = (data) => { try { localStorage.setItem(CHECKIN_KEY, JSON.stringify(data)); } catch (e) {} };
    let checkins = loadCheckins();

    const cleanText = (str) => (str || '').replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim();
    const cleanTextMultiline = (str) => (str || '').replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ' ').replace(/[ ]{2,}/g, ' ').trim();
    const timeToMinutes = (timeStr) => {
        if (!timeStr || typeof timeStr !== 'string') return null;
        const match = timeStr.trim().match(/(\d{1,2}):(\d{2})/);
        if (!match) return null;
        return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
    };
    const durationToMinutes = (str) => {
        if (!str) return 60;
        const m = String(str).match(/(\d+)/);
        return m ? parseInt(m[1], 10) : 60;
    };

    function getDayStopsWithStatus(dayNumber) {
        const day = currentItinerary && currentItinerary[dayNumber - 1];
        if (!day || !Array.isArray(day)) return [];
        return day.map((a, idx) => {
            const completed = !!checkins[`${dayNumber}-${a.id}-completed`];
            const arrived = !!checkins[`${dayNumber}-${a.id}`];
            return { ...a, idx, completed, arrived };
        });
    }

    function getNextStopFromContext(dayNumber, currentActivityId) {
        const stops = getDayStopsWithStatus(dayNumber);
        if (!stops.length) return null;
        let startIdx = 0;
        if (currentActivityId !== undefined && currentActivityId !== null) {
            const idx = stops.findIndex(s => s.id === currentActivityId);
            if (idx >= 0) startIdx = idx + 1;
        }
        return stops.slice(startIdx).find(s => !s.completed) || stops.find(s => !s.completed) || null;
    }

    function buildDaySummary(stops) {
        return stops.map(s => `${s.completed ? '(done) ' : ''}${s.title}${s.time ? ` @ ${s.time}` : ''}`).join('; ');
    }

    function buildDayScheduleDetailed(stops) {
        return stops.map(s => {
            const status = s.completed ? 'done' : s.arrived ? 'arrived' : 'pending';
            const when = s.time || 'TBD';
            const dur = s.duration || 'n/a';
            return `${status}: ${s.title} @ ${when} (dur ${dur})`;
        }).join(' | ');
    }

    function swapCurrentToTomorrow(dayNumber, activityId) {
        if (!currentItinerary || !currentItinerary.length) {
            showToast('No itinerary to edit.', 'error');
            return;
        }
        const dayIdx = dayNumber - 1;
        const today = currentItinerary[dayIdx];
        if (!Array.isArray(today)) {
            showToast('Cannot find today\'s plan.', 'error');
            return;
        }
        const actIdx = today.findIndex(a => a.id === activityId);
        if (actIdx === -1) {
            showToast('Activity not found.', 'error');
            return;
        }
        const activity = today.splice(actIdx, 1)[0];

        // Push to tomorrow (create if missing)
        const tomorrowIdx = dayIdx + 1;
        if (!currentItinerary[tomorrowIdx]) currentItinerary[tomorrowIdx] = [];
        currentItinerary[tomorrowIdx].push(activity);

        // Add a simple indoor placeholder for today
        const indoor = {
            id: Date.now(),
            title: 'Indoor alternative (swap)',
            time: activity.time || 'TBD',
            duration: activity.duration || '1 hr',
            details: 'Indoor option added after swap.',
            insta: 'Capture a cozy indoor moment.'
        };
        today.splice(actIdx, 0, indoor);

        saveItinerary(currentItinerary);
        renderItineraryUI(currentItinerary, tripDates || []);
        showToast('Swapped and moved to tomorrow. Refresh chat for updated context.', 'success');
    }

    function isOutdoor(activity) {
        const cat = (activity?.category || '').toLowerCase();
        const tag = (activity?.tag || '').toLowerCase();
        const details = (activity?.details || '').toLowerCase();
        const outdoorHints = ['adventure', 'park', 'outdoor', 'nature', 'sight', 'walk', 'boat', 'tour', 'view'];
        return outdoorHints.some(h => cat.includes(h) || tag.includes(h) || details.includes(h));
    }

    function buildChatContext(dayNumber, activity, status, timingNote, arrivalIso) {
        const stops = getDayStopsWithStatus(dayNumber);
        const nextStop = getNextStopFromContext(dayNumber, activity ? activity.id : null);
        const completedTitles = stops.filter(s => s.completed).map(s => s.title);
        const dayDate = tripDates && tripDates[dayNumber - 1] ? new Date(tripDates[dayNumber - 1]) : new Date();
        const weather = simulateWeather(dayDate);
        const weatherDesc = `${weather.desc} ${weather.temp}`.replace(/AøC/g, '°C');
        return {
            status,
            dayNumber,
            activityId: activity?.id,
            activityTitle: activity?.title,
            activityTime: activity?.time,
            activityDuration: activity?.duration,
            activityDetails: activity?.details,
            insta: activity?.insta,
            timingNote,
            arrivalIso,
            nextStopTitle: nextStop?.title,
            nextStopTime: nextStop?.time,
            nextStopDuration: nextStop?.duration,
            daySummary: buildDaySummary(stops),
            dayScheduleDetail: buildDayScheduleDetailed(stops),
            completedTitles,
            weatherDesc,
            isCurrentOutdoor: isOutdoor(activity),
            isNextOutdoor: isOutdoor(nextStop)
        };
    }

    /* ---------- TOAST ---------- */
    function showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        if (!toast) return;
        toast.textContent = message;
        toast.className = '';
        toast.classList.add(type);
        toast.classList.add('show');
        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 2800);
    }

    /* ---------- ASSISTANT & CHAT (AI toggle gated) ---------- */
    function updateAiUiVisibility() {
        const drawer = document.getElementById('assistantDrawer');
        const fab = document.getElementById('chatFab');
        const modal = document.getElementById('chatModal');
        const shouldShow = !!userProfile.tourGuide;
        if (drawer) drawer.style.display = shouldShow ? 'flex' : 'none';
        if (fab) fab.style.display = 'flex';
        if (!shouldShow && modal) modal.classList.remove('open');
    }

    function showAssistant(messageHtml = 'Assistant is standing by.') {
        if (!userProfile.tourGuide) return;
        const drawer = document.getElementById('assistantDrawer');
        const content = document.getElementById('assistantContent');
        const actions = document.getElementById('assistantActions');
        if (!drawer || !content) return;
        content.innerHTML = messageHtml;
        if (actions) actions.innerHTML = '';
        drawer.style.display = 'flex';
        drawer.classList.remove('collapsed', 'fullscreen');
        drawer.classList.add('open');
        assistantOpen = true;
        assistantFullscreen = false;
    }

    function hideAssistant() {
        const drawer = document.getElementById('assistantDrawer');
        if (!drawer) return;
        drawer.classList.remove('open', 'fullscreen');
        drawer.classList.add('collapsed');
        drawer.style.display = 'flex';
        assistantOpen = false;
        assistantFullscreen = false;
    }

    function renderAssistantState(context = {}) {
        if (!userProfile.tourGuide) return;
        const drawer = document.getElementById('assistantDrawer');
        const content = document.getElementById('assistantContent');
        const actions = document.getElementById('assistantActions');
        if (!drawer || !content || !actions) return;

        const { current, next, later, summary } = context;

        let routeHtml = '';
        if (current || next || (later && later.length)) {
            routeHtml += '<div class="assistant-route">';
            if (current) routeHtml += `<div class="assistant-stop"><span class="assistant-stop badge">Now</span><div><strong>${current.title}</strong><br><span>${current.time || 'TBD'} • ${current.duration || ''}</span></div></div>`;
            if (next) routeHtml += `<div class="assistant-stop"><span class="assistant-stop badge">Next</span><div><strong>${next.title}</strong><br><span>${next.time || 'TBD'} • ${next.duration || ''}</span></div></div>`;
            if (later && later.length) {
                later.slice(0,2).forEach((item, idx) => {
                    routeHtml += `<div class="assistant-stop"><span class="assistant-stop badge">L${idx+1}</span><div><strong>${item.title}</strong><br><span>${item.time || 'TBD'} • ${item.duration || ''}</span></div></div>`;
                });
            }
            routeHtml += '</div>';
        } else {
            routeHtml = '<div class="assistant-route">No active stops. Generate a plan first.</div>';
        }

        content.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:6px;">
                <div><strong>Route focus</strong></div>
                <button class="assistant-close" style="padding:4px 8px;" onclick="showAssistant()">Reset</button>
            </div>
            ${routeHtml}
            <div style="margin-top:6px; font-size:0.86rem; color: var(--secondary-text);">${summary || 'Tap an action below to tweak your day.'}</div>
        `;

        actions.innerHTML = `
            <button class="assistant-chip" onclick="skipNextStop(this)">Skip next</button>
            <button class="assistant-chip" onclick="moveNextToTomorrow(this)">Move next to tomorrow</button>
            <button class="assistant-chip" onclick="suggestNearbyFood(this)">Nearby food</button>
            <button class="assistant-chip" onclick="summarizeToday(this)">Summarize today</button>
            <button class="assistant-chip" onclick="openChatModal()">Ask the assistant</button>
        `;
    }

    function expandAssistantFull() {
        const drawer = document.getElementById('assistantDrawer');
        if (!drawer) return;
        drawer.style.transition = '';
        drawer.style.transform = '';
        drawer.style.display = 'flex';
        drawer.classList.remove('collapsed');
        drawer.classList.add('open', 'fullscreen');
        assistantOpen = true;
        assistantFullscreen = true;
    }

    function dockAssistant() {
        const drawer = document.getElementById('assistantDrawer');
        if (!drawer) return;
        drawer.style.transition = '';
        drawer.style.transform = '';
        drawer.classList.remove('fullscreen', 'open');
        drawer.classList.add('collapsed');
        drawer.style.display = 'flex';
        assistantOpen = false;
        assistantFullscreen = false;
    }

    function handleAssistantTap(event) {
        const drawer = document.getElementById('assistantDrawer');
        if (!drawer) return;
        if (event.target.closest('button')) return;
        if (!assistantOpen) {
            showAssistant();
            renderAssistantState(buildAssistantContext());
            expandAssistantFull();
            return;
        }
        if (assistantFullscreen) {
            dockAssistant();
        } else {
            expandAssistantFull();
        }
    }

    function handleAssistantPointerStart(y) {
        if (!assistantOpen || !assistantFullscreen) return;
        assistantDragStartY = y;
        assistantDragActive = true;
        const drawer = document.getElementById('assistantDrawer');
        if (drawer) {
            drawer.style.transition = 'transform 0s';
        }
    }

    function handleAssistantPointerMove(y) {
        if (!assistantDragActive || assistantDragStartY === null) return;
        const drawer = document.getElementById('assistantDrawer');
        if (!drawer) return;
        const delta = Math.max(0, y - assistantDragStartY);
        drawer.style.transform = `translateY(${delta}px)`;
    }

    function handleAssistantPointerEnd(y) {
        if (!assistantDragActive || assistantDragStartY === null) {
            assistantDragActive = false;
            assistantDragStartY = null;
            return;
        }
        const delta = Math.max(0, y - assistantDragStartY);
        assistantDragActive = false;
        assistantDragStartY = null;
        const drawer = document.getElementById('assistantDrawer');
        if (drawer) {
            drawer.style.transition = '';
            drawer.style.transform = '';
        }
        if (delta > 60) {
            dockAssistant();
        } else {
            expandAssistantFull();
        }
        renderAssistantState(buildAssistantContext());
    }

    function handleAssistantTouchStart(e) {
        const y = e.touches?.[0]?.clientY;
        if (y !== undefined) handleAssistantPointerStart(y);
    }

    function handleAssistantTouchMove(e) {
        const y = e.touches?.[0]?.clientY;
        if (y !== undefined) handleAssistantPointerMove(y);
    }

    function handleAssistantTouchEnd(e) {
        const y = e.changedTouches?.[0]?.clientY;
        if (y !== undefined) handleAssistantPointerEnd(y);
    }

    function handleAssistantMouseDown(e) {
        handleAssistantPointerStart(e.clientY);
    }

    function handleAssistantMouseMove(e) {
        handleAssistantPointerMove(e.clientY);
    }

    function handleAssistantMouseUp(e) {
        handleAssistantPointerEnd(e.clientY);
    }

    function appendChatBubble(text, isUser = false) {
        const container = document.getElementById('chatMessages');
        if (!container) return;
        const div = document.createElement('div');
        div.className = `chat-bubble ${isUser ? 'me' : 'ai'}`;

        const content = document.createElement('div');
        content.className = 'bubble-text';
        content.textContent = text;

        div.appendChild(content);
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    }

    function openChatModal() {
        const modal = document.getElementById('chatModal');
        if (modal) modal.classList.add('open');
    }

    function closeChatModal() {
        const modal = document.getElementById('chatModal');
        if (modal) modal.classList.remove('open');
    }

    function toggleChatSize() {
        const modal = document.getElementById('chatModal');
        if (!modal) return;
        modal.classList.toggle('expanded');
    }

    function sendChatMessage() {
        if (!userProfile.tourGuide) return;
        const input = document.getElementById('chatInput');
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;
        appendChatBubble(text, true);
        input.value = '';
        sendChatPrompt(text);
    }

    function handleChatKeydown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendChatMessage();
        }
    }

    function buildAssistantContext() {
        const firstDay = currentItinerary && currentItinerary[0] ? currentItinerary[0] : [];
        const current = firstDay[0] || null;
        const next = firstDay[1] || null;
        const later = firstDay.slice(2);
        const summary = next ? `Next: ${next.title} @ ${next.time || 'TBD'}.` : 'Route ready.';
        return { current, next, later, summary };
    }

    function flashChip(el) {
        if (!el) return;
        el.classList.remove('flash');
        void el.offsetWidth;
        el.classList.add('flash');
    }

    function skipNextStop(el) {
        if (!currentItinerary || !currentItinerary.length) { showToast('No itinerary yet.', 'info'); return; }
        if (currentItinerary[0].length > 1) {
            currentItinerary[0].splice(1,1);
            saveItinerary(currentItinerary);
            renderItineraryUI(currentItinerary, tripDates);
            renderAssistantState(buildAssistantContext());
            showToast('Next stop skipped.', 'info');
            flashChip(el);
        } else {
            showToast('No next stop to skip.', 'info');
        }
    }

    function moveNextToTomorrow(el) {
        if (!currentItinerary || currentItinerary.length < 2) { showToast('Need at least 2 days.', 'info'); return; }
        const day1 = currentItinerary[0];
        const day2 = currentItinerary[1];
        if (day1.length > 1) {
            const moved = day1.splice(1,1)[0];
            day2.unshift(moved);
            saveItinerary(currentItinerary);
            renderItineraryUI(currentItinerary, tripDates);
            renderAssistantState(buildAssistantContext());
            showToast('Moved next stop to tomorrow.', 'success');
            flashChip(el);
        } else {
            showToast('No next stop to move.', 'info');
        }
    }

    function suggestNearbyFood(el) {
        if (!currentItinerary || !currentItinerary.length) { showToast('No itinerary yet.', 'info'); return; }
        const all = currentItinerary.flat();
        const food = all.find(a => (a.category || '').toLowerCase().includes('food')) || all[0];
        if (food) {
            const msg = `<strong>Try nearby:</strong> ${food.title} (${food.category || ''}). Ask for more options in chat.`;
            showAssistant(msg);
            renderAssistantState(buildAssistantContext());
            flashChip(el);
        }
    }

    function summarizeToday(el) {
        if (!currentItinerary || !currentItinerary.length) { showToast('No itinerary yet.', 'info'); return; }
        const today = currentItinerary[0];
        const lines = today.slice(0,4).map((a,i) => `${i+1}. ${a.title}${a.time ? ' @ ' + a.time : ''}`);
        showAssistant(`<strong>Today:</strong><br>${lines.join('<br>')}`);
        renderAssistantState(buildAssistantContext());
        flashChip(el);
    }

    function sendChatMessage() {
        const input = document.getElementById('chatInput');
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;
        appendChatBubble(text, true);
        input.value = '';
        sendChatPrompt(text);
    }

    function handleChatKeydown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendChatMessage();
        }
    }

    /* ---------- ASSISTANT GESTURE BINDINGS ---------- */
    document.addEventListener('DOMContentLoaded', async () => {
        const assistantDrawer = document.getElementById('assistantDrawer');
        if (assistantDrawer) {
            assistantDrawer.addEventListener('click', handleAssistantTap);
            assistantDrawer.addEventListener('touchstart', handleAssistantTouchStart);
            assistantDrawer.addEventListener('touchmove', handleAssistantTouchMove);
            assistantDrawer.addEventListener('touchend', handleAssistantTouchEnd);
            assistantDrawer.addEventListener('mousedown', handleAssistantMouseDown);
            assistantDrawer.addEventListener('mousemove', handleAssistantMouseMove);
            assistantDrawer.addEventListener('mouseup', handleAssistantMouseUp);
        }
    });

    /* ---------- CITY & START CONTROL ---------- */
    function populateCityOptions() {
        const dataList = document.getElementById('cityOptions');
        if (!dataList) return;
        dataList.innerHTML = CITY_OPTIONS.map(city => `<option value="${city.label}">${city.region}</option>`).join('');
    }

    function populateCitySelect() {
        const select = document.getElementById('citySelector');
        if (!select) return;
        select.innerHTML = CITY_OPTIONS.map(city => `<option value="${city.label}">${city.label}</option>`).join('');
    }

    function handleCityInput(value) {
        const trimmed = (value || '').trim();
        const match = CITY_OPTIONS.find(c => c.label.toLowerCase() === trimmed.toLowerCase());
        if (match) {
            userProfile.city = match.label;
        } else {
            userProfile.city = trimmed;
        }
        saveProfile(userProfile);
        updateStartButtonState();
    }

    function initCitySelector() {
        populateCityOptions();
        populateCitySelect();
        const input = document.getElementById('citySelector');
        if (!input) return;
        input.value = userProfile.city || CITY_OPTIONS[0].label;
        handleCityInput(input.value);
        input.addEventListener('input', (e) => handleCityInput(e.target.value));
        input.addEventListener('change', (e) => handleCityInput(e.target.value));
    }

    function isStartReady() {
        return selectedDates.length === 2 && !!(userProfile.city && userProfile.city.trim());
    }

    function updateStartButtonState() {
        const startBtn = document.getElementById('startBtn');
        if (startBtn) startBtn.disabled = !isStartReady();
    }

    /* ---------- PASSWORD VISIBILITY ---------- */
    function initPasswordToggles() {
        document.querySelectorAll('.toggle-visibility').forEach(btn => {
            btn.addEventListener('click', () => {
                const targetId = btn.getAttribute('data-target');
                const input = document.getElementById(targetId);
                if (!input) return;
                const isPassword = input.type === 'password';
                input.type = isPassword ? 'text' : 'password';
                btn.innerHTML = `<i class="fa-solid ${isPassword ? 'fa-eye-slash' : 'fa-eye'}"></i>`;
            });
        });
    }

    /* ---------- THEME & SETTINGS ---------- */
    function applyTheme(theme, persist = false) {
        const root = document.documentElement;
        const themes = {
            gold: {
                '--primary-bg': '#050816',
                '--card-surface': '#0F172A',
                '--accent-gold': '#FACC15',
                '--accent-cyan': '#67E8F9',
                '--primary-text': '#F7F9FB',
                '--secondary-text': '#9CA3AF',
                '--muted-text': '#6B7280',
                '--btn-bg-start': '#FACC15',
                '--btn-bg-end': '#F4B400',
                '--btn-text': '#030712',
                '--btn-shadow': '0 10px 18px rgba(250, 204, 21, 0.28)',
                '--btn-shadow-strong': '0 14px 26px rgba(250, 204, 21, 0.38)'
            },
            emerald: {
                '--primary-bg': '#041410',
                '--card-surface': '#0a1f1a',
                '--accent-gold': '#34d399',
                '--accent-cyan': '#22d3ee',
                '--primary-text': '#e4f5ef',
                '--secondary-text': '#8abfaf',
                '--muted-text': '#6b9080',
                '--btn-bg-start': '#6ee7b7',
                '--btn-bg-end': '#34d399',
                '--btn-text': '#052018',
                '--btn-shadow': '0 14px 24px rgba(52, 211, 153, 0.35)',
                '--btn-shadow-strong': '0 18px 34px rgba(52, 211, 153, 0.45)'
            },
            sunset: {
                '--primary-bg': '#160814',
                '--card-surface': '#1f0f24',
                '--accent-gold': '#fca5a5',
                '--accent-cyan': '#a855f7',
                '--primary-text': '#f5e7ff',
                '--secondary-text': '#d6b8f2',
                '--muted-text': '#9d89b5',
                '--btn-bg-start': '#fca5a5',
                '--btn-bg-end': '#c084fc',
                '--btn-text': '#2a0c1d',
                '--btn-shadow': '0 14px 24px rgba(240, 171, 252, 0.32)',
                '--btn-shadow-strong': '0 18px 34px rgba(240, 171, 252, 0.42)'
            },
            liquid: {
                '--primary-bg': '#030712',
                '--card-surface': 'rgba(10, 20, 35, 0.24)',
                '--accent-gold': '#8fd3ff',
                '--accent-cyan': '#b7c5ff',
                '--primary-text': '#f4f8ff',
                '--secondary-text': '#d6e4f8',
                '--muted-text': '#a6bddf',
                '--btn-bg-start': 'rgba(255, 255, 255, 0.45)',
                '--btn-bg-end': 'rgba(200, 224, 255, 0.38)',
                '--btn-text': '#0b1224',
                '--btn-shadow': '0 20px 30px rgba(167, 224, 255, 0.25)',
                '--btn-shadow-strong': '0 24px 42px rgba(183, 197, 255, 0.32)'
            }
        };
        const chosen = themes[theme] || themes.gold;
        Object.entries(chosen).forEach(([k,v]) => root.style.setProperty(k, v));
        root.setAttribute('data-theme', theme);
        if (document.body) document.body.setAttribute('data-theme', theme);
        if (persist) {
            settingsStore.theme = theme;
            saveSettingsStore(settingsStore);
        }
        const select = document.getElementById('themeSelect');
        if (select) select.value = theme;
    }

    function saveSettingsToggle(key, value) {
        settingsStore[key] = value;
        saveSettingsStore(settingsStore);
        showToast('Settings updated.', 'success');
    }

    function hydrateSettingsUI() {
        const price = document.getElementById('togglePriceAlerts');
        const weather = document.getElementById('toggleWeatherAlerts');
        const daily = document.getElementById('toggleDailyReminder');
        const themeSelect = document.getElementById('themeSelect');
        const tgSettings = document.getElementById('settingsTourGuideToggle');
        if (price) price.checked = !!settingsStore.priceAlerts;
        if (weather) weather.checked = !!settingsStore.weatherAlerts;
        if (daily) daily.checked = !!settingsStore.dailyReminder;
        if (themeSelect) themeSelect.value = settingsStore.theme || 'gold';
        if (tgSettings) tgSettings.checked = !!userPreferences.tourGuide;
    }

    /* ---------- UI HELPERS ---------- */
    function setActiveTab(tab) {
        const planBtn = document.getElementById('tab-plan');
        const profileBtn = document.getElementById('tab-profile');
        const nav = document.querySelector('.tab-nav');
        if (!planBtn || !profileBtn) return;
        planBtn.classList.toggle('active', tab === 'plan');
        profileBtn.classList.toggle('active', tab === 'profile');
        const activeBtn = tab === 'plan' ? planBtn : profileBtn;
        if (nav && activeBtn) {
            const navRect = nav.getBoundingClientRect();
            const btnRect = activeBtn.getBoundingClientRect();
            nav.style.setProperty('--tab-pill-left', `${btnRect.left - navRect.left}px`);
            nav.style.setProperty('--tab-pill-width', `${btnRect.width}px`);
        }
    }

    function showOnlySection(id) {
        const sections = document.querySelectorAll('main > section');
        sections.forEach(sec => sec.classList.remove('active'));
        const target = document.getElementById(id);
        if (target) target.classList.add('active');

        if (id === 'profile' || id === 'auth' || id === 'settings' || id === 'pastTrips') {
            setActiveTab('profile');
        } else {
            setActiveTab('plan');
        }
    }

    function openPlannerTab() {
        if (!currentUser) {
            setAuthMode('login');
            showOnlySection('auth');
            return;
        }
        const savedItinerary = loadItinerary();
        if (savedItinerary && userProfile.startDate && userProfile.endDate) {
            currentItinerary = savedItinerary;
            const dates = getDaysArray(new Date(userProfile.startDate), new Date(userProfile.endDate));
            renderItineraryUI(savedItinerary, dates);
            showOnlySection('results');
        } else if (currentIndex > 0 && currentIndex < experiences.length) {
            showOnlySection('swiper');
        } else {
            showOnlySection('intro');
        }
    }

    function openPlanner() {
        openPlannerTab();
    }

    function goToPlannerStart() {
        clearPlannerState();
        showOnlySection('intro');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function openHome() {
        showOnlySection('home');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function openProfileTab() {
        if (currentUser) {
            populateProfileUI();
            renderTripsOnProfile();
            showOnlySection('profile');
        } else {
            setAuthMode('login');
            showOnlySection('auth');
        }
    }

    function openProfileFromMenu() {
        closeProfileDropdown();
        openProfileTab();
    }

    function openPastTripsTab() {
        if (currentUser) {
            populateProfileUI();
            renderTripsOnProfile();
            showOnlySection('pastTrips');
            setTimeout(() => {
                const tripsBlock = document.getElementById('previousTripsContainer');
                if (tripsBlock) {
                    tripsBlock.scrollTop = 0;
                }
            }, 50);
        } else {
            setAuthMode('login');
            showOnlySection('auth');
        }
    }

    function openPastTripsFromMenu() {
        closeProfileDropdown();
        openPastTripsTab();
    }

    function openSettingsFromMenu() {
        closeProfileDropdown();
        showOnlySection('settings');
    }

    function logoutFromMenu() {
        closeProfileDropdown();
        logout();
    }

    function toggleProfileDropdown(event) {
        event.stopPropagation();
        const dropdown = document.getElementById('profileDropdown');
        if (!dropdown) return;
        dropdown.classList.toggle('open');
    }

    function closeProfileDropdown() {
        const dropdown = document.getElementById('profileDropdown');
        if (dropdown) dropdown.classList.remove('open');
    }

    document.addEventListener('click', () => {
        closeProfileDropdown();
    });

    function initSignupTourGuideToggle() {
        const toggle = document.getElementById('signupTourGuide');
        const note = document.getElementById('signupTourGuideNote');
        if (!toggle || !note) return;
        const sync = () => {
            note.style.display = toggle.checked ? 'block' : 'none';
        };
        toggle.addEventListener('change', sync);
        sync();
    }

    function clearPlannerState() {
        selectedDates = [];
        likedTags = [...(userProfile.likedTags || [])];
        userBudgetScore = 0;
        currentIndex = 0;
        const startBtn = document.getElementById('startBtn');
        if (startBtn) startBtn.disabled = true;
        if (datePicker) datePicker.clear();
        const cardStack = document.getElementById('cardStack');
        if (cardStack) cardStack.innerHTML = '';
        const itineraryContent = document.getElementById('itineraryContent');
        if (itineraryContent) itineraryContent.innerHTML = '';
        updateStartButtonState();
    }

    /* ---------- AUTH MODE SWITCH ---------- */
    function setAuthMode(mode) {
        authMode = mode;
        const loginForm = document.getElementById('loginForm');
        const signupForm = document.getElementById('signupForm');
        const btnLogin = document.getElementById('btnAuthLogin');
        const btnSignup = document.getElementById('btnAuthSignup');
        const titleEl = document.getElementById('authTitle');
        const subEl = document.getElementById('authSubtitle');

        if (!loginForm || !signupForm || !btnLogin || !btnSignup) return;

        if (mode === 'login') {
            loginForm.classList.remove('hidden');
            signupForm.classList.add('hidden');
            btnLogin.classList.add('active');
            btnSignup.classList.remove('active');
            if (titleEl) titleEl.textContent = 'Welcome back';
            if (subEl) subEl.textContent = 'Log in to access your Chicago AI trips.';
        } else {
            signupForm.classList.remove('hidden');
            loginForm.classList.add('hidden');
            btnSignup.classList.add('active');
            btnLogin.classList.remove('active');
            if (titleEl) titleEl.textContent = 'Create Your Account';
            if (subEl) subEl.textContent = 'Save your Chicago itineraries under one profile.';
        }
    }

    /* ---------- PROFILE UI ---------- */
    function populateProfileUI() {
        if (!currentUser) return;
        const fullName = `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim() || 'User';
        const email = currentUser.email || 'user@example.com';
        const initial = (currentUser.firstName || 'U').charAt(0).toUpperCase();
        const avatarColor = userProfile.avatarColor || '#EAB308';
        const avatarImage = userProfile.avatarImage || '';

        const profileNameEl = document.getElementById('profileName');
        const profileEmailEl = document.getElementById('profileEmail');
        const profileAvatarEl = document.getElementById('profileAvatar');
        const headerAvatarEl = document.getElementById('headerAvatar');
        const profileMenu = document.getElementById('profileMenu');

        if (profileNameEl) profileNameEl.textContent = fullName.toLowerCase();
        if (profileEmailEl) profileEmailEl.textContent = email;
        const applyAvatar = (el) => {
            if (!el) return;
            if (avatarImage) {
                el.style.backgroundImage = `url(${avatarImage})`;
                el.style.backgroundSize = 'cover';
                el.style.backgroundPosition = 'center';
                el.textContent = '';
            } else {
                el.style.backgroundImage = '';
                el.textContent = initial;
                el.style.background = avatarColor;
            }
        };
        applyAvatar(profileAvatarEl);
        applyAvatar(headerAvatarEl);
        if (profileMenu) profileMenu.style.display = 'flex';
        renderTravelDNA();
        renderBadges();
        renderFavorites();
        fillEditForm(fullName, avatarColor);
        updateAllKnobs();
    }

    /* ---------- LOGIN & SIGNUP HANDLERS ---------- */
    async function handleLoginSubmit(event) {
        event.preventDefault();

        const emailInput = document.getElementById('loginEmail');
        const passwordInput = document.getElementById('loginPassword');
        const emailError = document.getElementById('loginEmailError');
        const passwordError = document.getElementById('loginPasswordError');
        const loginError = document.getElementById('loginError');

        [emailInput, passwordInput].forEach(i => i.classList.remove('input-error'));
        [emailError, passwordError, loginError].forEach(e => e.textContent = '');

        const email = emailInput.value.trim();
        const password = passwordInput.value;

        let hasError = false;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!email) {
            emailInput.classList.add('input-error');
            emailError.textContent = 'Email is required.';
            hasError = true;
        } else if (!emailRegex.test(email)) {
            emailInput.classList.add('input-error');
            emailError.textContent = 'Enter a valid email.';
            hasError = true;
        }

        if (!password) {
            passwordInput.classList.add('input-error');
            passwordError.textContent = 'Password is required.';
            hasError = true;
        }

        if (hasError) return;

        try {
            const { token, user } = await apiRequest('/api/login', {
                method: 'POST',
                body: { email, password }
            });
            setSessionToken(token);
            currentUser = user;
            saveUser(user);
        } catch (err) {
            loginError.textContent = err.message || 'Login failed.';
            return;
        }

        populateProfileUI();
        renderTripsOnProfile();
        clearPlannerState();
        showOnlySection('intro');
        showToast('Welcome back!', 'success');
    }

    async function handleRegisterSubmit(event) {
        event.preventDefault();

        const firstNameInput = document.getElementById('firstName');
        const lastNameInput = document.getElementById('lastName');
        const emailInput = document.getElementById('email');
        const passwordInput = document.getElementById('password');
        const passwordConfirmInput = document.getElementById('passwordConfirm');
        const signupTourGuideToggle = document.getElementById('signupTourGuide');

        const firstNameError = document.getElementById('firstNameError');
        const lastNameError = document.getElementById('lastNameError');
        const emailError = document.getElementById('emailError');
        const passwordError = document.getElementById('passwordError');
        const passwordConfirmError = document.getElementById('passwordConfirmError');

        [firstNameInput, lastNameInput, emailInput, passwordInput, passwordConfirmInput].forEach(i => i.classList.remove('input-error'));
        [firstNameError, lastNameError, emailError, passwordError, passwordConfirmError].forEach(e => e.textContent = '');

        const firstName = firstNameInput.value.trim();
        const lastName = lastNameInput.value.trim();
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        const passwordConfirm = passwordConfirmInput.value;

        let hasError = false;

        if (!firstName) {
            firstNameInput.classList.add('input-error');
            firstNameError.textContent = 'First name is required.';
            hasError = true;
        }

        if (!lastName) {
            lastNameInput.classList.add('input-error');
            lastNameError.textContent = 'Last name is required.';
            hasError = true;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email) {
            emailInput.classList.add('input-error');
            emailError.textContent = 'Email is required.';
            hasError = true;
        } else if (!emailRegex.test(email)) {
            emailInput.classList.add('input-error');
            emailError.textContent = 'Enter a valid email.';
            hasError = true;
        }

        if (!password) {
            passwordInput.classList.add('input-error');
            passwordError.textContent = 'Password is required.';
            hasError = true;
        } else if (password.length < 6) {
            passwordInput.classList.add('input-error');
            passwordError.textContent = 'Minimum 6 characters.';
            hasError = true;
        }

        if (!passwordConfirm) {
            passwordConfirmInput.classList.add('input-error');
            passwordConfirmError.textContent = 'Please repeat the password.';
            hasError = true;
        } else if (password !== passwordConfirm) {
            passwordConfirmInput.classList.add('input-error');
            passwordConfirmError.textContent = 'Passwords do not match.';
            hasError = true;
        }

        if (hasError) return;

        const tourGuidePref = !!signupTourGuideToggle?.checked;
        userPreferences.tourGuide = tourGuidePref;
        userProfile.tourGuide = tourGuidePref;

        try {
            const { token, user } = await apiRequest('/api/register', {
                method: 'POST',
                body: { firstName, lastName, email, password }
            });
            setSessionToken(token);
            currentUser = user;
            saveUser(user);
        } catch (err) {
            showToast(err.message || 'Sign up failed.', 'error');
            return;
        }

        populateProfileUI();
        renderTripsOnProfile();
        clearPlannerState();
        showOnlySection('intro');
        updateAiUiVisibility();
        showToast('Account created and signed in.', 'success');
    }

    /* ---------- PROFILE DNA & FAVORITES ---------- */
    function renderTravelDNA() {
        const dna = document.getElementById('dnaStats');
        if (!dna) return;
        const stats = [
            { label: 'Tempo', value: userPreferences.tempo, desc: getRulerValue('tempo', userPreferences.tempo) },
            { label: 'Price', value: userPreferences.price, desc: getRulerValue('price', userPreferences.price) },
            { label: 'Transportation', value: userPreferences.transportation, desc: getRulerValue('transportation', userPreferences.transportation) }
        ];
        dna.innerHTML = stats.map(s => `
            <div class="dna-stat">
                <div class="dna-stat-header">
                    <span>${s.label}</span>
                    <span style="color: var(--accent-gold); font-weight:700;">${s.desc}</span>
                </div>
                <div class="dna-bar"><div class="dna-bar-fill" style="width:${s.value}%;"></div></div>
            </div>
        `).join('');
    }

    function getBadges() {
        const badges = [];
        if (currentItinerary && currentItinerary.length) badges.push({ name: 'Route Builder', icon: 'fa-route', locked: false });
        if ((userPreferences.price || 0) > 65) badges.push({ name: 'Luxury Lover', icon: 'fa-gem', locked: false });
        if ((userPreferences.tempo || 0) > 65) badges.push({ name: 'Fast Tracker', icon: 'fa-bolt', locked: false });
        if (likedTags.includes('food_mid') || likedTags.includes('luxury_food')) badges.push({ name: 'Foodie', icon: 'fa-pizza-slice', locked: false });
        if (!badges.length) badges.push({ name: 'Getting Started', icon: 'fa-seedling', locked: false });
        // locked examples
        badges.push({ name: 'Night Owl', icon: 'fa-moon', locked: true });
        badges.push({ name: 'Culture Guru', icon: 'fa-landmark', locked: true });
        return badges;
    }

    function renderBadges() {
        const row = document.getElementById('badgeRow');
        if (!row) return;
        row.innerHTML = '';
        getBadges().forEach(b => {
            const div = document.createElement('div');
            div.className = 'badge-pill' + (b.locked ? ' locked' : '');
            div.innerHTML = `<i class="fa-solid ${b.icon}"></i> ${b.name}`;
            row.appendChild(div);
        });
    }

    function renderFavorites() {
        const container = document.getElementById('savedPlaces');
        if (!container) return;
        container.innerHTML = '';
        if (!favorites || favorites.length === 0) {
            container.innerHTML = `<div class="fav-empty">No saved places yet. Tap "Save place" on an activity.</div>`;
            return;
        }
        favorites.slice().reverse().forEach(f => {
            const div = document.createElement('div');
            div.className = 'saved-place';
            div.innerHTML = `<div><strong>${f.title}</strong><br><span>${f.category || ''}</span></div>
                <button class="btn-secondary btn" style="padding:6px 10px; font-size:0.78rem;" onclick="removeFavorite('${f.id}')">Remove</button>`;
            container.appendChild(div);
        });
    }

    function toggleFavorite(id) {
        const allActivities = experiences;
        const activity = allActivities.find(a => a.id === id);
        if (!activity) return;
        const exists = favorites.some(f => f.id === id);
        if (exists) {
            favorites = favorites.filter(f => f.id !== id);
            saveFavorites(favorites);
            renderFavorites();
            showToast('Removed from saved places.', 'info');
        } else {
            favorites.push({ id: activity.id, title: activity.title, category: activity.category });
            saveFavorites(favorites);
            renderFavorites();
            showToast('Saved to places.', 'success');
        }
    }

    function removeFavorite(id) {
        favorites = favorites.filter(f => f.id !== id);
        saveFavorites(favorites);
        renderFavorites();
    }

    const HOLD_MS = 2000;

    function startHold(action, dayNumber, activityId, btn, evt) {
        if (evt) evt.stopPropagation();
        if (!userProfile.tourGuide) {
            showToast('Turn on AI Tour Guide to send signals.', 'info');
            return;
        }
        if (!btn) return;
        if (btn.dataset.holdTimer) clearTimeout(btn.dataset.holdTimer);
        btn.dataset.holdTimer = setTimeout(() => {
            btn.dataset.holdTimer = null;
            if (action === 'arrived') {
                handleCheckin(dayNumber, activityId, btn);
            } else if (action === 'completed') {
                handleComplete(dayNumber, activityId, btn);
            }
        }, HOLD_MS);
    }

    function cancelHold(btn) {
        if (!btn || !btn.dataset.holdTimer) return;
        clearTimeout(btn.dataset.holdTimer);
        btn.dataset.holdTimer = null;
        showToast('Hold 2s to send Arrived/Completed.', 'info');
    }

    function handleCheckin(dayNumber, activityId, btn) {
        const day = currentItinerary && currentItinerary[dayNumber - 1];
        if (!day) return;
        const activity = day.find(a => a.id === activityId);
        if (!activity) return;

        const now = new Date();
        const nowMin = now.getHours() * 60 + now.getMinutes();
        const scheduledStart = timeToMinutes(activity.time);
        const plannedDuration = durationToMinutes(activity.duration);
        let timingNote = 'On schedule.';
        if (scheduledStart !== null) {
            const expectedEnd = scheduledStart + plannedDuration;
            const diff = Math.round(nowMin - expectedEnd);
            if (diff > 10) timingNote = `Running ${diff} min late.`;
            else if (diff < -10) timingNote = `You are ${Math.abs(diff)} min early.`;
        }

        const key = `${dayNumber}-${activityId}`;
        checkins[key] = { ts: now.getTime(), title: activity.title, timingNote };
        saveCheckins(checkins);

        if (btn) btn.classList.add('active');

        // store context for AI chat
        const arrivalIso = now.toISOString();
        lastAiContext = buildChatContext(dayNumber, activity, 'arrived', timingNote, arrivalIso);

        if (userProfile.tourGuide) {
            const nextStop = getNextStopFromContext(dayNumber, activity.id);
            const detail = activity.details ? `What to do: ${activity.details}` : '';
            const insta = activity.insta ? `Tip: ${activity.insta}` : '';
            const duration = activity.duration || 'Est. 1 hr';
            const sched = activity.time || 'TBD';
            const nextLine = nextStop
                ? `<div style="margin-top:6px;">Next planned: ${nextStop.title}${nextStop.time ? ` @ ${nextStop.time}` : ''}. Want to head there now or swap?</div>`
                : `<div style="margin-top:6px;">This was the last planned stop. Want a nearby alternate?</div>`;
            const note = `
                <strong>Arrived:</strong> ${activity.title}<br>
                ${timingNote}<br>
                <div style="margin-top:6px;">
                    <div><em>${duration} • Planned at ${sched}</em></div>
                    ${detail ? `<div>${detail}</div>` : ''}
                    ${insta ? `<div>${insta}</div>` : ''}
                </div>
                ${nextLine}
                <div style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap;">
                    <button class="btn-secondary" style="padding:6px 10px; font-size:0.8rem;" onclick="swapCurrentToTomorrow(${dayNumber}, ${activity.id})">Swap & move to tomorrow</button>
                </div>
                <div style="margin-top:6px; color: var(--secondary-text);">Ask me to adjust timing if you're early/late.</div>
            `;
            showAssistant(note);
            renderAssistantState(buildAssistantContext());
        } else {
            showToast('Check-in recorded.', 'success');
        }
    }

    function handleComplete(dayNumber, activityId, btn) {
        const day = currentItinerary && currentItinerary[dayNumber - 1];
        if (!day) return;
        const activity = day.find(a => a.id === activityId);
        if (!activity) return;

        const key = `${dayNumber}-${activityId}-completed`;
        checkins[key] = { ts: Date.now(), title: activity.title, status: 'completed' };
        saveCheckins(checkins);

        if (btn) btn.classList.add('active');

        // store context for AI chat
        lastAiContext = buildChatContext(dayNumber, activity, 'completed', null, null);

        if (userProfile.tourGuide) {
            showAssistant(`<strong>Completed:</strong> ${activity.title}<br><div style="margin-top:6px;">Logged. Want me to adjust timing or suggest what’s next?</div>`);
            renderAssistantState(buildAssistantContext());
        } else {
            showToast('Marked complete.', 'success');
        }
    }

    function fillEditForm(fullName, avatarColor) {
        const first = document.getElementById('editFirstName');
        const last = document.getElementById('editLastName');
        const email = document.getElementById('editEmail');
        if (first && currentUser) first.value = currentUser.firstName || '';
        if (last && currentUser) last.value = currentUser.lastName || '';
        if (email && currentUser) email.value = currentUser.email || '';
    }

    function saveProfileEdit() {
        if (!currentUser) return;
        const first = document.getElementById('editFirstName');
        const last = document.getElementById('editLastName');
        currentUser.firstName = (first?.value || '').trim() || currentUser.firstName;
        currentUser.lastName = (last?.value || '').trim() || currentUser.lastName;
        saveUser(currentUser);
        saveProfile(userProfile);
        populateProfileUI();
        showToast('Profile updated.', 'success');
    }

    function cancelProfileEdit() {
        if (!currentUser) return;
        fillEditForm('', userProfile.avatarColor);
        showToast('Changes discarded.', 'info');
    }

    function triggerProfilePicUpload() {
        const input = document.getElementById('profilePicInput');
        if (input) input.click();
    }

    function handleProfilePicSelected(event) {
        const file = event?.target?.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            showToast('Please select an image file.', 'error');
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            userProfile.avatarImage = reader.result;
            saveProfile(userProfile);
            populateProfileUI();
            showToast('Profile picture updated.', 'success');
        };
        reader.readAsDataURL(file);
    }

    function logout() {
        currentUser = null;
        try { localStorage.removeItem(USER_STORAGE_KEY); } catch (e) {}
        clearSessionToken();
        const profileMenu = document.getElementById('profileMenu');
        if (profileMenu) profileMenu.style.display = 'none';
        clearPlannerState();
        setAuthMode('login');
        showOnlySection('auth');
        showToast('Signed out.', 'info');
    }

    function resetAllData() {
        if (!confirm('This will clear your saved user, profile and trips from this browser. Continue?')) return;
        try {
            localStorage.removeItem(USER_STORAGE_KEY);
            Object.values(STORAGE_KEYS).forEach(k => localStorage.removeItem(k));
        } catch (e) {}

        currentUser = null;
        userProfile = { ...DEFAULT_PROFILE };
        likedTags = [];
        userPreferences = {
            tempo: DEFAULT_PROFILE.tempo,
            price: DEFAULT_PROFILE.price,
            transportation: DEFAULT_PROFILE.transportation,
            tourGuide: DEFAULT_PROFILE.tourGuide
        };

        const profileMenu = document.getElementById('profileMenu');
        if (profileMenu) profileMenu.style.display = 'none';

        clearPlannerState();
        setAuthMode('login');
        showOnlySection('auth');
    }

    /* ---------- DATE PICKER ---------- */
    const datePicker = flatpickr("#dateRange", { 
        mode: "range",
        dateFormat: "d-m-Y",
        minDate: "today",
        onChange: (dates) => {
            selectedDates = dates.length === 2 ? dates : [];
            if (dates.length === 2) {
                userProfile.startDate = dates[0].toISOString();
                userProfile.endDate = dates[1].toISOString();
                saveProfile(userProfile);
            } else {
                userProfile.startDate = null;
                userProfile.endDate = null;
                saveProfile(userProfile);
            }
            updateStartButtonState();
        } 
    });

    function hydratePlannerInputsFromProfile() {
        if (userProfile.startDate && userProfile.endDate && datePicker) {
            const start = new Date(userProfile.startDate);
            const end = new Date(userProfile.endDate);
            selectedDates = [start, end];
            datePicker.setDate(selectedDates, true);
        }
        const cityInput = document.getElementById('citySelector');
        if (cityInput) cityInput.value = userProfile.city || CITY_OPTIONS[0].label;
        updateStartButtonState();
    }

    /* ---------- PLANNER FLOW ---------- */
    function startApp() { 
        switchSection('intro', 'swiper'); 

        likedTags = [];
        userBudgetScore = 0;
        currentIndex = 0;

        userProfile.likedTags = [];
        saveProfile(userProfile);

        renderCards(); 
    }

    function switchSection(from, to) { 
        const fromEl = document.getElementById(from);
        const toEl = document.getElementById(to);
        if (fromEl) fromEl.classList.remove('active'); 
        
        if (to === 'evaluation' && !evaluationSetupDone) {
            setupEvaluationScreen();
        }
        if (to === 'evaluation') {
            updateAllKnobs(); 
        }
        setTimeout(() => {
            if (toEl) toEl.classList.add('active');
        }, 450); 
    }

    function startProcessing() {
        switchSection('evaluation', 'processing');
        document.getElementById('aiLog').innerText = "Analyzing preferences and creating itinerary...";

        setTimeout(() => { 
            try {
                document.getElementById('aiLog').innerText = "Finalizing optimal routes and guide generation...";
                
                generateItinerary(); 
                
                switchSection('processing', 'results'); 
            } catch (error) {
                document.getElementById('aiLog').innerText = "ERROR: Generation failed. Returning to profile review.";
                setTimeout(() => switchSection('processing', 'evaluation'), 1500); 
            }
        }, 3000);
    }
    
    function reviewProfile() {
        switchSection('results', 'evaluation');
    }

    function addLikedTag(tag) {
        if (!userProfile.likedTags.includes(tag)) {
            userProfile.likedTags.push(tag);
            saveProfile(userProfile);
        }
        if (!likedTags.includes(tag)) {
            likedTags.push(tag);
        }
    }

    function renderCards() {
        const stack = document.getElementById('cardStack');
        stack.innerHTML = '';
        for (let i = experiences.length - 1; i >= currentIndex; i--) {
            const item = experiences[i];
            const card = document.createElement('div');
            card.className = 'card'; 
            card.id = `card-${i}`;
            if (i > currentIndex) {
                let scale = 1 - (i - currentIndex) * 0.05;
                card.style.transform = `scale(${scale}) translateY(${(i - currentIndex) * 8}px)`;
                card.style.zIndex = experiences.length - i;
                card.style.opacity = i - currentIndex > 2 ? 0 : 1;
            } else { 
                card.style.zIndex = 100; 
                initDrag(card, item); 
            }
            
            let priceHtml = '';
            if(item.price === 3) priceHtml = `<span class="dollar-luxury">$$$</span>`;
            else if(item.price === 2) priceHtml = `<span class="dollar-active">$$</span><span class="dollar-inactive">$</span>`;
            else priceHtml = `<span class="dollar-active">$</span><span class="dollar-inactive">$$</span>`;
            
            card.innerHTML = `
                <div class="card-status status-like">LIKE</div>
                <div class="card-status status-nope">SKIP</div>
                <div class="price-badge">${priceHtml}</div>
                <img src="${item.img}" draggable="false">
                <div class="card-info">
                    <div class="card-tag">${item.category.toUpperCase()}</div>
                    <div class="card-title">${item.title}</div>
                </div>
            `;
            stack.appendChild(card);
        }
    }

    function initDrag(card, item) {
        let startX = 0, currentX = 0, isDragging = false;

        const start = (x) => { 
            isDragging = true; 
            startX = x; 
            card.style.transition = 'none'; 
        };

        const move = (x) => {
            if (!isDragging) return;
            currentX = x - startX;
            card.style.transform = `translateX(${currentX}px) rotate(${currentX * 0.05}deg)`;
            const like = card.querySelector('.status-like');
            const nope = card.querySelector('.status-nope');
            if (currentX > 0) { 
                like.style.opacity = currentX/100; 
                nope.style.opacity = 0; 
            } else { 
                nope.style.opacity = Math.abs(currentX)/100; 
                like.style.opacity = 0; 
            }
        };

        const end = () => {
            if (!isDragging) return;
            isDragging = false;
            card.style.transition = 'transform 0.4s ease';
            if (currentX > 100) {
                card.style.transform = `translateX(1000px) rotate(30deg)`;
                addLikedTag(item.tag);
                if (item.price === 3) userBudgetScore += 2; 
                nextCard();
            } 
            else if (currentX < -100) { 
                card.style.transform = `translateX(-1000px) rotate(-30deg)`; 
                nextCard(); 
            } 
            else { 
                card.style.transform = 'translateX(0) rotate(0)'; 
                card.querySelector('.status-like').style.opacity = 0; 
                card.querySelector('.status-nope').style.opacity = 0; 
            }
        };

        card.addEventListener('mousedown', e => { 
            e.preventDefault(); 
            start(e.clientX); 
            document.addEventListener('mousemove', mouseMoveHandler); 
            document.addEventListener('mouseup', mouseUpHandler); 
        });

        function mouseMoveHandler(e) { move(e.clientX); }
        function mouseUpHandler() { 
            end(); 
            document.removeEventListener('mousemove', mouseMoveHandler);
            document.removeEventListener('mouseup', mouseUpHandler);
        }

        card.addEventListener('touchstart', e => { 
            start(e.touches[0].clientX); 
            document.addEventListener('touchmove', touchMoveHandler); 
            document.addEventListener('touchend', touchEndHandler); 
        });

        function touchMoveHandler(e) { move(e.touches[0].clientX); }
        function touchEndHandler() { 
            end(); 
            document.removeEventListener('touchmove', touchMoveHandler);
            document.removeEventListener('touchend', touchEndHandler);
        }
    }

    function nextCard() { 
        currentIndex++; 
        setTimeout(() => { 
            if(currentIndex < experiences.length) renderCards(); 
            else finishSwiping(); 
        }, 300); 
    }

    function finishSwiping() {
        switchSection('swiper', 'evaluation');
    }

    /* ---------- RULERS ---------- */
    function getRulerValue(type, percentage) {
        if (type === 'tempo') {
            if (percentage < 33) return 'Enjoy & Relax';
            if (percentage > 66) return 'Fast & Active';
            return 'Medium';
        } else if (type === 'price') {
            if (percentage < 33) return 'Budget Friendly';
            if (percentage > 66) return 'Luxury & Exclusive';
            return 'Medium';
        } else if (type === 'transportation') {
            if (percentage < 33) return 'Walk/Scooter/Bike';
            if (percentage > 66) return 'Taxi/Uber/Private';
            return 'Public Transport';
        }
        return 'Medium';
    }

    function mapSelectToValue(type, option) {
        const presets = {
            tempo: { relax: 20, balanced: 50, active: 85 },
            price: { budget: 20, medium: 50, luxury: 85 },
            transportation: { walk: 15, rideshare: 60, private: 90 }
        };
        return presets[type]?.[option] ?? 50;
    }

    function mapValueToSelect(type, value) {
        const thresholds = {
            tempo: [30, 70],
            price: [30, 70],
            transportation: [25, 75]
        };
        const [low, high] = thresholds[type] || [30, 70];
        if (value <= low) return type === 'transportation' ? 'walk' : type === 'price' ? 'budget' : 'relax';
        if (value >= high) return type === 'transportation' ? 'private' : 'luxury';
        return type === 'transportation' ? 'rideshare' : type === 'price' ? 'medium' : 'balanced';
    }

    function handleProfileSelectChange(type, option) {
        const newValue = mapSelectToValue(type, option);
        userPreferences[type] = newValue;
        userProfile[type] = newValue;
        saveProfile(userProfile);
        renderTravelDNA();
        updateAllKnobs();
    }

    function updateAllKnobs() {
        const tempoSelect = document.getElementById('tempoSelect');
        const budgetSelect = document.getElementById('budgetSelect');
        const transportSelect = document.getElementById('transportSelect');
        const dnaTempo = document.getElementById('dnaTempoSelect');
        const dnaBudget = document.getElementById('dnaBudgetSelect');
        const dnaTransport = document.getElementById('dnaTransportSelect');
        if (tempoSelect) tempoSelect.value = mapValueToSelect('tempo', userPreferences.tempo);
        if (budgetSelect) budgetSelect.value = mapValueToSelect('price', userPreferences.price);
        if (transportSelect) transportSelect.value = mapValueToSelect('transportation', userPreferences.transportation);
        if (dnaTempo) dnaTempo.value = mapValueToSelect('tempo', userPreferences.tempo);
        if (dnaBudget) dnaBudget.value = mapValueToSelect('price', userPreferences.price);
        if (dnaTransport) dnaTransport.value = mapValueToSelect('transportation', userPreferences.transportation);
    }

    function initRulerDrag() {
        // sliders removed
    }

    function setupEvaluationScreen() {
        if (evaluationSetupDone) return; 

        updateAllKnobs(); 
        evaluationSetupDone = true;
    }

    function toggleTourGuide(isChecked) {
        userPreferences.tourGuide = isChecked;
        userProfile.tourGuide = isChecked;
        saveProfile(userProfile);
        updateAiUiVisibility();
    }

    function toggleTourGuideFromSettings(isChecked) {
        toggleTourGuide(isChecked);
        showToast('Tour guide preference updated.', 'success');
    }

    /* ---------- ITINERARY ---------- */
    function getDaysArray(start, end) {
        const dates = [];
        let currentDate = new Date(start); 
        let endDate = new Date(end);
        
        currentDate.setHours(0, 0, 0, 0); 
        endDate.setHours(0, 0, 0, 0); 

        while (currentDate.getTime() <= endDate.getTime()) {
            dates.push(new Date(currentDate));
            currentDate = new Date(currentDate.getTime() + (24 * 60 * 60 * 1000));
        }
        
        return dates;
    }

    function generateItinerary() {
        const itineraryContent = document.getElementById('itineraryContent');
        
        if (!selectedDates || selectedDates.length < 2) {
            itineraryContent.innerHTML = '<div style="padding: 16px; color: var(--danger); font-size:0.86rem;">Error: Please select valid dates before planning.</div>';
            throw new Error("Invalid dates selected.");
        }

        const dates = getDaysArray(selectedDates[0], selectedDates[1]);
        tripDates = dates;
        const allActivities = [...experiences];
        const itinerary = generateMockItinerary(dates, allActivities);

        currentItinerary = itinerary;
        saveItinerary(itinerary);
        renderItineraryUI(itinerary, dates);
        renderAssistantState(buildAssistantContext());
    }

    function renderItineraryUI(itinerary, dates) {
        tripDates = dates || tripDates || [];
        const itineraryContent = document.getElementById('itineraryContent');
        const itineraryMeta = document.getElementById('itineraryMeta');
        const viewDayMapBtn = document.getElementById('viewDayMapBtn');
        const dayTabs = document.getElementById('dayTabs');

        const numDays = dates.length;
        itineraryMeta.innerHTML = `${numDays} Days | AI Guide: <strong style="color: ${userPreferences.tourGuide ? 'var(--success)' : 'var(--secondary-text)'};">${userPreferences.tourGuide ? 'ON' : 'OFF'}</strong>`;

        itineraryContent.innerHTML = '';
        if (dayTabs) dayTabs.innerHTML = '';
        if (viewDayMapBtn) viewDayMapBtn.style.display = itinerary.length ? 'inline-flex' : 'none';

        if (!itinerary || !itinerary.length) {
            return;
        }

        const setActiveDay = (idx) => {
            if (!itinerary[idx]) return;
            if (dayTabs) {
                Array.from(dayTabs.querySelectorAll('.day-tab')).forEach((btn, bIdx) => {
                    btn.classList.toggle('active', bIdx === idx);
                });
            }
            itineraryContent.innerHTML = '';
            const dayDiv = document.createElement('div');
            dayDiv.className = 'itinerary-day';
            dayDiv.innerHTML = renderDay(itinerary[idx], idx + 1, dates[idx]);
            itineraryContent.appendChild(dayDiv);

            currentDayMapData.dayNumber = idx + 1;
            currentDayMapData.activities = itinerary[idx];
            if (viewDayMapBtn) {
                viewDayMapBtn.style.display = 'inline-flex';
                viewDayMapBtn.innerHTML = `<i class="fa-solid fa-map-location-dot"></i> Day ${idx + 1} Map (${(itinerary[idx] || []).length})`;
            }
        };

        if (dayTabs) {
            itinerary.forEach((_, index) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'day-tab';
                btn.textContent = `Day ${index + 1}`;
                btn.addEventListener('click', () => setActiveDay(index));
                dayTabs.appendChild(btn);
            });
        }

        setActiveDay(0);

        if (userPreferences.tourGuide && itinerary.length > 0) {
            showAssistant(`<strong>Day plan ready.</strong> Long-press "Arrived" or "Completed" for 2s at each stop; I'll keep you in sync, suggest nearby picks, and answer questions.`);
        }
    }

    function copyItinerarySummary() {
        if (!currentItinerary || !currentItinerary.length) {
            showToast('Generate an itinerary first.', 'error');
            return;
        }
        const summary = buildTripSummary(currentItinerary);
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(summary).then(() => {
                showToast('Copied shareable plan. Paste into chat/email.', 'success');
            }).catch(() => showToast('Clipboard blocked.', 'error'));
        } else {
            showToast('Clipboard not available.', 'error');
        }
    }

    function buildTripSummary(itinerary, dates = []) {
        let summary = 'Trip Plan to Share:\n';
        itinerary.forEach((day, idx) => {
            const datePart = dates[idx] ? dates[idx].toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) : `Day ${idx + 1}`;
            summary += `${datePart}:\n`;
            day.slice(0, 3).forEach(a => {
                summary += ` - ${a.title}${a.time ? ' at ' + a.time : ''}\n`;
            });
        });
        return summary;
    }

    function copyTripSummaryById(tripId) {
        const trips = loadTrips();
        const trip = trips.find(t => t.id === tripId);
        if (!trip || !trip.summaryText) {
            showToast('No summary found for this trip.', 'error');
            return;
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(trip.summaryText).then(() => {
                showToast('Trip summary copied.', 'success');
            }).catch(() => showToast('Clipboard blocked.', 'error'));
        } else {
            showToast('Clipboard not available.', 'error');
        }
    }

    function loadLastPlan() {
        const itinerary = loadItinerary();
        if (!itinerary) {
            showToast('No saved plan found.', 'error');
            return;
        }

        if (!userProfile.startDate || !userProfile.endDate) {
            showToast('No saved dates found for the last plan.', 'error');
            return;
        }

        const dates = getDaysArray(
            new Date(userProfile.startDate),
            new Date(userProfile.endDate)
        );

        currentItinerary = itinerary;
        renderItineraryUI(itinerary, dates);
        renderAssistantState(buildAssistantContext());
    }

    function generateMockItinerary(dates, activities) {
        const isLuxury = userPreferences.price > 60;
        const isFastTempo = userPreferences.tempo > 60;
        const dailyLimit = isFastTempo ? 4 : 3;
        
        let itinerary = [];
        let availableActivities = [...activities].sort(() => 0.5 - Math.random()); 
        
        for (let day = 0; day < dates.length; day++) {
            let dayActivities = [];
            let filteredActivities = availableActivities.filter(a => {
                const matchesLuxury = isLuxury ? (a.price > 1) : true;
                const matchesLike = likedTags.includes(a.tag);
                const randomChance = 0.4;
                return matchesLuxury && (matchesLike || Math.random() > randomChance); 
            });
            
            for (let i = 0; i < dailyLimit && filteredActivities.length > 0; i++) {
                const activity = filteredActivities.shift(); 
                if (activity) {
                    dayActivities.push(activity);
                    availableActivities = availableActivities.filter(a => a.id !== activity.id); 
                }
            }
            
            dayActivities.sort((a, b) => (a.time || "12:00").localeCompare(b.time || "12:00"));
            itinerary.push(dayActivities);
        }
        return itinerary;
    }

    function renderDay(dayPlan, dayNumber, date) {
        const weather = simulateWeather(date);
        const dateStr = date.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' });
        
        let activityList = '';

        if (userPreferences.tourGuide && weather.desc === 'Rainy') {
            showAssistant(`<strong>Rain alert for Day ${dayNumber}:</strong> Placeholder indoor suggestion message.`);
        }

        if (dayPlan.length === 0) {
            activityList = `<div style="padding: 8px 0; color: var(--secondary-text); font-style: italic; font-size:0.82rem;">
                No activities for this day. Try changing Tempo or Price sliders.
            </div>`;
        } else {
            if (userPreferences.tourGuide) {
                activityList += `<div style="padding: 8px 0; color: var(--success); font-style: italic; font-size:0.82rem;">
                    <i class="fa-solid fa-robot"></i> AI Tour Guide is ready. Long-press "Arrived" or "Completed" for 2s to send a signal.
                </div>`;
            }
            dayPlan.forEach(activity => {
                const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(activity.title + ', Chicago')}`;

                activityList += `
                    <div class="activity-item" onclick="toggleDetails(this)">
                        
                        <div class="activity-content-wrapper">
                            <div style="flex-grow: 1; min-width: 0;">
                                <div class="activity-title">${activity.title}</div>
                                <div class="activity-duration">Est. Visit: ${activity.duration || '1 hr'}</div>
                            </div>
                            ${userPreferences.tourGuide ? `
                                <div class="activity-time-group">
                                    <button class="checkin-btn" title="Arrived (long-press 2s)" 
                                        onmousedown="startHold('arrived', ${dayNumber}, ${activity.id}, this, event)" 
                                        onmouseup="cancelHold(this)" onmouseleave="cancelHold(this)"
                                        ontouchstart="startHold('arrived', ${dayNumber}, ${activity.id}, this, event)" 
                                        ontouchend="cancelHold(this)">
                                        <i class="fa-solid fa-flag-checkered"></i>
                                    </button>
                                    <div class="activity-time">${activity.time || 'TBD'}</div>
                                    <button class="complete-btn" title="Completed (long-press 2s)" 
                                        onmousedown="startHold('completed', ${dayNumber}, ${activity.id}, this, event)" 
                                        onmouseup="cancelHold(this)" onmouseleave="cancelHold(this)"
                                        ontouchstart="startHold('completed', ${dayNumber}, ${activity.id}, this, event)" 
                                        ontouchend="cancelHold(this)">
                                        <i class="fa-regular fa-circle-check"></i>
                                    </button>
                                </div>
                            ` : `
                                <div class="activity-time">${activity.time || 'TBD'}</div>
                            `}
                        </div>

                        <div class="activity-details">
                            <div class="details-info-box">
                                <h5>About ${activity.title}</h5>
                                <p>${activity.details}</p>
                                
                                <div class="insta-tip">
                                    <i class="fa-brands fa-instagram"></i> <strong>Insta Tip:</strong> ${activity.insta || 'Look for unique angles of the skyline!'}
                                </div>
                                
                                <div class="details-actions">
                                    <a href="${mapsUrl}" target="_blank" class="action-btn btn-maps">
                                        <i class="fa-solid fa-location-dot"></i> Navigate
                                    </a>
                                    <a href="https://feverup.com/en/chicago" target="_blank" class="action-btn btn-booking">
                                        <i class="fa-solid fa-ticket"></i> Book/Reserve
                                    </a>
                                    <button type="button" class="action-btn btn-booking" style="color: var(--accent-gold); border-color: var(--accent-gold);" onclick="event.stopPropagation(); toggleFavorite(${activity.id});">
                                        <i class="fa-regular fa-star"></i> Save place
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            });
        }

        return `
            <div class="day-header">
                <div>
                    <div class="day-title">DAY ${dayNumber}</div>
                    <div class="day-meta">${dateStr}</div>
                </div>
                <div class="day-header-controls">
                    <div class="weather-info">${weather.icon} ${weather.temp}</div>
                </div>
            </div>
            <div class="day-content">
                ${activityList}
            </div>
        `;
    }

    function toggleDetails(item) {
        const detailBox = item.querySelector('.activity-details');
        document.querySelectorAll('.activity-details').forEach(box => {
            if (box !== detailBox && box.classList.contains('open')) {
                box.classList.remove('open');
            }
        });
        detailBox.classList.toggle('open');
    }

    // ----- AI PROXY CALL -----
    async function callAssistant(messages) {
        const res = await fetch(`${API_BASE}/api/ai`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'gpt-4o',
                messages,
                temperature: 0.7,
                max_tokens: 500
            })
        });
        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`AI request failed: ${res.status} ${errText}`);
        }
        const data = await res.json();
        return data.reply || '';
    }

    async function refreshSuggestedToday() {
        const listEl = document.getElementById('suggestedTodayList');
        const metaEl = document.getElementById('suggestedTodayMeta');
        if (!listEl || !metaEl) return;
        listEl.innerHTML = `<div class="hero-card-line"><span>...</span><strong>Loading suggestions...</strong></div>`;
        metaEl.textContent = 'Loading...';
        try {
            const dayStops = getDayStopsWithStatus(1);
            const daySchedule = buildDayScheduleDetailed(dayStops);
            const todayDate = tripDates && tripDates[0] ? new Date(tripDates[0]) : new Date();
            const weather = simulateWeather(todayDate);
            const profileSummary = `Tempo:${userPreferences.tempo}|Price:${userPreferences.price}|Transport:${userPreferences.transportation}|TourGuide:${userPreferences.tourGuide}|Liked:${(userProfile.likedTags || []).join(', ')}`;
            const systemContent = `You are a concise Chicago travel planner. Suggest exactly 3 stops for today with times in format "HH:MM - Title". Use current profile ${profileSummary}. Today's weather: ${weather.desc} ${weather.temp}. Planned schedule: ${daySchedule || 'none'}. Keep each line under 50 characters.`;
            const reply = await callAssistant([
                { role: 'system', content: systemContent },
                { role: 'user', content: 'Give 3 updated suggestions for today with times and one-line titles.' }
            ]);
            const lines = reply.split('\n').map(l => l.trim()).filter(Boolean).slice(0,3);
            if (!lines.length) throw new Error('No suggestions returned.');
            listEl.innerHTML = lines.map(line => {
                const timeMatch = line.match(/(\d{1,2}:\d{2})/);
                const time = timeMatch ? timeMatch[1] : '--:--';
                const title = line.replace(/^\s*\d{1,2}:\d{2}\s*[-–—:]\s*/, '').replace(/^[\-\d\.\)\s]+/, '').trim() || line;
                return `<div class="hero-card-line"><span>${time}</span><strong>${title}</strong></div>`;
            }).join('');
            metaEl.textContent = `Profile: Tempo ${userPreferences.tempo} | Price ${userPreferences.price} | Transport ${userPreferences.transportation}`;
        } catch (e) {
            console.error(e);
            listEl.innerHTML = `<div class="hero-card-line"><span>--</span><strong>Could not load suggestions.</strong></div>`;
            metaEl.textContent = e.message || 'Error';
            showToast(e.message || 'Suggestions failed.', 'error');
        }
    }

    async function sendChatPrompt(userText) {
        if (!userProfile.tourGuide) {
            showToast('Turn on AI Tour Guide to chat.', 'info');
            return;
        }
        try {
            const profileSummary = `Tempo:${userPreferences.tempo}|Price:${userPreferences.price}|Transport:${userPreferences.transportation}|TourGuide:${userPreferences.tourGuide}|Liked:${(userProfile.likedTags || []).join(', ')}`;
            const contextSummary = lastAiContext
                ? `Last event: ${lastAiContext.status} - ${lastAiContext.activityTitle || ''} at ${lastAiContext.activityTime || 'TBD'} (${lastAiContext.activityDuration || 'n/a'}). Arrived at: ${lastAiContext.arrivalIso || 'n/a'}. Note: ${lastAiContext.timingNote || ''}. Details: ${lastAiContext.activityDetails || ''}. ${lastAiContext.insta ? 'Insta tip: ' + lastAiContext.insta : ''}. Next scheduled: ${lastAiContext.nextStopTitle || 'unknown'} at ${lastAiContext.nextStopTime || 'TBD'}. Today: ${lastAiContext.daySummary || ''}. Completed: ${(lastAiContext.completedTitles || []).join(', ')}. Weather: ${lastAiContext.weatherDesc || 'n/a'}. Current stop outdoor: ${lastAiContext.isCurrentOutdoor ? 'yes' : 'no'}. Next stop outdoor: ${lastAiContext.isNextOutdoor ? 'yes' : 'no'}.`
                : 'No recent check-in.';
            const nowStr = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            const scheduleDetail = lastAiContext?.dayScheduleDetail || 'Schedule unknown';
            const systemContent = `You are a concise travel assistant for Chicago trips. Keep responses brief and actionable. User profile: ${profileSummary}. Context: ${contextSummary}. Current local time: ${nowStr}. Today schedule: ${scheduleDetail}. If weather is bad and next stop is outdoor, ask to swap to an indoor alternative. You cannot modify the itinerary; propose changes and ask for confirmation before reordering or moving items to another day. Prefer the next scheduled stop unless the user asks to change. Include short directions if possible.`;
            const reply = await callAssistant([
                { role: 'system', content: systemContent },
                { role: 'user', content: userText }
            ]);
            const safeReply = reply || 'No response received.';
            appendChatBubble(safeReply, false);
        const chatContent = document.getElementById('assistantContent');
        if (chatContent) {
            const bot = document.createElement('div');
            const label = document.createElement('strong');
            label.textContent = 'AI: ';
            const message = document.createElement('span');
            message.textContent = safeReply;
            bot.appendChild(label);
            bot.appendChild(message);
            bot.style.color = 'var(--secondary-text)';
            bot.style.marginBottom = '10px';
            chatContent.appendChild(bot);
        }
        showAssistant(''); // ensure drawer is open (drawer mirrors convo)
    } catch (e) {
        console.error(e);
        showToast(e.message || 'AI request failed.', 'error');
    }
    }
    
    /* ---------- MAP ---------- */
    const CHICAGO_BOUNDS = {
        minLat: 41.79,
        maxLat: 41.92,
        minLng: -87.67,
        maxLng: -87.58
    };

    function coordsToPercent(lat, lng) {
        const latRange = CHICAGO_BOUNDS.maxLat - CHICAGO_BOUNDS.minLat;
        const lngRange = CHICAGO_BOUNDS.maxLng - CHICAGO_BOUNDS.minLng;

        const latPercent = ((lat - CHICAGO_BOUNDS.minLat) / latRange) * 100;
        const lngPercent = ((lng - CHICAGO_BOUNDS.minLng) / lngRange) * 100;

        return {
            top: `${100 - latPercent}%`,
            left: `${lngPercent}%`
        };
    }

    function handleMainMapClick() {
        showDayMap(currentDayMapData.dayNumber, currentDayMapData.activities);
    }

    function showDayMap(dayNumber, activities) {
        const mapModal = document.getElementById('dayMapModal');
        const mapContainer = document.getElementById('dayMapContainer');
        const mapTitle = document.getElementById('mapModalTitle');
        const mapLegend = document.getElementById('mapLegend');

        mapTitle.textContent = `Day ${dayNumber} Itinerary Map`;
        mapLegend.innerHTML = '';
        
        if (!activities || activities.length === 0) {
            mapContainer.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--secondary-text); font-size:0.86rem;">No activities found for this day.</div>';
        } else {
            if (!dayMapInstance) {
                mapContainer.innerHTML = '';
                dayMapInstance = L.map(mapContainer).setView([41.8781, -87.6298], 11);
                L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
                    maxZoom: 19,
                    attribution: '&copy; OpenStreetMap &copy; CartoDB'
                }).addTo(dayMapInstance);
            }
            if (!dayMapMarkers) {
                dayMapMarkers = L.layerGroup().addTo(dayMapInstance);
            } else {
                dayMapMarkers.clearLayers();
            }

            let legendHtml = '';
            let bounds = [];
            activities.forEach((activity, index) => {
                const lat = activity.lat;
                const lng = activity.lng;
                if (lat && lng) {
                    const marker = L.marker([lat, lng]).addTo(dayMapMarkers);
                    marker.bindPopup(`${index + 1}. ${activity.title}<br>${activity.time || 'TBD'}`);
                    bounds.push([lat, lng]);
                }
                legendHtml += `<span style="margin-right:12px; display: flex; align-items: center; gap: 5px;">
                    <span style="color:var(--accent-gold); font-weight:700; background: var(--primary-bg); border-radius: 4px; padding: 1px 4px;">${index + 1}</span> 
                    ${activity.title} (${activity.time || 'TBD'})
                </span>`;
            });
            if (bounds.length) {
                dayMapInstance.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
            } else {
                dayMapInstance.setView([41.8781, -87.6298], 11);
            }
            setTimeout(() => { if (dayMapInstance) dayMapInstance.invalidateSize(); }, 80);
            mapLegend.innerHTML = legendHtml;
        }

        mapModal.style.display = 'flex';
    }
    
    const simulateWeather = (date) => { 
        const month = date.getMonth();
        const icons = { sun: '<i class="fa-solid fa-sun"></i>', cloud: '<i class="fa-solid fa-cloud"></i>', rain: '<i class="fa-solid fa-cloud-rain"></i>', snow: '<i class="fa-solid fa-snowflake"></i>' };
        if (month >= 11 || month <= 2) { return { icon: icons.snow, temp: "-5&deg;C", desc: "Snowy" }; } 
        else if (month >= 5 && month <= 8) { return { icon: icons.sun, temp: "28&deg;C", desc: "Sunny" }; } 
        else { return Math.random() > 0.5 ? { icon: icons.cloud, temp: "15&deg;C", desc: "Cloudy" } : { icon: icons.rain, temp: "12&deg;C", desc: "Rainy" }; }
    };

    /* ---------- COMPLETE TRIP & PROFILE TRIPS ---------- */
    function completeCurrentTrip() {
        if (!currentItinerary || !Array.isArray(currentItinerary)) {
            showToast('No active itinerary to complete.', 'error');
            return;
        }

        let start = null;
        let end = null;

        if (userProfile.startDate && userProfile.endDate) {
            start = new Date(userProfile.startDate);
            end = new Date(userProfile.endDate);
        } else if (selectedDates && selectedDates.length === 2) {
            start = selectedDates[0];
            end = selectedDates[1];
        }

        if (!start || !end) {
            showToast('Trip dates not found. Please create a new plan.', 'error');
            return;
        }

        const dates = getDaysArray(start, end);
        let activitiesCount = 0;
        currentItinerary.forEach(day => {
            activitiesCount += (Array.isArray(day) ? day.length : 0);
        });

        const trip = {
            id: 'trip_' + Date.now(),
            title: `Chicago Trip - ${dates.length} Day${dates.length > 1 ? 's' : ''}`,
            startDate: start.toISOString(),
            endDate: end.toISOString(),
            createdAt: new Date().toISOString(),
            status: 'completed',
            daysCount: dates.length,
            activitiesCount: activitiesCount,
            profileSnapshot: {
                tempo: userPreferences.tempo,
                price: userPreferences.price,
                transportation: userPreferences.transportation,
                tourGuide: userPreferences.tourGuide,
                likedTags: [...likedTags]
            }
        };

        const trips = loadTrips();
        trips.push(trip);
        saveTrips(trips);
        renderTripsOnProfile();

        showToast('Trip saved to your profile.', 'success');
    }

    function toggleTripDetails(id) {
        const el = document.getElementById(`tripDetails-${id}`);
        if (!el) return;
        const trips = loadTrips();
        const trip = trips.find(t => t.id === id);
        if (!trip) return;
        if (!el.classList.contains('hidden') && el.innerHTML) {
            el.classList.add('hidden');
            el.innerHTML = '';
            return;
        }
        let detail = `Tempo: ${trip.profileSnapshot?.tempo || '-'} | Price: ${trip.profileSnapshot?.price || '-'} | Transport: ${trip.profileSnapshot?.transportation || '-'}`;
        detail += `<br>Liked tags: ${(trip.profileSnapshot?.likedTags || []).join(', ') || 'none'}`;
        el.innerHTML = detail;
        el.classList.remove('hidden');
    }

    function deleteTrip(id) {
        if (!confirm('Silmek istediginize emin misiniz?')) return;
        const trips = loadTrips().filter(t => t.id !== id);
        saveTrips(trips);
        renderTripsOnProfile();
        showToast('Trip deleted.', 'info');
    }

    function renderTripsOnProfile() {
        const container = document.getElementById('previousTripsContainer');
        const info = document.getElementById('profileTripsInfo');
        const emptyState = document.getElementById('profileTripsEmptyState');
        const trips = loadTrips();

        if (!container || !info) return;

        if (!trips || trips.length === 0) {
            container.innerHTML = '';
            info.textContent = 'No completed trips yet.';
            if (emptyState) emptyState.style.display = 'block';
            return;
        }

        info.textContent = `You have ${trips.length} completed trip${trips.length > 1 ? 's' : ''}.`;
        if (emptyState) emptyState.style.display = 'none';
        container.innerHTML = '';

        trips
            .slice()
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .forEach(trip => {
                const start = new Date(trip.startDate);
                const end = new Date(trip.endDate);
                const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                const createdStr = new Date(trip.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

                const safeTitle = cleanText(trip.title || 'Trip');

                const div = document.createElement('div');
                div.className = 'profile-trip-card';
                div.innerHTML = `
                    <div class="profile-trip-title">${safeTitle}</div>
                    <div class="profile-trip-meta">
                        ${startStr} - ${endStr} - ${trip.daysCount} day${trip.daysCount > 1 ? 's' : ''}, ${trip.activitiesCount} activities<br>
                        Saved on ${createdStr}
                    </div>
                    <div style="margin-top:6px; display:flex; gap:8px;">
                        <button class="btn-secondary btn" style="padding:6px 10px; font-size:0.8rem;" onclick="toggleTripDetails('${trip.id}')">View details</button>
                        <button class="btn-secondary btn" style="padding:6px 10px; font-size:0.8rem; border-color: var(--danger); color: var(--danger);" onclick="deleteTrip('${trip.id}')">Delete</button>
                    </div>
                    <div class="profile-trip-details hidden" id="tripDetails-${trip.id}" style="margin-top:8px; font-size:0.82rem; color: var(--secondary-text);"></div>
                `;
                container.appendChild(div);
            });
    }

    /* ---------- INITIALIZE ---------- */
    document.addEventListener('DOMContentLoaded', async () => {
        // sanitize stored trips once to remove bad characters
        const trips = loadTrips();
        let tripsChanged = false;
        const cleanedTrips = trips.map(t => {
            const cleanTitle = cleanText(t.title || '');
            const cleanSummary = cleanTextMultiline(t.summaryText || '');
            if (cleanTitle !== (t.title || '') || cleanSummary !== (t.summaryText || '')) {
                tripsChanged = true;
                return { ...t, title: cleanTitle, summaryText: cleanSummary };
            }
            return t;
        });
        if (tripsChanged) saveTrips(cleanedTrips);

        let authed = false;
        authed = await hydrateSessionFromToken();
        if (!authed) {
            const stored = loadUser();
            if (stored) {
                currentUser = stored;
                authed = true;
            }
        }

        if (authed) {
            populateProfileUI();
            renderTripsOnProfile();
            clearPlannerState();
            showOnlySection('intro');
        } else {
            currentUser = null;
            setAuthMode('login');
            clearPlannerState();
            showOnlySection('home');
        }
        initPasswordToggles();
        applyTheme(settingsStore.theme || 'gold', false);
        hydrateSettingsUI();
        initCitySelector();
        hydratePlannerInputsFromProfile();
        updateAiUiVisibility();
        refreshSuggestedToday();
        initSignupTourGuideToggle();
    });

