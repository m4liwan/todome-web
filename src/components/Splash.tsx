import { useEffect, useMemo, useRef, useState } from 'react';
import { Logo } from './Logo';
import { prefersReducedMotion } from '../app/theme';
import { avatarName } from '../domain/companion';
import { energyProfile, theOneThing } from '../domain/energy';
import type { AppState, Millis } from '../domain/types';
import { eveningAdvice } from '../domain/weather';
import { uiSound } from '../app/uiSound';
import { Biolume } from './Biolume';
import { greetingFor } from './Greeting';
import { useFocusTrap } from '../lib/a11y';

interface Props {
  state: AppState;
  now: Millis;
  onDone: () => void;
  /** Opened by hand ("Mentaler Login") instead of at launch. */
  manual?: boolean;
}

const LINE_MS = 1500;

/**
 * Welcome ("Mentaler Login"): a calm instrument in the centre (rings, a
 * breathing core, a progress arc) that briefs you line by line. It stays
 * until you say you are ready (button, Enter or Esc).
 */
export function Splash({ state, now, onDone, manual = false }: Props) {
  const [leaving, setLeaving] = useState(false);
  const trap = useFocusTrap<HTMLDivElement>(!leaving, { restore: false, autoFocus: false });
  const [line, setLine] = useState(-1);
  // Brief once, with the state at launch.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const lines = useMemo(() => (state.settings.onboarded ? briefing(state, now) : FIRST_LINES), []);
  const total = prefersReducedMotion() ? 400 : 900 + lines.length * LINE_MS;
  const [ready, setReady] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const ids = lines.map((_, i) => window.setTimeout(() => setLine(i), 900 + i * LINE_MS));
    // The last line stays; then the way in appears. Nothing closes by itself.
    const done = window.setTimeout(() => setReady(true), total);
    return () => {
      ids.forEach((id) => window.clearTimeout(id));
      window.clearTimeout(done);
    };
  }, [lines, total]);

  useEffect(() => {
    if (ready) button.current?.focus();
  }, [ready]);

  useEffect(() => {
    if (!leaving) return;
    const id = window.setTimeout(onDone, prefersReducedMotion() ? 0 : 750);
    return () => window.clearTimeout(id);
  }, [leaving, onDone]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') setLeaving(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const name = state.settings.userName.trim();
  // The very first start: no name yet, the setup comes right after this.
  const first = !state.settings.onboarded;
  return (
    <div
      ref={trap}
      data-focus-trap=""
      className={`splash${leaving ? ' is-leaving' : ''}${manual ? ' splash--manual' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Willkommen"
      style={{ '--splash-ms': `${total}ms` } as React.CSSProperties}
    >
      <div className="splash__grid" aria-hidden="true" />
      <Logo className="splash__logo" height={28} />

      <div className="splash__center">
        <Biolume width={Math.min(640, window.innerWidth - 48)} height={240} />
        {first ? (
          <h1 className="splash__hello">Bereit für einen ruhigen Tag?</h1>
        ) : (
          <>
            <p className="splash__kicker">Bereit für einen ruhigen Tag?</p>
            <h1 className="splash__hello">
              {greetingFor(now)}
              {name ? `, ${name}` : ''}.
            </h1>
          </>
        )}
        <div className="splash__line" aria-live="polite">
          {lines.map((l, i) => (
            <p key={l} className={i === line ? 'is-on' : i < line ? 'is-past' : undefined}>
              {l}
            </p>
          ))}
        </div>
        <div className={`splash__enter${ready ? ' is-ready' : ''}`}>
          <button
            ref={button}
            type="button"
            className="glass-cta"
            onClick={() => {
              uiSound(state, 'bloom');
              setLeaving(true);
            }}
          >
            {manual ? 'Ich bin angekommen' : 'Lass uns ankommen'}
          </button>
        </div>
      </div>

      <button type="button" className="splash__skip" onClick={() => setLeaving(true)}>
        {first ? 'Direkt einrichten' : 'Direkt zur Übersicht'}
      </button>
    </div>
  );
}

const FIRST_LINES = ['Schön, dass du da bist.', 'Wir richten alles in zwei Minuten ein. Ganz ohne Eile.', 'Dein Begleiter wartet schon auf dich.'];

function briefing(state: AppState, now: Millis): string[] {
  const lines: string[] = [];
  const one = theOneThing(state, now);
  lines.push(one ? `Heute zählt vor allem: ${one.title}.` : 'Heute ist noch alles offen. Wir starten ganz entspannt.');
  const profile = energyProfile(state, now);
  if (profile) lines.push(profile.headline);
  if (state.weather) {
    const advice = eveningAdvice(state.weather, state.settings.workdayEnd, now, state.settings.userContext);
    lines.push(`Draußen ${Math.round(state.weather.current.temp)} °C.${advice ? ` ${advice.text}` : ''}`);
  }
  if (lines.length < 3 && state.settings.companion.enabled) lines.push(`${avatarName(state.settings.companion.avatar)} ist an deiner Seite.`);
  return lines.slice(0, 3);
}
