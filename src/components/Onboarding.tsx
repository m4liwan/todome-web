import { useEffect, useRef, useState } from 'react';
import { useAppState } from '../app/hooks';
import { Logo } from './Logo';
import { isProAvatar, openPro } from '../app/pro';
import { IconLock } from './icons';
import { useServices } from '../app/services';
import { AVATARS, avatarName, avatarProfile } from '../domain/companion';
import { ENERGY_PROFILES, ENERGY_WORDS, energyMode } from '../domain/energy';
import { brainPatch } from '../domain/brain';
import type { AvatarId, BrainProfile } from '../domain/types';
import { BrainPicker } from './dialogs/SettingsSections';
import { desktop } from '../lib/desktop';
import { dayKey } from '../lib/time';
import { Avatar } from './Avatar';
import { AvatarScene } from './AvatarScene';
import { useFocusTrap } from '../lib/a11y';
import { TELEMETRY_LABEL, trackEvent } from '../services/telemetry';
import { USER_CONTEXTS, contextLabels, type UserContext } from '../domain/userContext';

/** The first tasks are collected right after, by the companion (FirstTasks). */
const STEPS = ['Hallo', 'Kontext', 'Kopf', 'Energie', 'Arbeitszeit', 'Overlay'] as const;

/**
 * First start: your companion says hello, asks your name and walks you through
 * the three core ideas (energy, the one next step, the overlay) in short,
 * playful steps. Can be replayed from the settings.
 */
/** Crossfade length of the soft landing (onboarding out, home in). Matches v21.css. */
export const LANDING_MS = 900;

/**
 * `onLeave` fires in the same event as the final save, so the home screen
 * starts its fade-in in the very commit that uncovers it (no bare frame).
 */
/** The companion's welcome during the beta (first onboarding step). */
export const BETA_GREETING =
  'Schön, dass du da bist! ToDoMe ist aktuell in der Beta-Phase. Mein größtes Ziel ist es, dein Wohlbefinden im Alltag zu unterstützen und dir beim Arbeiten spürbar den Druck zu nehmen. 💚';

