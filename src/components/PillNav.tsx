import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type FocusEvent as ReactFocusEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';

/*
 * PillNav, after the React Bits component of the same name, adapted to the
 * OLED cockpit: every colour comes from the app's tokens (the light colour
 * via --accent-rgb, so a palette change recolours the dot, the hover fill and
 * the focus ring at once), every corner from --radius (the corner setting),
 * hairlines instead of grey surfaces. Items are buttons (views, not links).
 *
 * The motion is the original's: a spring engine (requestAnimationFrame) moves
 * the dot under the current item and, in 'glide' mode, a lens between items;
 * on hover a fill rises from below and the label rolls over to its lit twin;
 * on mount the logo pops, the bar unveils and the items slide in. Reduced
 * motion settles everything instantly.
 */

export interface PillNavItem {
  id: string;
  label: string;
  icon?: ReactNode;
  ariaLabel?: string;
  /** Set apart at the end of the bar and softly lit (the day end). */
  anchor?: boolean;
}

export interface PillNavProps {
  /** The mark in the slot left of the bar (decorative; the nav is labelled). */
  logo?: ReactNode;
  items: PillNavItem[];
  /** The current item; none when the current view is not in the bar. */
  activeId?: string;
  onSelect: (item: PillNavItem) => void;
  /** Controls after the bar (tools), counted in when deciding to collapse. */
  end?: ReactNode;
  hoverEffect?: 'fill' | 'glide' | 'none';
  indicator?: 'dot' | 'pill' | 'none';
  bounce?: number;
  stretch?: number;
  intro?: boolean;
  collapse?: 'auto' | 'always' | 'never';
  /** Where the collapsed menu opens: below the bar (top) or above it (bottom). */
  placement?: 'below' | 'above';
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
}

interface Engine {
  enter: (index: number, event?: ReactPointerEvent) => void;
  leave: () => void;
  focus: (index: number, event?: ReactFocusEvent) => void;
  blur: () => void;
  press: (event?: ReactPointerEvent) => void;
  release: () => void;
  refresh: () => void;
}

const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const readVar = (element: Element, name: string) => parseFloat(getComputedStyle(element).getPropertyValue(name)) || 0;
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
/** Web Animations, where the environment has them (not in jsdom). */
const animate = (element: Element | null | undefined, keyframes: Keyframe[], options: KeyframeAnimationOptions): Animation | null =>
  element && typeof element.animate === 'function' ? element.animate(keyframes, options) : null;

