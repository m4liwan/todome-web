import { useId, useRef, useState } from 'react';
import { searchPlaces, type PlaceResult } from '../domain/weather';
import type { WeatherLocation } from '../domain/types';
import { IconLocation } from './icons';

interface Props {
  value: WeatherLocation | null;
  onChange: (location: WeatherLocation | null) => void;
}

/** Find your place for the weather (Open-Meteo place search, no account). */
export function LocationPicker({ value, onChange }: Props) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  const search = async () => {
    controller.current?.abort();
    controller.current = new AbortController();
    setBusy(true);
    setError(null);
    try {
      const found = await searchPlaces(query, controller.current.signal);
      setResults(found);
      if (found.length === 0) setError('Kein Ort gefunden. Versuch es mit einer größeren Stadt in deiner Nähe.');
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError('Die Ortssuche ist gerade nicht erreichbar. Bist du online?');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="location">
      {value && (
        <p className="location__current">
          <IconLocation size={16} /> {value.name}
          <button type="button" className="link-btn" onClick={() => onChange(null)}>
            Entfernen
          </button>
        </p>
      )}
      <form
        className="location__search"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <label className="sr-only" htmlFor={`${id}-q`}>
          Ort suchen
        </label>
        <input id={`${id}-q`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={value ? 'Anderen Ort suchen' : 'z. B. Wetzlar'} minLength={2} />
        <button type="submit" className="pill pill--sm" disabled={busy || query.trim().length < 2}>
          {busy ? 'Sucht …' : 'Suchen'}
        </button>
      </form>
      {error && <p className="hint">{error}</p>}
      {results && results.length > 0 && (
        <ul className="location__results">
          {results.map((r) => (
            <li key={`${r.latitude},${r.longitude}`}>
              <button
                type="button"
                className="choice choice--row"
                onClick={() => {
                  onChange({ name: r.name, latitude: r.latitude, longitude: r.longitude });
                  setResults(null);
                  setQuery('');
                }}
              >
                <strong>{r.name}</strong>
                <span>{r.region}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="hint">Nur die Koordinaten deines Orts gehen an den Wetterdienst Open-Meteo. Kein Konto, kein Tracking.</p>
    </div>
  );
}
