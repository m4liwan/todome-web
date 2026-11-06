import { useEffect, useId, useLayoutEffect, useReducer, useRef, useState, type ReactNode } from 'react';

/** Last focused element outside any dialog: where focus returns when a dialog closes. */
let lastOutside: HTMLElement | null = null;
if (typeof document !== 'undefined') {
  document.addEventListener('focusin', (e) => {
    const t = e.target;
    if (t instanceof HTMLElement && !t.closest('dialog')) lastOutside = t;
  });
}

/** Length of the closing motion (mirrors `sheet-out` in base/animations.css). */
export const DIALOG_CLOSE_MS = 180;

/** True when the closing motion should be skipped (reduced motion, no layout engine). */
export function closeInstantly(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  tone?: 'default' | 'focus' | 'pause' | 'alert';
  wide?: boolean;
  /** When false, Esc and backdrop clicks don't close (e.g. mid-decision). */
  dismissible?: boolean;
  /** Extra class on the <dialog> (layout variants such as the settings sheet). */
  className?: string;
}

/** Native <dialog> modal: focus trap, Esc and inert background for free. */
export function Dialog({ open, title, onClose, children, footer, tone = 'default', wide, dismissible = true, className = '' }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  /** Element that had focus before the dialog opened: it gets focus back. */
  const opener = useRef<HTMLElement | null>(null);
  /** While closing, the last content stays visible and fades out with the sheet. */
  const [closing, setClosing] = useState(false);
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  const shown = useRef({ title, children, footer });
  if (open) shown.current = { title, children, footer };
  const view = open ? { title, children, footer } : shown.current;

  // While a dialog is open the window's drag strip steps back, so buttons
  // that overlap it (like the close button) always receive the click.
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const n = Number(root.dataset.modals ?? 0) + 1;
    root.dataset.modals = String(n);
    root.classList.add('has-modal');
    return () => {
      const left = Math.max(0, Number(root.dataset.modals ?? 1) - 1);
      root.dataset.modals = String(left);
      if (left === 0) root.classList.remove('has-modal');
    };
  }, [open]);

  // Layout effect: opening and the start of the soft close happen before the next frame is painted.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      const active = document.activeElement;
      // A field inside may already have taken focus (autoFocus): use the last element outside.
      opener.current = active instanceof HTMLElement && !el.contains(active) && active !== document.body ? active : lastOutside;
      // A field that asked for focus (autoFocus) keeps it; otherwise the sheet
      // itself takes focus, so the close button never opens with a ring.
      const wanted = document.activeElement instanceof HTMLElement && el.contains(document.activeElement) ? document.activeElement : null;
      if (typeof el.showModal === 'function') el.showModal();
      else el.setAttribute('open', '');
      (wanted ?? el).focus({ preventScroll: true });
    } else if (open && el.open) {
      // Opened again while it was still fading out: simply stay.
      setClosing(false);
    } else if (!open && el.open) {
      const done = () => {
        if (typeof el.close === 'function') el.close();
        else el.removeAttribute('open');
        setClosing(false);
        refresh();
        restoreFocus(el);
      };
      if (closeInstantly()) return done();
      // Soft close: fade and scale down like the opening, then hand focus back.
      // The class goes on right away, so the motion starts with the very next frame.
      el.classList.add('is-closing');
      setClosing(true);
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        window.clearTimeout(timer);
        el.removeEventListener('animationstart', onStart);
        el.removeEventListener('animationend', onEnd);
        if (el.isConnected) done();
      };
      const onEnd = (e: AnimationEvent) => e.target === el && finish();
      // Safety net counts from the start of the motion, so a busy frame never cuts it short;
      // without any motion (styles missing) it ends after a short while anyway.
      let timer = window.setTimeout(finish, DIALOG_CLOSE_MS * 4);
      const onStart = (e: AnimationEvent) => {
        if (e.target !== el) return;
        window.clearTimeout(timer);
        timer = window.setTimeout(finish, DIALOG_CLOSE_MS + 80);
      };
      el.addEventListener('animationstart', onStart);
      el.addEventListener('animationend', onEnd);
      return () => {
        // Reopened or unmounted mid-way: stop the pending close.
        finished = true;
        window.clearTimeout(timer);
        el.classList.remove('is-closing');
        el.removeEventListener('animationstart', onStart);
        el.removeEventListener('animationend', onEnd);
      };
    }
  }, [open]);

  // Closed by unmounting (the usual way here): give focus back as well.
  useEffect(() => {
    const el = ref.current;
    return () => {
      // React's development double mount keeps the element: nothing to give back then.
      if (el?.isConnected && el.open) return;
      restoreFocus(el);
    };
  }, []);

  function restoreFocus(el: HTMLDialogElement | null) {
    const back = opener.current;
    opener.current = null;
    const active = document.activeElement;
    if (back?.isConnected && (!active || active === document.body || (el && el.contains(active)))) back.focus({ preventScroll: true });
  }

  return (
    <dialog
      ref={ref}
      className={`dialog dialog--${tone}${wide ? ' dialog--wide' : ''}${className ? ` ${className}` : ''}${closing ? ' is-closing' : ''}`}
      aria-labelledby={titleId}
      tabIndex={-1}
      onCancel={(e) => {
        // React bubbles onCancel through nested dialogs: only the dialog itself reacts.
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        if (dismissible && open) onClose();
      }}
      onClick={(e) => {
        if (dismissible && open && e.target === e.currentTarget) onClose();
      }}
    >
      {/* Still open in the DOM (about to fade out): keep the content until it is gone. */}
      {(open || closing || Boolean(ref.current?.open)) && (
        <div className="dialog__inner">
          <header className="dialog__header">
            <h2 id={titleId}>{view.title}</h2>
            {dismissible && (
              <button type="button" className="icon-btn" onClick={onClose} aria-label="Schließen">
                <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
                  <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </header>
          <div className="dialog__body">{view.children}</div>
          {view.footer && <footer className="dialog__footer">{view.footer}</footer>}
        </div>
      )}
    </dialog>
  );
}
