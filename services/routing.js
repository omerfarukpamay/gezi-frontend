/* Routing service (OSRM + local heuristics) */

export function haversineDistanceKm(a, b) {
    if (!a || !b || !a.lat || !a.lng || !b.lat || !b.lng) return 0;
    const toRad = (deg) => deg * (Math.PI / 180);
    const R = 6371;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const sinDLat = Math.sin(dLat / 2);
    const sinDLng = Math.sin(dLng / 2);
    const aVal = sinDLat * sinDLat + sinDLng * sinDLng * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));
    return R * c;
}

export function estimateTravelMinutes(distanceKm, mode) {
    const speeds = { walk: 4.5, rideshare: 18, private: 24 }; // km/h
    const overhead = { walk: 4, rideshare: 8, private: 6 }; // mins for waiting/parking
    const speed = speeds[mode] || speeds.walk;
    const base = (distanceKm / speed) * 60;
    return Math.max(5, Math.round(base + (overhead[mode] || 4)));
}

export function formatMinutesToClock(totalMinutes) {
    const normalized = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
    const h = Math.floor(normalized / 60);
    const m = normalized % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatDurationLabel(mins) {
    const m = Math.max(15, Math.round(mins));
    const h = Math.floor(m / 60);
    const rem = m % 60;
    if (h === 0) return `${rem} min`;
    if (rem === 0) return `${h} hr`;
    return `${h} hr ${rem} min`;
}

export function getDurationMinutes(activity) {
    if (!activity) return 90;
    if (typeof activity.durationMinutes === 'number') return Math.max(20, activity.durationMinutes);
    const str = (activity.duration || '').toLowerCase();
    const hrMatch = str.match(/(\d+)\s*hr/);
    const minMatch = str.match(/(\d+)\s*min/);
    const hrs = hrMatch ? parseInt(hrMatch[1], 10) : 0;
    const mins = minMatch ? parseInt(minMatch[1], 10) : 0;
    const total = hrs * 60 + mins;
    if (total > 0) return Math.max(20, total);
    return 90;
}

const routeCache = {};

function trafficMultiplierHint(mode, date = new Date()) {
    if (mode === 'walk') return { multiplier: 1, hint: '' };
    const hour = date.getHours();
    const rush = (hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 18);
    if (!rush) return { multiplier: 1, hint: '' };
    const multiplier = mode === 'rideshare' ? 1.25 : 1.18;
    return { multiplier, hint: 'Rush hour: travel time may be higher than the estimate.' };
}

async function fetchRouteInfo(origin, destination, transportMode) {
    if (!origin || !destination || !origin.lat || !origin.lng || !destination.lat || !destination.lng) return null;
    const key = `${origin.lat},${origin.lng}->${destination.lat},${destination.lng}|${transportMode || 'na'}`;
    if (routeCache[key]) return routeCache[key];
    const fallback = () => {
        const distanceKm = haversineDistanceKm(origin, destination);
        const durationMin = estimateTravelMinutes(distanceKm, transportMode || 'walk');
        return { distanceKm, durationMin, source: 'approx' };
    };
    try {
        const profile = transportMode === 'walk' ? 'walking' : 'driving';
        const url = `https://router.project-osrm.org/route/v1/${profile}/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=false`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('route fetch failed');
        const data = await res.json();
        const leg = data?.routes?.[0]?.legs?.[0];
        if (!leg) throw new Error('no leg');
        const distanceKm = Math.round((leg.distance || 0) / 10) / 100;
        const durationMin = Math.round((leg.duration || 0) / 60);
        routeCache[key] = { distanceKm, durationMin, source: 'live' };
        return routeCache[key];
    } catch (e) {
        const approx = fallback();
        routeCache[key] = approx;
        return approx;
    }
}

export async function updateRouteChips({ dayNumber, getTransportMode, itinerary }) {
    const chips = document.querySelectorAll(`.route-chip[data-day='${dayNumber}']`);
    const mode = typeof getTransportMode === 'function' ? getTransportMode() : 'walk';
    const traffic = trafficMultiplierHint(mode);

    for (const chip of chips) {
        const prevLat = parseFloat(chip.dataset.prevLat);
        const prevLng = parseFloat(chip.dataset.prevLng);
        const lat = parseFloat(chip.dataset.lat);
        const lng = parseFloat(chip.dataset.lng);
        const idx = parseInt(chip.dataset.idx, 10);
        if (Number.isNaN(lat) || Number.isNaN(lng) || Number.isNaN(prevLat) || Number.isNaN(prevLng)) {
            chip.textContent = 'Route n/a';
            continue;
        }
        chip.textContent = 'Routing...';
        const info = await fetchRouteInfo({ lat: prevLat, lng: prevLng }, { lat, lng }, mode);
        if (!info) {
            chip.textContent = 'Route n/a';
            continue;
        }
        const distanceLabel = `${info.distanceKm.toFixed(1)} km`;
        const base = info.durationMin || 0;
        const adjusted = Math.max(1, Math.round(base * traffic.multiplier));
        const durationLabel = `${adjusted} min`;
        chip.textContent = `${distanceLabel} • ${durationLabel}`;
        chip.title = traffic.hint || 'Estimated travel time (no real-time traffic).';
        chip.dataset.source = info.source;

        if (itinerary && itinerary[dayNumber - 1] && itinerary[dayNumber - 1][idx]) {
            itinerary[dayNumber - 1][idx]._lastDistance = distanceLabel;
            itinerary[dayNumber - 1][idx]._lastDuration = durationLabel;
        }
    }
}

