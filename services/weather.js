/* Weather service (Open-Meteo + fallback) */

const WEATHER_CACHE_KEY = 'weather_cache_v1';
export const DEFAULT_CITY_COORDS = { lat: 41.8781, lng: -87.6298 }; // Chicago (fallback)
const WEATHER_TTL_MS = 1000 * 60 * 30; // 30 min

let weatherCache = (() => {
    try { return JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY)) || {}; } catch (e) { return {}; }
})();
let weatherFetchInFlight = null;

const saveWeatherCache = () => {
    try { localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(weatherCache)); } catch (e) {}
};

export const toDateKeyLocal = (d) => {
    const date = d instanceof Date ? d : new Date(d);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

export const toPlainTemp = (tempHtml) => String(tempHtml || '').replace(/&deg;/g, '°').replace(/\s+/g, ' ').trim();

export const mapWeatherCode = (code) => {
    const c = Number(code);
    if (Number.isNaN(c)) return { desc: 'Unknown', iconHtml: '<i class="fa-solid fa-cloud"></i>' };
    if (c === 0) return { desc: 'Clear', iconHtml: '<i class="fa-solid fa-sun"></i>' };
    if ([1, 2, 3].includes(c)) return { desc: 'Partly cloudy', iconHtml: '<i class="fa-solid fa-cloud-sun"></i>' };
    if ([45, 48].includes(c)) return { desc: 'Fog', iconHtml: '<i class="fa-solid fa-smog"></i>' };
    if ([51, 53, 55, 56, 57].includes(c)) return { desc: 'Drizzle', iconHtml: '<i class="fa-solid fa-cloud-rain"></i>' };
    if ([61, 63, 65, 66, 67].includes(c)) return { desc: 'Rain', iconHtml: '<i class="fa-solid fa-cloud-showers-heavy"></i>' };
    if ([71, 73, 75, 77].includes(c)) return { desc: 'Snow', iconHtml: '<i class="fa-solid fa-snowflake"></i>' };
    if ([80, 81, 82].includes(c)) return { desc: 'Rain showers', iconHtml: '<i class="fa-solid fa-cloud-showers-heavy"></i>' };
    if ([85, 86].includes(c)) return { desc: 'Snow showers', iconHtml: '<i class="fa-solid fa-snowflake"></i>' };
    if ([95, 96, 99].includes(c)) return { desc: 'Thunderstorm', iconHtml: '<i class="fa-solid fa-bolt"></i>' };
    return { desc: 'Cloudy', iconHtml: '<i class="fa-solid fa-cloud"></i>' };
};

export const simulateWeather = (date) => {
    const d = date instanceof Date ? date : new Date(date);
    const month = d.getMonth();
    const icons = {
        sun: '<i class="fa-solid fa-sun"></i>',
        cloud: '<i class="fa-solid fa-cloud"></i>',
        rain: '<i class="fa-solid fa-cloud-rain"></i>',
        snow: '<i class="fa-solid fa-snowflake"></i>'
    };
    if (month >= 11 || month <= 2) return { icon: icons.snow, temp: '-5&deg;C', desc: 'Snow', precipProb: null };
    if (month >= 5 && month <= 8) return { icon: icons.sun, temp: '28&deg;C', desc: 'Clear', precipProb: null };
    return Math.random() > 0.5
        ? { icon: icons.cloud, temp: '15&deg;C', desc: 'Cloudy', precipProb: null }
        : { icon: icons.rain, temp: '12&deg;C', desc: 'Rain', precipProb: 60 };
};

export function getWeatherSnapshotSync(date, coords = DEFAULT_CITY_COORDS) {
    const dayKey = toDateKeyLocal(date);
    const coordKey = `${coords.lat.toFixed(3)},${coords.lng.toFixed(3)}`;
    const entry = weatherCache[coordKey];
    const fresh = entry && entry.ts && (Date.now() - entry.ts) < WEATHER_TTL_MS;
    const daily = fresh ? entry.daily?.[dayKey] : null;
    if (daily) return daily;
    return simulateWeather(date);
}

export async function prefetchOpenMeteoDaily(startDate, endDate, coords = DEFAULT_CITY_COORDS) {
    const coordKey = `${coords.lat.toFixed(3)},${coords.lng.toFixed(3)}`;
    const startKey = toDateKeyLocal(startDate);
    const endKey = toDateKeyLocal(endDate);
    const cached = weatherCache[coordKey];
    const fresh = cached && cached.ts && (Date.now() - cached.ts) < WEATHER_TTL_MS;
    if (fresh && cached.startKey === startKey && cached.endKey === endKey) return cached;
    if (weatherFetchInFlight) return weatherFetchInFlight;

    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', String(coords.lat));
    url.searchParams.set('longitude', String(coords.lng));
    url.searchParams.set('timezone', 'auto');
    url.searchParams.set('start_date', startKey);
    url.searchParams.set('end_date', endKey);
    url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max');

    weatherFetchInFlight = fetch(url.toString())
        .then(res => res.json())
        .then(data => {
            const daily = {};
            const times = data?.daily?.time || [];
            const codes = data?.daily?.weather_code || [];
            const tMax = data?.daily?.temperature_2m_max || [];
            const tMin = data?.daily?.temperature_2m_min || [];
            const precip = data?.daily?.precipitation_probability_max || [];

            times.forEach((t, idx) => {
                const code = codes[idx];
                const mapped = mapWeatherCode(code);
                const avg = (Number(tMax[idx]) + Number(tMin[idx])) / 2;
                const avgSafe = Number.isFinite(avg) ? Math.round(avg) : null;
                const temp = avgSafe === null ? '' : `${avgSafe}&deg;C`;
                daily[t] = {
                    code,
                    desc: mapped.desc,
                    icon: mapped.iconHtml,
                    temp,
                    precipProb: Number.isFinite(Number(precip[idx])) ? Number(precip[idx]) : null
                };
            });

            weatherCache[coordKey] = { ts: Date.now(), startKey, endKey, daily };
            saveWeatherCache();
            return weatherCache[coordKey];
        })
        .catch(() => null)
        .finally(() => { weatherFetchInFlight = null; });

    return weatherFetchInFlight;
}

export async function prefetchWeatherForTripDates(dates, coords = DEFAULT_CITY_COORDS) {
    if (!Array.isArray(dates) || !dates.length) return null;
    const start = dates[0];
    const end = dates[dates.length - 1];
    return prefetchOpenMeteoDaily(start, end, coords);
}