export function Onboarding({ onLeave, onDone }: { onLeave: () => void; onDone: () => void }) {
  const services = useServices();
  const state = useAppState();
  const [step, setStep] = useState(0);
  const at = STEPS[step] ?? 'Hallo';
  const [name, setName] = useState(state.settings.userName);
  const [avatar, setAvatar] = useState<AvatarId>(state.settings.companion.avatar);
  const [energy, setEnergy] = useState(6);
  const [context, setContext] = useState<UserContext>(state.settings.userContext);
  const labels = contextLabels(context);
  const [brain, setBrain] = useState<BrainProfile | null>(state.settings.brain);
  const [hours, setHours] = useState({ start: state.settings.workdayStart, end: state.settings.workdayEnd, lunchStart: state.settings.lunchStart, lunchEnd: state.settings.lunchEnd });
  const hoursOk = toMin(hours.end) > toMin(hours.start) + 30;
  const [overlay, setOverlay] = useState(state.settings.overlay.enabled);
  // GDPR: off until the user ticks it.
  const [telemetry, setTelemetry] = useState(state.settings.telemetryEnabled === true);
  const [leaving, setLeaving] = useState(false);
  // The setup covers the app: keyboard focus stays inside until it is done.
  const trap = useFocusTrap<HTMLDivElement>(!leaving, { restore: false, autoFocus: false });
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (input.current) input.current.focus();
    // Card steps: the chosen card has the focus (arrow keys and Tab start from there).
    else document.querySelector<HTMLElement>('.onboard__panel [role="radio"][aria-checked="true"]')?.focus();
  }, [step]);

  const who = name.trim();
  const buddy = avatarName(avatar);
  const profile = ENERGY_PROFILES[energyMode(energy) ?? 'mid'];

  const finish = () => {
    if (leaving) return;
    // Batched with the dispatch below: one commit uncovers and starts the fade.
    onLeave();
    setLeaving(true);
    const s = services.store.getState();
    const day = dayKey(services.clock.now());
    services.store.dispatch([
      {
        type: 'settings/update',
        patch: {
          userName: who,
          userContext: context,
          telemetryEnabled: telemetry,
          onboarded: true,
          companion: { ...s.settings.companion, avatar },
          overlay: { ...s.settings.overlay, enabled: Boolean(desktop) && overlay },
          ...(hoursOk ? { workdayStart: hours.start, workdayEnd: hours.end, lunchStart: hours.lunchStart, lunchEnd: hours.lunchEnd } : {}),
        },
      },
      ...(brain ? [{ type: 'settings/update' as const, patch: brainPatch({ ...s.settings, companion: { ...s.settings.companion, avatar } }, brain) }] : []),
      { type: 'wellbeing/mark', patch: { energyDay: day, energyLevel: energy, energyLog: { ...s.wellbeing.energyLog, [day]: energy } } },
    ]);
    // Only sent if the box above was ticked (the setting is already saved).
    trackEvent('onboarding_completed', { context, avatar, brain: brain ?? 'none' });
    try {
      window.localStorage.setItem('todome:onboarding-done', '1');
    } catch {
      /* the persisted settings flag is enough */
    }
    // Done when the fade really ended (a busy first render can delay its start);
    // the timer is only a safety net. The companion tour follows right after.
    window.setTimeout(onDone, LANDING_MS + 3000);
  };

  const next = () => {
    if (at === 'Arbeitszeit' && !hoursOk) return;
    if (step < STEPS.length - 1) setStep(step + 1);
    else finish();
  };
  const speech = {
    Hallo: `Hi! ${avatarProfile(avatar).intro} ${BETA_GREETING} Wie darf ich dich nennen?`,
    Kontext: `Schön, dich kennenzulernen${who ? `, ${who}` : ''}! Wobei darf ich dich begleiten? Dann wähle ich die passenden Worte, fürs Lernen, für die Arbeit oder ganz entspannt für den Alltag.`,
    Kopf: 'Wie tickt dein Kopf am liebsten? Dann richte ich alles so ein, dass es sich leicht anfühlt.',
    Energie: `${who ? `${who}, j` : 'J'}eden Morgen frage ich dich kurz nach deiner Energie. Probier es aus: Wie fühlst du dich gerade?`,
    Arbeitszeit: labels.hoursQuestion,
    Overlay: desktop
      ? 'Auf Wunsch begleite ich dich in einer kleinen Glasbox. Verschieb mich, wohin du willst. Ein Klick darauf bringt dich zurück.'
      : 'In der Desktop-App begleite ich dich auch in einer kleinen Glasbox. Verschieb mich, wohin du willst.',
  }[at];

  return (
    <div
      ref={trap}
      data-focus-trap=""
      className={`onboard${leaving ? ' is-leaving' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Willkommen bei ToDoMe"
      onAnimationEnd={(e) => {
        if (leaving && e.target === e.currentTarget && e.animationName === 'onboard-out') onDone();
      }}
    >
      <div className="splash__grid" aria-hidden="true" />
      <div className="onboard__aura" aria-hidden="true">
        <span />
        <span />
      </div>
      <Logo className="onboard__logo" height={24} />

      <form
        className="onboard__stage"
        key={step}
        onSubmit={(e) => {
          e.preventDefault();
          next();
        }}
      >
        <div className="onboard__buddy">
          <AvatarScene avatar={avatar} activity={at === 'Kontext' ? 'writing' : at === 'Kopf' ? 'reading' : at === 'Energie' ? (energy <= 3 ? 'tea' : energy >= 8 ? 'weights' : 'writing') : at === 'Arbeitszeit' ? 'tea' : at === 'Overlay' ? 'reading' : 'waiting'} size={150} />
          <p className="onboard__speech" aria-live="polite">
            {speech}
          </p>
        </div>

        <div className="onboard__panel">
          {at === 'Hallo' && (
            <>
              <label className="field">
                <span>Dein Vorname</span>
                <input ref={input} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="z. B. Julian" required />
              </label>
              <p className="onboard__label">Lieber jemand anderes an deiner Seite? Tippe einfach drauf.</p>
              <div className="onboard__avatars" role="radiogroup" aria-label="Begleiter">
                {AVATARS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    role="radio"
                    aria-checked={avatar === a.id}
                    aria-disabled={isProAvatar(a.id) || undefined}
                    aria-label={isProAvatar(a.id) ? `${a.name} (bald in Pro)` : a.name}
                    title={isProAvatar(a.id) ? `${a.name}: bald in Pro` : a.name}
                    className={`onboard__avatar${avatar === a.id ? ' is-on' : ''}${isProAvatar(a.id) ? ' is-pro' : ''}`}
                    onClick={() => (isProAvatar(a.id) ? openPro('avatars') : setAvatar(a.id))}
                  >
                    <span className="onboard__figure">
                      <Avatar id={a.id} size={44} animated={false} crop />
                    </span>
                    {isProAvatar(a.id) && (
                      <span className="pro-blur__lock pro-blur__lock--sm" aria-hidden="true">
                        <IconLock size={11} />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}

          {at === 'Kontext' && (
            <div className="contexts" role="radiogroup" aria-label="Wofür nutzt du ToDoMe?">
              {USER_CONTEXTS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={context === c.id}
                  className={`context-card${context === c.id ? ' is-on' : ''}`}
                  onClick={() => setContext(c.id)}
                >
                  <span className="context-card__icon" aria-hidden="true">
                    {c.icon}
                  </span>
                  <strong>{c.label}</strong>
                  <span className="context-card__text">{c.description}</span>
                </button>
              ))}
            </div>
          )}

          {at === 'Kopf' && (
            <>
              <BrainPicker value={brain} onChange={setBrain} />
              <button type="button" className="link-btn brain__none" onClick={() => setBrain(null)}>
                {brain === null ? 'Ich schaue erst mal so.' : 'Doch lieber ohne Profil'}
              </button>
            </>
          )}

          {at === 'Energie' && (
            <>
              <div className="onboard__energy">
                <input
                  ref={input}
                  type="range"
                  className="range onboard__range"
                  min={1}
                  max={10}
                  step={1}
                  value={energy}
                  onChange={(e) => setEnergy(Number(e.target.value))}
                  aria-label="Energie von 1 bis 10"
                  style={{ '--fill': `${((energy - 1) / 9) * 100}%` } as React.CSSProperties}
                />
                <div className="onboard__scale" aria-hidden="true">
                  <span>leer</span>
                  <span>voll</span>
                </div>
              </div>
              <div className="energy__readout">
                <p className="energy__word">
                  <strong>{energy}</strong> {ENERGY_WORDS[energy]}
                </p>
                <p className="energy__mode">{profile.label}</p>
                <p className="energy__headline">{profile.headline}</p>
                <p className="muted">{profile.description}</p>
              </div>
            </>
          )}

          {at === 'Arbeitszeit' && (
            <>
              <div className="workhours">
                <label className="field">
                  <span>{labels.dayStart}</span>
                  <input ref={input} type="time" value={hours.start} onChange={(e) => setHours({ ...hours, start: e.target.value })} required />
                </label>
                <label className="field">
                  <span>{labels.dayEnd}</span>
                  <input type="time" value={hours.end} onChange={(e) => setHours({ ...hours, end: e.target.value })} required />
                </label>
                <label className="field">
                  <span>Mittag von</span>
                  <input type="time" value={hours.lunchStart} onChange={(e) => setHours({ ...hours, lunchStart: e.target.value })} />
                </label>
                <label className="field">
                  <span>Mittag bis</span>
                  <input type="time" value={hours.lunchEnd} onChange={(e) => setHours({ ...hours, lunchEnd: e.target.value })} />
                </label>
              </div>
              <DayPreview {...hours} />
              <p className="hint">{hoursOk ? 'Deine Zeitlinie zeigt genau diesen Tag. Änderbar jederzeit in den Einstellungen.' : labels.hoursMismatch}</p>
            </>
          )}

          {at === 'Overlay' && (
            <>
              <div className="onboard__mini" aria-hidden="true">
                <AvatarScene avatar={avatar} activity="writing" size={56} />
                <div>
                  <p className="onboard__mini-title">Dein Fokus-Anker</p>
                  <p className="muted small">Schön im Fluss</p>
                </div>
              </div>
              {desktop ? (
                <label className="check">
                  <input type="checkbox" checked={overlay} onChange={(e) => setOverlay(e.target.checked)} />
                  <span>Mini-Overlay einschalten (jederzeit änderbar)</span>
                </label>
              ) : (
                <p className="muted small">Du findest das Mini-Overlay später in den Einstellungen der Desktop-App.</p>
              )}
              <label className="check onboard__telemetry">
                <input type="checkbox" checked={telemetry} onChange={(e) => setTelemetry(e.target.checked)} />
                <span>{TELEMETRY_LABEL}</span>
              </label>
              <p className="hint">{labels.focusTimes}, Wetterort und Farbwelt stellst du in den Einstellungen ein, wann immer du magst.</p>
            </>
          )}
        </div>

        <div className="onboard__nav">
          <ol className="stepper" aria-label={`Schritt ${step + 1} von ${STEPS.length}`}>
            {STEPS.map((s, i) => (
              <li key={s} className={i === step ? 'is-current' : i < step ? 'is-done' : undefined} />
            ))}
          </ol>
          <span className="spacer" />
          {step > 0 && (
            <button type="button" className="pill pill--ghost" onClick={() => setStep(step - 1)}>
              Zurück
            </button>
          )}
          <button type="submit" className="pill pill--dark pill--lg">
            {step === 0 ? (who ? `Hallo ${buddy}` : 'Weiter') : step < STEPS.length - 1 ? 'Weiter' : 'Los geht’s'}
          </button>
        </div>
      </form>
      <p className="onboard__foot muted small">
        Alles bleibt auf deinem Gerät. Kein Konto, kein Tracking ohne deine Erlaubnis.
      </p>
    </div>
  );
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** The working day on a 6–22 h scale, lunch hatched. */
function DayPreview({ start, end, lunchStart, lunchEnd }: { start: string; end: string; lunchStart: string; lunchEnd: string }) {
  const from = 6 * 60;
  const span = 16 * 60;
  const pct = (t: string) => `${Math.min(100, Math.max(0, ((toMin(t) - from) / span) * 100))}%`;
  const width = (a: string, b: string) => `${Math.max(0, ((toMin(b) - toMin(a)) / span) * 100)}%`;
  return (
    <div aria-hidden="true">
      <div className="workhours__preview">
        <span style={{ left: pct(start), width: width(start, end) }} />
        {toMin(lunchEnd) > toMin(lunchStart) && <i style={{ left: pct(lunchStart), width: width(lunchStart, lunchEnd) }} />}
      </div>
      <div className="workhours__scale">
        <span>6</span>
        <span>10</span>
        <span>14</span>
        <span>18</span>
        <span>22</span>
      </div>
    </div>
  );
}
