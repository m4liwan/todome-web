import { useLayoutEffect, useRef, type RefObject } from 'react';
import { useMedia } from '../app/media';
import { IconMusic, IconPauseFilled, IconPlay, IconSkipNext, IconSkipPrev } from './icons';

/**
 * Compact transport for whatever plays on Windows (Spotify, browser, …):
 * back, play/pause, skip, plus a calm "now playing" line.
 */
/**
 * Marks the label when its text does not fit and stores by how much
 * (--marquee-shift), so the hover marquee scrolls exactly to the end and
 * short titles stay put. Written straight to the DOM: no re-render.
 */
function useMarquee(label: RefObject<HTMLSpanElement | null>, text: string) {
  useLayoutEffect(() => {
    const el = label.current;
    if (!el) return;
    const measure = () => {
      const overflow = el.scrollWidth - el.clientWidth;
      el.classList.toggle('is-overflowing', overflow > 1);
      // Past the overflow by the fade at the right edge, so the last word ends clear of it.
      el.style.setProperty('--marquee-shift', `${Math.max(0, Math.ceil(overflow + el.clientWidth * 0.15))}px`);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [label, text]);
}

export function MediaControl({ variant = 'bar', fallback = null }: { variant?: 'bar' | 'mini'; fallback?: React.ReactNode }) {
  const { info, supported, send } = useMedia(true);
  const labelRef = useRef<HTMLSpanElement>(null);
  const active = info?.active ?? false;
  const label = active ? [info?.title, info?.artist].filter(Boolean).join(' · ') || 'Wiedergabe' : 'Nichts läuft gerade';
  // Keyed on availability too: the label only mounts once the control is supported.
  useMarquee(labelRef, supported ? label : '');
  // Blocked or unavailable on this PC: step aside quietly.
  if (!supported) return <>{fallback}</>;
  return (
    <div className={`media media--${variant}${info?.playing ? ' is-playing' : ''}`} role="group" aria-label="Mediensteuerung">
      <span className="media__icon" aria-hidden="true">
        <IconMusic size={14} />
        <span className="media__eq">
          <i />
          <i />
          <i />
        </span>
      </span>
      <span ref={labelRef} className="media__label" title={label}>
        <span>{label}</span>
      </span>
      <div className="media__buttons">
        <button type="button" className="media__btn" aria-label="Zurück" title="Zurück" onClick={() => send('prev')}>
          <IconSkipPrev size={14} />
        </button>
        <button type="button" className="media__btn media__btn--main" aria-label={info?.playing ? 'Pause' : 'Abspielen'} title={info?.playing ? 'Pause' : 'Abspielen'} onClick={() => send('toggle')}>
          {info?.playing ? <IconPauseFilled size={14} /> : <IconPlay size={14} />}
        </button>
        <button type="button" className="media__btn" aria-label="Weiter" title="Weiter" onClick={() => send('next')}>
          <IconSkipNext size={14} />
        </button>
      </div>
    </div>
  );
}
