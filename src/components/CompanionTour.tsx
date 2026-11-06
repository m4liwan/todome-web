import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { hasPro } from '../app/pro';
import { useLabels } from '../app/hooks';
import type { ContextLabels } from '../domain/userContext';
import { prefersReducedMotion } from '../app/theme';
import { avatarName } from '../domain/companion';
import type { AvatarId } from '../domain/types';
import { desktop } from '../lib/desktop';
import { Avatar } from './Avatar';
import { IconLock } from './icons';
import { showSettingsTab, type SettingsTab } from './dialogs/SettingsDialog';

/** Where the companion sits relative to what it explains. */
type Place = 'corner' | 'top' | 'left';

interface Step {
  id: string;
  /** First visible match wins; a step without any match is skipped. */
  targets: string[];
  title: string;
  text: string;
  place: Place;
  /** Steps inside the settings sheet. */
  tab?: SettingsTab;
  /** Flow & Focus layout: the slide that holds the target. */
  slide?: string;
  /** A small chip next to the title (e.g. "Pro-Vorschau"). */
  badge?: string;
}

const AV = 64;
const GAP = 16;
const BUBBLE_W = 340;

export function buildSteps(name: string, user: string, labels: ContextLabels, bridgeNext = false): Step[] {
  const you = user ? `, ${user}` : '';
  const steps: Step[] = [
    {
      id: 'focus',
      targets: ['.panel--focus'],
      title: 'Deine Fokus-Karte',
      text: `Hallo${you}! Ich bin ${name} und zeige dir kurz alles. Hier steht immer nur dein nächster Schritt, nie die ganze Liste. Ein Klick auf „Ankommen und starten“, und wir legen gemeinsam los.`,
      place: 'corner',
      slide: 'Jetzt',
    },
    {
      id: 'energy',
      targets: ['.hello .energy-chip'],
      title: 'Dein Energie-Check',
      text: 'Sag mir morgens, wie viel Kraft du hast. Bei wenig Energie plane ich kürzere Blöcke und mehr Luft ein. Ohne schlechtes Gewissen.',
      place: 'top',
    },
    {
      id: 'thoughts',
      targets: ['.panel--thoughts'],
      title: 'Der Gedanken-Parkplatz',
      text: 'Alles, was dir zwischendurch durch den Kopf geht, parkst du hier. Es geht nicht verloren und stört deinen Fokus nicht. Oder du lässt es bewusst los.',
      place: 'corner',
      slide: 'Kopf frei',
    },
    {
      id: 'closing',
      targets: ['.topbar__main'],
      title: labels.dayEnd,
      text: labels.tourText,
      place: 'left',
    },
    {
      id: 'clients',
      tab: 'data',
      targets: ['#settings-tab-data'],
      title: 'Kunden anlegen',
      text: `Unter „Daten“ legst du deine Kunden mit Stundensatz an. So landet jede Minute beim richtigen Auftrag.${hasPro() ? '' : ' Neue Kunden anlegen kommt bald mit Pro.'}`,
      place: 'top',
      ...(hasPro() ? {} : { badge: 'Pro-Vorschau' }),
    },
    {
      id: 'design',
      tab: 'design',
      targets: ['#settings-tab-design'],
      title: 'Design-Anpassungen',
      text: 'Hier machst du ToDoMe. zu deinem Ort: Farbwelten, Layouts, Atmosphäre mit leisem Klang und der Stil deiner Zeitlinie.',
      place: 'top',
    },
    {
      id: 'overlay',
      tab: 'overlay',
      targets: ['#settings-tab-overlay'],
      title: 'Overlay-Modus',
      text: desktop
        ? 'Eine kleine Glasbox mit mir und deinem Fokus, frei verschiebbar, auch auf den zweiten Bildschirm. So bin ich dabei, während du in anderen Programmen arbeitest.'
        : 'In der Desktop-App gibt es eine kleine Glasbox mit mir und deinem Fokus, frei verschiebbar, auch auf den zweiten Bildschirm.',
      place: 'top',
    },
    {
      id: 'end',
      targets: ['.home-hub', '.panel--focus'],
      title: 'Das war es schon',
      text: bridgeNext
        ? `Ich bleibe in deiner Nähe und schaue ab und zu vorbei. Zum Schluss räumen wir kurz deinen Kopf auf${you}, dann kann es losgehen.`
        : `Ich bleibe in deiner Nähe und schaue ab und zu vorbei. Ein Schritt nach dem anderen${you}.`,
      place: 'corner',
      slide: 'Jetzt',
    },
  ];
  // Clients are a work topic: studying and everyday use skip this step.
  return labels.business ? steps : steps.filter((s) => s.id !== 'clients');
}

