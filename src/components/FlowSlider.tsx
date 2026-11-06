import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { prefersReducedMotion } from '../app/theme';
import { IconChevronLeft, IconChevronRight } from './icons';

export interface Slide {
  id: string;
  label: string;
  content: ReactNode;
}

/**
 * "Flow & Focus": the home screen as a calm horizontal slider. Swipe or drag
 * with the mouse, use the arrows, the dots or ←/→. Slides snap softly.
 */
export function FlowSlider({ slides }: { slides: Slide[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const drag = useRef<{ x: number; left: number; id: number; moved: boolean } | null>(null);

  const go = useCallback((i: number) => {
    const el = track.current;
    if (!el) return;
    const n = Math.max(0, Math.min(slides.length - 1, i));
    const target = el.children[n] as HTMLElement | undefined;
    if (!target) return;
    const first = el.children[0] as HTMLElement;
    el.scrollTo({ left: target.offsetLeft - first.offsetLeft, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [slides.length]);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onScroll = () => {
      const w = el.clientWidth;
      const first = el.children[0] as HTMLElement | undefined;
      const second = el.children[1] as HTMLElement | undefined;
      const stride = first && second ? second.offsetLeft - first.offsetLeft : w;
      if (stride > 0) setIndex(Math.round(el.scrollLeft / stride));
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return; // touch scrolls natively
    if ((e.target as Element).closest('button, a, input, textarea, select, label, [role="option"], .select')) return;
    const el = track.current;
    if (!el) return;
    drag.current = { x: e.clientX, left: el.scrollLeft, id: e.pointerId, moved: false };
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = track.current;
    if (!d || !el || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < 6) return;
    if (!d.moved) {
      d.moved = true;
      el.setPointerCapture(e.pointerId);
      el.classList.add('is-dragging');
    }
    el.scrollLeft = d.left - dx;
  };
  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = track.current;
    drag.current = null;
    if (!d || !el || !d.moved) return;
    el.classList.remove('is-dragging');
    const dx = e.clientX - d.x;
    const first = el.children[0] as HTMLElement | undefined;
    const second = el.children[1] as HTMLElement | undefined;
    const w = first && second ? second.offsetLeft - first.offsetLeft : el.clientWidth;
    const base = Math.round(d.left / w);
    go(Math.abs(dx) > 60 ? base + (dx < 0 ? 1 : -1) : base);
  };

  return (
    <section className="flow" aria-roledescription="Karussell" aria-label="Deine Bereiche">
      <nav className="flow__nav" aria-label="Bereiche">
        <ol className="flow__dots">
          {slides.map((s, i) => (
            <li key={s.id}>
              <button type="button" className={i === index ? 'is-on' : undefined} aria-current={i === index ? 'step' : undefined} onClick={() => go(i)}>
                {s.label}
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <div className="flow__stage">
      <button type="button" className="flow__arrow flow__arrow--prev" aria-label="Vorheriger Bereich" disabled={index === 0} onClick={() => go(index - 1)}>
        <IconChevronLeft size={22} />
      </button>
      <button type="button" className="flow__arrow flow__arrow--next" aria-label="Nächster Bereich" disabled={index >= slides.length - 1} onClick={() => go(index + 1)}>
        <IconChevronRight size={22} />
      </button>
      <div
        ref={track}
        className="flow__track"
        tabIndex={0}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => {
          drag.current = null;
          track.current?.classList.remove('is-dragging');
        }}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'ArrowRight') go(index + 1);
          if (e.key === 'ArrowLeft') go(index - 1);
        }}
      >
        {slides.map((s, i) => (
          <div key={s.id} className={`flow__slide flow__slide--${s.id}${i === index ? ' is-current' : ''}`} role="group" aria-roledescription="Bereich" aria-label={`${s.label}, ${i + 1} von ${slides.length}`}>
            {s.content}
          </div>
        ))}
      </div>
      </div>
    </section>
  );
}
