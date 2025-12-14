import './state.js';
import {
    DEFAULT_CITY_COORDS,
    getWeatherSnapshotSync,
    prefetchWeatherForTripDates as prefetchWeatherForTripDatesBase,
    toPlainTemp
} from './services/weather.js';
import { fetchNearbyPlaces, fetchPlaceMetaByName, buildGoogleMapsSearchUrl } from './services/osm.js';
import { findNearestCtaStation, findNearbyCtaStations, fetchCtaTrainArrivals } from './services/cta.js';
import {
    haversineDistanceKm,
    estimateTravelMinutes,
    formatMinutesToClock,
    formatDurationLabel,
    getDurationMinutes,
    formatDistanceMiles,
    updateRouteChips as updateRouteChipsService
} from './services/routing.js';

    let setActiveDayExternal = null;
    const PLAN_INSIGHTS_DISMISSED_KEY = 'assistant_plan_insights_dismissed_v1';
    let planInsightsDismissed = (() => {
        try { return JSON.parse(localStorage.getItem(PLAN_INSIGHTS_DISMISSED_KEY)) || {}; } catch (e) { return {}; }
    })();
    const savePlanInsightsDismissed = () => {
        try { localStorage.setItem(PLAN_INSIGHTS_DISMISSED_KEY, JSON.stringify(planInsightsDismissed)); } catch (e) {}
    };
    function dismissPlanInsight(insightId) {
        const planKey = getPlanKey();
        if (!planInsightsDismissed[planKey]) planInsightsDismissed[planKey] = {};
        planInsightsDismissed[planKey][insightId] = Date.now();
        savePlanInsightsDismissed();
        renderPlanInsights();
    }
    function isPlanInsightDismissed(insightId) {
        const planKey = getPlanKey();
        return !!planInsightsDismissed?.[planKey]?.[insightId];
    }

    const PLAN_SUGGESTIONS_HINT_SEEN_KEY = 'assistant_plan_suggestions_hint_seen_v1';
    let planSuggestionsHintSeen = (() => {
        try { return JSON.parse(localStorage.getItem(PLAN_SUGGESTIONS_HINT_SEEN_KEY)) || {}; } catch (e) { return {}; }
    })();
    let planSuggestionsHintTimeout = null;
    const savePlanSuggestionsHintSeen = () => {
        try { localStorage.setItem(PLAN_SUGGESTIONS_HINT_SEEN_KEY, JSON.stringify(planSuggestionsHintSeen)); } catch (e) {}
    };
    function hasSeenPlanSuggestionsHint(planKey = getPlanKey()) {
        return !!planSuggestionsHintSeen?.[planKey];
    }
    function markPlanSuggestionsHintSeen(planKey = getPlanKey()) {
        planSuggestionsHintSeen[planKey] = Date.now();
        savePlanSuggestionsHintSeen();
    }

    function isPlanFullyConfirmed(planKey = getPlanKey()) {
        if (!currentItinerary || !Array.isArray(currentItinerary) || currentItinerary.length === 0) return false;
        if (isPlanLocked(planKey)) return true;
        if (bookingDeferred?.[planKey]) return true;
        const dayMap = confirmedDays?.[planKey] || {};
        const allConfirmed = currentItinerary.every((_, idx) => !!dayMap[idx + 1]);
        return allConfirmed;
    }
    function openAssistantForSuggestion({ dayIndex, activityId, prefillText }) {
        if (!currentItinerary || !currentItinerary.length) return;
        if (typeof dayIndex === 'number' && setActiveDayExternal) {
            setActiveDayExternal(dayIndex);
        }
        const day = typeof dayIndex === 'number' ? (currentItinerary[dayIndex] || []) : getActiveDayActivities();
        const target = activityId ? day.find(a => String(a.id) === String(activityId)) : null;
        assistantSelectedActivity = target || (day[0] || null);
        assistantMode = ASSISTANT_STATES.REFINEMENT_CHAT;
        assistantPendingSave = false;
        assistantLastSnapshot = JSON.stringify(getActiveDayActivities());
        renderAssistantInline();
        const panel = document.getElementById('assistantPanel');
        if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const input = document.getElementById('assistantChangeInput');
        if (input && prefillText) {
            input.value = prefillText;
            input.focus();
        }
    }
    function parseMilesFromLabel(label) {
        const m = String(label || '').match(/([\d.]+)\s*mi/i);
        if (!m) return null;
        const n = Number(m[1]);
        return Number.isFinite(n) ? n : null;
    }
    function getFirstLegMilesForActiveDay() {
        const day = getActiveDayActivities();
        if (!day || !day.length) return null;
        const label = day[0]?._lastDistance;
        const parsed = parseMilesFromLabel(label);
        if (typeof parsed === 'number') return parsed;

        const first = day[0];
        const loc = settingsStore?.locationEnabled ? getUserLocationSnapshot(1000 * 60 * 2) : null;
        if (loc && typeof first?.lat === 'number' && typeof first?.lng === 'number') {
            const km = haversineDistanceKm({ lat: loc.lat, lng: loc.lng }, { lat: first.lat, lng: first.lng });
            const miles = km * 0.621371;
            return Number.isFinite(miles) ? miles : null;
        }
        return null;
    }
    function renderPlanInsights() {
        const bannerEl = document.getElementById('planBannerHost');
        const listEl = document.getElementById('planSuggestions');
        if (!bannerEl || !listEl) return;

        const hasPlan = currentItinerary && Array.isArray(currentItinerary) && currentItinerary.length > 0;
        if (!hasPlan) {
            bannerEl.style.display = 'none';
            listEl.style.display = 'none';
            return;
        }

        if (!isPlanFullyConfirmed()) {
            bannerEl.style.display = 'none';
            bannerEl.innerHTML = '';
            listEl.style.display = 'none';
            listEl.innerHTML = '';
            if (planSuggestionsHintTimeout) {
                clearTimeout(planSuggestionsHintTimeout);
                planSuggestionsHintTimeout = null;
            }
            return;
        }

        const insights = computePlanInsights();
        const banner = (insights.banner && !isPlanInsightDismissed(insights.banner.id)) ? insights.banner : null;
        const suggestions = insights.suggestions || [];

        if (banner) {
            bannerEl.style.display = 'flex';
            bannerEl.innerHTML = `
                <div>
                    <strong>${banner.title}</strong>
                    <div class="meta">${banner.subtitle || ''}</div>
                </div>
                <div class="actions">
                    ${(banner.primaryCta || []).map(btn => `<button class="assistant-chip" onclick="${btn.onClick}">${btn.label}</button>`).join('')}
                    ${(banner.dismissible ? `<button class="assistant-chip" style="opacity:0.85;" onclick="dismissPlanInsight('${banner.id}')">Dismiss</button>` : '')}
                </div>
            `;
        } else {
            bannerEl.style.display = 'none';
            bannerEl.innerHTML = '';
        }

        const visibleSuggestions = suggestions.filter(s => !isPlanInsightDismissed(s.id));
        if (!visibleSuggestions.length) {
            if (hasSeenPlanSuggestionsHint()) {
                listEl.style.display = 'none';
                listEl.innerHTML = '';
                return;
            }

            listEl.style.display = 'grid';
            listEl.innerHTML = `
                    <div class="plan-suggestion-card" style="opacity:0.9;">
                        <div class="plan-suggestion-icon" style="background: rgba(148,163,184,0.10); border-color: rgba(148,163,184,0.22); color: rgba(226,232,240,0.95);">
                            <i class="fa-solid fa-lightbulb"></i>
                        </div>
                        <div style="flex:1;">
                            <div class="plan-suggestion-title">Suggestions will appear here</div>
                            <div class="plan-suggestion-sub">When weather, timing, distance, or bookings affect your plan, you will get quick, optional recommendations here.</div>
                        </div>
                    </div>
                `;

            if (planSuggestionsHintTimeout) clearTimeout(planSuggestionsHintTimeout);
            planSuggestionsHintTimeout = setTimeout(() => {
                markPlanSuggestionsHintSeen();
                renderPlanInsights();
            }, 7000);
            return;
        }

        if (!hasSeenPlanSuggestionsHint()) {
            markPlanSuggestionsHintSeen();
            if (planSuggestionsHintTimeout) {
                clearTimeout(planSuggestionsHintTimeout);
                planSuggestionsHintTimeout = null;
            }
        }
        listEl.style.display = 'grid';
        listEl.innerHTML = visibleSuggestions.map(s => `
            <div class="plan-suggestion-card">
                <div class="plan-suggestion-icon"><i class="${s.iconClass}"></i></div>
                <div style="flex:1;">
                    <div class="plan-suggestion-title">${s.title}</div>
                    <div class="plan-suggestion-sub">${s.subtitle || ''}</div>
                    <div class="plan-suggestion-actions">
                        ${(s.actions || []).map(btn => `<button class="assistant-chip" onclick="${btn.onClick}">${btn.label}</button>`).join('')}
                        ${(s.dismissible ? `<button class="assistant-chip" style="opacity:0.85;" onclick="dismissPlanInsight('${s.id}')">Dismiss</button>` : '')}
                    </div>
                </div>
            </div>
        `).join('');
    }

    function computePlanInsights() {
        const dayDate = tripDates && tripDates[activeDayIndex] ? tripDates[activeDayIndex] : null;
        const weather = dayDate ? getWeatherSnapshotSync(dayDate) : null;
        const dayActivities = getActiveDayActivities();
        const outdoorActs = (dayActivities || []).filter(a => isOutdoor(a));

        const suggestions = [];
        let banner = null;

        // Level B: plan lock summary (action needed, but not modal)
        if (isPlanLocked()) {
            banner = {
                id: 'plan_locked',
                title: 'Plan locked due to bookings',
                subtitle: 'Booked stops are locked. You can still use Tour Guide and check-ins.',
                dismissible: true,
                primaryCta: [
                    { label: 'Review bookings', onClick: `setAssistantMode('${ASSISTANT_STATES.BOOKING_ALERT}')` }
                ]
            };
        }

        // Level A: weather-based suggestion
        if (weather && outdoorActs.length) {
            const isRisk = ['Rain', 'Rain showers', 'Snow', 'Thunderstorm'].includes(weather.desc) || (typeof weather.precipProb === 'number' && weather.precipProb >= 50);
            if (isRisk) {
                const target = outdoorActs[0];
                suggestions.push({
                    id: 'weather_outdoor_swap',
                    iconClass: 'fa-solid fa-cloud-rain',
                    title: 'Weather may affect outdoor stops',
                    subtitle: `Forecast shows ${weather.desc}${typeof weather.precipProb === 'number' ? ` (${weather.precipProb}% precip.)` : ''}. Consider swapping or rescheduling outdoor activities.`,
                    dismissible: true,
                    actions: [
                        { label: 'Review in Assistant', onClick: `openAssistantForSuggestion({ dayIndex: ${activeDayIndex}, activityId: ${JSON.stringify(target.id)}, prefillText: ${JSON.stringify('Swap this outdoor activity with an indoor alternative and adjust times if needed.')} })` }
                    ]
                });
            }
        }

        // Level A: transit hint for long first leg (Chicago CTA placeholder)
        const firstLegMiles = getFirstLegMilesForActiveDay();
        const transportMode = getTransportMode();
        if (settingsStore?.locationEnabled && transportMode === 'walk' && typeof firstLegMiles === 'number' && firstLegMiles >= 1.5) {
            suggestions.push({
                id: 'transit_hint_long_leg',
                iconClass: 'fa-solid fa-train-subway',
                title: 'Consider CTA transit for a long walk',
                subtitle: `Your first leg is about ${firstLegMiles.toFixed(1)} mi. Public transit can save time for longer distances.`,
                dismissible: true,
                actions: [
                    { label: 'Open transit options', onClick: 'openTransitPreview()' }
                ]
            });
        }

        return { banner, suggestions };
    }

