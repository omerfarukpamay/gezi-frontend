/* OpenStreetMap service (Overpass + light opening_hours parsing) */

import { haversineDistanceKm } from './routing.js';

const OVERPASS_CACHE_KEY = 'osm_overpass_cache_v1';
const OVERPASS_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
const OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
];

let overpassCache = (() => {
    try { return JSON.parse(localStorage.getItem(OVERPASS_CACHE_KEY)) || {}; } catch (e) { return {}; }
})();

function saveOverpassCache() {
    try { localStorage.setItem(OVERPASS_CACHE_KEY, JSON.stringify(overpassCache)); } catch (e) {}
}

function normalizePlaceName(name) {
    return String(name || '')
        .replace(/\(.*?\)/g, '')
        .replace(/['"]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

export function buildGoogleMapsSearchUrl(name, lat, lng) {
    const q = lat && lng ? `${name} @${lat},${lng}` : name;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

function getElementCenter(el) {
    if (!el) return null;
    if (typeof el.lat === 'number' && typeof el.lon === 'number') return { lat: el.lat, lng: el.lon };
    if (el.center && typeof el.center.lat === 'number' && typeof el.center.lon === 'number') return { lat: el.center.lat, lng: el.center.lon };
    return null;
}

function getTag(el, key) {
    return el?.tags?.[key] ?? null;
}

function formatOsmAddress(tags) {
    if (!tags) return '';
    const parts = [];
    const house = tags['addr:housenumber'];
    const street = tags['addr:street'];
    const city = tags['addr:city'];
    const state = tags['addr:state'];
    const postcode = tags['addr:postcode'];
    if (street) parts.push(`${house ? house + ' ' : ''}${street}`);
    if (city) parts.push(city);
    if (state) parts.push(state);
    if (postcode) parts.push(postcode);
    return parts.join(', ');
}

export function parseSimpleOpeningHours(openingHoursText, date = new Date()) {
    const raw = String(openingHoursText || '').trim();
    if (!raw) return { status: 'unknown', note: 'No hours available' };
    if (raw.toLowerCase() === '24/7') return { status: 'open', note: 'Open 24/7' };

    const dayNames = ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa'];
    const today = dayNames[date.getDay()];
    const minutesNow = date.getHours() * 60 + date.getMinutes();

    const dayToIndex = Object.fromEntries(dayNames.map((d, i) => [d, i]));
    const inDayRange = (range, todayKey) => {
        const m = range.match(/^(mo|tu|we|th|fr|sa|su)(?:-(mo|tu|we|th|fr|sa|su))?$/i);
        if (!m) return false;
        const a = m[1].toLowerCase();
        const b = (m[2] || m[1]).toLowerCase();
        const ai = dayToIndex[a];
        const bi = dayToIndex[b];
        const ti = dayToIndex[todayKey];
        if (ai <= bi) return ti >= ai && ti <= bi;
        return ti >= ai || ti <= bi;
    };
    const parseTime = (t) => {
        const m = t.match(/^(\d{1,2}):(\d{2})$/);
        if (!m) return null;
        return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    };

    const parts = raw.split(';').map(s => s.trim()).filter(Boolean);
    for (const part of parts) {
        const m = part.match(/^([A-Za-z]{2}(?:-[A-Za-z]{2})?)\s+(\d{1,2}:\d{2})-(\d{1,2}:\d{2})/);
        if (!m) continue;
        const dayRange = m[1];
        if (!inDayRange(dayRange, today)) continue;
        const start = parseTime(m[2]);
        const end = parseTime(m[3]);
        if (start === null || end === null) continue;
        const openNow = start <= end
            ? minutesNow >= start && minutesNow <= end
            : (minutesNow >= start || minutesNow <= end);
        return { status: openNow ? 'open' : 'closed', note: raw };
    }

    return { status: 'unknown', note: raw };
}

async function fetchOverpassJson(query) {
    const key = `q:${query}`;
    const cached = overpassCache[key];
    if (cached && cached.ts && (Date.now() - cached.ts) < OVERPASS_TTL_MS) return cached.data;

    for (const endpoint of OVERPASS_ENDPOINTS) {
        try {
            const controller = new AbortController();
            const t = setTimeout(() => controller.abort(), 9000);
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
                body: `data=${encodeURIComponent(query)}`,
                signal: controller.signal
            });
            clearTimeout(t);
            if (!res.ok) throw new Error(`Overpass ${res.status}`);
            const data = await res.json();
            overpassCache[key] = { ts: Date.now(), data };
            saveOverpassCache();
            return data;
        } catch (e) {
            // try next endpoint
        }
    }
    throw new Error('Overpass failed');
}

function buildNearbyOverpassQuery(lat, lng, radiusM, kind) {
    const around = `around:${Math.round(radiusM)},${lat},${lng}`;
    const kinds = {
        food: `nwr(${around})["amenity"~"restaurant|fast_food|food_court|ice_cream|bar|pub"];\n`,
        coffee: `nwr(${around})["amenity"="cafe"];\n`,
        museum: `nwr(${around})["tourism"~"museum|gallery"];\n`,
        attraction: `nwr(${around})["tourism"~"attraction|viewpoint"];\n`
    };
    const body = kinds[kind] || kinds.food;
    return `[out:json][timeout:25];(\n${body});out center tags;`;
}

export async function fetchNearbyPlaces(lat, lng, kind = 'food', limit = 5, radiusM = 900) {
    const query = buildNearbyOverpassQuery(lat, lng, radiusM, kind);
    const data = await fetchOverpassJson(query);
    const elements = data?.elements || [];
    const center = { lat, lng };
    const places = elements.map(el => {
        const c = getElementCenter(el);
        if (!c) return null;
        const name = getTag(el, 'name');
        if (!name) return null;
        const distanceKm = haversineDistanceKm(center, c);
        const openingHours = getTag(el, 'opening_hours');
        const open = parseSimpleOpeningHours(openingHours);
        return {
            id: `${el.type}/${el.id}`,
            name,
            lat: c.lat,
            lng: c.lng,
            distanceKm,
            openingHours: openingHours || '',
            openStatus: open.status,
            address: formatOsmAddress(el.tags),
            phone: getTag(el, 'phone') || getTag(el, 'contact:phone') || '',
            website: getTag(el, 'website') || getTag(el, 'contact:website') || ''
        };
    }).filter(Boolean);

    places.sort((a, b) => a.distanceKm - b.distanceKm);
    return places.slice(0, Math.max(1, limit));
}

export async function fetchPlaceMetaByName(lat, lng, name) {
    const clean = normalizePlaceName(name);
    if (!clean || !lat || !lng) return null;
    const safe = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const query = `[out:json][timeout:25];(\n` +
        `nwr(around:200,${lat},${lng})["name"~"${safe}",i];\n` +
        `);\nout center tags;`;
    const data = await fetchOverpassJson(query);
    const elements = data?.elements || [];
    if (!elements.length) return null;
    const center = { lat, lng };
    const scored = elements.map(el => {
        const c = getElementCenter(el);
        if (!c) return null;
        const elName = getTag(el, 'name') || '';
        const dist = haversineDistanceKm(center, c);
        const exactBoost = elName.toLowerCase().includes(clean.toLowerCase()) ? 0 : 0.4;
        return { el, c, score: dist + exactBoost };
    }).filter(Boolean);
    scored.sort((a, b) => a.score - b.score);
    const best = scored[0];
    const openingHours = getTag(best.el, 'opening_hours') || '';
    const open = parseSimpleOpeningHours(openingHours);
    return {
        name: getTag(best.el, 'name') || clean,
        lat: best.c.lat,
        lng: best.c.lng,
        address: formatOsmAddress(best.el.tags),
        openingHours,
        openStatus: open.status,
        phone: getTag(best.el, 'phone') || getTag(best.el, 'contact:phone') || '',
        website: getTag(best.el, 'website') || getTag(best.el, 'contact:website') || ''
    };
}

