import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { avatarName, type Mood } from '../domain/companion';
import { FEATURE_UNLOCKS, type FeatureId } from '../domain/companionProgression';
import type { AvatarId } from '../domain/types';
import { Avatar } from './Avatar';

/** The part of the hub a step talks about; the hub keeps it bright. */
export type IntroSpot = 'hero' | 'stats' | 'path';

export interface IntroStep {
  spot: IntroSpot;
  mood: Mood;
  title: string;
  text: string;
}

/** How long the bubble fades out before it is gone. */
export const INTRO_LEAVE_MS = 180;

const unlockLevel = (feature: FeatureId) => FEATURE_UNLOCKS.find((u) => u.feature === feature)?.level ?? 0;

/** The three things worth knowing about the hub, told by the companion itself. */
export function introSteps(name: string, user: string): IntroStep[] {
  const you = user ? `, ${user}` : '';
  return [
    {
      spot: 'hero',
      mood: 'happy',
      title: 'Hier wachsen wir zusammen',
      text: `Hallo${you}! Ich bin ${name}, und das hier ist mein Zuhause. ToDoMe hilft dir, einen Schritt nach dem anderen zu gehen, ohne Druck und ohne schlechtes Gewissen. Mit jedem Schritt, den du schaffst, wachse ich ein kleines Stück mit.`,
    },
    {
      spot: 'stats',
      mood: 'calm',
      title: 'XP und Serie, ganz entspannt',
      text: 'Jede erledigte Aufgabe bringt uns XP, kleine Schritte zählen mit. Deine Serie zählt Werktage, Wochenenden nie gegen dich, und Streak-Freezes überbrücken freie Tage. Machst du mal länger Pause, freue ich mich einfach, wenn du wieder da bist. XP und Level bleiben dir immer.',
    },
    {
      spot: 'path',
      mood: 'curious',
      title: 'Belohnungen auf eurem Pfad',
      text: `Hier siehst du, was wir gemeinsam freischalten: ab Level ${unlockLevel('advanced_stats')} erweiterte Statistiken, ab Level ${unlockLevel('exclusive_themes')} exklusive Themes, und für mich unterwegs Glitzern, Aura und Holofoil. Was einmal erreicht ist, bleibt für immer. Und über das ? oben erzähle ich dir das alles jederzeit wieder.`,
    },
  ];
}

interface Props {
  avatar: AvatarId;
  userName: string;
  /** Nothing moves (effects off, reduced motion, low battery): no fades. */
  still: boolean;
  /** A new step is on screen. */
  onStep: (spot: IntroSpot) => void;
  /** Finished or skipped: from now on it only comes back when asked for. */
  onSeen: () => void;
  /** The bubble is gone; the hub unmounts the intro. */
  onClose: () => void;
}

/**
 * The companion's short intro to its hub: three speech bubbles in a modal
 * <dialog> (top layer, focus stays inside, Escape skips). The hub behind it
 * dims everything but the part the current step is about.
 *
 * Everything it starts it stops again: the leave timer is cleared and the
 * dialog closed on unmount, so leaving the tab mid-intro leaves nothing behind.
 */
export function CompanionIntro({ avatar, userName, still, onStep, onSeen, onClose }: Props) {
  const name = avatarName(avatar);
  const [steps] = useState(() => introSteps(name, userName.trim()));
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const nextBtn = useRef<HTMLButtonElement>(null);
  const ended = useRef(false);
  const leaveTimer = useRef<number | undefined>(undefined);
  const step = steps[index]!;
  const last = index === steps.length - 1;

  // Open in the top layer; close again whenever the intro goes away.
  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) {
      if (typeof el.showModal === 'function') el.showModal();
      else el.setAttribute('open', '');
    }
    return () => {
      window.clearTimeout(leaveTimer.current);
      if (!el?.open) return;
      if (typeof el.close === 'function') el.close();
      else el.removeAttribute('open');
    };
  }, []);

  // Each step: tell the hub where to look, keep "Weiter" under the keyboard.
  useEffect(() => {
    onStep(step.spot);
    nextBtn.current?.focus({ preventScroll: true });
  }, [step.spot, onStep]);

  const finish = useCallback(() => {
    if (ended.current) return;
    ended.current = true;
    // Saved right away, so even leaving during the fade counts as seen.
    onSeen();
    if (still) return onClose();
    setLeaving(true);
    leaveTimer.current = window.setTimeout(onClose, INTRO_LEAVE_MS);
  }, [still, onSeen, onClose]);

  const next = useCallback(() => {
    if (last) finish();
    else setIndex((i) => Math.min(i + 1, steps.length - 1));
  }, [last, finish, steps.length]);

  const onKeyDown = (e: KeyboardEvent<HTMLDialogElement>) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      next();
    } else if (e.key === 'Escape') {
      // The browser's own cancel does the same; this covers dialogs without it.
      e.preventDefault();
      finish();
    }
  };

  return (
    <dialog
      ref={dialog}
      className={`hub-intro${still ? ' is-still' : ''}${leaving ? ' is-leaving' : ''}`}
      aria-labelledby="hub-intro-title"
      aria-describedby="hub-intro-text"
      onCancel={(e) => {
        e.preventDefault();
        finish();
      }}
      onKeyDown={onKeyDown}
    >
      <div className="hub-intro__buddy" aria-hidden="true">
        <Avatar id={avatar} mood={step.mood} size={64} />
      </div>
      <div className="hub-intro__bubble" role="group" aria-live="polite" aria-labelledby="hub-intro-title">
        <p className="hub-intro__who">
          <span>{name} erzählt</span>
          <span>
            {index + 1} von {steps.length}
          </span>
        </p>
        <div key={step.spot} className="hub-intro__say">
          <h2 id="hub-intro-title" className="hub-intro__title">
            {step.title}
          </h2>
          <p id="hub-intro-text" className="hub-intro__text">
            {step.text}
          </p>
        </div>
        <div className="hub-intro__actions">
          <span className="hub-intro__dots" aria-hidden="true">
            {steps.map((s, i) => (
              <i key={s.spot} className={i === index ? 'is-on' : i < index ? 'is-done' : undefined} />
            ))}
          </span>
          {!last && (
            <button type="button" className="link-btn hub-intro__skip" onClick={finish}>
              Überspringen
            </button>
          )}
          <button ref={nextBtn} type="button" className="btn btn--primary hub-intro__next" onClick={next}>
            {last ? 'Los geht’s' : 'Weiter'}
          </button>
        </div>
      </div>
    </dialog>
  );
}
