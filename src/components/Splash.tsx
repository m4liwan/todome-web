import { useEffect, useMemo, useRef, useState } from 'react';
import ElectricLogo from './ElectricLogo';
import { prefersReducedMotion, useAccentColors, useResolvedTheme } from '../app/theme';
import { avatarName } from '../domain/companion';
import { energyProfile, theOneThing } from '../domain/energy';
import type { AppState, Millis } from '../domain/types';
import { describeCode, eveningAdvice } from '../domain/weather';
import { uiSound } from '../app/uiSound';
import { greetingFor } from './Greeting';
import { formatTime } from '../lib/time';
import { useFocusTrap } from '../lib/a11y';
import { WeatherIcon } from './icons';
import { WindowDrag } from './WindowDrag';

interface Props {
  state: AppState;
  now: Millis;
  onDone: () => void;
  /** Opened by hand ("Mentaler Login") instead of at launch. */
  manual?: boolean;
}

const LINE_MS = 1500;

/**
 * Welcome ("Mentaler Login") as a heads-up display: the electric wordmark
 * floats free in the centre of the screen; around it, at the edges, a system
 * message with the greeting and a briefing line by line (top), telemetry for
 * the day (date and time, weather; bottom corners) and the way in (bottom
 * third). It stays until you say you are ready (button, Enter or Esc).
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
  const theme = useResolvedTheme(state.settings.theme);
  // The neon follows the colour world (palette and theme), live.
  const accent = useAccentColors({ strong: '#10b981', light: '#84cc16' });

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
  const weather = state.weather
    ? {
        ...describeCode(state.weather.current.code),
        temp: Math.round(state.weather.current.temp),
        isDay: state.weather.current.isDay,
        locationName: state.weather.locationName,
      }
    : null;
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
      <WindowDrag />
      <div className="splash__grid" aria-hidden="true" />
      <div className="splash__frame" aria-hidden="true" />

      <div className="splash__hero" role="img" aria-label="ToDoMe.">
        <ElectricLogo
          src="/logo-schwarz.png"
          theme={theme}
          arcs={0.7}
          bend={0.25}
          color={accent.strong}
          crackle={0.6}
          cursorIntensity={0.25}
          cursorRadius={100}
          fill={0}
          flicker={0.15}
          glow={1.05}
          glowColor={accent.light}
          intensity={1}
          interactive
          scale={0.75}
          speed={0.55}
          strands={2}
          thickness={1.3}
        />
      </div>

      <header className="splash__status">
        <p className="splash__sys">
          <span className="splash__blip" aria-hidden="true" />
          {first ? 'Erster Start' : 'Bereit für einen ruhigen Tag?'}
        </p>
        <h1 className="splash__hello">
          {first ? (
            'Bereit für einen ruhigen Tag?'
          ) : (
            <>
              {greetingFor(now)}
              {name ? `, ${name}` : ''}.
            </>
          )}
        </h1>
        <div className="splash__line" aria-live="polite">
          {lines.map((l, i) => (
            <p key={l} className={i === line ? 'is-on' : i < line ? 'is-past' : undefined}>
              {l}
            </p>
          ))}
        </div>
      </header>

      <dl className="splash__tele splash__tele--left">
        <dt>
          <span className="splash__blip" aria-hidden="true" />
          Heute
        </dt>
        <dd>{dayLabel(now)}</dd>
      </dl>
      <dl className="splash__tele splash__tele--right">
        {weather ? (
          <>
            <dt>
              <span className="splash__blip" aria-hidden="true" />
              Wetter · {weather.locationName}
            </dt>
            <dd>
              <WeatherIcon kind={weather.kind} isDay={weather.isDay} size={18} />
              <strong>{weather.temp}&nbsp;°C</strong>
              <span>{weather.label}</span>
            </dd>
          </>
        ) : (
          <>
            <dt>
              <span className="splash__blip" aria-hidden="true" />
              Ortszeit
            </dt>
            <dd>
              <strong>{formatTime(now)}</strong> Uhr
            </dd>
          </>
        )}
      </dl>

      <div className="splash__dock">
        <div className={`splash__enter${ready ? ' is-ready' : ''}`}>
          <button
            ref={button}
            type="button"
            className="glass-cta splash__action"
            onClick={() => {
              uiSound(state, 'bloom');
              setLeaving(true);
            }}
          >
            {manual ? 'Ich bin angekommen' : 'Lass uns ankommen'}
          </button>
        </div>
        <button type="button" className="splash__skip" onClick={() => setLeaving(true)}>
          {first ? 'Direkt einrichten' : 'Direkt zur Übersicht'}
        </button>
      </div>
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
  // The temperature sits in the weather chip; the briefing only adds advice.
  if (state.weather) {
    const advice = eveningAdvice(state.weather, state.settings.workdayEnd, now, state.settings.userContext);
    if (advice) lines.push(advice.text);
  }
  if (lines.length < 3 && state.settings.companion.enabled) lines.push(`${avatarName(state.settings.companion.avatar)} ist an deiner Seite.`);
  return lines.slice(0, 3);
}

/** "Freitag, 13. November" */
function dayLabel(now: Millis): string {
  return new Date(now).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
}
