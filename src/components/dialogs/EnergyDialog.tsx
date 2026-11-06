import { useEffect, useState } from 'react';
import { useAppState, useNow } from '../../app/hooks';
import { useServices } from '../../app/services';
import { ENERGY_PROFILES, ENERGY_WORDS, energyMode, energyToday } from '../../domain/energy';
import { dayKey } from '../../lib/time';
import { Dialog } from '../Dialog';
import { trackEvent } from '../../services/telemetry';

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Daily energy check (1–10). It sets the tone for the day: gentle micro
 * steps when the tank is low, ambitious focus blocks when it is full.
 */
export function EnergyDialog({ open, onClose }: Props) {
  const services = useServices();
  const state = useAppState();
  const now = useNow();
  const [level, setLevel] = useState<number>(() => energyToday(state, now) ?? 6);

  useEffect(() => {
    if (open) setLevel(energyToday(services.store.getState(), services.clock.now()) ?? 6);
  }, [open, services]);

  const mode = energyMode(level) ?? 'mid';
  const profile = ENERGY_PROFILES[mode];
  const save = (value: number | null) => {
    const day = dayKey(services.clock.now());
    const cur = services.store.getState().wellbeing;
    const energyLog = { ...cur.energyLog };
    if (value === null) delete energyLog[day];
    else energyLog[day] = value;
    services.store.dispatch({ type: 'wellbeing/mark', patch: { energyDay: day, energyLevel: value, energyLog } });
    if (value !== null) {
      trackEvent('energy_checkin_saved');
      services.announce(`${ENERGY_PROFILES[energyMode(value) ?? 'mid'].label}. Wir richten deinen Tag danach aus.`);
    }
    onClose();
  };

  return (
    <Dialog
      open={open}
      title="Wie viel Energie hast du heute?"
      tone="focus"
      onClose={() => save(energyToday(state, now))}
      footer={
        <>
          <button type="button" className="btn btn--quiet" onClick={() => save(null)}>
            Heute nicht
          </button>
          <button type="button" className="btn btn--primary" onClick={() => save(level)}>
            So starten
          </button>
        </>
      }
    >
      <p className="muted">Ehrlich ist hier immer richtig. Es gibt keine falsche Antwort, nur einen Tag, der zu dir passt.</p>
      <div className="energy" data-mode={mode}>
        <div className="energy__scale" role="radiogroup" aria-label="Energie von 1 bis 10">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={level === n}
              aria-label={`${n}: ${ENERGY_WORDS[n]}`}
              className={`energy__step${n <= level ? ' is-filled' : ''}${n === level ? ' is-on' : ''}`}
              style={{ '--n': n } as React.CSSProperties}
              onClick={() => setLevel(n)}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="energy__readout" aria-live="polite">
          <p className="energy__word">
            <strong>{level}</strong> {ENERGY_WORDS[level]}
          </p>
          <p className="energy__mode">{profile.label}</p>
          <p className="energy__headline">{profile.headline}</p>
          <p className="muted">{profile.description}</p>
        </div>
      </div>
    </Dialog>
  );
}