export function PillNav({
  logo,
  items,
  activeId,
  onSelect,
  end,
  hoverEffect = 'fill',
  indicator = 'dot',
  bounce = 0.3,
  stretch = 0.5,
  intro = true,
  collapse = 'auto',
  placement = 'below',
  ariaLabel = 'Navigation',
  className = '',
  style,
}: PillNavProps) {
  const panelId = useId();
  const rootRef = useRef<HTMLElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const glideRef = useRef<HTMLSpanElement>(null);
  const inkRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLSpanElement>(null);
  const logoRef = useRef<HTMLSpanElement>(null);
  const markRef = useRef<HTMLSpanElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const measureListRef = useRef<HTMLDivElement>(null);
  const slotRefs = useRef<(HTMLLIElement | null)[]>([]);
  const engineRef = useRef<Engine | null>(null);
  const introRef = useRef(intro);
  const slideRef = useRef(false);
  const pendingRef = useRef<boolean | null>(null);
  const [collapsed, setCollapsed] = useState(collapse === 'always');
  const [open, setOpen] = useState(false);
  const [panelShown, setPanelShown] = useState(false);

  const activeIndex = items.findIndex((item) => item.id === activeId);
  const hasLogo = Boolean(logo);
  const fill = hoverEffect === 'fill';
  const glide = !fill && (hoverEffect === 'glide' || indicator === 'pill');

  const settings = { hoverEffect, indicator, activeIndex, bounce: clamp(bounce, 0, 1), stretch: clamp(stretch, 0, 1) };
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // The spring engine: the dot (and the glide lens) follow the current and the
  // hovered item; positions are written straight to the elements, no renders.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const reduce = reducedMotion();
    const state = {
      x0: 0,
      x1: 0,
      v0: 0,
      v1: 0,
      alpha: 0,
      pop: 1,
      press: 1,
      pressVelocity: 0,
      dotX: 0,
      dotVelocity: 0,
      dotAlpha: 0,
      hover: -1,
      focus: false,
      sliding: false,
      pressing: false,
      waiting: slideRef.current && !reduce,
    };
    slideRef.current = false;
    const rects: Array<{ left: number; width: number }> = [];
    let trackWidth = 0;
    let trackHeight = 0;
    let corner = 0;
    let raf = 0;
    let last = 0;

    const measure = () => {
      const track = trackRef.current;
      if (!track) return;
      trackWidth = track.offsetWidth;
      trackHeight = track.offsetHeight;
      corner = readVar(root, '--radius');
      slotRefs.current.forEach((slot, index) => {
        if (!slot) return;
        rects[index] = { left: slot.offsetLeft, width: slot.offsetWidth };
        // The hover fill is a circle; it must cover the whole item when grown.
        const reach = Math.ceil(2 * Math.sqrt((slot.offsetWidth / 2) ** 2 + slot.offsetHeight ** 2)) + 2;
        slot.style.setProperty('--pn-fill', `${reach}px`);
      });
    };

    const glideIndex = () => {
      const s = settingsRef.current;
      if (s.hoverEffect === 'fill') return -1;
      if (s.hoverEffect === 'glide' && state.hover >= 0) return state.hover;
      return s.indicator === 'pill' ? s.activeIndex : -1;
    };

    const sync = () => {
      const s = settingsRef.current;
      slotRefs.current.forEach((slot, index) => {
        if (!slot) return;
        const hovered = state.hover === index;
        slot.toggleAttribute('data-lit', hovered);
        slot.toggleAttribute('data-hover', hovered && s.hoverEffect === 'fill');
      });
      root.toggleAttribute('data-focus', state.focus && state.hover >= 0);
      root.toggleAttribute('data-dot-lit', s.hoverEffect === 'fill' && state.hover >= 0 && state.hover === s.activeIndex);
    };

    const render = () => {
      const glideEl = glideRef.current;
      const ink = inkRef.current;
      const dot = dotRef.current;
      const width = Math.max(0, state.x1 - state.x0);
      const scale = state.press * state.pop;
      const target = rects[glideIndex()];
      const squash = target ? 1 - clamp((width / Math.max(target.width, 1) - 1) * 0.3, 0, 0.14) : 1;
      if (glideEl) {
        glideEl.style.width = `${width}px`;
        glideEl.style.transform = `translate3d(${state.x0}px, 0, 0) scale(${scale}, ${scale * squash})`;
        glideEl.style.opacity = `${state.alpha}`;
      }
      if (ink) {
        const half = (width * scale) / 2;
        const center = (state.x0 + state.x1) / 2;
        const inset = (trackHeight * (1 - scale * squash)) / 2;
        ink.style.clipPath = `inset(${inset}px ${trackWidth - center - half}px ${inset}px ${center - half}px round ${corner}px)`;
        ink.style.opacity = `${state.alpha}`;
      }
      if (dot) {
        const pull = clamp(Math.abs(state.dotVelocity) / 700, 0, 2.2);
        dot.style.transform = `translate3d(${state.dotX}px, 0, 0) scaleX(${1 + pull})`;
        dot.style.opacity = `${state.dotAlpha}`;
      }
    };

    const tick = (now: number) => {
      raf = 0;
      const s = settingsRef.current;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      const target = rects[glideIndex()];
      const zeta = 1 - 0.55 * s.bounce;
      const base = 520;
      let busy = false;

      if (target && !state.waiting) {
        const t0 = target.left;
        const t1 = target.left + target.width;
        if (state.alpha < 0.02 && !state.sliding) {
          state.x0 = t0;
          state.x1 = t1;
          state.v0 = 0;
          state.v1 = 0;
          state.pop = 0.9;
        }
        if (reduce) {
          state.x0 = t0;
          state.x1 = t1;
          state.v0 = 0;
          state.v1 = 0;
        } else {
          // The leading edge runs ahead, the trailing one follows: the lens stretches.
          const direction = Math.sign((t0 + t1) / 2 - (state.x0 + state.x1) / 2);
          const lead = base * (1 + 0.9 * s.stretch);
          const trail = base * (1 - 0.5 * s.stretch);
          const k0 = direction < 0 ? lead : direction > 0 ? trail : base;
          const k1 = direction > 0 ? lead : direction < 0 ? trail : base;
          const steps = Math.ceil(dt / (1 / 240));
          const h = dt / steps;
          for (let i = 0; i < steps; i++) {
            state.v0 += (-k0 * (state.x0 - t0) - 2 * zeta * Math.sqrt(k0) * state.v0) * h;
            state.x0 += state.v0 * h;
            state.v1 += (-k1 * (state.x1 - t1) - 2 * zeta * Math.sqrt(k1) * state.v1) * h;
            state.x1 += state.v1 * h;
          }
        }
        state.alpha += (1 - state.alpha) * (reduce ? 1 : 1 - Math.exp(-dt / 0.06));
        busy = Math.abs(state.x0 - t0) > 0.05 || Math.abs(state.x1 - t1) > 0.05 || Math.abs(state.v0) > 0.5 || Math.abs(state.v1) > 0.5 || state.alpha < 0.999;
        if (!busy) state.sliding = false;
      } else {
        state.alpha += (0 - state.alpha) * (reduce ? 1 : 1 - Math.exp(-dt / 0.07));
        if (state.alpha > 0.002) busy = true;
        else state.alpha = 0;
      }

      state.pop += (1 - state.pop) * (reduce ? 1 : 1 - Math.exp(-dt / 0.09));
      if (Math.abs(1 - state.pop) > 0.001) busy = true;

      const pressTarget = state.pressing ? 0.95 : 1;
      if (reduce) {
        state.press = pressTarget;
        state.pressVelocity = 0;
      } else {
        state.pressVelocity += (-700 * (state.press - pressTarget) - 30 * state.pressVelocity) * dt;
        state.press += state.pressVelocity * dt;
      }
      if (Math.abs(state.press - pressTarget) > 0.0005 || Math.abs(state.pressVelocity) > 0.01) busy = true;

      const dotTarget = s.indicator === 'dot' ? rects[s.activeIndex] : undefined;
      if (dotTarget && !state.waiting) {
        const center = dotTarget.left + dotTarget.width / 2;
        if (state.dotAlpha < 0.02) {
          state.dotX = center;
          state.dotVelocity = 0;
        }
        if (reduce) {
          state.dotX = center;
          state.dotVelocity = 0;
        } else {
          const k = 360;
          const steps = Math.ceil(dt / (1 / 240));
          const h = dt / steps;
          for (let i = 0; i < steps; i++) {
            state.dotVelocity += (-k * (state.dotX - center) - 2 * (1 - 0.5 * s.bounce) * Math.sqrt(k) * state.dotVelocity) * h;
            state.dotX += state.dotVelocity * h;
          }
        }
        state.dotAlpha += (1 - state.dotAlpha) * (reduce ? 1 : 1 - Math.exp(-dt / 0.1));
        if (Math.abs(state.dotX - center) > 0.05 || Math.abs(state.dotVelocity) > 0.5 || state.dotAlpha < 0.999) busy = true;
      } else {
        state.dotAlpha += (0 - state.dotAlpha) * (reduce ? 1 : 1 - Math.exp(-dt / 0.1));
        if (state.dotAlpha > 0.002) busy = true;
        else state.dotAlpha = 0;
      }

      render();
      if (busy) raf = requestAnimationFrame(tick);
    };

    const wake = () => {
      if (!raf) {
        last = 0;
        raf = requestAnimationFrame(tick);
      }
    };

    const engine: Engine = {
      enter: (index, event) => {
        if (event?.pointerType === 'touch') return;
        state.hover = index;
        state.focus = false;
        sync();
        wake();
      },
      leave: () => {
        if (state.focus) return;
        state.hover = -1;
        sync();
        wake();
      },
      focus: (index, event) => {
        const target = event?.target;
        let visible = false;
        try {
          visible = target instanceof Element && target.matches(':focus-visible');
        } catch {
          visible = false;
        }
        state.focus = visible;
        state.hover = visible ? index : state.hover;
        sync();
        wake();
      },
      blur: () => {
        if (!state.focus) return;
        state.focus = false;
        state.hover = -1;
        sync();
        wake();
      },
      press: (event) => {
        if (event && event.button > 0) return;
        state.pressing = true;
        wake();
      },
      release: () => {
        if (!state.pressing) return;
        state.pressing = false;
        wake();
      },
      refresh: () => {
        measure();
        sync();
        wake();
      },
    };
    engineRef.current = engine;

    measure();
    sync();
    render();
    wake();

    let timer = 0;
    if (state.waiting) {
      // The intro: the dot waits until the bar has unveiled, then slides in.
      state.x0 = 0;
      state.x1 = 0;
      timer = window.setTimeout(() => {
        state.waiting = false;
        if (glideIndex() >= 0) {
          state.alpha = 1;
          state.sliding = true;
        }
        wake();
      }, 420);
    }

    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            measure();
            render();
            wake();
          });
    if (trackRef.current) resizeObserver?.observe(trackRef.current);
    document.fonts?.ready?.then(() => engineRef.current?.refresh()).catch(() => {});
    window.addEventListener('pointerup', engine.release);
    window.addEventListener('pointercancel', engine.release);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      resizeObserver?.disconnect();
      window.removeEventListener('pointerup', engine.release);
      window.removeEventListener('pointercancel', engine.release);
      engineRef.current = null;
    };
  }, [collapsed, items.length]);

  // Labels, the current item or the corner setting may have changed: re-measure.
  useEffect(() => {
    engineRef.current?.refresh();
  });

  // Too narrow for the whole bar: fold the items into a menu behind a toggle.
  useLayoutEffect(() => {
    const root = rootRef.current;
    const measureEl = measureRef.current;
    if (!root || !measureEl) return undefined;
    const evaluate = () => {
      if (collapse !== 'auto') {
        setCollapsed(collapse === 'always');
        return;
      }
      const parent = root.parentElement;
      if (!parent) return;
      const styles = getComputedStyle(parent);
      const available = parent.clientWidth - (parseFloat(styles.paddingLeft) || 0) - (parseFloat(styles.paddingRight) || 0);
      // Not laid out (yet): nothing to decide.
      if (available <= 0) return;
      const listWidth = measureListRef.current?.offsetWidth ?? 0;
      const height = readVar(root, '--pn-h');
      const pad = readVar(root, '--pn-pad');
      const gap = readVar(root, '--pn-gap');
      const endWidth = endRef.current ? endRef.current.offsetWidth + gap : 0;
      const need = (hasLogo ? height + gap : 0) + listWidth + pad * 2 + endWidth;
      const next = need > available + 0.5;
      if (introRef.current && next !== collapsed) pendingRef.current = next;
      setCollapsed(next);
    };
    evaluate();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(evaluate);
    if (root.parentElement) observer.observe(root.parentElement);
    observer.observe(measureEl);
    return () => observer.disconnect();
  }, [collapse, collapsed, hasLogo]);

  // The entrance: the logo pops, the bar unveils from the logo, the items slide in.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !introRef.current) return;
    if (pendingRef.current !== null && pendingRef.current !== collapsed) return;
    pendingRef.current = null;
    introRef.current = false;
    if (reducedMotion()) return;
    const corner = readVar(root, '--radius');
    const pop = (element: HTMLElement | null, delay: number) =>
      animate(
        element,
        [
          { opacity: 0, transform: 'scale(0.6)' },
          { opacity: 1, transform: 'scale(1)' },
        ],
        { duration: 700, delay, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)', fill: 'backwards' },
      );
    pop(logoRef.current, 0);
    if (collapsed) {
      pop(toggleRef.current, 120);
      return;
    }
    slideRef.current = true;
    const bar = barRef.current;
    if (bar) {
      const width = bar.offsetWidth;
      const height = bar.offsetHeight;
      animate(bar, [{ clipPath: `inset(0px ${Math.max(0, width - height)}px 0px 0px round ${corner}px)` }, { clipPath: `inset(0px 0px 0px 0px round ${corner}px)` }], {
        duration: 760,
        delay: 90,
        easing: EASE_OUT,
        fill: 'backwards',
      });
    }
    slotRefs.current.forEach((slot, index) => {
      animate(
        slot,
        [
          { opacity: 0, transform: 'translateX(-10px)' },
          { opacity: 1, transform: 'translateX(0)' },
        ],
        { duration: 560, delay: 200 + index * 50, easing: EASE_OUT, fill: 'backwards' },
      );
    });
    pop(endRef.current, 200 + items.length * 50);
  }, [collapsed, items.length]);

  useEffect(() => {
    if (!collapsed && open) setOpen(false);
  }, [collapsed, open]);

  // The collapsed menu unfolds from the bar's edge, its rows a beat later.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const root = rootRef.current;
    if (!panel || !root) return undefined;
    const reduce = reducedMotion();
    const corner = readVar(root, '--radius');
    const start = placement === 'above' ? `inset(100% 0px 0px 0px round ${corner}px)` : `inset(0px 0px 100% 0px round ${corner}px)`;
    const finish = `inset(0px 0px 0px 0px round ${corner}px)`;
    const rows = panel.querySelectorAll('li');
    const running: Animation[] = [];
    const keep = (a: Animation | null) => a && running.push(a);
    if (open) {
      if (reduce) return undefined;
      keep(animate(panel, [{ clipPath: start }, { clipPath: finish }], { duration: 560, easing: EASE_OUT }));
      rows.forEach((row, index) => {
        keep(
          animate(
            row,
            [
              { opacity: 0, transform: `translateY(${placement === 'above' ? 8 : -8}px)` },
              { opacity: 1, transform: 'translateY(0)' },
            ],
            { duration: 420, delay: 90 + index * 40, easing: EASE_OUT, fill: 'backwards' },
          ),
        );
      });
    } else {
      const morph = reduce ? null : animate(panel, [{ clipPath: finish }, { clipPath: start }], { duration: 380, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' });
      if (!morph) {
        setPanelShown(false);
        return undefined;
      }
      morph.onfinish = () => setPanelShown(false);
      running.push(morph);
      rows.forEach((row) => keep(animate(row, [{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' })));
    }
    return () => {
      running.forEach((animation) => {
        animation.onfinish = null;
        animation.cancel();
      });
    };
  }, [open, panelShown, placement]);

  // An open menu closes on a click outside and on Escape (focus back to the toggle).
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && rootRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      toggleRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // The mark turns once when the pointer arrives.
  const spin = (event: ReactPointerEvent) => {
    const mark = markRef.current;
    if (!mark || event.pointerType === 'touch' || reducedMotion()) return;
    if (typeof mark.getAnimations === 'function' && mark.getAnimations().length) return;
    animate(mark, [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], { duration: 900, easing: 'cubic-bezier(0.65, 0, 0.25, 1)' });
  };

  const toggle = () => {
    const next = !open;
    if (next) setPanelShown(true);
    setOpen(next);
  };

  const face = (item: PillNavItem) => (
    <>
      {item.icon}
      <span className="pill-nav__text">{item.label}</span>
    </>
  );

  return (
    <nav
      ref={rootRef}
      className={['pill-nav', className].filter(Boolean).join(' ')}
      data-collapsed={collapsed ? '' : undefined}
      data-open={open ? '' : undefined}
      data-panel={panelShown ? '' : undefined}
      data-placement={placement}
      style={style}
      aria-label={ariaLabel}
    >
      {logo && (
        <span ref={logoRef} className="pill-nav__logo pill-nav__surface" aria-hidden="true" onPointerEnter={spin}>
          <span ref={markRef} className="pill-nav__mark">
            {logo}
          </span>
          <span className="pill-nav__rim" />
        </span>
      )}

      {!collapsed && (
        <div ref={barRef} className="pill-nav__bar pill-nav__surface">
          <div ref={trackRef} className="pill-nav__track" onPointerLeave={() => engineRef.current?.leave()}>
            <ul className="pill-nav__list">
              {items.map((item, index) => (
                <li
                  key={item.id}
                  ref={(element) => {
                    slotRefs.current[index] = element;
                  }}
                  className="pill-nav__slot"
                  data-anchor={item.anchor ? '' : undefined}
                  data-on={fill && indicator === 'pill' && index === activeIndex ? '' : undefined}
                  onPointerEnter={(event) => engineRef.current?.enter(index, event)}
                  onPointerDown={(event) => engineRef.current?.press(event)}
                  onFocus={(event) => engineRef.current?.focus(index, event)}
                  onBlur={() => engineRef.current?.blur()}
                >
                  <button
                    type="button"
                    className={`pill-nav__item${item.anchor ? ' pill-nav__item--anchor' : ''}`}
                    aria-current={index === activeIndex ? 'page' : undefined}
                    aria-label={item.ariaLabel}
                    onClick={() => onSelect(item)}
                  >
                    {fill && <span className="pill-nav__fill" aria-hidden="true" />}
                    <span className="pill-nav__face">{face(item)}</span>
                    {fill && (
                      <span className="pill-nav__face-alt" aria-hidden="true">
                        {face(item)}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
            {glide && <span ref={glideRef} className="pill-nav__glide" aria-hidden="true" />}
            {glide && (
              <div ref={inkRef} className="pill-nav__ink" aria-hidden="true">
                {items.map((item) => (
                  <span key={item.id} className="pill-nav__ink-item">
                    {face(item)}
                  </span>
                ))}
              </div>
            )}
            {indicator === 'dot' && <span ref={dotRef} className="pill-nav__dot" aria-hidden="true" />}
          </div>
          <span className="pill-nav__rim" />
        </div>
      )}

      {collapsed && (
        <button
          ref={toggleRef}
          type="button"
          className="pill-nav__toggle pill-nav__surface"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={open ? 'Menü schließen' : 'Menü öffnen'}
          onClick={toggle}
        >
          <span className="pill-nav__burger" aria-hidden="true">
            <span className="pill-nav__line pill-nav__line--top" />
            <span className="pill-nav__line pill-nav__line--bottom" />
          </span>
          <span className="pill-nav__rim" />
        </button>
      )}

      {end && (
        <div ref={endRef} className="pill-nav__end">
          {end}
        </div>
      )}

      {collapsed && panelShown && (
        <div ref={panelRef} id={panelId} className="pill-nav__panel pill-nav__surface">
          <ul className="pill-nav__menu">
            {items.map((item, index) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`pill-nav__row${item.anchor ? ' pill-nav__row--anchor' : ''}`}
                  aria-current={index === activeIndex ? 'page' : undefined}
                  aria-label={item.ariaLabel}
                  tabIndex={open ? undefined : -1}
                  onClick={() => {
                    onSelect(item);
                    setOpen(false);
                  }}
                >
                  {face(item)}
                </button>
              </li>
            ))}
          </ul>
          <span className="pill-nav__rim" />
        </div>
      )}

      <div ref={measureRef} className="pill-nav__measure" aria-hidden="true">
        <div ref={measureListRef} className="pill-nav__list">
          {items.map((item) => (
            <span key={item.id} className={`pill-nav__ink-item${item.anchor ? ' pill-nav__ink-item--anchor' : ''}`}>
              {face(item)}
            </span>
          ))}
        </div>
      </div>
    </nav>
  );
}
