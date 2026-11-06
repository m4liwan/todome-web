import type { OpenModal } from '../app/modal';
import { useWeatherStatus } from '../app/weather';
import type { AppState, Millis } from '../domain/types';
import { describeCode, eveningAdvice } from '../domain/weather';
import { HOUR } from '../lib/time';
import { IconLocation, WeatherIcon } from './icons';

interface Props {
  state: AppState;
  now: Millis;
  onOpen: OpenModal;
}

/** Weather with a view on the evening after work: jacket, umbrella or a walk. */
export function WeatherCard({ state, now, onOpen }: Props) {
  const status = useWeatherStatus();
  const w = state.weather;
  const hasLocation = Boolean(state.settings.location) || Boolean(w);

  if (!hasLocation) {
    return (
      <section className="card weather weather--empty rise" style={{ '--i': 4 } as React.CSSProperties} aria-label="Wetter">
        <header className="card__head">
          <h2>Wetter</h2>
        </header>
        <p className="muted">Sag mir, wo du arbeitest. Dann weißt du schon mittags, ob du abends eine Jacke brauchst.</p>
        <button type="button" className="pill pill--dark" onClick={() => onOpen({ kind: 'weather' })}>
          <IconLocation size={16} /> Ort festlegen
        </button>
      </section>
    );
  }

  if (!w) {
    return (
      <section className="card weather rise" style={{ '--i': 4 } as React.CSSProperties} aria-label="Wetter" aria-busy={status.loading}>
        <header className="card__head">
          <h2>Wetter</h2>
        </header>
        <p className="muted">{status.error ?? 'Wetter wird geladen …'}</p>
      </section>
    );
  }

  const d = describeCode(w.current.code);
  const advice = eveningAdvice(w, state.settings.workdayEnd, now, state.settings.userContext);
  const next = w.hourly.filter((h) => h.at >= now - HOUR / 2).slice(0, 8);
  const temps = next.map((h) => h.temp);
  const lo = Math.min(...temps, w.today.min);
  const hi = Math.max(...temps, w.today.max);

  return (
    <section
      className="card weather weather--interactive rise"
      data-kind={d.kind}
      style={{ '--i': 4 } as React.CSSProperties}
      aria-label="Wetter"
      onClick={(e) => {
        if (!(e.target as Element).closest('button')) onOpen({ kind: 'weather' });
      }}
    >
      <div className="weather__glow" aria-hidden="true" />
      <header className="card__head">
        <div>
          <h2>Wetter</h2>
          <p className="muted">{w.locationName}</p>
        </div>
        <button type="button" className="weather__icon" aria-label="Wetter-Details und Ort" title="Details und Ort" onClick={() => onOpen({ kind: 'weather' })}>
          <WeatherIcon kind={d.kind} isDay={w.current.isDay} size={34} />
        </button>
      </header>
      <div className="weather__now">
        <span className="weather__temp">
          {Math.round(w.current.temp)}
          <sup>°C</sup>
        </span>
        <span className="weather__desc">
          {d.label}
          <br />
          <span className="muted">
            {Math.round(w.today.min)}° bis {Math.round(w.today.max)}°
          </span>
        </span>
      </div>
      {next.length > 1 && (
        <ol className="hours" aria-label="Nächste Stunden">
          {next.map((h) => (
            <li key={h.at}>
              <span className="hours__bar" style={{ height: `${14 + ((h.temp - lo) / Math.max(1, hi - lo)) * 30}px` }} />
              <span className="hours__t">{Math.round(h.temp)}°</span>
              <span className="hours__h">{new Date(h.at).getHours()}</span>
            </li>
          ))}
        </ol>
      )}
      {advice && <p className="weather__advice">{advice.text}</p>}
      {status.error && <p className="muted small">{status.error}</p>}
    </section>
  );
}