const visible = (el: Element | null): el is HTMLElement => {
  if (!(el instanceof HTMLElement)) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
};

const findTarget = (step: Step): HTMLElement | null => {
  for (const sel of step.targets) {
    const el = document.querySelector(sel);
    if (visible(el)) return el;
  }
  return null;
};

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** The element's own corner radius, so the spotlight hugs it exactly. */
  radius: string;
}
const sameRect = (a: Rect | null, b: Rect) =>
  a !== null && a.radius === b.radius && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.w - b.w) < 0.5 && Math.abs(a.h - b.h) < 0.5;

/** The visible shape: a layout wrapper without corners hands over to its card. */
function measure(target: HTMLElement): Rect {
  let el: Element = target;
  let radius = getComputedStyle(el).borderRadius;
  for (let depth = 0; depth < 2 && (radius === '0px' || radius === '') && el.firstElementChild; depth++) {
    const child = el.firstElementChild as HTMLElement;
    const cr = getComputedStyle(child).borderRadius;
    if (cr && cr !== '0px') {
      el = child;
      radius = cr;
      break;
    }
    el = child;
  }
  if (radius === '0px') el = target;
  const b = el.getBoundingClientRect();
  return { x: b.left, y: b.top, w: b.width, h: b.height, radius: radius || '0px' };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

function avatarSpot(r: Rect, place: Place, vw: number, vh: number) {
  let x: number;
  let y: number;
  if (place === 'left') {
    x = r.x - AV - 10;
    y = r.y + r.h / 2 - AV / 2 + 18;
  } else if (place === 'top') {
    x = r.x + r.w / 2 - AV / 2;
    y = r.y - AV + 14;
  } else {
    x = r.x + r.w - AV - 18;
    y = r.y - AV * 0.62;
  }
  return { x: clamp(x, 8, vw - AV - 8), y: clamp(y, 8, vh - AV - 8) };
}

type Side = 'below' | 'above' | 'right' | 'left';

/**
 * Where the speech bubble goes: for big cards beside the card (so nothing is
 * covered), otherwise hanging below the companion, or above when there is no
 * room. `tail` is where the little pointer sits along the bubble's edge.
 */
function placeBubble(r: Rect | null, place: Place, spot: { x: number; y: number }, w: number, h: number, vp: { w: number; h: number }) {
  if (r && place === 'corner') {
    const y = clamp(spot.y + AV * 0.35, GAP, vp.h - h - GAP);
    const tail = clamp(spot.y + AV / 2 - y, 24, h - 24);
    if (r.x + r.w + GAP + w <= vp.w - GAP) return { side: 'right' as Side, x: r.x + r.w + GAP, y, w, tail };
    if (r.x - GAP - w >= GAP) return { side: 'left' as Side, x: r.x - GAP - w, y, w, tail };
  }
  const x = clamp(spot.x + AV / 2 - w + 48, GAP, vp.w - w - GAP);
  const tail = clamp(spot.x + AV / 2 - x, 28, w - 28);
  if (spot.y + AV + h + GAP < vp.h) return { side: 'below' as Side, x, y: spot.y + AV - 2, w, tail };
  return { side: 'above' as Side, x, y: Math.max(GAP, spot.y - h + 2), w, tail };
}

interface Props {
  avatar: AvatarId;
  userName: string;
  onOpenSettings: (tab: SettingsTab) => void;
  onCloseSettings: () => void;
  onDone: () => void;
  /** "Kopf aufräumen" follows right after (first start). */
  bridgeNext?: boolean;
}

/**
 * The companion walks the user through the interface once: it wanders to
 * each place, sits on it and explains it in a glass speech bubble. Inside
 * the settings it opens the sheet and perches on the tab it talks about.
 *
 * The tour lives in its own modal <dialog> so it always stays above every
 * other sheet (top layer); Escape ends it at any time.
 */
export function CompanionTour({ avatar, userName, onOpenSettings, onCloseSettings, onDone, bridgeNext = false }: Props) {
  const name = avatarName(avatar);
  const labels = useLabels();
  const [steps] = useState(() => buildSteps(name, userName.trim(), labels, bridgeNext));
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [bubbleH, setBubbleH] = useState(180);
  const [walking, setWalking] = useState(false);
  const [view, setView] = useState({ w: window.innerWidth, h: window.innerHeight });
  const dialog = useRef<HTMLDialogElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const nextBtn = useRef<HTMLButtonElement>(null);
  const raisedOverSettings = useRef(false);
  const step = steps[index];
  const last = index === steps.length - 1;

  // Open as top-layer dialog.
  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) {
      if (typeof el.showModal === 'function') el.showModal();
      else el.setAttribute('open', '');
    }
    nextBtn.current?.focus({ preventScroll: true });
    return () => {
      if (el?.open) el.close();
    };
  }, []);

  const [leaving, setLeaving] = useState(false);
  const ended = useRef(false);
  const finish = useCallback(() => {
    if (ended.current) return;
    ended.current = true;
    if (document.querySelector('dialog.dialog--settings[open]')) onCloseSettings();
    if (prefersReducedMotion()) return onDone();
    // Soft goodbye: ring, companion and bubble fade out together, then the tour ends.
    setLeaving(true);
    window.setTimeout(onDone, 200);
  }, [onCloseSettings, onDone]);

  const next = useCallback(() => {
    if (last) finish();
    else setIndex((i) => i + 1);
  }, [last, finish]);

  // Prepare each station: open/close the settings, pick the slide, scroll gently.
  useEffect(() => {
    if (!step) return;
    setRect(null);
    const settingsOpen = Boolean(document.querySelector('dialog.dialog--settings[open]'));
    if (step.tab) {
      if (settingsOpen) showSettingsTab(step.tab);
      else onOpenSettings(step.tab);
    } else {
      if (settingsOpen) onCloseSettings();
      if (step.slide) {
        const dot = Array.from(document.querySelectorAll<HTMLButtonElement>('.flow__dots button')).find((b) => b.textContent?.trim() === step.slide);
        dot?.click();
      }
    }
    // Give the sheet / slide a moment, then make sure the target is in view.
    const t = window.setTimeout(() => {
      const el = findTarget(step);
      if (!el) {
        // Nothing to show here (e.g. hidden in this layout): walk on.
        setIndex((i) => (i === index ? Math.min(i + 1, steps.length - 1) : i));
        if (last) finish();
        return;
      }
      if (!step.tab) {
        const r = el.getBoundingClientRect();
        if (r.top < 90 || r.bottom > window.innerHeight - 40) el.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      }
    }, step.tab ? 260 : 120);
    return () => window.clearTimeout(t);
    // Runs once per station.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // Follow the target every frame (scrolling, opening sheets, resizing).
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      // A settings sheet that opened above us: step back on top.
      const settings = document.querySelector('dialog.dialog--settings[open]');
      const el = dialog.current;
      if (settings && el && typeof el.showModal === 'function' && !raisedOverSettings.current) {
        raisedOverSettings.current = true;
        el.close();
        el.showModal();
        nextBtn.current?.focus({ preventScroll: true });
      } else if (!settings) {
        raisedOverSettings.current = false;
      }
      const target = step ? findTarget(step) : null;
      if (target) {
        const r = measure(target);
        setRect((prev) => (sameRect(prev, r) ? prev : r));
      }
      setView((v) => (v.w === window.innerWidth && v.h === window.innerHeight ? v : { w: window.innerWidth, h: window.innerHeight }));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [step]);

  // The bubble's height decides whether it hangs below or above the companion.
  useLayoutEffect(() => {
    const el = bubble.current;
    if (!el) return;
    const measure = () => setBubbleH((h) => (Math.abs(h - el.offsetHeight) > 1 ? el.offsetHeight : h));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [index]);

  // A little walk animation whenever the companion changes place; "Weiter" keeps the focus.
  useEffect(() => {
    nextBtn.current?.focus({ preventScroll: true });
    setWalking(true);
    const t = window.setTimeout(() => setWalking(false), 950);
    return () => window.clearTimeout(t);
  }, [index]);

  // Keyboard: arrow right / Enter = next, Escape (cancel) = end.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next]);

  const spot = rect ? avatarSpot(rect, step?.place ?? 'corner', view.w, view.h) : { x: view.w / 2 - AV / 2, y: view.h / 2 - AV };
  const bubblePos = placeBubble(rect, step?.place ?? 'corner', spot, Math.min(BUBBLE_W, view.w - 2 * GAP), bubbleH, view);

  return (
    <dialog
      ref={dialog}
      className={`tour${leaving ? ' is-closing' : ''}`}
      aria-label={`Rundgang mit ${name}`}
      onCancel={(e) => {
        e.preventDefault();
        finish();
      }}
    >
      {rect && (
        <div
          className="tour__ring"
          aria-hidden="true"
          style={{ transform: `translate3d(${rect.x}px, ${rect.y}px, 0)`, width: rect.w, height: rect.h, borderRadius: rect.radius }}
        />
      )}

      <div className={`tour__buddy${walking ? ' is-walking' : ''}`} style={{ transform: `translate3d(${spot.x}px, ${spot.y}px, 0)` }} aria-hidden="true">
        <div className="tour__hop">
          <Avatar id={avatar} mood="happy" size={AV} />
        </div>
        <span className="tour__shadow" />
      </div>

      <div
        ref={bubble}
        key={step?.id}
        className={`tour__bubble is-${bubblePos.side}${rect ? ' is-ready' : ''}`}
        style={{ width: bubblePos.w, transform: `translate3d(${bubblePos.x}px, ${bubblePos.y}px, 0)`, '--tail': `${bubblePos.tail}px` } as React.CSSProperties}
        role="group"
        aria-live="polite"
        aria-labelledby="tour-title"
      >
        <p className="tour__who">
          <span>{name} zeigt dir ToDoMe.</span>
          <span>
            {index + 1} von {steps.length}
          </span>
        </p>
        <h2 id="tour-title" className="tour__title">
          {step?.title}
          {step?.badge && (
            <span className="pro-lock tour__badge">
              <IconLock size={11} />
              {step.badge}
            </span>
          )}
        </h2>
        <p className="tour__text">{step?.text}</p>
        <div className="tour__actions">
          <span className="tour__dots" aria-hidden="true">
            {steps.map((s, i) => (
              <i key={s.id} className={i === index ? 'is-on' : i < index ? 'is-done' : undefined} />
            ))}
          </span>
          {!last && (
            <button type="button" className="link-btn tour__skip" onClick={finish}>
              Überspringen
            </button>
          )}
          <button ref={nextBtn} type="button" className="btn btn--primary tour__next" onClick={next}>
            {last ? 'Los geht’s' : 'Weiter'}
          </button>
        </div>
      </div>
    </dialog>
  );
}
