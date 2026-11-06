import type { Millis, WeatherLocation, WeatherSnapshot } from './types';
import { atTimeOfDay, HOUR } from '../lib/time';
import { contextLabels, type UserContext } from './userContext';

/**
 * Weather via Open-Meteo (no API key; only the chosen coordinates are sent).
 * Parsing and advice are pure and tested; fetching is a thin wrapper.
 */

const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';
export const WEATHER_REFRESH_MS = 30 * 60_000;

export type WeatherKind = 'clear' | 'partly' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm';

/** WMO weather interpretation codes → simplified kind + German label. */
export function describeCode(code: number): { kind: WeatherKind; label: string } {
  if (code === 0) return { kind: 'clear', label: 'Klar' };
  if (code <= 2) return { kind: 'partly', label: 'Leicht bewölkt' };
  if (code === 3) return { kind: 'cloudy', label: 'Bedeckt' };
  if (code === 45 || code === 48) return { kind: 'fog', label: 'Nebel' };
  if (code >= 51 && code <= 57) return { kind: 'drizzle', label: 'Nieselregen' };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { kind: 'rain', label: 'Regen' };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { kind: 'snow', label: 'Schnee' };
  if (code >= 95) return { kind: 'storm', label: 'Gewitter' };
  return { kind: 'cloudy', label: 'Wechselhaft' };
}

interface ForecastResponse {
  utc_offset_seconds: number;
  current?: { temperature_2m: number; weather_code: number; is_day: number };
  hourly?: { time: string[]; temperature_2m: number[]; precipitation_probability: (number | null)[]; weather_code: number[] };
  daily?: { temperature_2m_max: number[]; temperature_2m_min: number[] };
}

/** Local ISO time without offset ("2026-11-04T18:00") + UTC offset → epoch ms. */
export function localIsoToEpoch(iso: string, offsetSec: number): Millis {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])) - offsetSec * 1000;
}

export function parseForecast(json: unknown, location: WeatherLocation, fetchedAt: Millis): WeatherSnapshot | null {
  const r = json as ForecastResponse;
  if (!r || typeof r !== 'object' || !r.current || !r.hourly || !r.daily) return null;
  const offset = Number(r.utc_offset_seconds) || 0;
  const hourly = r.hourly.time
    .map((t, i) => ({
      at: localIsoToEpoch(t, offset),
      temp: Number(r.hourly!.temperature_2m[i]),
      precipProb: Number(r.hourly!.precipitation_probability[i] ?? 0),
      code: Number(r.hourly!.weather_code[i]),
    }))
    .filter((h) => Number.isFinite(h.at) && Number.isFinite(h.temp));
  return {
    fetchedAt,
    locationName: location.name,
    latitude: location.latitude,
    longitude: location.longitude,
    current: { temp: Number(r.current.temperature_2m), code: Number(r.current.weather_code), isDay: r.current.is_day === 1 },
    hourly,
    today: { min: Number(r.daily.temperature_2m_min[0]), max: Number(r.daily.temperature_2m_max[0]) },
  };
}

export async function fetchWeather(location: WeatherLocation, now: Millis, signal?: AbortSignal): Promise<WeatherSnapshot> {
  const params = new URLSearchParams({
    latitude: location.latitude.toFixed(4),
    longitude: location.longitude.toFixed(4),
    current: 'temperature_2m,weather_code,is_day',
    hourly: 'temperature_2m,precipitation_probability,weather_code',
    daily: 'temperature_2m_max,temperature_2m_min',
    timezone: 'auto',
    forecast_days: '2',
  });
  const res = await fetch(`${FORECAST}?${params}`, { signal });
  if (!res.ok) throw new Error(`Wetterdienst antwortet mit ${res.status}`);
  const snapshot = parseForecast(await res.json(), location, now);
  if (!snapshot) throw new Error('Unerwartete Antwort vom Wetterdienst');
  return snapshot;
}

export interface PlaceResult extends WeatherLocation {
  region: string;
}

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<PlaceResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const params = new URLSearchParams({ name: q, count: '6', language: 'de', format: 'json' });
  const res = await fetch(`${GEOCODE}?${params}`, { signal });
  if (!res.ok) throw new Error(`Ortssuche antwortet mit ${res.status}`);
  const data = (await res.json()) as { results?: Array<{ name: string; latitude: number; longitude: number; admin1?: string; country?: string }> };
  return (data.results ?? []).map((r) => ({
    name: r.name,
    latitude: r.latitude,
    longitude: r.longitude,
    region: [r.admin1, r.country].filter(Boolean).join(', '),
  }));
}

export interface EveningAdvice {
  minTemp: number;
  maxPrecip: number;
  kind: WeatherKind;
  text: string;
}

/**
 * What the evening after work looks like (workday end → +4 h) and what to do
 * about it: jacket, umbrella, or a walk.
 */
export function eveningAdvice(w: WeatherSnapshot, workdayEnd: string, now: Millis, context?: UserContext): EveningAdvice | null {
  const after = contextLabels(context).afterDayEnd;
  const from = Math.max(atTimeOfDay(now, workdayEnd), now);
  const to = atTimeOfDay(now, workdayEnd) + 4 * HOUR;
  const hours = w.hourly.filter((h) => h.at >= from - HOUR / 2 && h.at <= to);
  if (hours.length === 0) return null;
  const minTemp = Math.round(Math.min(...hours.map((h) => h.temp)));
  const maxPrecip = Math.round(Math.max(...hours.map((h) => h.precipProb)));
  const worst = [...hours].sort((a, b) => severity(b.code) - severity(a.code))[0]!;
  const kind = describeCode(worst.code).kind;

  let text: string;
  if (kind === 'snow') text = `Heute Abend kann es schneien, bei ${minTemp}°. Warm anziehen und gute Schuhe.`;
  else if (kind === 'storm') text = `Abends sind Gewitter möglich. Plan den Heimweg lieber früher.`;
  else if (maxPrecip >= 50) text = `${after} regnet es wahrscheinlich (${maxPrecip} %). Schirm einpacken.`;
  else if (minTemp <= 3) text = `${after} wird es ${minTemp}° kalt. Zieh dich warm an.`;
  else if (minTemp <= 10) text = `Abends nur ${minTemp}°. Eine Jacke lohnt sich.`;
  else if (minTemp >= 22) text = `Abends noch ${minTemp}°. Perfekt für einen Spaziergang nach der Arbeit.`;
  else text = `Abends ${minTemp}° und trocken. Gut für eine Runde an der frischen Luft.`;
  return { minTemp, maxPrecip, kind, text };
}

function severity(code: number): number {
  const k = describeCode(code).kind;
  return { clear: 0, partly: 1, cloudy: 2, fog: 3, drizzle: 4, rain: 5, snow: 6, storm: 7 }[k];
}

/** Example data for the demo (no network). */
export function demoWeather(now: Millis): WeatherSnapshot {
  const start = atTimeOfDay(now, '00:00');
  const temps = [4, 4, 3, 3, 3, 3, 4, 5, 6, 8, 9, 10, 11, 11, 11, 10, 9, 7, 5, 4, 3, 2, 2, 1];
  return {
    fetchedAt: now,
    locationName: 'Wetzlar (Beispiel)',
    latitude: 50.5558,
    longitude: 8.5049,
    current: { temp: 9, code: 2, isDay: true },
    hourly: temps.map((t, i) => ({ at: start + i * HOUR, temp: t, precipProb: i >= 18 ? 20 : 5, code: i >= 17 ? 3 : 2 })),
    today: { min: 1, max: 11 },
  };
}
