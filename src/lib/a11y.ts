import { useEffect, useRef } from 'react';

/**
 * Accessibility helpers. Everything here is invisible: it only changes what
 * screen readers hear and where keyboard focus goes, never how the app looks.
 */

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',');

/** Focusable elements inside a container, in tab order, visible ones only. */
export function focusables(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => {
    if (el.closest('[inert], [aria-hidden="true"]')) return false;
    const style = window.getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none' && (el.offsetParent !== null || style.position === 'fixed');
  });
}

// ---------------------------------------------------------------------------
// Keyboard mode
// ---------------------------------------------------------------------------

/**
 * Marks <html data-input="keyboard"> while someone navigates with the
 * keyboard and "pointer" after a click or touch. Focus styles that would
 * otherwise also show on a mouse click (text fields) only appear in keyboard
 * mode, so the look for mouse users stays exactly as designed.
 */
export function installInputModality(): () => void {
  const root = document.documentElement;
  const NAV = new Set(['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'Enter', ' ', 'Escape']);
  const onKey = (e: KeyboardEvent) => {
    if (NAV.has(e.key) && !e.altKey && !e.metaKey) root.dataset.input = 'keyboard';
  };
  const onPointer = () => {
    root.dataset.input = 'pointer';
  };
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('pointerdown', onPointer, true);
  return () => {
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('pointerdown', onPointer, true);
  };
}

// ---------------------------------------------------------------------------
// Screen reader announcements
// ---------------------------------------------------------------------------

const regions: Partial<Record<'polite' | 'assertive', HTMLElement>> = {};

function region(priority: 'polite' | 'assertive'): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const existing = regions[priority];
  if (existing?.isConnected) return existing;
  const el = document.createElement('div');
  el.id = `sr-${priority}`;
  el.className = 'sr-only';
  el.setAttribute('aria-live', priority);
  el.setAttribute('aria-atomic', 'true');
  if (priority === 'assertive') el.setAttribute('role', 'alert');
  document.body.appendChild(el);
  regions[priority] = el;
  return el;
}

/**
 * Says a sentence to screen readers only (no toast, nothing visible).
 * `assertive` interrupts, for things that need attention now.
 */
export function speak(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
  const el = region(priority);
  if (!el || !message) return;
  el.textContent = '';
  // A fresh text node after a tick, so the same sentence is read twice too.
  window.setTimeout(() => (el.textContent = message), 40);
}

// ---------------------------------------------------------------------------
// Focus management for custom overlays (native <dialog> does this by itself)
// ---------------------------------------------------------------------------

interface TrapOptions {
  /** Element to focus first; default: the first focusable, else the container. */
  initial?: () => HTMLElement | null;
  /** Escape closes the overlay. */
  onEscape?: () => void;
  /** Give focus back to where it was before (default true). */
  restore?: boolean;
  /** Move focus into the overlay when it opens (default true). */
  autoFocus?: boolean;
}

/**
 * Keeps keyboard focus inside an overlay while it is open: Tab and Shift+Tab
 * cycle within it, Escape can close it, and focus returns to the element that
 * opened it. For overlays that are not native modal dialogs.
 */
export function useFocusTrap<T extends HTMLElement>(active: boolean, opts: TrapOptions = {}) {
  const ref = useRef<T>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = optsRef.current.initial?.() ?? focusables(container)[0] ?? container;
    if (first === container && !container.hasAttribute('tabindex')) container.setAttribute('tabindex', '-1');
    // After the opening frame, so entrance animations do not jump.
    const raf = window.requestAnimationFrame(() => {
      if (optsRef.current.autoFocus !== false && !container.contains(document.activeElement)) first.focus({ preventScroll: true });
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && optsRef.current.onEscape) {
        e.preventDefault();
        e.stopPropagation();
        optsRef.current.onEscape();
        return;
      }
      if (e.key !== 'Tab') return;
      const list = focusables(container);
      if (list.length === 0) {
        e.preventDefault();
        container.focus({ preventScroll: true });
        return;
      }
      const firstEl = list[0]!;
      const lastEl = list[list.length - 1]!;
      const current = document.activeElement;
      if (e.shiftKey && (current === firstEl || !container.contains(current))) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && (current === lastEl || !container.contains(current))) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      window.cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey, true);
      if (optsRef.current.restore !== false && before?.isConnected) before.focus({ preventScroll: true });
    };
  }, [active]);

  return ref;
}

/** Spoken form of a duration: "1 Stunde 5 Minuten", "12 Minuten", "40 Sekunden". */
export function spokenDuration(ms: number): string {
  const totalMin = Math.round(Math.abs(ms) / 60_000);
  if (Math.abs(ms) < 60_000) {
    const s = Math.max(0, Math.round(Math.abs(ms) / 1000));
    return `${s} ${s === 1 ? 'Sekunde' : 'Sekunden'}`;
  }
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const hs = h ? `${h} ${h === 1 ? 'Stunde' : 'Stunden'}` : '';
  const mins = m ? `${m} ${m === 1 ? 'Minute' : 'Minuten'}` : '';
  return [hs, mins].filter(Boolean).join(' ');
}

/**
 * What a running block says to screen readers, at calm moments only:
 * the start, five minutes before the planned end, the planned end, pause and
 * resume. Pure, so it can be tested; `prev` is the last seen state.
 */
export interface TimerSnapshot {
  sessionId: string;
  status: 'running' | 'paused' | string;
  remainingMs: number;
  task: string;
}

export function timerAnnouncement(prev: TimerSnapshot | null, next: TimerSnapshot | null): string | null {
  if (!next) return prev ? 'Der Fokusblock ist beendet.' : null;
  if (!prev || prev.sessionId !== next.sessionId) {
    return `Fokusblock gestartet: ${next.task}. ${next.remainingMs > 0 ? `${spokenDuration(next.remainingMs)} geplant.` : ''}`.trim();
  }
  if (prev.status !== next.status) {
    if (next.status === 'paused') return 'Pause. Die Zeit steht.';
    if (next.status === 'running') return `Weiter geht es. Noch ${spokenDuration(Math.max(0, next.remainingMs))}.`;
  }
  const FIVE = 5 * 60_000;
  if (prev.remainingMs > FIVE && next.remainingMs <= FIVE && next.remainingMs > 0) return 'Noch fünf Minuten bis zum geplanten Ende.';
  if (prev.remainingMs > 0 && next.remainingMs <= 0) return 'Die geplante Zeit ist um. Du entscheidest in Ruhe, wie es weitergeht.';
  return null;
}
