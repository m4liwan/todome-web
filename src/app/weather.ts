import { useEffect, useSyncExternalStore } from 'react';
import { demoWeather, fetchWeather, WEATHER_REFRESH_MS } from '../domain/weather';
import { useServices } from './services';

/** Fetch status for the weather card (the data itself lives in app state). */
type WeatherStatus = { loading: boolean; error: string | null };
let status: WeatherStatus = { loading: false, error: null };
const listeners = new Set<() => void>();
const setStatus = (next: WeatherStatus) => {
  status = next;
  listeners.forEach((l) => l());
};
export const useWeatherStatus = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status,
    () => status,
  );

/**
 * Keeps the weather fresh: every 30 minutes for the chosen place. Real time
 * is used for freshness (independent of the demo time-lapse). The demo uses
 * example data and never goes online.
 */
export function useWeatherSync(): void {
  const services = useServices();

  useEffect(() => {
    let controller: AbortController | null = null;
    let inflight: string | null = null;
    let failedAt = 0;
    let lastLocationKey: string | null = null;

    const refresh = async () => {
      const state = services.store.getState();
      if (services.mode === 'demo') {
        if (!state.weather) services.store.dispatch({ type: 'weather/set', weather: demoWeather(services.clock.now()) });
        return;
      }
      const loc = state.settings.location;
      if (!loc) return;
      const w = state.weather;
      const sameLocation = w && w.latitude === loc.latitude && w.longitude === loc.longitude;
      if (sameLocation && Date.now() - w.fetchedAt < WEATHER_REFRESH_MS) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setStatus({ loading: false, error: 'Offline. Das Wetter aktualisiert sich, sobald du wieder online bist.' });
        return;
      }
      const key = `${loc.latitude},${loc.longitude}`;
      if (inflight === key || Date.now() - failedAt < 2 * 60_000) return;
      controller?.abort();
      controller = new AbortController();
      inflight = key;
      setStatus({ loading: true, error: null });
      try {
        const snapshot = await fetchWeather(loc, Date.now(), controller.signal);
        services.store.dispatch({ type: 'weather/set', weather: snapshot });
        setStatus({ loading: false, error: null });
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        failedAt = Date.now();
        setStatus({ loading: false, error: 'Wetter gerade nicht erreichbar.' });
      } finally {
        if (inflight === key) inflight = null;
      }
    };

    const initial = services.store.getState().settings.location;
    lastLocationKey = initial ? `${initial.latitude},${initial.longitude}` : null;
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    const unsubscribe = services.store.subscribe(() => {
      const s = services.store.getState();
      const loc = s.settings.location;
      const key = loc ? `${loc.latitude},${loc.longitude}` : null;
      if (key !== lastLocationKey) {
        lastLocationKey = key;
        failedAt = 0;
        void refresh();
      }
    });
    const onOnline = () => {
      failedAt = 0;
      void refresh();
    };
    window.addEventListener('online', onOnline);
    return () => {
      controller?.abort();
      window.clearInterval(timer);
      unsubscribe();
      window.removeEventListener('online', onOnline);
    };
  }, [services]);
}
