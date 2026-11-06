import { useAppState, useNow } from '../../app/hooks';
import { useServices } from '../../app/services';
import { useWeatherStatus } from '../../app/weather';
import { describeCode, eveningAdvice } from '../../domain/weather';
import { HOUR } from '../../lib/time';
import { WeatherIcon } from '../icons';
import { LocationPicker } from '../LocationPicker';
import { Dialog } from '../Dialog';

/** Calm weather details plus place and ambience settings in one spot. */
export function WeatherDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const services = useServices();
  const state = useAppState();
  const now = useNow();
  const status = useWeatherStatus();
  const w = state.weather;
  const s = state.settings;
  const live = s.appearance.ambience === 'live';
  const advice = w ? eveningAdvice(w, s.workdayEnd, now, s.userContext) : null;
  const hours = w ? w.hourly.filter((h) => h.at >= now - HOUR / 2).slice(0, 12) : [];
  const d = w ? describeCode(w.current.code) : null;

  return (
    <Dialog open={open} title="Wetter" onClose={onClose} wide>
      {w && d ? (
        <div className="wx">
          <div className="wx__now">
            <WeatherIcon kind={d.kind} isDay={w.current.isDay} size={52} />
            <div>
              <p className="wx__temp">
                {Math.round(w.current.temp)}
                <sup>°C</sup>
              </p>
              <p className="muted">
                {d.label} in {w.locationName}, heute {Math.round(w.today.min)}° bis {Math.round(w.today.max)}°
              </p>
            </div>
          </div>
          {advice && <p className="weather__advice">{advice.text}</p>}
          <ol className="wx__hours" aria-label="Die nächsten Stunden">
            {hours.map((h) => (
              <li key={h.at}>
                <span className="wx__h">{String(new Date(h.at).getHours()).padStart(2, '0')}</span>
                <WeatherIcon kind={describeCode(h.code).kind} isDay={new Date(h.at).getHours() > 6 && new Date(h.at).getHours() < 19} size={22} />
                <span className="wx__t">{Math.round(h.temp)}°</span>
                <span className="wx__p" title="Regenwahrscheinlichkeit">
                  {h.precipProb > 0 ? `${Math.round(h.precipProb)} %` : ''}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <p className="muted">{status.error ?? (s.location ? 'Wetter wird geladen …' : 'Sag mir, wo du arbeitest. Dann weißt du schon mittags, ob du abends eine Jacke brauchst.')}</p>
      )}

      <div className="wx__settings">
        <div className="field">
          <span>Dein Ort</span>
          <LocationPicker value={s.location} onChange={(location) => services.store.dispatch({ type: 'settings/update', patch: { location } })} />
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={live}
            onChange={(e) => services.store.dispatch({ type: 'settings/update', patch: { appearance: { ...s.appearance, ambience: e.target.checked ? 'live' : 'none' } } })}
          />
          <span>Das Wetter leise im Hintergrund zeigen (Regen tropft, Wolken ziehen, Schnee fällt)</span>
        </label>
        <p className="hint">Nur die Koordinaten deines Orts gehen an den Wetterdienst Open-Meteo. Kein Konto, kein Tracking.</p>
      </div>
    </Dialog>
  );
}