/* --------- DATA: 3 TEST EXPERIENCES ---------- */
    const experiences = [
        { id: 1, title: "Luxury Helicopter Tour", category: "Adventure", price: 3, img: "https://images.unsplash.com/photo-1540962351504-03099e0a754b?q=80&fm=jpg&crop=entropy&cs=tinysrgb&w=600", tag: "luxury", details: "A 30-minute private helicopter ride offering unmatched views of the Magnificent Mile and Lake Michigan.", insta: "Best shot is the tilt-shift view looking straight down at The Loop. Use a wide-angle lens!", time: "10:00", duration: "45 min", lat: 41.9407935, lng: -87.6443132, address: "3209 N Broadway, Chicago, IL 60657", requiresBooking: true },
        { id: 2, title: "Deep Dish Pizza (Lou Malnati's)", category: "Food", price: 2, img: "https://images.unsplash.com/photo-1619860167683-176375037549?q=80&fm=jpg&crop=entropy&cs=tinysrgb&w=600", tag: "food_mid", details: "Experience authentic Chicago-style deep-dish pizza. Recommended: Buttercrust with sausage.", insta: "Get a close-up of the cheese pull before you slice the pie! Make sure the tomato sauce looks vibrant.", time: "12:30", duration: "1 hr 15 min", lat: 41.9882449, lng: -87.6554399, address: "5822 N Sheridan Rd, Chicago, IL 60660", requiresBooking: false },
        { id: 3, title: "Alinea (3-Star Michelin)", category: "Fine Dining", price: 3, img: "https://images.unsplash.com/photo-1559339352-11d035aa65de?q=80&fm=jpg&crop=entropy&cs=tinysrgb&w=600", tag: "luxury_food", details: "World-renowned culinary experience. This is an evening activity requiring formal attire and advance booking.", insta: "Capture the artistic presentation of the floating dessert course. Use soft, directional lighting.", time: "19:00", duration: "3 hr", lat: 41.9161, lng: -87.6483, requiresBooking: true }
    ];

    const CITY_OPTIONS = [
        { id: 'chicago', label: 'Chicago', region: 'Illinois, USA' }
    ];

    async function hydrateSessionFromToken() {
        const token = window.getAuthToken();
        if (!token) return false;
        try {
            const { user } = await window.apiRequest('/api/me');
            currentUser = user;
            window.saveUser(user);
            return true;
        } catch (e) {
            window.clearSessionToken();
            return false;
        }
    }

    let currentUser = null;
    let userProfile = window.loadProfile();

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
    let favorites = window.loadFavorites();
    let settingsStore = window.loadSettingsStore();

    const USER_LOCATION_STORAGE_KEY = 'assistant_user_location_v1';
    function loadUserLocation() {
        try { return JSON.parse(localStorage.getItem(USER_LOCATION_STORAGE_KEY)) || null; } catch (e) { return null; }
    }
    function saveUserLocation(data) {
        try { localStorage.setItem(USER_LOCATION_STORAGE_KEY, JSON.stringify(data)); } catch (e) {}
    }
    function clearUserLocation() {
        try { localStorage.removeItem(USER_LOCATION_STORAGE_KEY); } catch (e) {}
    }
    function getUserLocationSnapshot(maxAgeMs = 1000 * 60 * 60 * 6) {
        const snap = loadUserLocation();
        if (!snap || !snap.ts) return null;
        if (Date.now() - snap.ts > maxAgeMs) return null;
        if (typeof snap.lat !== 'number' || typeof snap.lng !== 'number') return null;
        return snap;
    }
    function requestUserLocationOnce(timeoutMs = 10000) {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocation is not available in this browser.'));
                return;
            }
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const lat = pos?.coords?.latitude;
                    const lng = pos?.coords?.longitude;
                    const accuracy = pos?.coords?.accuracy;
                    if (typeof lat !== 'number' || typeof lng !== 'number') {
                        reject(new Error('Could not read your location.'));
                        return;
                    }
                    resolve({ lat, lng, accuracy, ts: Date.now() });
                },
                (err) => reject(err),
                { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 1000 * 60 * 5 }
            );
        });
    }

    const LOCATION_PROMPT_DISMISSED_KEY = 'assistant_location_prompt_dismissed_v1';
    let locationPromptDismissed = (() => {
        try { return JSON.parse(localStorage.getItem(LOCATION_PROMPT_DISMISSED_KEY)) || {}; } catch (e) { return {}; }
    })();
    const saveLocationPromptDismissed = () => {
        try { localStorage.setItem(LOCATION_PROMPT_DISMISSED_KEY, JSON.stringify(locationPromptDismissed)); } catch (e) {}
    };
    function isLocationPromptDismissed(planKey = getPlanKey(), cooldownMs = 1000 * 60 * 60 * 24) {
        const ts = locationPromptDismissed?.[planKey];
        if (!ts) return false;
        return Date.now() - ts < cooldownMs;
    }
    function updateLocationPlanPromptVisibility() {
        const el = document.getElementById('locationPermissionPrompt');
        if (!el) return;
        const hasPlan = currentItinerary && Array.isArray(currentItinerary) && currentItinerary.length > 0;
        const canAsk = typeof navigator !== 'undefined' && !!navigator.geolocation;
        const shouldShow =
            hasPlan &&
            canAsk &&
            !settingsStore?.locationEnabled &&
            !isLocationPromptDismissed(getPlanKey());
        el.style.display = shouldShow ? 'flex' : 'none';
    }
    function dismissLocationPlanPrompt() {
        locationPromptDismissed[getPlanKey()] = Date.now();
        saveLocationPromptDismissed();
        updateLocationPlanPromptVisibility();
    }
    async function enableLocationFromPlanPrompt() {
        const settingsToggle = document.getElementById('settingsLocationToggle');
        if (settingsToggle) settingsToggle.checked = true;
        await toggleLocationFromSettings(true);
        if (settingsStore?.locationEnabled) {
            delete locationPromptDismissed[getPlanKey()];
            saveLocationPromptDismissed();
        }
        updateLocationPlanPromptVisibility();
    }

    /* ---------- ARRIVAL DETECTION (GPS + DWELL) ---------- */
    const ARRIVAL_STORAGE_KEY = 'assistant_arrival_state_v1';
    const ARRIVAL_RADIUS_METERS = 100;
    const ARRIVAL_DWELL_MS = 1000 * 60 * 2;
    const ARRIVAL_SNOOZE_MS = 1000 * 60 * 10;
    const ARRIVAL_PROMPT_CLEAR_METERS = 250;

    function loadArrivalState() {
        try { return JSON.parse(localStorage.getItem(ARRIVAL_STORAGE_KEY)) || {}; } catch (e) { return {}; }
    }
    function saveArrivalState(state) {
        try { localStorage.setItem(ARRIVAL_STORAGE_KEY, JSON.stringify(state || {})); } catch (e) {}
    }
    let arrivalState = loadArrivalState();

    let geoWatchId = null;
    let arrivalCandidate = null; // { stopKey, enteredAt }
    let arrivalPromptShownFor = null; // stopKey

    function getStopKey(dayNumber, activityId) {
        return `${dayNumber}-${activityId}`;
    }

    function getArrivalBucket(planKey = getPlanKey()) {
        if (!planKey) planKey = 'plan';
        if (!arrivalState[planKey]) {
            arrivalState[planKey] = { confirmed: {}, snoozedUntil: {} };
            saveArrivalState(arrivalState);
        }
        return arrivalState[planKey];
    }

    function isStopArrivalConfirmed(dayNumber, activityId, planKey = getPlanKey()) {
        const bucket = getArrivalBucket(planKey);
        return !!bucket.confirmed?.[getStopKey(dayNumber, activityId)];
    }

    function isArrivalPromptSnoozed(dayNumber, activityId, planKey = getPlanKey()) {
        const bucket = getArrivalBucket(planKey);
        const until = bucket.snoozedUntil?.[getStopKey(dayNumber, activityId)];
        return typeof until === 'number' && Date.now() < until;
    }

    function snoozeArrivalPrompt(dayNumber, activityId, ms = ARRIVAL_SNOOZE_MS, planKey = getPlanKey()) {
        const bucket = getArrivalBucket(planKey);
        bucket.snoozedUntil[getStopKey(dayNumber, activityId)] = Date.now() + ms;
        saveArrivalState(arrivalState);
    }

    function confirmStopArrival(dayNumber, activityId, meta = {}, planKey = getPlanKey()) {
        const bucket = getArrivalBucket(planKey);
        bucket.confirmed[getStopKey(dayNumber, activityId)] = { ts: Date.now(), ...meta };
        delete bucket.snoozedUntil[getStopKey(dayNumber, activityId)];
        saveArrivalState(arrivalState);
    }

    function isResultsSectionActive() {
        const el = document.getElementById('results');
        return !!el && el.classList.contains('active');
    }

    function shouldTrackArrivals() {
        if (!isResultsSectionActive()) return false;
        if (!settingsStore?.locationEnabled) return false;
        if (!navigator.geolocation) return false;
        return true;
    }

    function haversineMeters(lat1, lng1, lat2, lng2) {
        const R = 6371000;
        const toRad = (d) => (d * Math.PI) / 180;
        const dLat = toRad(lat2 - lat1);
        const dLng = toRad(lng2 - lng1);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    function getNextArrivableStop() {
        if (!currentItinerary || !currentItinerary.length) return null;
        const dayNumber = activeDayIndex + 1;
        const day = getActiveDayActivities();
        if (!day || !day.length) return null;
        const next = day.find(a => a && typeof a.lat === 'number' && typeof a.lng === 'number' && !isStopArrivalConfirmed(dayNumber, a.id));
        if (!next) return null;
        return { dayNumber, activity: next };
    }

    function clearArrivalPromptUi() {
        const host = document.getElementById('arrivalPromptHost');
        if (!host) return;
        host.style.display = 'none';
        host.innerHTML = '';
        arrivalPromptShownFor = null;
    }

    function renderArrivalPromptUi(dayNumber, activity) {
        const host = document.getElementById('arrivalPromptHost');
        if (!host || !activity) return;
        const title = activity.title || 'this stop';
        const stopKey = getStopKey(dayNumber, activity.id);
        arrivalPromptShownFor = stopKey;
        host.style.display = 'flex';
        host.innerHTML = `
            <div>
                <strong>Looks like you're at ${title}.</strong>
                <div class="meta">Start your on-site tour with Wise? (Detected within ~${ARRIVAL_RADIUS_METERS}m for 2+ minutes.)</div>
            </div>
            <div class="actions">
                <button class="assistant-chip" onclick="respondToArrivalPrompt(true, ${dayNumber}, ${activity.id})">Yes, start</button>
                <button class="assistant-chip" style="opacity:0.9;" onclick="respondToArrivalPrompt(false, ${dayNumber}, ${activity.id})">Not yet</button>
            </div>
        `;
    }

    function evaluateArrivalFromLocation(locationSnap) {
        if (!shouldTrackArrivals()) {
            arrivalCandidate = null;
            clearArrivalPromptUi();
            return;
        }
        if (!isTourGuideActive() || !isPlanFullyConfirmed()) {
            arrivalCandidate = null;
            clearArrivalPromptUi();
            return;
        }
        const target = getNextArrivableStop();
        if (!target) {
            arrivalCandidate = null;
            clearArrivalPromptUi();
            return;
        }

        const { dayNumber, activity } = target;
        if (!activity || typeof activity.lat !== 'number' || typeof activity.lng !== 'number') return;
        const distanceM = haversineMeters(locationSnap.lat, locationSnap.lng, activity.lat, activity.lng);

        if (arrivalPromptShownFor === getStopKey(dayNumber, activity.id) && distanceM > ARRIVAL_PROMPT_CLEAR_METERS) {
            arrivalCandidate = null;
            clearArrivalPromptUi();
            return;
        }

        if (distanceM <= ARRIVAL_RADIUS_METERS) {
            if (isArrivalPromptSnoozed(dayNumber, activity.id)) return;
            if (!arrivalCandidate || arrivalCandidate.stopKey !== getStopKey(dayNumber, activity.id)) {
                arrivalCandidate = { stopKey: getStopKey(dayNumber, activity.id), enteredAt: Date.now() };
                return;
            }
            if (Date.now() - arrivalCandidate.enteredAt >= ARRIVAL_DWELL_MS) {
                if (arrivalPromptShownFor !== getStopKey(dayNumber, activity.id) && !isStopArrivalConfirmed(dayNumber, activity.id)) {
                    renderArrivalPromptUi(dayNumber, activity);
                }
            }
            return;
        }

        if (arrivalCandidate && arrivalCandidate.stopKey === getStopKey(dayNumber, activity.id)) {
            arrivalCandidate = null;
        }
    }

    function updateArrivalTracking() {
        if (!navigator.geolocation) return;
        if (!shouldTrackArrivals()) {
            if (geoWatchId !== null) {
                try { navigator.geolocation.clearWatch(geoWatchId); } catch (e) {}
                geoWatchId = null;
            }
            arrivalCandidate = null;
            clearArrivalPromptUi();
            return;
        }

        if (geoWatchId !== null) return;
        let lastRouteUpdate = 0;
        geoWatchId = navigator.geolocation.watchPosition(
            (pos) => {
                const lat = pos?.coords?.latitude;
                const lng = pos?.coords?.longitude;
                const accuracy = pos?.coords?.accuracy;
                if (typeof lat !== 'number' || typeof lng !== 'number') return;
                const snap = { lat, lng, accuracy, ts: Date.now() };
                saveUserLocation(snap);
                if (currentItinerary && currentItinerary.length) {
                    const now = Date.now();
                    if (now - lastRouteUpdate > 5000) {
                        lastRouteUpdate = now;
                        updateRouteChips(activeDayIndex + 1);
                    }
                }
                evaluateArrivalFromLocation(snap);
            },
            (err) => {
                if (err?.code === 1) {
                    showToast('Location permission denied. Enable it to use arrival detection.', 'info');
                }
                try { navigator.geolocation.clearWatch(geoWatchId); } catch (e) {}
                geoWatchId = null;
            },
            { enableHighAccuracy: false, maximumAge: 5000, timeout: 15000 }
        );
    }

    let lastAiContext = null;
    let assistantOpen = false;
    let assistantFullscreen = false;
    let assistantState = 'mid'; // legacy drawer (unused)
    let assistantChatMode = false;
    let assistantDragStartY = null;
    let assistantDragActive = false;
    const ASSISTANT_STATES = {
        REFINEMENT_INITIAL: 'refinement_initial',
        REFINEMENT_PICK_ACTIVITY: 'refinement_pick',
        REFINEMENT_CHAT: 'refinement_chat',
        REFINEMENT_POST_CHANGE: 'refinement_post_change',
        BOOKING_ALERT: 'booking_alert',
        BOOKING_CONFIRM: 'booking_confirm',
        BOOKING_DEFER: 'booking_defer',
        TOUR_GUIDE_READY: 'tour_guide_ready',
        TRANSIT_INFO: 'transit_info'
    };
    const ALLOWED_ASSISTANT_STATES = new Set(Object.values(ASSISTANT_STATES));
    let assistantMode = ASSISTANT_STATES.REFINEMENT_INITIAL;
    let assistantSelectedActivity = null;
    let assistantPendingSave = false;
    let assistantLastChangeMessage = '';
    let assistantLastSnapshot = null;
    let activeDayIndex = 0;
    let dayMapInstance = null;
    let dayMapMarkers = null;
    const loadCheckins = window.loadCheckins;
    const saveCheckins = window.saveCheckins;
    let checkins = loadCheckins();
    const loadBookings = window.loadBookings;
    const saveBookings = window.saveBookings;
    let bookings = loadBookings();
    let planLocks = (() => {
        try { return JSON.parse(localStorage.getItem('assistant_plan_locks_v1')) || {}; } catch (e) { return {}; }
    })();
    let bookingDeferred = (() => {
        try { return JSON.parse(localStorage.getItem('assistant_booking_deferred_v1')) || {}; } catch (e) { return {}; }
    })();
    let tourGuideUnlocked = (() => {
        try { return JSON.parse(localStorage.getItem('assistant_tour_guide_unlocked_v1')) || {}; } catch (e) { return {}; }
    })();
    let assistantBookingSummary = null;
    let assistantTransitHtml = '';
    let assistantPrevMode = null;

    const savePlanLocks = () => {
        try { localStorage.setItem('assistant_plan_locks_v1', JSON.stringify(planLocks)); } catch (e) {}
    };
    const saveBookingDeferred = () => {
        try { localStorage.setItem('assistant_booking_deferred_v1', JSON.stringify(bookingDeferred)); } catch (e) {}
    };
    const saveTourGuideUnlocked = () => {
        try { localStorage.setItem('assistant_tour_guide_unlocked_v1', JSON.stringify(tourGuideUnlocked)); } catch (e) {}
    };
    function isPlanLocked(planKey = getPlanKey()) {
        return !!planLocks[planKey];
    }
    function isTourGuideUnlocked(planKey = getPlanKey()) {
        return !!tourGuideUnlocked[planKey];
    }
    function setTourGuideUnlocked(planKey, unlocked) {
        if (!planKey) return;
        if (unlocked) tourGuideUnlocked[planKey] = true;
        else delete tourGuideUnlocked[planKey];
        saveTourGuideUnlocked();
    }
    function isTourGuideActive(planKey = getPlanKey()) {
        return !!userProfile.tourGuide && isTourGuideUnlocked(planKey);
    }
    function getAllBookedActivities() {
        if (!currentItinerary || !currentItinerary.length) return [];
        const list = [];
        currentItinerary.forEach((day, idx) => {
            (day || []).forEach(act => {
                if (act.requiresBooking && isBooked(idx + 1, act.id)) {
                    list.push({ ...act, dayNumber: idx + 1 });
                }
            });
        });
        return list;
    }
    let confirmedDays = {};
    let changeHistory = window.changeHistory || {};
    let assistantLastChangedActivityId = null;
    let assistantLastChangedDayIdx = null;
    const loadHistory = () => {
        try { return JSON.parse(localStorage.getItem('planner_change_history_v1')) || {}; } catch (e) { return {}; }
    };
    const saveHistory = () => {
        try { localStorage.setItem('planner_change_history_v1', JSON.stringify(changeHistory)); } catch (e) {}
    };
    const loadConfirmedDays = () => {
        try { return JSON.parse(localStorage.getItem('assistant_confirmed_days_v1')) || {}; } catch (e) { return {}; }
    };
    const saveConfirmedDays = () => {
        try { localStorage.setItem('assistant_confirmed_days_v1', JSON.stringify(confirmedDays)); } catch (e) {}
    };
    confirmedDays = loadConfirmedDays();
    changeHistory = loadHistory();
    window.changeHistory = changeHistory;

    function migrateStorage() {
        const ensureArray = (label, loader, saver) => {
            let data = loader();
            if (!Array.isArray(data)) {
                data = [];
                saver(data);
                showToast(`${label} store fixed.`, 'info');
            }
            return data;
        };
        favorites = ensureArray('Favorites', loadFavorites, saveFavorites);
        const trips = ensureArray('Trips', loadTrips, saveTrips);
        const cleanTrips = trips.map(t => {
            const cleanTitle = cleanText(t.title || '');
            const cleanSummary = cleanTextMultiline(t.summaryText || '');
            return { ...t, title: cleanTitle, summaryText: cleanSummary };
        });
        saveTrips(cleanTrips);
        bookings = loadBookings();
        changeHistory = loadHistory();
    }

    const cleanText = (str) => (str || '').replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim();
    const cleanTextMultiline = (str) => (str || '').replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ' ').replace(/[ ]{2,}/g, ' ').trim();
    const timeToMinutes = (timeStr) => {
        if (!timeStr || typeof timeStr !== 'string') return null;
        const match = timeStr.trim().match(/(\d{1,2}):(\d{2})/);
        if (!match) return null;
        return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
    };

    function sortActivitiesByTime(list) {
        if (!Array.isArray(list)) return [];
        return list
            .map((item, originalIndex) => ({ item, originalIndex }))
            .sort((a, b) => {
                const aMin = timeToMinutes(a.item?.time);
                const bMin = timeToMinutes(b.item?.time);
                const aVal = aMin === null ? Number.POSITIVE_INFINITY : aMin;
                const bVal = bMin === null ? Number.POSITIVE_INFINITY : bMin;
                if (aVal !== bVal) return aVal - bVal;
                return a.originalIndex - b.originalIndex;
            })
            .map(({ item }) => item);
    }

    function resortDayByTime(dayIdx) {
        if (!currentItinerary || !Array.isArray(currentItinerary)) return;
        if (dayIdx < 0 || dayIdx >= currentItinerary.length) return;
        const day = currentItinerary[dayIdx];
        if (!Array.isArray(day)) return;
        currentItinerary[dayIdx] = sortActivitiesByTime(day);
    }

    function resortAllDaysByTime() {
        if (!currentItinerary || !Array.isArray(currentItinerary)) return;
        currentItinerary.forEach((_, idx) => resortDayByTime(idx));
    }
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

    /* ---------- WEATHER (Open-Meteo + fallback) ---------- */
    function prefetchWeatherForTripDates(dates, coords = DEFAULT_CITY_COORDS) {
        if (!Array.isArray(dates) || !dates.length) return;
        prefetchWeatherForTripDatesBase(dates, coords).then(() => {
            try {
                renderItineraryUI(currentItinerary, tripDates || []);
                renderAssistantInline();
            } catch (e) {}
        });
    }

    function buildChatContext(dayNumber, activity, status, timingNote, arrivalIso) {
        const stops = getDayStopsWithStatus(dayNumber);
        const nextStop = getNextStopFromContext(dayNumber, activity ? activity.id : null);
        const completedTitles = stops.filter(s => s.completed).map(s => s.title);
        const dayDate = tripDates && tripDates[dayNumber - 1] ? new Date(tripDates[dayNumber - 1]) : new Date();
        const weather = getWeatherSnapshotSync(dayDate);
        const weatherDesc = `${weather.desc} ${toPlainTemp(weather.temp)}`.trim();
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
    const showToast = window.showToast;

    /* ---------- ASSISTANT & CHAT (AI toggle gated) ---------- */
    function updateAiUiVisibility() {
        const bar = document.getElementById('assistantBar');
        const chatBtn = document.getElementById('headerChatBtn');
        const shouldShow = isTourGuideActive();
        if (bar) bar.style.display = shouldShow ? 'flex' : 'none';
        if (chatBtn) chatBtn.style.display = shouldShow ? 'inline-flex' : 'none';
        updateArrivalTracking();
    }

    function showAssistant(messageHtml = 'Assistant is standing by.') {
        const drawer = document.getElementById('assistantDrawer');
        const bar = document.getElementById('assistantBar');
        const content = document.getElementById('assistantContent');
        const actions = document.getElementById('assistantActions');
        if (!drawer || !content) return;
        content.innerHTML = messageHtml;
        if (actions) actions.innerHTML = '';
        if (bar) bar.style.display = 'none';
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
        if (!isTourGuideActive()) return;
        const drawer = document.getElementById('assistantDrawer');
        const content = document.getElementById('assistantContent');
        const actions = document.getElementById('assistantActions');
        if (!drawer || !content || !actions) return;

        const { current, next, later, summary } = context;

        let routeHtml = '';
        if (current || next || (later && later.length)) {
            routeHtml += '<div class="assistant-route">';
            if (current) routeHtml += `<div class="assistant-stop"><span class="assistant-stop badge">Now</span><div><strong>${current.title}</strong><br><span>${current.time || 'TBD'} | ${current.duration || ''}</span></div></div>`;
            if (next) routeHtml += `<div class="assistant-stop"><span class="assistant-stop badge">Next</span><div><strong>${next.title}</strong><br><span>${next.time || 'TBD'} | ${next.duration || ''}</span></div></div>`;
            if (later && later.length) {
                later.slice(0,2).forEach((item, idx) => {
                    routeHtml += `<div class="assistant-stop"><span class="assistant-stop badge">L${idx+1}</span><div><strong>${item.title}</strong><br><span>${item.time || 'TBD'} | ${item.duration || ''}</span></div></div>`;
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

        // Simplified helper actions: only surface chat entry
        actions.innerHTML = `
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
        if (assistantState === 'collapsed') {
            setAssistantState('mid');
        } else if (assistantState === 'mid') {
            setAssistantState('full');
        } else {
            setAssistantState('collapsed');
        }
    }

    /* ---------- BOTTOM SHEET (ASSISTANT) ---------- */
    let sheetDragStartY = null;
    let sheetStartHeight = null;

    function setAssistantState(state) {
        assistantState = state;
        const drawer = document.getElementById('assistantDrawer');
        const bar = document.getElementById('assistantBar');
        const footer = document.querySelector('.assistant-drawer-footer');
        if (bar) bar.style.display = 'flex';
        if (drawer) {
            drawer.style.display = 'none';
            drawer.style.height = '';
        }
        if (state === 'collapsed') {
            if (bar) bar.style.display = 'flex';
            assistantOpen = false;
        } else if (state === 'mid') {
            if (bar) bar.style.display = 'none';
            if (drawer) {
                drawer.style.display = 'flex';
                drawer.classList.add('open');
                drawer.style.height = '45vh';
            }
            assistantOpen = true;
            assistantFullscreen = false;
            assistantChatMode = false;
            renderAssistantPrompt();
            if (footer) footer.style.display = 'none';
        } else if (state === 'full') {
            if (bar) bar.style.display = 'none';
            if (drawer) {
                drawer.style.display = 'flex';
                drawer.classList.add('open');
                drawer.style.height = 'calc(100vh - 100px)';
            }
            assistantOpen = true;
            assistantFullscreen = true;
            if (footer) footer.style.display = assistantChatMode ? 'grid' : 'none';
        }
    }

    function expandAssistantSheet() {
        setAssistantState('full');
    }

    function collapseAssistantSheet() {
        setAssistantState('collapsed');
    }

    function startSheetDrag(y) {
        const drawer = document.getElementById('assistantDrawer');
        if (!drawer) return;
        if (assistantState === 'collapsed') setAssistantState('mid');
        sheetDragStartY = y;
        sheetStartHeight = drawer.offsetHeight || Math.round(window.innerHeight * 0.45);
        document.addEventListener('mousemove', onSheetDragMove);
        document.addEventListener('mouseup', onSheetDragEnd);
        document.addEventListener('touchmove', onSheetTouchMove);
        document.addEventListener('touchend', onSheetTouchEnd);
    }

    function onSheetDragMove(e) {
        handleSheetDrag(e.clientY);
    }
    function onSheetTouchMove(e) {
        const y = e.touches?.[0]?.clientY;
        if (y !== undefined) handleSheetDrag(y);
    }

    function handleSheetDrag(currentY) {
        const drawer = document.getElementById('assistantDrawer');
        if (!drawer || sheetDragStartY === null || sheetStartHeight === null) return;
        const delta = sheetDragStartY - currentY;
        const target = Math.min(window.innerHeight * 0.9, Math.max(80, sheetStartHeight + delta));
        drawer.style.height = `${target}px`;
    }

    function onSheetDragEnd() {
        finishSheetDrag();
    }
    function onSheetTouchEnd() {
        finishSheetDrag();
    }

    function finishSheetDrag() {
        const drawer = document.getElementById('assistantDrawer');
        if (drawer) {
            const h = drawer.offsetHeight;
            if (h < 140) {
                setAssistantState('collapsed');
            } else if (h < window.innerHeight * 0.65) {
                setAssistantState('mid');
            } else {
                setAssistantState('full');
            }
        }
        sheetDragStartY = null;
        sheetStartHeight = null;
        document.removeEventListener('mousemove', onSheetDragMove);
        document.removeEventListener('mouseup', onSheetDragEnd);
        document.removeEventListener('touchmove', onSheetTouchMove);
        document.removeEventListener('touchend', onSheetTouchEnd);
    }

    function resetAssistant() {
        renderAssistantPrompt();
    }

    function openAssistantChat() {
        const panel = document.getElementById('assistantPanel');
        const modal = document.getElementById('chatModal');
        if (!currentItinerary || !currentItinerary.length) {
            showToast('Generate an itinerary first.', 'info');
            return;
        }
        if (!isTourGuideActive()) {
            showToast('Confirm bookings (or book later) to start Tour Guide chat.', 'info');
            return;
        }
        if (modal) {
            openChatModal();
            const input = document.getElementById('chatInput');
            if (input) input.focus();
            const messages = document.getElementById('chatMessages');
            if (messages && messages.children.length === 0) {
                appendChatBubble('Hi! I\'m Wise. Ask me about the place you\'re visiting, what to bring, timing tips, or nearby options.', false);
            }
        } else if (panel) {
            panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setAssistantMode(ASSISTANT_STATES.REFINEMENT_INITIAL);
        }
    }

    /* ---------- INLINE ASSISTANT (PLAN CHANGE FLOW) ---------- */
    function getActiveDayActivities() {
        if (!currentItinerary || !currentItinerary.length) return [];
        const idx = Math.min(activeDayIndex, currentItinerary.length - 1);
        return currentItinerary[idx] || [];
    }

        function getPlanKey() {
        if (userProfile.startDate && userProfile.endDate) {
            return `${userProfile.startDate}|${userProfile.endDate}`;
        }
        if (selectedDates && selectedDates.length === 2) {
            return `${selectedDates[0].toISOString()}|${selectedDates[1].toISOString()}`;
        }
        return 'plan';
    }

    function getOutstandingBookings(dayIdx = activeDayIndex) {
        const activities = currentItinerary && currentItinerary[dayIdx] ? currentItinerary[dayIdx] : [];
        return activities.filter(a => a.requiresBooking && !isBooked(dayIdx + 1, a.id));
    }

    function getAllOutstandingBookings() {
        const list = [];
        if (!currentItinerary || !currentItinerary.length) return list;
        currentItinerary.forEach((day, idx) => {
            (day || []).forEach((act) => {
                if (act.requiresBooking && !isBooked(idx + 1, act.id)) {
                    list.push({ ...act, dayNumber: idx + 1 });
                }
            });
        });
        return list;
    }
function writeBackDayActivities(activities) {
        if (!currentItinerary || !currentItinerary.length) return;
        currentItinerary[activeDayIndex] = activities;
    }

    function setAssistantMode(mode) {
        if (!ALLOWED_ASSISTANT_STATES.has(mode)) return;
        if (isPlanLocked() && mode !== ASSISTANT_STATES.TOUR_GUIDE_READY && mode !== ASSISTANT_STATES.BOOKING_ALERT) {
            assistantMode = ASSISTANT_STATES.TOUR_GUIDE_READY;
            renderAssistantInline();
            return;
        }
        assistantMode = mode;
        if (mode !== ASSISTANT_STATES.REFINEMENT_CHAT && mode !== ASSISTANT_STATES.REFINEMENT_POST_CHANGE) {
            assistantSelectedActivity = null;
            assistantPendingSave = false;
            assistantLastSnapshot = null;
            assistantLastChangeMessage = '';
            assistantLastChangedActivityId = null;
            assistantLastChangedDayIdx = null;
        }
        renderAssistantInline();
    }

    function setChatFocusToDay(dayIdx) {
        if (!currentItinerary || !currentItinerary.length) return;
        const idx = Math.max(0, Math.min(dayIdx, currentItinerary.length - 1));
        const day = currentItinerary[idx] || [];
        const stops = day.map(a => `${a.title}${a.time ? ' @ ' + a.time : ''}`).join('; ');
        lastAiContext = {
            status: 'focus-day',
            dayNumber: idx + 1,
            daySummary: stops,
            dayScheduleDetail: stops,
            weatherDesc: '',
            completedTitles: []
        };
    }

    function confirmDayPlan() {
        if (!currentItinerary || !currentItinerary.length) {
            renderAssistantInline();
            return;
        }
        if (isPlanLocked()) {
            assistantMode = ASSISTANT_STATES.TOUR_GUIDE_READY;
            renderAssistantInline();
            return;
        }
        const key = getPlanKey();
        if (!confirmedDays[key]) confirmedDays[key] = {};
        confirmedDays[key][activeDayIndex + 1] = true;
        saveConfirmedDays();

        const outstanding = getAllOutstandingBookings();
        const allDaysConfirmed = currentItinerary.every((_, idx) => confirmedDays[key]?.[idx + 1]);
        if (outstanding.length) {
            assistantMode = ASSISTANT_STATES.BOOKING_ALERT;
        } else if (allDaysConfirmed) {
            assistantMode = ASSISTANT_STATES.TOUR_GUIDE_READY;
        } else {
            assistantMode = ASSISTANT_STATES.REFINEMENT_INITIAL;
        }
        renderAssistantInline();
        renderPlanInsights();
    }

    // Save any pending assistant edits then confirm the day
    function confirmAndFinalizeDay() {
        if (assistantPendingSave) {
            confirmAssistantSave(true);
        }
        confirmDayPlan();
    }

    function renderAssistantInline() {
        const activityPrompt = document.getElementById('assistantActivityPrompt');
        const activityList = document.getElementById('assistantActivityList');
        const chat = document.getElementById('assistantChat');
        const chatPrompt = document.getElementById('assistantChatPrompt');
        const booking = document.getElementById('assistantBookingPrompt');
        const bookingList = document.getElementById('assistantBookingList');
        const insights = document.getElementById('assistantInsights');
        const insightsBody = document.getElementById('assistantInsightsBody');
        const insightsActions = document.getElementById('assistantInsightsActions');
        const saveActions = document.getElementById('assistantSaveActions');
        const chatInputRow = document.querySelector('.assistant-chat-input');
        const question = document.querySelector('.assistant-question');
        const questionTitle = question?.querySelector('.assistant-title');
        const questionSub = question?.querySelector('.assistant-sub');
        const questionActions = question?.querySelector('.assistant-actions-row');

        if (!activityPrompt || !activityList || !chat || !chatPrompt || !booking || !bookingList) return;

        // Reset displays
        activityPrompt.style.display = 'none';
        chat.style.display = 'none';
        booking.style.display = 'none';
        if (insights) insights.style.display = 'none';
        if (saveActions) saveActions.style.display = 'none';
        if (chatInputRow) chatInputRow.style.display = 'grid';

        const outstanding = getAllOutstandingBookings();
        const planKey = getPlanKey();
        const dayConfirmed = confirmedDays[planKey]?.[activeDayIndex + 1];

        switch (assistantMode) {
            case ASSISTANT_STATES.REFINEMENT_INITIAL: {
                if (questionTitle) questionTitle.textContent = 'Do you want to change your plan?';
                if (questionSub) {
                    questionSub.textContent = 'You can change days/activities, or confirm the plan when you are ready.';
                }
                if (questionActions) {
                    questionActions.innerHTML = `
                        <button class="assistant-chip" onclick="setAssistantMode('${ASSISTANT_STATES.REFINEMENT_PICK_ACTIVITY}')">I want to make changes</button>
                        <button class="assistant-chip" onclick="confirmDayPlan()">Confirm the plan</button>
                    `;
                }
                break;
            }
            case ASSISTANT_STATES.REFINEMENT_PICK_ACTIVITY: {
                if (questionTitle) questionTitle.textContent = 'Pick an activity to change.';
                if (questionSub) questionSub.textContent = '';
                if (questionActions) {
                    questionActions.innerHTML = `
                        <button class="assistant-chip" onclick="setAssistantMode('${ASSISTANT_STATES.REFINEMENT_INITIAL}')">Back</button>
                    `;
                }
                activityPrompt.style.display = 'block';
                populateAssistantActivities();
                break;
            }
            case ASSISTANT_STATES.REFINEMENT_CHAT: {
                chat.style.display = 'block';
                if (assistantPendingSave) {
                    chatPrompt.innerHTML = assistantLastChangeMessage
                        ? `Confirm change: ${assistantLastChangeMessage}`
                        : 'Changes made. Save changes?';
                    if (saveActions) saveActions.style.display = 'flex';
                    if (chatInputRow) chatInputRow.style.display = 'none';
                } else {
                    chatPrompt.textContent = assistantSelectedActivity
                        ? `What change do you want for "${assistantSelectedActivity.title}"? (you can mention day/time/place)`
                        : 'Select an activity to change.';
                    if (saveActions) saveActions.style.display = 'none';
                    if (chatInputRow) chatInputRow.style.display = 'grid';
                }
                break;
            }
            case ASSISTANT_STATES.REFINEMENT_POST_CHANGE: {
                chat.style.display = 'block';
                chatPrompt.textContent = 'Change applied. Confirm, continue editing, discard, or save.';
                if (questionTitle) questionTitle.textContent = 'Change applied';
                if (questionSub) questionSub.textContent = assistantLastChangeMessage || '';
                if (questionActions) {
                    questionActions.innerHTML = `
                        <button class="assistant-chip" onclick="confirmAndFinalizeDay()">Confirm the plan</button>
                        <button class="assistant-chip" onclick="resumeAssistantChanges()">Continue making changes</button>
                        <button class="assistant-chip" onclick="confirmAssistantSave(false)">Discard</button>
                        <button class="assistant-chip" onclick="confirmAssistantSave(true)">Save</button>
                    `;
                }
                break;
            }
            case ASSISTANT_STATES.BOOKING_ALERT: {
                booking.style.display = 'block';
                renderBookingList();
                if (questionTitle) questionTitle.textContent = 'Booking check';
                if (questionSub) {
                    questionSub.textContent = outstanding.length
                        ? 'These places require booking. If you have booked them, mark as "Booked" and then confirm.'
                        : 'No booking-required places remain.';
                }
                if (questionActions) {
                    questionActions.innerHTML = `
                        <button class="assistant-chip" onclick="confirmBookingStatuses()">Confirm booking status</button>
                        <button class="assistant-chip" onclick="deferBookingsAndStartTour()">I will book later, continue</button>
                        <button class="assistant-chip" onclick="backToPlanEditing()">Back to editing</button>
                    `;
                }
                break;
            }
            case ASSISTANT_STATES.BOOKING_CONFIRM: {
                if (questionTitle) questionTitle.textContent = 'Confirm bookings';
                const bookedList = assistantBookingSummary?.booked || getAllBookedActivities();
                const pendingList = assistantBookingSummary?.pending || getAllOutstandingBookings();
                if (questionSub) {
                    const bookedText = bookedList.length ? bookedList.map(b => `Day ${b.dayNumber}: ${b.title}`).join(', ') : 'none';
                    const pendingText = pendingList.length ? pendingList.map(p => `Day ${p.dayNumber}: ${p.title}`).join(', ') : 'none';
                    questionSub.textContent = `Booked: ${bookedText}. Pending: ${pendingText}. Booked items will lock the plan. Do you confirm?`;
                }
                if (questionActions) {
                    questionActions.innerHTML = `
                        <button class="assistant-chip" onclick="finalizeBookingConfirmation(true)">Yes, confirm</button>
                        <button class="assistant-chip" onclick="setAssistantMode('${ASSISTANT_STATES.BOOKING_ALERT}')">No, I want to adjust</button>
                    `;
                }
                break;
            }
            case ASSISTANT_STATES.BOOKING_DEFER: {
                if (questionTitle) questionTitle.textContent = 'No bookings yet';
                if (questionSub) questionSub.textContent = 'You have not booked anything yet. Do you want to continue with this plan? (The plan will not be locked.)';
                if (questionActions) {
                    questionActions.innerHTML = `
                        <button class="assistant-chip" onclick="deferBookingsAndStartTour(true)">Yes, continue</button>
                        <button class="assistant-chip" onclick="backToPlanEditing()">No, keep editing</button>
                    `;
                }
                break;
            }
            case ASSISTANT_STATES.TOUR_GUIDE_READY: {
                if (questionTitle) questionTitle.textContent = 'Tour guide is ready!';
                const deferred = !!bookingDeferred[planKey];
                const reminder = (outstanding.length && deferred)
                    ? `<div style="margin-top:6px; padding:6px 8px; border:1px solid rgba(234,179,8,0.5); border-radius:8px; background:rgba(234,179,8,0.08); color:var(--accent-gold); font-size:0.85rem;">Bookings pending (${outstanding.length}). You can complete them anytime.</div>`
                    : '';
                const tourGuideOn = isTourGuideActive();
                const next = (() => {
                    const day = getActiveDayActivities();
                    if (!day || !day.length) return null;
                    const sorted = sortActivitiesByTime(day);
                    return sorted[0] || null;
                })();

                const locEnabled = !!settingsStore?.locationEnabled;
                const nextLine = next
                    ? `Next: ${next.title}${next.time ? ` · ${next.time}` : ''}`
                    : 'Next: Not set yet';

                const line2 = locEnabled
                    ? 'I’ll prompt you when you’re near your next stop.'
                    : 'Enable location for live ETA and arrival prompts.';

                const intro = tourGuideOn ? 'Tour Guide is active.' : `Confirm booking status (or choose "I'll book later") to start Wise.`;
                if (questionSub) {
                    questionSub.innerHTML = `${intro}<div style="margin-top:6px;">${line2}</div><div style="margin-top:8px; font-weight:700;">${nextLine}</div>${reminder}`;
                }
                if (questionActions) {
                    const bookingBtn = outstanding.length && (deferred || isPlanLocked())
                        ? `<button class="assistant-chip" onclick="setAssistantMode('${ASSISTANT_STATES.BOOKING_ALERT}')">Booking checklist</button>`
                        : '';
                    questionActions.innerHTML = `
                        ${bookingBtn}
                        <button class="assistant-chip" onclick="openAssistantChat()">Open Wise</button>
                        <button class="assistant-chip" onclick="openTransitPreview()">Open transit options</button>
                    `;
                }
                break;
            }
            case ASSISTANT_STATES.TRANSIT_INFO: {
                if (questionTitle) questionTitle.textContent = 'Transit options';
                if (questionSub) questionSub.textContent = '';
                if (questionActions) questionActions.innerHTML = '';
                if (insights) insights.style.display = 'block';
                if (insightsBody) insightsBody.innerHTML = assistantTransitHtml || 'No transit info available.';
                if (insightsActions) {
                    insightsActions.innerHTML = `
                        <button class="assistant-chip" onclick="closeTransitInfo()">Back</button>
                    `;
                }
                break;
            }
        }

        // Auto-transition only between booking alert and ready when bookings change
        if (!assistantPendingSave && assistantMode === ASSISTANT_STATES.BOOKING_ALERT && outstanding.length === 0) {
            assistantMode = ASSISTANT_STATES.TOUR_GUIDE_READY;
            renderAssistantInline();
        }
    }
function populateAssistantActivities() {
        const activityList = document.getElementById('assistantActivityList');
        if (!activityList) return;
        activityList.innerHTML = '';
        const activities = getActiveDayActivities();
        if (!activities.length) {
            activityList.innerHTML = '<div style="color:var(--secondary-text); font-size:0.88rem;">No activities found for this day.</div>';
            return;
        }
        activities.forEach((act) => {
            const btn = document.createElement('button');
            btn.className = 'assistant-activity-btn';
            btn.textContent = `${act.title}${act.time ? ` - ${act.time}` : ''}`;
            btn.addEventListener('click', () => {
                assistantSelectedActivity = act;
                assistantMode = ASSISTANT_STATES.REFINEMENT_CHAT;
                assistantPendingSave = false;
                assistantLastSnapshot = JSON.stringify(getActiveDayActivities());
                renderAssistantInline();
            });
            activityList.appendChild(btn);
        });
    }

    function renderBookingList() {
        const bookingList = document.getElementById('assistantBookingList');
        const bookingSection = document.getElementById('assistantBookingPrompt');
        if (!bookingList) return;
        bookingList.innerHTML = '';
        if (!currentItinerary || !currentItinerary.length) {
            bookingList.innerHTML = '<div style="color:var(--secondary-text); font-size:0.88rem;">No plan found.</div>';
            if (bookingSection) bookingSection.style.display = 'none';
            return;
        }
        const planKey = getPlanKey();
        const locked = isPlanLocked(planKey);
        const activities = [];
        currentItinerary.forEach((day, idx) => {
            (day || []).forEach(act => {
                if (act.requiresBooking) activities.push({ ...act, dayNumber: idx + 1 });
            });
        });
        if (!activities.length) {
            bookingList.innerHTML = '<div style="color:var(--secondary-text); font-size:0.88rem;">No activities require booking.</div>';
            if (bookingSection) bookingSection.style.display = 'none';
            return;
        }
        if (bookingSection) bookingSection.style.display = 'block';
        activities.forEach((act) => {
            const item = document.createElement('div');
            item.className = 'assistant-booking-item';
            const link = document.createElement('a');
            link.href = `https://www.google.com/search?q=${encodeURIComponent(act.title + ' booking')}`;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = `Day ${act.dayNumber}: ${act.title}`;
            item.appendChild(link);
            const status = document.createElement('span');
            status.className = 'assistant-booking-status';
            const booked = isBooked(act.dayNumber, act.id);
            status.textContent = booked ? 'Booked' : 'Booking needed';
            item.appendChild(status);
            if (!booked && !locked) {
                const btn = document.createElement('button');
                btn.className = 'assistant-chip';
                btn.style.marginLeft = '8px';
                btn.textContent = 'Mark booked';
                btn.onclick = () => toggleBooking(act.dayNumber, act.id);
                item.appendChild(btn);
            }
            bookingList.appendChild(item);
        });
    }

    function confirmBookingStatuses() {
        const booked = getAllBookedActivities();
        const pending = getAllOutstandingBookings();
        assistantBookingSummary = { booked, pending };
        if (booked.length > 0) {
            assistantMode = ASSISTANT_STATES.BOOKING_CONFIRM;
        } else {
            assistantMode = ASSISTANT_STATES.BOOKING_DEFER;
        }
        renderAssistantInline();
    }

    function finalizeBookingConfirmation(accept) {
        if (!accept) {
            assistantMode = ASSISTANT_STATES.BOOKING_ALERT;
            renderAssistantInline();
            return;
        }
        const planKey = getPlanKey();
        const booked = getAllBookedActivities();
        setTourGuideUnlocked(planKey, true);
        userProfile.tourGuide = true;
        userPreferences.tourGuide = true;
        saveProfile(userProfile);
        updateAiUiVisibility();
        if (booked.length) {
            planLocks[planKey] = { lockedAt: Date.now() };
            savePlanLocks();
            bookingDeferred[planKey] = false;
            saveBookingDeferred();
            showToast('Booked stops are now locked. The plan cannot be edited.', 'success');
        }
        assistantMode = ASSISTANT_STATES.TOUR_GUIDE_READY;
        renderItineraryUI(currentItinerary, tripDates || []);
        renderAssistantInline();
        renderPlanInsights();
    }

    function deferBookingsAndStartTour(fromDeferScreen = false) {
        const planKey = getPlanKey();
        bookingDeferred[planKey] = true;
        saveBookingDeferred();
        setTourGuideUnlocked(planKey, true);
        userProfile.tourGuide = true;
        userPreferences.tourGuide = true;
        saveProfile(userProfile);
        updateAiUiVisibility();
        assistantMode = ASSISTANT_STATES.TOUR_GUIDE_READY;
        renderItineraryUI(currentItinerary, tripDates || []);
        renderAssistantInline();
        renderPlanInsights();
    }

    function backToPlanEditing() {
        if (isPlanLocked()) {
            assistantMode = ASSISTANT_STATES.TOUR_GUIDE_READY;
        } else {
            assistantMode = ASSISTANT_STATES.REFINEMENT_PICK_ACTIVITY;
        }
        renderAssistantInline();
    }

    async function interpretAssistantChangeWithAi(userText, activity, baseDayIdx = activeDayIndex) {
        if (!userText) return null;
        const daysCount = (tripDates && tripDates.length) ? tripDates.length : (currentItinerary ? currentItinerary.length : 1);
        const baseDayNumber = Math.max(1, Math.min(daysCount, baseDayIdx + 1));
        const activityTitle = activity?.title || 'Selected activity';

        const system = [
            'You are a strict JSON parser for itinerary edit commands.',
            `Trip has ${daysCount} day(s). Base day is Day ${baseDayNumber}. Selected activity: ${activityTitle}.`,
            'Return JSON only with keys:',
            '- action: one of "set_time", "move_day", "move_day_set_time", "unknown"',
            '- day: integer 1..N (optional)',
            '- time: "HH:MM" 24h format (optional)',
            'Rules:',
            '- "tomorrow" or "next" means base day + 1.',
            '- "yesterday" or "previous" means base day - 1.',
            '- If user says "move it to next" treat it as next day.',
            '- If no valid day/time is found, return {"action":"unknown"}.',
        ].join('\n');

        const reply = await callAssistant([
            { role: 'system', content: system },
            { role: 'user', content: userText }
        ]);
        const raw = String(reply || '').trim();
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return null;
        try {
            const parsed = JSON.parse(jsonMatch[0]);
            const action = String(parsed?.action || '').toLowerCase();
            if (!action || action === 'unknown') return null;
            const out = {};
            if (parsed?.day !== undefined && parsed?.day !== null) {
                const n = Number(parsed.day);
                if (Number.isFinite(n)) out.day = Math.max(1, Math.min(daysCount, Math.round(n)));
            }
            if (parsed?.time) {
                const m = String(parsed.time).match(/(\d{1,2}):(\d{2})/);
                if (m) out.time = `${String(parseInt(m[1], 10)).padStart(2, '0')}:${String(parseInt(m[2], 10)).padStart(2, '0')}`;
            }
            if (!out.day && !out.time) return null;
            return out;
        } catch (e) {
            return null;
        }
    }

    async function submitChangeRequest() {
        const input = document.getElementById('assistantChangeInput');
        if (!assistantSelectedActivity || !input) {
            showToast('Select an activity first.', 'info');
            return;
        }
        let textRaw = (input.value || '').trim();
        if (!textRaw) {
            showToast('Please describe the change.', 'info');
            return;
        }
        let parsed = null;
        if (textRaw.startsWith('{') || textRaw.startsWith('[')) {
            try {
                parsed = JSON.parse(textRaw);
            } catch (e) {
                showToast('Could not parse that change. Please rephrase.', 'error');
                return;
            }
        }
        // If awaiting save confirmation, check user intent
        if (assistantPendingSave) {
            const affirmative = /\b(yes|yep|yeah|sure|ok|okay|save|confirm)\b/i.test(textRaw);
            if (affirmative) {
                showToast('Changes saved.', 'success');
                assistantPendingSave = false;
                assistantSelectedActivity = null;
                assistantMode = ASSISTANT_STATES.REFINEMENT_PICK_ACTIVITY;
                renderItineraryUI(currentItinerary, tripDates || []);
                return;
            } else {
                assistantPendingSave = false;
                assistantMode = ASSISTANT_STATES.REFINEMENT_CHAT;
                renderAssistantInline();
                return;
            }
        }

        let changeResult = applyChangeCommand(parsed || textRaw, assistantSelectedActivity);
        if (!changeResult.changed && changeResult.needsAi) {
            try {
                showToast('Interpreting your request...', 'info');
                const structuredAi = await interpretAssistantChangeWithAi(textRaw, assistantSelectedActivity, activeDayIndex);
                if (!structuredAi) {
                    showToast('Could not understand that. Try: \"Move to Day 2\" or \"Set time to 14:30\".', 'info');
                    return;
                }
                changeResult = applyChangeCommand(structuredAi, assistantSelectedActivity);
            } catch (e) {
                showToast(e?.message || 'AI is unavailable. Please rephrase with day/time.', 'info');
                return;
            }
        }
        if (!changeResult.changed) {
            showToast(changeResult.message || 'No change applied.', 'info');
            return;
        }
        assistantPendingSave = true;
        assistantLastChangedActivityId = assistantSelectedActivity ? assistantSelectedActivity.id : null;
        assistantLastChangedDayIdx = activeDayIndex;
        assistantLastChangeMessage = changeResult.preview || changeResult.message;
        input.value = '';
        assistantMode = ASSISTANT_STATES.REFINEMENT_POST_CHANGE;
        renderAssistantInline();
    }

    function handleChangeKeydown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submitChangeRequest();
        }
    }

    function confirmAssistantSave(accept) {
        const chatInputRow = document.querySelector('.assistant-chat-input');
        const saveActions = document.getElementById('assistantSaveActions');
        if (accept) {
            showToast('Changes saved.', 'success');
            recordChange(activeDayIndex, assistantLastChangeMessage || 'Assistant change', assistantLastSnapshot);
            setChatFocusToDay(activeDayIndex);
            resortAllDaysByTime();
            if (assistantLastChangedActivityId !== null) {
                const dayList = currentItinerary[assistantLastChangedDayIdx] || [];
                const target = dayList.find(a => a.id === assistantLastChangedActivityId);
                if (target) target._recentlyUpdated = true;
                saveItinerary(currentItinerary);
                renderItineraryUI(currentItinerary, tripDates || []);
            }
            // Stay in post-change so the user can Keep & Confirm or continue editing
            assistantPendingSave = false;
            assistantMode = ASSISTANT_STATES.REFINEMENT_POST_CHANGE;
            assistantLastChangeMessage = assistantLastChangeMessage ? `${assistantLastChangeMessage} (saved)` : 'Change saved';
        } else if (assistantLastSnapshot) {
            currentItinerary[activeDayIndex] = JSON.parse(assistantLastSnapshot);
            saveItinerary(currentItinerary);
            renderItineraryUI(currentItinerary, tripDates || []);
            showToast('Changes discarded.', 'info');
        }
        assistantPendingSave = false;
        assistantLastSnapshot = null;
        assistantSelectedActivity = null;
        assistantLastChangedActivityId = null;
        assistantLastChangedDayIdx = null;
        assistantMode = assistantMode === ASSISTANT_STATES.REFINEMENT_POST_CHANGE
            ? ASSISTANT_STATES.REFINEMENT_POST_CHANGE
            : ASSISTANT_STATES.REFINEMENT_PICK_ACTIVITY;
        if (saveActions) saveActions.style.display = 'none';
        if (chatInputRow) chatInputRow.style.display = 'grid';
        renderAssistantInline();
    }

    function resumeAssistantChanges() {
        assistantPendingSave = false;
        assistantSelectedActivity = null;
        assistantLastSnapshot = null;
        assistantMode = ASSISTANT_STATES.REFINEMENT_PICK_ACTIVITY;
        renderAssistantInline();
    }

    function undoLastChange(dayIdx = activeDayIndex) {
        const idx = Math.max(0, Math.min(dayIdx, (currentItinerary || []).length - 1));
        const history = changeHistory[idx];
        if (!history || !history.length) {
            showToast('No changes to undo.', 'info');
            return;
        }
        const last = history.pop();
        saveHistory();
        try {
            currentItinerary[idx] = JSON.parse(last.snapshot);
            saveItinerary(currentItinerary);
            renderItineraryUI(currentItinerary, tripDates || []);
            showToast('Reverted last change.', 'success');
        } catch (e) {
            showToast('Could not undo.', 'error');
        }
    }

    // Apply change commands to itinerary
    function parseRequestedDayIndex(text, baseDayIdx = activeDayIndex) {
        if (!tripDates || !tripDates.length) return null;
        const lower = String(text || '').toLowerCase();
        const days = tripDates.length;
        if (/\b(tomorrow|next\s+day)\b/.test(lower) || (/\b(move|shift|push|reschedule)\b/.test(lower) && /\bnext\b/.test(lower))) {
            return Math.min(days - 1, Math.max(0, baseDayIdx + 1));
        }
        if (/\b(yesterday|previous\s+day|prior\s+day)\b/.test(lower) || (/\b(move|shift|push|reschedule)\b/.test(lower) && /\b(previous|prior|back)\b/.test(lower))) {
            return Math.max(0, baseDayIdx - 1);
        }
        const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
        const m = lower.match(/(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(st|nd|rd|th)?/);
        if (m) {
            const monthIdx = months.indexOf(m[1]);
            const dayNum = parseInt(m[2], 10);
            if (monthIdx >= 0) {
                const target = tripDates.findIndex(d => {
                    const dt = new Date(d);
                    return dt.getMonth() === monthIdx && dt.getDate() === dayNum;
                });
                if (target >= 0) return target;
            }
        }
        const dayMatch = text.match(/day\s+(\d{1,2})(st|nd|rd|th)?/i);
        if (dayMatch) {
            return Math.max(0, parseInt(dayMatch[1], 10) - 1);
        }
        const weekdayMatch = lower.match(/(next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/);
        if (weekdayMatch) {
            const targetWeekday = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'].indexOf(weekdayMatch[2]);
            const nextRequested = !!weekdayMatch[1];
            const hits = [];
            tripDates.forEach((d, idx) => {
                const dt = new Date(d);
                if (dt.getDay() === targetWeekday) hits.push(idx);
            });
            if (hits.length) {
                if (nextRequested && hits.length > 1) return hits[1];
                return hits[0];
            }
        }
        return null;
    }

    function applyChangeCommand(text, activity) {
        if (isPlanLocked()) {
            return { changed: false, message: 'The plan is locked. A booked plan cannot be modified.' };
        }
        if (!activity) return { changed: false, message: 'No activity selected.' };
        let structured = null;
        if (typeof text === 'object' && text !== null) {
            structured = text;
            text = JSON.stringify(text);
        }
        const lower = typeof text === 'string' ? text.toLowerCase() : '';
        const originDayIdx = activeDayIndex;
        const activities = getActiveDayActivities().slice();
        const idx = activities.findIndex(a => a.id === activity.id);
        if (idx === -1) return { changed: false, message: 'Activity not found.' };

        const updated = { ...activities[idx] };
        const original = { ...activities[idx] };
        let changed = false;
        let preview = '';

        // Apply structured change if provided
        if (structured) {
            if (structured.time) {
                const t = structured.time;
                if (typeof t === 'string' && /\d/.test(t)) {
                    const m = t.match(/(\d{1,2}):?(\d{2})?/);
                    if (m) {
                        const hr = parseInt(m[1], 10);
                        const min = m[2] ? parseInt(m[2], 10) : 0;
                        updated.time = `${String(hr).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
                        changed = true;
                    }
                }
            }
            if (structured.day) {
                const targetIdx = Math.max(0, Math.min(parseInt(structured.day, 10) - 1, (currentItinerary || []).length ? currentItinerary.length - 1 : 0));
                if (targetIdx !== activeDayIndex) {
                    if (!currentItinerary[targetIdx]) currentItinerary[targetIdx] = [];
                    activities.splice(idx, 1);
                    writeBackDayActivities(activities);
                    currentItinerary[targetIdx].push(updated);
                    resortDayByTime(originDayIdx);
                    resortDayByTime(targetIdx);
                    activeDayIndex = targetIdx;
                    saveItinerary(currentItinerary);
                    renderItineraryUI(currentItinerary, tripDates || []);
                    preview = `Move to Day ${targetIdx + 1}${updated.time ? ` at ${updated.time}` : ''}.`;
                    return { changed: true, message: `Moved to Day ${targetIdx + 1}.`, preview };
                }
            }
            if (structured.title) {
                updated.title = `${structured.title} (updated)`;
                changed = true;
            }
        }

        // Change time
        // time parsing: support 24h (HH:MM) and 12h with am/pm
        const timeMatch24 = text.match(/(\d{1,2}):(\d{2})/);
        const timeMatch12 = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
        if (timeMatch12) {
            let hr = parseInt(timeMatch12[1], 10);
            const min = timeMatch12[2] ? parseInt(timeMatch12[2], 10) : 0;
            const ampm = timeMatch12[3].toLowerCase();
            if (ampm === 'pm' && hr < 12) hr += 12;
            if (ampm === 'am' && hr === 12) hr = 0;
            updated.time = `${String(hr).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
            changed = true;
        } else if (timeMatch24) {
            const hr = parseInt(timeMatch24[1], 10);
            const min = parseInt(timeMatch24[2], 10);
            updated.time = `${String(hr).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
            changed = true;
        }

        // Move to another day (can be combined with time change)
        const requestedIdx = parseRequestedDayIndex(text, originDayIdx);
        if (lower.includes('move') || lower.includes('another day') || requestedIdx !== null) {
            const targetIdx = requestedIdx !== null
                ? Math.max(0, Math.min(requestedIdx, (tripDates || []).length ? tripDates.length - 1 : requestedIdx))
                : activeDayIndex;
            if (targetIdx !== activeDayIndex) {
                if (!currentItinerary[targetIdx]) currentItinerary[targetIdx] = [];
                activities.splice(idx, 1);
                writeBackDayActivities(activities);
                currentItinerary[targetIdx].push(updated);
                resortDayByTime(originDayIdx);
                resortDayByTime(targetIdx);
                activeDayIndex = targetIdx;
                saveItinerary(currentItinerary);
                renderItineraryUI(currentItinerary, tripDates || []);
                preview = `Move to Day ${targetIdx + 1}${updated.time ? ` at ${updated.time}` : ''}.`;
                return { changed: true, message: `Moved to Day ${targetIdx + 1}.`, preview };
            }
        }

        // Swap order
        if (!changed && lower.includes('swap')) {
            const swapWith = activities[idx + 1] || activities[idx - 1];
            const swapIdx = idx + 1 < activities.length ? idx + 1 : idx - 1;
            if (swapWith && swapIdx >= 0) {
                activities[idx] = swapWith;
                activities[swapIdx] = updated;
                writeBackDayActivities(activities);
                saveItinerary(currentItinerary);
                renderItineraryUI(currentItinerary, tripDates || []);
                preview = `Swap ${updated.title} with ${swapWith.title}.`;
                return { changed: true, message: 'Swapped order.', preview };
            }
        }

        // Replace with a new activity title
        const replaceMatch = text.match(/replace with\s+(.+)/i);
        if (!changed && replaceMatch) {
            const newTitle = replaceMatch[1].trim();
            if (newTitle) {
                updated.title = `${newTitle} (updated)`;
                updated.details = `${updated.details || ''}\nReplaced from ${activity.title}`;
                changed = true;
            }
        }

        if (!changed) {
            const t = String(text || '').toLowerCase();
            const looksLikeCommand = /(move|shift|push|reschedule|tomorrow|next|yesterday|previous|prior|day\\s+\\d|at\\s+\\d|am|pm|\\d{1,2}:\\d{2}|time)/.test(t);
            if (looksLikeCommand) {
                return { changed: false, needsAi: true, message: 'Could not interpret that change.' };
            }
            return { changed: false, message: 'No change detected. Please mention a day or a time.' };
        }

        activities[idx] = updated;
        writeBackDayActivities(sortActivitiesByTime(activities));
        saveItinerary(currentItinerary);
        renderItineraryUI(currentItinerary, tripDates || []);
        if (!preview) {
            const changes = [];
            if (original.time !== updated.time) changes.push(`Time: ${original.time || 'TBD'} -> ${updated.time}`);
            if (original.title !== updated.title) changes.push(`Title updated`);
            preview = changes.length ? changes.join(' | ') : 'Change applied.';
        }
        return { changed: true, message: 'Change applied.', preview };
    }

    function initAssistantInline() {
        const yesBtn = document.getElementById('assistantYesBtn');
        const noBtn = document.getElementById('assistantNoBtn');
        if (yesBtn) yesBtn.addEventListener('click', () => setAssistantMode(ASSISTANT_STATES.REFINEMENT_PICK_ACTIVITY));
        if (noBtn) noBtn.addEventListener('click', () => confirmDayPlan());
        renderAssistantInline();
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
        // no-op for sheet version
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

    function openWiseForActivity(dayNumber, activityId) {
        const day = currentItinerary && currentItinerary[dayNumber - 1];
        const activity = day ? day.find(a => a.id === activityId) : null;
        const placeName = activity?.title || 'your stop';

        openChatModal();
        const messages = document.getElementById('chatMessages');
        const input = document.getElementById('chatInput');

        const intro1 = `Hi! I'm Wise, your on-site tour guide for ${placeName}.`;
        const intro2 = `Want a 60-second intro, or do you have a specific question?`;

        const lastText = (() => {
            try {
                const last = messages?.lastElementChild?.querySelector('.bubble-text')?.textContent || '';
                return String(last).trim();
            } catch (e) {
                return '';
            }
        })();

        if (messages && messages.children.length === 0) {
            appendChatBubble(intro1, false);
            appendChatBubble(intro2, false);
        } else if (lastText !== intro2) {
            appendChatBubble(intro1, false);
            appendChatBubble(intro2, false);
        }

        if (input) input.focus();
    }

    function sendChatMessage() {
        const primaryInput = document.getElementById('chatInput');
        const sheetInput = document.getElementById('assistantSheetInput');
        const input = (primaryInput && primaryInput.matches(':focus')) ? primaryInput : (sheetInput || primaryInput);
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
    function handleSheetKeydown(e) {
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
        suggestNearby('food', el);
    }

    async function suggestNearbyAt(lat, lng, kind, el) {
        if (!currentItinerary || !currentItinerary.length) { showToast('No itinerary yet.', 'info'); return; }
        if (!lat || !lng) { showToast('No map coordinates available.', 'info'); return; }
        showToast('Searching nearby places...', 'info');
        try {
            const places = await fetchNearbyPlaces(lat, lng, kind, 5, 900);
            if (!places.length) {
                showAssistant('<strong>No nearby places found.</strong>');
                return;
            }
            const titleMap = { food: 'Food & drinks', coffee: 'Coffee', museum: 'Museums', attraction: 'Attractions' };
            const title = titleMap[kind] || 'Nearby';
            const lines = places.map(p => {
                const dist = formatDistanceMiles(Math.max(0.1, p.distanceKm), 1);
                const status = p.openStatus === 'open' ? 'Open now' : (p.openStatus === 'closed' ? 'Closed' : 'Hours unknown');
                const maps = buildGoogleMapsSearchUrl(p.name, p.lat, p.lng);
                const addr = p.address ? ` | ${p.address}` : '';
                return `<div style="margin:6px 0;"><strong><a href="${maps}" target="_blank" rel="noopener noreferrer" style="color:var(--accent-cyan); text-decoration:none;">${p.name}</a></strong><br><span style="color:var(--secondary-text); font-size:0.85rem;">${dist} | ${status}${addr}</span></div>`;
            }).join('');
            showAssistant(`<strong>Nearby ${title}:</strong>${lines}`);
            renderAssistantState(buildAssistantContext());
            flashChip(el);
        } catch (e) {
            console.error(e);
            showToast(e.message || 'Nearby search failed.', 'error');
        }
    }

    async function suggestNearby(kind, el) {
        const day = getActiveDayActivities();
        const loc = settingsStore?.locationEnabled ? getUserLocationSnapshot() : null;
        const fallbackCenter = loc ? { lat: loc.lat, lng: loc.lng } : LOOP_COORDS;
        const center = day.find(a => a.lat && a.lng) || currentItinerary.flat().find(a => a.lat && a.lng) || fallbackCenter;
        await suggestNearbyAt(center.lat, center.lng, kind, el);
    }

    async function hydratePlaceMetaForActivity(dayNumber, activityId) {
        const metaEl = document.getElementById(`place-meta-${dayNumber}-${activityId}`);
        if (!metaEl) return;
        const day = currentItinerary?.[dayNumber - 1] || [];
        const activity = day.find(a => String(a.id) === String(activityId));
        if (!activity || !activity.lat || !activity.lng) {
            metaEl.innerHTML = '<div style="color:var(--secondary-text); font-size:0.85rem;">No coordinates for place details.</div>';
            return;
        }
        if (activity._osmMeta && activity._osmMeta.loaded) {
            metaEl.innerHTML = activity._osmMeta.html;
            return;
        }
        metaEl.innerHTML = '<div style="color:var(--secondary-text); font-size:0.85rem;">Loading place info...</div>';
        try {
            const meta = await fetchPlaceMetaByName(activity.lat, activity.lng, activity.title);
            if (!meta) {
                metaEl.innerHTML = '<div style="color:var(--secondary-text); font-size:0.85rem;">No OpenStreetMap match found for this place.</div>';
                activity._osmMeta = { loaded: true, html: metaEl.innerHTML };
                return;
            }
            const openLabel = meta.openStatus === 'open' ? 'Open now' : (meta.openStatus === 'closed' ? 'Closed now' : 'Hours unknown');
            const hours = meta.openingHours ? `<div><strong>Hours:</strong> <span style="color:var(--secondary-text);">${meta.openingHours}</span></div>` : '';
            const phone = meta.phone ? `<div><strong>Phone:</strong> <span style="color:var(--secondary-text);">${meta.phone}</span></div>` : '';
            const safeWebsite = meta.website
                ? (String(meta.website).startsWith('http://') || String(meta.website).startsWith('https://') ? String(meta.website) : `https://${String(meta.website)}`)
                : '';
            const website = safeWebsite ? `<div><strong>Website:</strong> <a href="${safeWebsite}" target="_blank" rel="noopener noreferrer" style="color:var(--accent-cyan); text-decoration:none;">${safeWebsite.replace(/^https?:\/\//, '')}</a></div>` : '';
            const address = meta.address ? `<div><strong>Address:</strong> <span style="color:var(--secondary-text);">${meta.address}</span></div>` : '';
            const mapsUrl = buildGoogleMapsSearchUrl(meta.name, meta.lat, meta.lng);
            metaEl.innerHTML = `
                <div style="margin-top:10px; padding-top:10px; border-top:1px dashed rgba(255,255,255,0.12);">
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
                        <div style="font-weight:700;">Place info</div>
                        <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" class="action-btn btn-maps" style="padding:8px 10px; font-size:0.85rem;">
                            <i class="fa-solid fa-location-dot"></i> Map
                        </a>
                    </div>
                    <div style="margin-top:6px; color:${meta.openStatus === 'open' ? 'var(--success)' : (meta.openStatus === 'closed' ? 'var(--danger)' : 'var(--secondary-text)')}; font-weight:700;">
                        ${openLabel}
                    </div>
                    ${hours}
                    ${address}
                    ${phone}
                    ${website}
                    <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap;">
                        <button type="button" class="assistant-chip" onclick="event.stopPropagation(); suggestNearbyFromActivity(${dayNumber}, ${activityId}, 'coffee')">Coffee</button>
                        <button type="button" class="assistant-chip" onclick="event.stopPropagation(); suggestNearbyFromActivity(${dayNumber}, ${activityId}, 'food')">Food</button>
                        <button type="button" class="assistant-chip" onclick="event.stopPropagation(); suggestNearbyFromActivity(${dayNumber}, ${activityId}, 'museum')">Museums</button>
                    </div>
                </div>
            `;
            activity._osmMeta = { loaded: true, html: metaEl.innerHTML, meta };
        } catch (e) {
            console.error(e);
            metaEl.innerHTML = '<div style="color:var(--danger); font-size:0.85rem;">Could not load place details.</div>';
        }
    }

    async function suggestNearbyFromActivity(dayNumber, activityId, kind) {
        if (!currentItinerary || !currentItinerary.length) return;
        const day = currentItinerary?.[dayNumber - 1] || [];
        const activity = day.find(a => String(a.id) === String(activityId));
        if (!activity || !activity.lat || !activity.lng) {
            showToast('No coordinates for nearby search.', 'info');
            return;
        }
        await suggestNearbyAt(activity.lat, activity.lng, kind, null);
    }

    function summarizeToday(el) {
        if (!currentItinerary || !currentItinerary.length) { showToast('No itinerary yet.', 'info'); return; }
        const today = currentItinerary[0];
        const lines = today.slice(0,4).map((a,i) => `${i+1}. ${a.title}${a.time ? ' @ ' + a.time : ''}`);
        showAssistant(`<strong>Today:</strong><br>${lines.join('<br>')}`);
        renderAssistantState(buildAssistantContext());
        flashChip(el);
    }

    /* ---------- ASSISTANT GESTURE BINDINGS ---------- */
    document.addEventListener('DOMContentLoaded', async () => {
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
        const locationToggle = document.getElementById('settingsLocationToggle');
        if (price) price.checked = !!settingsStore.priceAlerts;
        if (weather) weather.checked = !!settingsStore.weatherAlerts;
        if (daily) daily.checked = !!settingsStore.dailyReminder;
        if (themeSelect) themeSelect.value = settingsStore.theme || 'gold';
        if (tgSettings) tgSettings.checked = !!userPreferences.tourGuide;
        if (locationToggle) locationToggle.checked = !!settingsStore.locationEnabled;
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

    function updateHeaderActionsVisibility() {
        const headerActionsCompact = document.getElementById('headerActionsCompact');
        const hasPlan = currentItinerary && Array.isArray(currentItinerary) && currentItinerary.length > 0;
        if (headerActionsCompact) {
            headerActionsCompact.style.display = hasPlan ? 'flex' : 'none';
        }
    }

    function showOnlySection(id) {
        const sections = document.querySelectorAll('main > section');
        sections.forEach(sec => sec.classList.remove('active'));
        const target = document.getElementById(id);
        if (target) target.classList.add('active');

        updateHeaderActionsVisibility();
        updateLocationPlanPromptVisibility();
        updateArrivalTracking();

        if (id === 'profile' || id === 'auth' || id === 'settings' || id === 'pastTrips') {
            setActiveTab('profile');
        } else {
            setActiveTab('plan');
        }
    }

    function toggleHeaderActionsMenu(event) {
        const wrap = document.getElementById('headerActionsCompact');
        if (!wrap) return;
        if (event) event.stopPropagation();
        wrap.classList.toggle('open');
    }

    function closeHeaderActionsMenu() {
        const wrap = document.getElementById('headerActionsCompact');
        if (wrap) wrap.classList.remove('open');
    }

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.header-actions-compact')) {
            closeHeaderActionsMenu();
        }
    });

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
            prefetchWeatherForTripDates(dates);
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

    function clearSavedPlanData() {
        try { localStorage.removeItem(STORAGE_KEYS.itinerary); } catch (e) {}
        try { localStorage.removeItem('planner_checkins_v1'); } catch (e) {}
        try { localStorage.removeItem('planner_bookings_v1'); } catch (e) {}
        try { localStorage.removeItem('assistant_plan_locks_v1'); } catch (e) {}
        try { localStorage.removeItem('assistant_booking_deferred_v1'); } catch (e) {}
        try { localStorage.removeItem('assistant_tour_guide_unlocked_v1'); } catch (e) {}
        try { localStorage.removeItem('assistant_confirmed_days_v1'); } catch (e) {}
        try { localStorage.removeItem('planner_change_history_v1'); } catch (e) {}
        try { localStorage.removeItem(PLAN_INSIGHTS_DISMISSED_KEY); } catch (e) {}
        try { localStorage.removeItem(PLAN_SUGGESTIONS_HINT_SEEN_KEY); } catch (e) {}
        try { localStorage.removeItem(ARRIVAL_STORAGE_KEY); } catch (e) {}

        planInsightsDismissed = {};
        planSuggestionsHintSeen = {};
        if (planSuggestionsHintTimeout) {
            clearTimeout(planSuggestionsHintTimeout);
            planSuggestionsHintTimeout = null;
        }

        arrivalState = {};
        arrivalCandidate = null;
        clearArrivalPromptUi();
        if (geoWatchId !== null) {
            try { navigator.geolocation.clearWatch(geoWatchId); } catch (e) {}
            geoWatchId = null;
        }

        checkins = {};
        bookings = {};
        planLocks = {};
        bookingDeferred = {};
        tourGuideUnlocked = {};
        confirmedDays = {};
        changeHistory = {};
        assistantBookingSummary = null;
        lastAiContext = null;

        window.changeHistory = changeHistory;
    }

    function startNewPlan() {
        closeHeaderActionsMenu();
        clearSavedPlanData();

        userProfile.startDate = null;
        userProfile.endDate = null;
        saveProfile(userProfile);

        clearPlannerState();
        assistantMode = ASSISTANT_STATES.REFINEMENT_INITIAL;
        assistantSelectedActivity = null;
        assistantPendingSave = false;
        assistantLastChangeMessage = '';
        assistantLastSnapshot = null;
        activeDayIndex = 0;
        currentDayMapData = { dayNumber: 1, activities: [] };
        resetAssistant();
    }

    function goToPlannerStart() {
        startNewPlan();
        showOnlySection('intro');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function openHome() {
        if (currentUser) {
            openPlannerTab();
            return;
        }
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
        const dayTabs = document.getElementById('dayTabs');
        if (dayTabs) dayTabs.innerHTML = '';
        const daySummary = document.getElementById('daySummary');
        if (daySummary) daySummary.innerHTML = '';
        const viewDayMapBtn = document.getElementById('viewDayMapBtn');
        if (viewDayMapBtn) viewDayMapBtn.style.display = 'none';
        updateStartButtonState();
        currentItinerary = null;
        tripDates = [];
        updateHeaderActionsVisibility();
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
            const { token, user } = await window.apiRequest('/api/login', {
                method: 'POST',
                body: { email, password }
            });
            window.setSessionToken(token);
            currentUser = user;
            window.saveUser(user);
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
            const { token, user } = await window.apiRequest('/api/register', {
                method: 'POST',
                body: { firstName, lastName, email, password }
            });
            window.setSessionToken(token);
            currentUser = user;
            window.saveUser(user);
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
        showToast('Removed from saved places.', 'info');
    }

    function recordChange(dayIdx, note, snapshot) {
        const idx = Math.max(0, dayIdx || 0);
        if (!changeHistory[idx]) changeHistory[idx] = [];
        changeHistory[idx].push({
            note: note || 'Change applied',
            snapshot: snapshot || JSON.stringify(currentItinerary[idx] || []),
            ts: Date.now()
        });
        saveHistory();
    }

    const HOLD_MS = 2000;

    function recordArrivalSignal(dayNumber, activity, source = 'gps') {
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

        const key = `${dayNumber}-${activity.id}`;
        checkins[key] = { ts: now.getTime(), title: activity.title, timingNote, source };
        saveCheckins(checkins);
        lastAiContext = buildChatContext(dayNumber, activity, 'arrived', timingNote, now.toISOString());
    }

    function respondToArrivalPrompt(didArrive, dayNumber, activityId) {
        const day = currentItinerary && currentItinerary[dayNumber - 1];
        const activity = day ? day.find(a => a.id === activityId) : null;
        clearArrivalPromptUi();
        arrivalCandidate = null;

        if (!didArrive) {
            if (activity) {
                snoozeArrivalPrompt(dayNumber, activityId);
            }
            showToast('No problem. You can open Wise anytime by tapping the chat icon.', 'info');
            return;
        }

        if (!activity) {
            showToast('Stop not found in the plan.', 'error');
            return;
        }

        confirmStopArrival(dayNumber, activityId, { title: activity.title });
        recordArrivalSignal(dayNumber, activity, 'gps');
        openWiseForActivity(dayNumber, activityId);
        updateArrivalTracking();
    }

    function startHold(action, dayNumber, activityId, btn, evt) {
        if (evt) evt.stopPropagation();
        if (!isTourGuideActive()) {
            showToast('Confirm bookings (or book later) to use check-ins.', 'info');
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
        showToast('Action canceled.', 'info');
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

        if (isTourGuideActive()) {
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
                    <div><em>${duration} | Planned at ${sched}</em></div>
                    ${detail ? `<div>${detail}</div>` : ''}
                    ${insta ? `<div>${insta}</div>` : ''}
                </div>
                ${nextLine}
                <div style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap;">
                    <button class="assistant-chip" onclick="skipNextStop(this)">Skip next</button>
                    <button class="assistant-chip" onclick="moveNextToTomorrow(this)">Delay next</button>
                </div>
                <div style="margin-top:6px; color: var(--secondary-text);">Ask me to adjust timing if you're early/late.</div>
            `;
            showAssistant(note);
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

        if (isTourGuideActive()) {
            showAssistant(`<strong>Completed:</strong> ${activity.title}<br><div style="margin-top:6px;">Logged. Want me to adjust timing or suggest what's next?</div>`);
            renderAssistantState(buildAssistantContext());
        } else {
            showToast('Marked complete.', 'success');
        }
    }

    function isBooked(dayNumber, activityId) {
        const key = `${dayNumber}-${activityId}`;
        const entry = bookings[key];
        const day = currentItinerary && currentItinerary[dayNumber - 1];
        const activity = day ? day.find(a => a.id === activityId) : null;
        const matchesPlan = entry && entry.planKey === getPlanKey();
        return (!!entry && matchesPlan) || !!activity?._bookingDone;
    }

    function toggleBooking(dayNumber, activityId, evt) {
        if (evt) evt.stopPropagation();
        if (isPlanLocked()) {
            showToast('The plan is locked. Booking status cannot be changed.', 'info');
            return;
        }
        const key = `${dayNumber}-${activityId}`;
        const wasBooked = !!bookings[key] && bookings[key].planKey === getPlanKey();
        if (wasBooked) {
            delete bookings[key];
        } else {
            bookings[key] = { ts: Date.now(), planKey: getPlanKey() };
        }
        saveBookings(bookings);
        const day = currentItinerary && currentItinerary[dayNumber - 1];
        if (day) {
            const act = day.find(a => a.id === activityId);
            if (act) act._bookingDone = !wasBooked;
        }
        const btn = document.querySelector(`[data-book-btn='${key}']`);
        if (btn) btn.textContent = wasBooked ? 'Mark booked' : 'Booked';
        const badge = document.querySelector(`[data-book-badge='${key}']`);
        if (badge) {
            badge.textContent = wasBooked ? 'Booking needed' : 'Booked';
            badge.style.background = wasBooked ? 'rgba(234,179,8,0.15)' : 'rgba(22,163,74,0.15)';
            badge.style.color = wasBooked ? 'var(--accent-gold)' : 'var(--success)';
            badge.style.borderColor = wasBooked ? 'rgba(234,179,8,0.5)' : 'rgba(22,163,74,0.5)';
            if (wasBooked) {
                badge.classList.add('pulsing-glow');
            } else {
                badge.classList.remove('pulsing-glow');
            }
        }
        const dayRemaining = getOutstandingBookings(dayNumber - 1);
        if (!dayRemaining.length && !wasBooked) {
            showToast(`Day ${dayNumber} is booked/ready.`, 'success');
        } else {
            showToast(wasBooked ? 'Booking removed.' : 'Marked as booked.', 'success');
        }
        renderBookingList();
        renderItineraryUI(currentItinerary, tripDates || []);
        renderAssistantInline();
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
        window.clearSessionToken();
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
    const datePicker = (typeof flatpickr === 'function') ? flatpickr("#dateRange", { 
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
    }) : null;

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
            updateHeaderActionsVisibility();
            updateLocationPlanPromptVisibility();
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

    async function toggleLocationFromSettings(isChecked) {
        const toggleEl = document.getElementById('settingsLocationToggle');
        if (!isChecked) {
            settingsStore.locationEnabled = false;
            saveSettingsStore(settingsStore);
            clearUserLocation();
            showToast('Location access disabled.', 'info');
            updateLocationPlanPromptVisibility();
            updateArrivalTracking();
            if (currentItinerary && currentItinerary.length) {
                renderItineraryUI(currentItinerary, tripDates || []);
            }
            return;
        }

        try {
            showToast('Requesting location permission...', 'info');
            const location = await requestUserLocationOnce();
            saveUserLocation(location);
            settingsStore.locationEnabled = true;
            saveSettingsStore(settingsStore);
            showToast('Location enabled.', 'success');
            updateLocationPlanPromptVisibility();
            updateArrivalTracking();
            if (currentItinerary && currentItinerary.length) {
                renderItineraryUI(currentItinerary, tripDates || []);
            }
        } catch (err) {
            settingsStore.locationEnabled = false;
            saveSettingsStore(settingsStore);
            if (toggleEl) toggleEl.checked = false;

            const code = err?.code;
            const msg =
                code === 1
                    ? 'Location permission denied. Please enable it in your browser settings and try again.'
                    : code === 2
                        ? 'Location is unavailable right now. Please try again.'
                        : code === 3
                            ? 'Location request timed out. Please try again.'
                    : (err?.message || 'Could not enable location.');
            showToast(msg, 'error');
            updateLocationPlanPromptVisibility();
            updateArrivalTracking();
        }
    }


    function exportUserData() {
        const payload = {
            version: 1,
            exportedAt: new Date().toISOString(),
            profile: userProfile,
            settings: settingsStore,
            favorites,
            trips: loadTrips()
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'planner-export.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
        showToast('Data exported as JSON.', 'success');
    }

    function openImportData() {
        const input = document.getElementById('importDataInput');
        if (input) input.click();
    }

    function handleImportData(event) {
        const file = event?.target?.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const data = JSON.parse(reader.result);
                if (!data || typeof data !== 'object') throw new Error('Invalid file');
                if (Array.isArray(data.favorites)) {
                    favorites = data.favorites;
                    saveFavorites(favorites);
                }
                if (Array.isArray(data.trips)) {
                    saveTrips(data.trips);
                }
                if (data.profile) {
                    userProfile = { ...DEFAULT_PROFILE, ...data.profile };
                    saveProfile(userProfile);
                }
                if (data.settings) {
                    settingsStore = { ...settingsStore, ...data.settings };
                    saveSettingsStore(settingsStore);
                    applyTheme(settingsStore.theme || 'gold', false);
                }
                populateProfileUI();
                renderTripsOnProfile();
                hydratePlannerInputsFromProfile();
                showToast('Data imported.', 'success');
            } catch (e) {
                console.error(e);
                showToast('Import failed. Invalid file.', 'error');
            } finally {
                event.target.value = '';
            }
        };
        reader.readAsText(file);
    }

    async function syncDataNow() {
        const trips = loadTrips();
        if (!currentUser && !window.getAuthToken()) {
            showToast('Log in to sync with cloud.', 'info');
            return;
        }
        try {
            const res = await window.apiRequest('/api/sync', {
                method: 'POST',
                body: { trips, favorites }
            });
            if (res?.trips && Array.isArray(res.trips)) {
                saveTrips(res.trips);
                renderTripsOnProfile();
            }
            if (res?.favorites && Array.isArray(res.favorites)) {
                favorites = res.favorites;
                saveFavorites(favorites);
                renderFavorites();
            }
            showToast('Sync complete.', 'success');
        } catch (e) {
            console.error(e);
            showToast(e.message || 'Sync failed. Using local data.', 'error');
        }
    }

    /* ---------- ITINERARY ---------- */
    const LOOP_COORDS = { lat: 41.8781, lng: -87.6298 };

    function getTransportMode() {
        const val = typeof userPreferences.transportation === 'number' ? userPreferences.transportation : 50;
        if (val >= 70) return 'private';
        if (val >= 40) return 'rideshare';
        return 'walk';
    }

    function updateRouteChips(dayNumber) {
        const loc = settingsStore?.locationEnabled ? getUserLocationSnapshot(1000 * 60 * 2) : null;
        const originOverride = loc ? { lat: loc.lat, lng: loc.lng } : null;
        return updateRouteChipsService({ dayNumber, getTransportMode, itinerary: currentItinerary, originOverride });
    }

    async function openTransitPreview() {
        const loc = settingsStore?.locationEnabled ? getUserLocationSnapshot() : null;
        if (!loc) {
            showToast('Enable location to see nearby CTA transit options.', 'info');
            return;
        }
        try {
            showToast('Calculating nearby transit options...', 'info');

            let nearby = null;
            let gtfsFailed = false;
            try {
                const q = `?lat=${encodeURIComponent(loc.lat)}&lng=${encodeURIComponent(loc.lng)}&radius=2000&limit=18`;
                nearby = await window.apiRequest(`/api/transit/nearby${q}`, { method: 'GET' });
            } catch (e) {
                nearby = null;
                gtfsFailed = true;
            }

            const activeDay = getActiveDayActivities();
            const firstStop = activeDay?.[0];
            const hasDest = !!firstStop && typeof firstStop.lat === 'number' && typeof firstStop.lng === 'number';
            const googleTransitUrl = hasDest
                ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(`${loc.lat},${loc.lng}`)}&destination=${encodeURIComponent(`${firstStop.lat},${firstStop.lng}`)}&travelmode=transit`
                : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('CTA near me')}`;
            const ctaTrackerUrl = 'https://www.transitchicago.com/traintracker/';
            const ctaSearchUrl = `https://www.google.com/search?q=${encodeURIComponent('CTA stops near me')}`;

            const stops = Array.isArray(nearby?.stops) ? nearby.stops : [];
            const trains = stops.filter(s => (s.modes || []).includes('train')).slice(0, 4);
            const buses = stops.filter(s => (s.modes || []).includes('bus')).slice(0, 4);

            const formatStop = (s) => {
                const dist = typeof s.distanceMi === 'number' ? `${s.distanceMi.toFixed(2)} mi` : '';
                const routes = Array.isArray(s.routes) ? s.routes : [];
                const short = routes
                    .filter(r => r && (r.type === 'bus' || r.type === 'train'))
                    .map(r => r.shortName)
                    .filter(Boolean);
                const uniq = Array.from(new Set(short)).slice(0, 10);
                const routesLabel = uniq.length ? uniq.join(', ') : 'Routes unknown';
                return `<div style="margin-top:8px;">
                    <strong>${s.name}</strong> <span style="color:var(--secondary-text); font-size:0.85rem;">(${dist})</span><br>
                    <span style="color:var(--secondary-text); font-size:0.85rem;">Lines: ${routesLabel}</span>
                </div>`;
            };

            let trainsHtml = '';
            let busesHtml = '';

            if (trains.length || buses.length) {
                trainsHtml = trains.length
                    ? `<div style="margin-top:10px;"><strong>Trains</strong>${trains.map(formatStop).join('')}</div>`
                    : `<div style="margin-top:10px; color:var(--secondary-text); font-size:0.85rem;">No nearby train stations found.</div>`;
                busesHtml = buses.length
                    ? `<div style="margin-top:10px;"><strong>Buses</strong>${buses.map(formatStop).join('')}</div>`
                    : `<div style="margin-top:10px; color:var(--secondary-text); font-size:0.85rem;">No nearby bus stops found.</div>`;
            } else if (!gtfsFailed && nearby) {
                // GTFS reachable but no CTA stops in range (likely outside CTA coverage).
                trainsHtml = `<div style="margin-top:10px; color:var(--secondary-text); font-size:0.85rem;">No CTA transit stops found near your location. CTA data currently covers Chicago only.</div>`;
                busesHtml = '';
            } else {
                // Fallback to lightweight train-only station lookup (no GTFS backend needed).
                const stations = await findNearbyCtaStations(loc.lat, loc.lng, 3000, 3);
                const linesFor = (s) => (Array.isArray(s?.lines) && s.lines.length ? s.lines.join(', ') : 'Unknown lines');
                const stationsHtml = (stations || []).map((s, idx) => {
                    const distMi = formatDistanceMiles(haversineDistanceKm({ lat: loc.lat, lng: loc.lng }, s), 1);
                    return `<div style="margin-top:${idx === 0 ? 8 : 6}px;">
                        <strong>${s.name}</strong> <span style="color:var(--secondary-text); font-size:0.85rem;">(${distMi})</span><br>
                        <span style="color:var(--secondary-text); font-size:0.85rem;">Lines: ${linesFor(s)}</span>
                    </div>`;
                }).join('');
                trainsHtml = stationsHtml
                    ? `<div style="margin-top:10px;"><strong>Trains</strong>${stationsHtml}</div>`
                    : `<div style="margin-top:10px; color:var(--secondary-text); font-size:0.85rem;">No nearby train stations found.</div>`;
                busesHtml = gtfsFailed
                    ? `<div style="margin-top:10px; color:var(--secondary-text); font-size:0.85rem;">Bus stops require the GTFS backend endpoint. For local testing, open the app with <strong>?api=local</strong> and run the backend on port 3001.</div>`
                    : `<div style="margin-top:10px; color:var(--secondary-text); font-size:0.85rem;">No nearby bus stops found.</div>`;
            }

            assistantTransitHtml = `
                <div style="color:var(--secondary-text); font-size:0.85rem;">Nearby transit stops:</div>
                ${trainsHtml}
                ${busesHtml}
                <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">
                    <a class="assistant-chip" href="${googleTransitUrl}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;">Open Google Maps (Transit)</a>
                    <a class="assistant-chip" href="${ctaTrackerUrl}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;">CTA Train Tracker</a>
                    <a class="assistant-chip" href="${ctaSearchUrl}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;">Search nearby stops</a>
                </div>
            `;
            assistantPrevMode = assistantMode;
            assistantMode = ASSISTANT_STATES.TRANSIT_INFO;
            renderAssistantInline();
            const panel = document.getElementById('assistantPanel');
            if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (e) {
            showToast(e.message || 'CTA transit preview failed.', 'error');
        }
    }

    function closeTransitInfo() {
        assistantTransitHtml = '';
        assistantMode = assistantPrevMode || ASSISTANT_STATES.TOUR_GUIDE_READY;
        assistantPrevMode = null;
        renderAssistantInline();
    }

    function scoreActivityForPlan(activity, cursor, dayIdx) {
        let score = 100;
        if (!activity) return 0;
        const dist = haversineDistanceKm(cursor, activity);
        score -= dist * 6;
        if (likedTags.includes(activity.tag)) score += 25;
        if (userPreferences.price < 40 && activity.price <= 2) score += 12;
        if (userPreferences.price > 65 && activity.price >= 2) score += 10;
        if (userPreferences.tourGuide && activity.requiresBooking) score += 6;
        if (dayIdx === 0 && activity.category === 'Architecture') score += 5;
        if (activity.isOutdoor && userPreferences.tempo < 40) score -= 4;
        if (!activity.lat || !activity.lng) score -= 8;
        return score;
    }

    function buildOptimizedItinerary(dates, activities) {
        const itinerary = [];
        const pool = activities.slice();
        const used = new Set();
        const tempo = typeof userPreferences.tempo === 'number' ? userPreferences.tempo : 50;
        const targetCount = tempo >= 70 ? 5 : tempo >= 45 ? 4 : 3;
        const startHour = tempo <= 35 ? 10 : 9;
        const transportMode = getTransportMode();

        dates.forEach((d, dayIdx) => {
            const dayPlan = [];
            let cursor = { ...LOOP_COORDS };
            let currentMinutes = startHour * 60 + 15;
            const latest = 21 * 60 + 30;

            for (let i = 0; i < targetCount; i++) {
                const candidates = pool.filter(a => !used.has(a.id));
                if (!candidates.length) break;
                candidates.sort((a, b) => scoreActivityForPlan(b, cursor, dayIdx) - scoreActivityForPlan(a, cursor, dayIdx));
                const chosen = candidates[0];
                if (!chosen) break;
                used.add(chosen.id);
                const idx = pool.findIndex(p => p.id === chosen.id);
                if (idx >= 0) pool.splice(idx, 1);

                const dist = haversineDistanceKm(cursor, chosen);
                currentMinutes += estimateTravelMinutes(dist, transportMode);
                const durationMinutes = getDurationMinutes(chosen);

                const activity = { ...chosen };
                activity.time = formatMinutesToClock(currentMinutes);
                activity.duration = formatDurationLabel(durationMinutes);
                dayPlan.push(activity);

                currentMinutes += durationMinutes;
                cursor = { lat: chosen.lat || cursor.lat, lng: chosen.lng || cursor.lng };

                if (currentMinutes > latest) break;
            }

            itinerary.push(dayPlan);
        });

        return itinerary;
    }

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
        let itinerary = [];

        try {
            itinerary = buildOptimizedItinerary(dates, allActivities);
        } catch (e) {
            console.warn('Optimized itinerary failed, falling back', e);
        }

        // Fallback if optimizer returned nothing usable
        const hasStops = itinerary && itinerary.some(day => Array.isArray(day) && day.length);
        if (!hasStops) {
            itinerary = generateMockItinerary(dates, allActivities);
        }

        currentItinerary = itinerary;
        saveItinerary(itinerary);
        renderItineraryUI(itinerary, dates);
        prefetchWeatherForTripDates(dates);
        renderAssistantState(buildAssistantContext());
    }

    function renderItineraryUI(itinerary, dates) {
        tripDates = dates || tripDates || [];
        const itineraryContent = document.getElementById('itineraryContent');
        const daySummary = document.getElementById('daySummary');
        const viewDayMapBtn = document.getElementById('viewDayMapBtn');
        const dayTabs = document.getElementById('dayTabs');
        const headerActionsCompact = document.getElementById('headerActionsCompact');

        itineraryContent.innerHTML = '';
        if (dayTabs) dayTabs.innerHTML = '';
        if (daySummary) daySummary.innerHTML = '';
        if (viewDayMapBtn) viewDayMapBtn.style.display = itinerary.length ? 'inline-flex' : 'none';
        updateHeaderActionsVisibility();

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
            activeDayIndex = idx;
            const dayContent = dayDiv.querySelector('.day-content');
            if (dayContent) dayContent.classList.add('active');

            if (daySummary) {
                const d = dates[idx];
                const weather = getWeatherSnapshotSync(d);
                const dateStr = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
                daySummary.innerHTML = `
                    <div class="date">${dateStr}</div>
                    <div class="weather">${weather.icon} ${weather.temp} ${weather.desc}</div>
                `;
            }

            currentDayMapData.dayNumber = idx + 1;
            currentDayMapData.activities = itinerary[idx];
            if (viewDayMapBtn) {
                viewDayMapBtn.style.display = 'inline-flex';
                viewDayMapBtn.innerHTML = `<i class="fa-solid fa-map-location-dot"></i> Day ${idx + 1} Map (${(itinerary[idx] || []).length})`;
            }
            renderAssistantInline();
            updateRouteChips(idx + 1);
            renderPlanInsights();
            setTimeout(() => renderPlanInsights(), 700);
            updateLocationPlanPromptVisibility();
            updateArrivalTracking();
            const snap = settingsStore?.locationEnabled ? getUserLocationSnapshot(1000 * 60 * 60 * 24) : null;
            if (snap) evaluateArrivalFromLocation(snap);
        };
        setActiveDayExternal = setActiveDay;

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

        if (isTourGuideActive() && itinerary.length > 0) {
            showAssistant(`<strong>Day plan ready.</strong> I'll prompt you when you're near a stop, then you can open Wise for on-site guidance.`);
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
        const tempo = userPreferences.tempo ?? '-';
        const price = userPreferences.price ?? '-';
        const transport = userPreferences.transportation ?? '-';
        let summary = `Trip Plan to Share (Tempo ${tempo} | Price ${price} | Transport ${transport}):\n`;
        itinerary.forEach((day, idx) => {
            const datePart = dates[idx] ? dates[idx].toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) : `Day ${idx + 1}`;
            summary += `${datePart}:\n`;
            day.slice(0, 3).forEach(a => {
                const distance = a._lastDistance ? ` | ${a._lastDistance}` : '';
                const duration = a._lastDuration ? ` | ${a._lastDuration}` : '';
                summary += ` - ${a.title}${a.time ? ' at ' + a.time : ''}${distance}${duration}\n`;
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
        const weather = getWeatherSnapshotSync(date);
        const dateStr = date.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' });
        
        let activityList = '';
        let alertBanner = '';

        const weatherAlertsEnabled = settingsStore?.weatherAlerts !== false;
        const isWetWeather = (w) => {
            const desc = String(w?.desc || '').toLowerCase();
            if (desc.includes('rain') || desc.includes('drizzle') || desc.includes('thunder')) return true;
            if (typeof w?.precipProb === 'number' && w.precipProb >= 50) return true;
            return false;
        };

        if (isTourGuideActive() && weatherAlertsEnabled && isWetWeather(weather)) {
            alertBanner = `
                <div class="weather-alert" style="background: rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.4); padding:10px; border-radius:10px; margin-bottom:8px;">
                    <strong>Weather alert for Day ${dayNumber}.</strong>
                    <div style="margin-top:4px; display:flex; gap:6px; flex-wrap:wrap;">
                        <button class="assistant-chip" onclick="skipNextStop(this)">Skip next stop</button>
                        <button class="assistant-chip" onclick="moveNextToTomorrow(this)">Delay to tomorrow</button>
                        <button class="assistant-chip" onclick="suggestNearbyFood(this)">Nearby food</button>
                        <button class="assistant-chip" onclick="suggestNearby('coffee', this)">Nearby coffee</button>
                        <button class="assistant-chip" onclick="suggestNearby('museum', this)">Nearby museums</button>
                    </div>
                </div>`;
            showAssistant(`<strong>Weather alert for Day ${dayNumber}:</strong> ${weather.desc || 'Rain'} expected. Want to swap outdoor stops for indoor options?`);
        }

            if (dayPlan.length === 0) {
                activityList = `<div style="padding: 8px 0; color: var(--secondary-text); font-style: italic; font-size:0.82rem;">
                No activities for this day. Try changing Tempo or Price sliders.
            </div>`;
        } else {
            if (isTourGuideActive()) {
                activityList += `<div style="padding: 8px 0; color: var(--success); font-style: italic; font-size:0.82rem;">
                    <i class="fa-solid fa-robot"></i> AI Tour Guide is ready. I'll prompt you when you're near a stop.
                </div>`;
            }
            dayPlan.forEach((activity, idx) => {
                const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(activity.title + ', Chicago')}`;
                const hasCoords = activity.lat && activity.lng;
                const canShowRouting = !!settingsStore?.locationEnabled;
                const userOrigin = canShowRouting ? getUserLocationSnapshot(1000 * 60 * 2) : null;
                const prev = idx > 0 ? dayPlan[idx - 1] : null;
                const origin = prev && prev.lat && prev.lng ? prev : LOOP_COORDS;
                const bookingKey = `${dayNumber}-${activity.id}`;
                const booked = isBooked(dayNumber, activity.id);
                const directionsOrigin = userOrigin ? userOrigin : origin;
                const directionsUrl = hasCoords
                    ? `https://www.google.com/maps/dir/?api=1&origin=${directionsOrigin.lat},${directionsOrigin.lng}&destination=${activity.lat},${activity.lng}`
                    : mapsUrl;
                const routeChip = (hasCoords && canShowRouting)
                    ? `<span class="route-chip" data-day="${dayNumber}" data-idx="${idx}" data-lat="${activity.lat}" data-lng="${activity.lng}" data-prev-lat="${origin.lat}" data-prev-lng="${origin.lng}" title="Distance & duration">Locating...</span>`
                    : '';
                const bookingBadge = activity.requiresBooking
                    ? `<span class="activity-badge${booked ? '' : ' pulsing-glow'}" data-book-badge="${bookingKey}" style="background:${booked ? 'rgba(22,163,74,0.15)' : 'rgba(234,179,8,0.15)'}; color:${booked ? 'var(--success)' : 'var(--accent-gold)'}; border:1px solid ${booked ? 'rgba(22,163,74,0.5)' : 'rgba(234,179,8,0.5)'};">${booked ? 'Booked' : 'Booking needed'}</span>`
                    : '';
                const updatedBadge = activity._recentlyUpdated
                    ? `<span class="activity-badge" style="background:rgba(59,130,246,0.15); color:var(--accent-gold); border:1px solid rgba(59,130,246,0.5);">Updated</span>`
                    : '';
                const guideSnippet = isTourGuideActive()
                    ? `${weather.icon || ''} ${weather.temp || ''} ${weather.desc || ''} | Next: ${activity.time || 'TBD'} | Est. ${activity.duration || 'visit soon'}`
                    : '';

                activityList += `
                    <div class="activity-item" data-day="${dayNumber}" data-activity-id="${activity.id}" onclick="toggleDetails(this)">
                        
                        <div class="activity-content-wrapper">
                            <div style="flex-grow: 1; min-width: 0;">
                                <div class="activity-title">${activity.title} ${bookingBadge} ${updatedBadge}</div>
                                <div class="activity-duration">Est. Visit: ${activity.duration || '1 hr'}</div>
                                <div class="activity-meta-row" style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:6px;">
                                    ${routeChip}
                                </div>
                            </div>
                            <div class="activity-time">${activity.time || 'TBD'}</div>
                        </div>

                        <div class="activity-details">
                            <div class="details-info-box">
                                <h5>About ${activity.title}</h5>
                                <p>${activity.details}</p>
                                
                                <div class="insta-tip">
                                    <i class="fa-brands fa-instagram"></i> <strong>Insta Tip:</strong> ${activity.insta || 'Look for unique angles of the skyline!'}
                                </div>
                                <div class="place-meta" id="place-meta-${dayNumber}-${activity.id}"></div>
                                
                                <div class="details-actions">
                                    <a href="${directionsUrl}" target="_blank" class="action-btn btn-maps">
                                        <i class="fa-solid fa-route"></i> Directions
                                    </a>
                                    <a href="https://feverup.com/en/chicago" target="_blank" class="action-btn btn-booking">
                                        <i class="fa-solid fa-ticket"></i> Book/Reserve
                                    </a>
                                    ${activity.requiresBooking ? `
                                        <button type="button" class="action-btn btn-booking" data-book-btn="${bookingKey}" onclick="event.stopPropagation(); toggleBooking(${dayNumber}, ${activity.id}, event);">
                                            ${booked ? 'Booked' : 'Mark booked'}
                                        </button>` : ''}
                                    <button type="button" class="action-btn btn-booking" style="color: var(--accent-gold); border-color: var(--accent-gold);" onclick="event.stopPropagation(); toggleFavorite(${activity.id});">
                                        <i class="fa-regular fa-star"></i> Save place
                                    </button>
                                    <button type="button" class="action-btn btn-booking" onclick="event.stopPropagation(); requestDetailedGuide(${dayNumber}, ${activity.id});">
                                        <i class="fa-solid fa-book-open-reader"></i> Detailed Guide
                                    </button>
                                    <button type="button" class="action-btn btn-booking" onclick="event.stopPropagation(); requestAudioNarration(${dayNumber}, ${activity.id});">
                                        <i class="fa-solid fa-headphones"></i> Audio Narration
                                    </button>
                                    <button type="button" class="action-btn btn-booking" onclick="event.stopPropagation(); exportActivityToCalendar(${dayNumber}, ${activity.id});">
                                        <i class="fa-solid fa-calendar-plus"></i> Calendar
                                    </button>
                                </div>
                                <div class="gemini-output" id="guide-${dayNumber}-${activity.id}" style="margin-top:8px; font-size:0.85rem; color: var(--secondary-text);">
                                    ${guideSnippet || 'Guide notes will show here once available.'}
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            });
        }

        return `
            <div class="day-content">
                ${alertBanner}
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
        if (detailBox.classList.contains('open')) {
            const dayNumber = parseInt(item.dataset.day, 10);
            const activityId = parseInt(item.dataset.activityId, 10);
            if (!Number.isNaN(dayNumber) && !Number.isNaN(activityId)) {
                hydratePlaceMetaForActivity(dayNumber, activityId);
            }
        }
    }

    function renderAssistantPrompt() {
        const content = document.getElementById('assistantContent');
        const actions = document.getElementById('assistantActions');
        const footer = document.querySelector('.assistant-drawer-footer');
        if (footer && !assistantChatMode) footer.style.display = 'none';
        if (content) {
            content.innerHTML = `
                <div style="font-weight:700; margin-bottom:6px;">Do you want to change the plan?</div>
                <div style="color: var(--secondary-text); margin-bottom:10px;">You can change the days/activities.</div>
            `;
        }
        if (actions) {
            actions.innerHTML = '';
            const yesBtn = document.createElement('button');
            yesBtn.className = 'assistant-chip';
            yesBtn.textContent = 'Yes, I want to make changes';
            yesBtn.onclick = () => showToast('Tell me what to change: day, activity, or timing.', 'info');
            const noBtn = document.createElement('button');
            noBtn.className = 'assistant-chip';
            noBtn.textContent = 'No, keep & confirm the plan';
            noBtn.onclick = () => showToast('Plan confirmed. I will keep the current schedule.', 'success');
            actions.appendChild(yesBtn);
            actions.appendChild(noBtn);
        }
    }

    function requestDetailedGuide(dayNumber, activityId) {
        const out = document.getElementById(`guide-${dayNumber}-${activityId}`);
        const cite = document.getElementById(`citations-${dayNumber}-${activityId}`);
        if (out) out.textContent = 'Detailed guide (LLM) placeholder. Connect to backend to fetch.';
        if (cite) cite.textContent = 'Citations: sample source placeholders.';
    }

    function requestAudioNarration(dayNumber, activityId) {
        const out = document.getElementById(`guide-${dayNumber}-${activityId}`);
        const cite = document.getElementById(`citations-${dayNumber}-${activityId}`);
        if (out) out.textContent = 'Audio narration (TTS) placeholder. Connect to backend to play.';
        if (cite) cite.textContent = 'Citations: TTS source.';
    }

    function exportActivityToCalendar(dayNumber, activityId) {
        const day = currentItinerary && currentItinerary[dayNumber - 1];
        const activity = day ? day.find(a => a.id === activityId) : null;
        if (!activity) return showToast('Activity not found.', 'error');
        const date = tripDates && tripDates[dayNumber - 1] ? new Date(tripDates[dayNumber - 1]) : new Date();
        const start = new Date(date);
        if (activity.time) {
            const [hr, min] = activity.time.split(':').map(v => parseInt(v, 10) || 0);
            start.setHours(hr, min || 0, 0, 0);
        }
        const end = new Date(start.getTime() + (durationToMinutes(activity.duration) || 60) * 60000);
        const fmt = (d) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        const ics = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'BEGIN:VEVENT',
            `DTSTART:${fmt(start)}`,
            `DTEND:${fmt(end)}`,
            `SUMMARY:${activity.title}`,
            `DESCRIPTION:${activity.details || 'Chicago AI Planner activity'}`,
            'END:VEVENT',
            'END:VCALENDAR'
        ].join('\\r\\n');
        const blob = new Blob([ics], { type: 'text/calendar' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${activity.title || 'activity'}.ics`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        showToast('Calendar file ready.', 'success');
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
            const normalized = String(errText || '').replace(/\s+/g, ' ').trim();
            const msg = normalized.includes('OPENAI_API_KEY') || normalized.includes('OPENAI_KEY')
                ? 'AI is not configured on the server yet.'
                : `AI request failed (${res.status}).`;
            const e = new Error(msg);
            e.status = res.status;
            e.raw = normalized;
            throw e;
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
            const weather = getWeatherSnapshotSync(todayDate);
            const profileSummary = `Tempo:${userPreferences.tempo}|Price:${userPreferences.price}|Transport:${userPreferences.transportation}|TourGuide:${userPreferences.tourGuide}|Liked:${(userProfile.likedTags || []).join(', ')}`;
            const systemContent = `You are a concise Chicago travel planner. Suggest exactly 3 stops for today with times in format "HH:MM - Title". Use current profile ${profileSummary}. Today's weather: ${weather.desc} ${toPlainTemp(weather.temp)}. Planned schedule: ${daySchedule || 'none'}. Keep each line under 50 characters.`;
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
            listEl.innerHTML = `<div class="hero-card-line"><span>--</span><strong>Suggestions unavailable.</strong></div>`;
            metaEl.textContent = e?.message || 'Unavailable';
        }
    }

    async function sendChatPrompt(userText) {
        if (!isTourGuideActive()) {
            showToast('Confirm bookings (or book later) to start Tour Guide chat.', 'info');
            return;
        }
        const isTravelRelated = (text) => {
            const t = (text || '').toLowerCase();
            const travelHints = ['trip','travel','itinerary','plan','day','schedule','museum','restaurant','food','hotel','map','route','chicago','booking','ticket','weather','time','move','reschedule','change','at ','am','pm','january','february','march','april','may','june','july','august','september','october','november','december'];
            const offTopic = ['code','program','song','poem','draw','alien','flag','game','joke'];
            if (offTopic.some(k => t.includes(k))) return false;
            return travelHints.some(k => t.includes(k));
        };
        if (!isTravelRelated(userText)) {
            appendChatBubble("I'm here to help with your Chicago trip-ask about your itinerary, days, times, places, bookings, or directions.", false);
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
        if (!confirm('Are you sure you want to delete this trip?')) return;
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
        migrateStorage();
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
        initAssistantInline();
    });

export {
    experiences,
    CITY_OPTIONS,
    hydrateSessionFromToken,
    getDayStopsWithStatus,
    getNextStopFromContext,
    buildDaySummary,
    buildDayScheduleDetailed,
    swapCurrentToTomorrow,
    isOutdoor,
    buildChatContext,
    updateAiUiVisibility,
    showAssistant,
    hideAssistant,
    renderAssistantState,
    expandAssistantFull,
    dockAssistant,
    handleAssistantTap,
    setAssistantState,
    expandAssistantSheet,
    collapseAssistantSheet,
    startSheetDrag,
    onSheetDragMove,
    onSheetTouchMove,
    handleSheetDrag,
    onSheetDragEnd,
    onSheetTouchEnd,
    finishSheetDrag,
    resetAssistant,
    openAssistantChat,
    getActiveDayActivities,
    writeBackDayActivities,
    setAssistantMode,
    setChatFocusToDay,
    confirmDayPlan,
    renderAssistantInline,
    populateAssistantActivities,
    renderBookingList,
    confirmBookingStatuses,
    finalizeBookingConfirmation,
    deferBookingsAndStartTour,
    backToPlanEditing,
    submitChangeRequest,
    handleChangeKeydown,
    confirmAssistantSave,
    resumeAssistantChanges,
    confirmAndFinalizeDay,
    parseRequestedDayIndex,
    applyChangeCommand,
    initAssistantInline,
    handleAssistantPointerStart,
    handleAssistantPointerMove,
    handleAssistantPointerEnd,
    handleAssistantTouchStart,
    handleAssistantTouchMove,
    handleAssistantTouchEnd,
    handleAssistantMouseDown,
    handleAssistantMouseMove,
    handleAssistantMouseUp,
    appendChatBubble,
    openChatModal,
    closeChatModal,
    toggleChatSize,
    sendChatMessage,
    handleChatKeydown,
    handleSheetKeydown,
    buildAssistantContext,
    flashChip,
    skipNextStop,
    moveNextToTomorrow,
    suggestNearbyFood,
    suggestNearby,
    suggestNearbyFromActivity,
    summarizeToday,
    populateCityOptions,
    populateCitySelect,
    handleCityInput,
    initCitySelector,
    isStartReady,
    updateStartButtonState,
    initPasswordToggles,
    applyTheme,
    saveSettingsToggle,
    hydrateSettingsUI,
    setActiveTab,
    updateHeaderActionsVisibility,
    showOnlySection,
    toggleHeaderActionsMenu,
    closeHeaderActionsMenu,
    openPlannerTab,
    openPlanner,
    goToPlannerStart,
    openHome,
    openProfileTab,
    openProfileFromMenu,
    openPastTripsTab,
    openPastTripsFromMenu,
    openSettingsFromMenu,
    logoutFromMenu,
    toggleProfileDropdown,
    closeProfileDropdown,
    initSignupTourGuideToggle,
    clearPlannerState,
    setAuthMode,
    populateProfileUI,
    handleLoginSubmit,
    handleRegisterSubmit,
    renderTravelDNA,
    getBadges,
    renderBadges,
    renderFavorites,
    toggleFavorite,
    removeFavorite,
    startHold,
    cancelHold,
    handleCheckin,
    handleComplete,
    isBooked,
    toggleBooking,
    fillEditForm,
    saveProfileEdit,
    cancelProfileEdit,
    triggerProfilePicUpload,
    handleProfilePicSelected,
    logout,
    resetAllData,
    hydratePlannerInputsFromProfile,
    startApp,
    switchSection,
    startProcessing,
    reviewProfile,
    addLikedTag,
    renderCards,
    initDrag,
    nextCard,
    finishSwiping,
    getRulerValue,
    mapSelectToValue,
    mapValueToSelect,
    handleProfileSelectChange,
    updateAllKnobs,
    initRulerDrag,
    setupEvaluationScreen,
    toggleTourGuide,
    toggleTourGuideFromSettings,
    toggleLocationFromSettings,
    enableLocationFromPlanPrompt,
    dismissLocationPlanPrompt,
    respondToArrivalPrompt,
    openWiseForActivity,
    renderPlanInsights,
    dismissPlanInsight,
    openAssistantForSuggestion,
    openTransitPreview,
    closeTransitInfo,
    exportUserData,
    openImportData,
    handleImportData,
    syncDataNow,
    getTransportMode,
    haversineDistanceKm,
    estimateTravelMinutes,
    formatMinutesToClock,
    formatDurationLabel,
    getDurationMinutes,
    scoreActivityForPlan,
    buildOptimizedItinerary,
    getDaysArray,
    generateItinerary,
    renderItineraryUI,
    copyItinerarySummary,
    buildTripSummary,
    copyTripSummaryById,
    loadLastPlan,
    generateMockItinerary,
    renderDay,
    toggleDetails,
    renderAssistantPrompt,
    requestDetailedGuide,
    requestAudioNarration,
    exportActivityToCalendar,
    callAssistant,
    refreshSuggestedToday,
    sendChatPrompt,
    coordsToPercent,
    handleMainMapClick,
    showDayMap,
    completeCurrentTrip,
    toggleTripDetails,
    deleteTrip,
    renderTripsOnProfile,
    undoLastChange
};
