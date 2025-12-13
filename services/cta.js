/* Chicago transit helpers:
   - Station lookup via City of Chicago open data (no API key)
   - Optional arrivals via backend proxy (CTA Train Tracker key kept server-side)
*/

import { haversineDistanceKm } from './routing.js';

const STATION_CACHE_KEY = 'cta_station_cache_v1';
const ARRIVALS_CACHE_KEY = 'cta_arrivals_cache_v1';

const STATION_TTL_MS = 1000 * 60 * 60 * 24; // 24h
const ARRIVALS_TTL_MS = 1000 * 30; // 30s

let stationCache = (() => {
    try { return JSON.parse(localStorage.getItem(STATION_CACHE_KEY)) || {}; } catch (e) { return {}; }
})();
let arrivalsCache = (() => {
    try { return JSON.parse(localStorage.getItem(ARRIVALS_CACHE_KEY)) || {}; } catch (e) { return {}; }
})();

const saveStationCache = () => {
    try { localStorage.setItem(STATION_CACHE_KEY, JSON.stringify(stationCache)); } catch (e) {}
};
const saveArrivalsCache = () => {
    try { localStorage.setItem(ARRIVALS_CACHE_KEY, JSON.stringify(arrivalsCache)); } catch (e) {}
};

function coordKey(lat, lng) {
    const la = Number(lat);
    const lo = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return '0,0';
    return `${la.toFixed(3)},${lo.toFixed(3)}`;
}

export async function findNearestCtaStation(lat, lng, radiusMeters = 3000) {
    const key = coordKey(lat, lng);
    const cached = stationCache[key];
    if (cached && cached.ts && (Date.now() - cached.ts) < STATION_TTL_MS && cached.station) {
        return cached.station;
    }

    const url = new URL('https://data.cityofchicago.org/resource/8pix-ypme.json');
    url.searchParams.set('$select', 'station_name,station_descriptive_name,map_id,location,red,blue,brn,g,p,pnk,o,y');
    url.searchParams.set('$limit', '200');
    url.searchParams.set('$where', `within_circle(location, ${lat}, ${lng}, ${radiusMeters})`);

    const res = await fetch(url.toString(), { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error('Could not load CTA station data.');
    const rows = await res.json();
    const stations = (Array.isArray(rows) ? rows : [])
        .map(r => {
            const la = Number(r?.location?.latitude);
            const lo = Number(r?.location?.longitude);
            const mapId = String(r?.map_id || '').trim();
            const name = String(r?.station_name || r?.station_descriptive_name || '').trim();
            if (!name || !mapId || !Number.isFinite(la) || !Number.isFinite(lo)) return null;
            const lineFlags = {
                red: !!r?.red,
                blue: !!r?.blue,
                brn: !!r?.brn,
                g: !!r?.g,
                p: !!r?.p,
                pnk: !!r?.pnk,
                o: !!r?.o,
                y: !!r?.y
            };
            const lineNames = [
                lineFlags.red ? 'Red' : null,
                lineFlags.blue ? 'Blue' : null,
                lineFlags.brn ? 'Brown' : null,
                lineFlags.g ? 'Green' : null,
                lineFlags.p ? 'Purple' : null,
                lineFlags.pnk ? 'Pink' : null,
                lineFlags.o ? 'Orange' : null,
                lineFlags.y ? 'Yellow' : null
            ].filter(Boolean);
            return { name, mapId, lat: la, lng: lo, lines: lineNames };
        })
        .filter(Boolean);

    if (!stations.length) {
        stationCache[key] = { ts: Date.now(), station: null };
        saveStationCache();
        return null;
    }

    const center = { lat: Number(lat), lng: Number(lng) };
    stations.sort((a, b) => haversineDistanceKm(center, a) - haversineDistanceKm(center, b));
    const nearest = stations[0];
    stationCache[key] = { ts: Date.now(), station: nearest };
    saveStationCache();
    return nearest;
}

export async function findNearbyCtaStations(lat, lng, radiusMeters = 3000, limit = 3) {
    const key = `${coordKey(lat, lng)}|r=${radiusMeters}|n=${limit}`;
    const cached = stationCache[key];
    if (cached && cached.ts && (Date.now() - cached.ts) < STATION_TTL_MS && Array.isArray(cached.stations)) {
        return cached.stations;
    }
    const url = new URL('https://data.cityofchicago.org/resource/8pix-ypme.json');
    url.searchParams.set('$select', 'station_name,station_descriptive_name,map_id,location,red,blue,brn,g,p,pnk,o,y');
    url.searchParams.set('$limit', '200');
    url.searchParams.set('$where', `within_circle(location, ${lat}, ${lng}, ${radiusMeters})`);

    const res = await fetch(url.toString(), { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error('Could not load CTA station data.');
    const rows = await res.json();
    const stations = (Array.isArray(rows) ? rows : [])
        .map(r => {
            const la = Number(r?.location?.latitude);
            const lo = Number(r?.location?.longitude);
            const mapId = String(r?.map_id || '').trim();
            const name = String(r?.station_name || r?.station_descriptive_name || '').trim();
            if (!name || !mapId || !Number.isFinite(la) || !Number.isFinite(lo)) return null;
            const lineFlags = {
                red: !!r?.red,
                blue: !!r?.blue,
                brn: !!r?.brn,
                g: !!r?.g,
                p: !!r?.p,
                pnk: !!r?.pnk,
                o: !!r?.o,
                y: !!r?.y
            };
            const lineNames = [
                lineFlags.red ? 'Red' : null,
                lineFlags.blue ? 'Blue' : null,
                lineFlags.brn ? 'Brown' : null,
                lineFlags.g ? 'Green' : null,
                lineFlags.p ? 'Purple' : null,
                lineFlags.pnk ? 'Pink' : null,
                lineFlags.o ? 'Orange' : null,
                lineFlags.y ? 'Yellow' : null
            ].filter(Boolean);
            return { name, mapId, lat: la, lng: lo, lines: lineNames };
        })
        .filter(Boolean);

    const center = { lat: Number(lat), lng: Number(lng) };
    stations.sort((a, b) => haversineDistanceKm(center, a) - haversineDistanceKm(center, b));
    const out = stations.slice(0, Math.max(1, Math.min(6, Number(limit) || 3)));
    stationCache[key] = { ts: Date.now(), stations: out };
    saveStationCache();
    return out;
}

export async function fetchCtaTrainArrivals(mapId, max = 6) {
    const id = String(mapId || '').trim();
    if (!id) return [];
    const maxSafe = Math.max(1, Math.min(10, Number(max) || 6));
    const cacheKey = `${id}|${maxSafe}`;
    const cached = arrivalsCache[cacheKey];
    if (cached && cached.ts && (Date.now() - cached.ts) < ARRIVALS_TTL_MS && Array.isArray(cached.items)) {
        return cached.items;
    }

    const base = window.API_BASE || '';
    const url = `${base}/api/cta/train-arrivals?mapid=${encodeURIComponent(id)}&max=${maxSafe}`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const msg = data?.error || data?.message || `CTA request failed (${res.status})`;
        throw new Error(msg);
    }
    const items = Array.isArray(data?.arrivals) ? data.arrivals : [];
    arrivalsCache[cacheKey] = { ts: Date.now(), items };
    saveArrivalsCache();
    return items;
}
