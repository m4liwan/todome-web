import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ACTIVITY_LABELS } from '../domain/energy';
import { avatarName } from '../domain/companion';
import { desktop, type OverlayConfig, type OverlayEdge, type OverlayState } from '../lib/desktop';
import { AvatarScene } from './AvatarScene';
import { MediaControl } from './MediaControl';
import { IconArrowUpRight, IconClose } from './icons';

const SIZES = { small: 56, medium: 76, large: 100 } as const;
const DRAG_THRESHOLD = 4;
/** Grips in the transparent margin: the four sides and the four corners. */
const EDGES: readonly OverlayEdge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

/** Height the glass box needs: its content plus its own padding and border. */
function boxHeight(box: HTMLElement, content: HTMLElement): number {
  const cs = getComputedStyle(box);
  const frame = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
  return content.getBoundingClientRect().height + (Number.isFinite(frame) ? frame : 0);
}

/**
 * Root of the floating mini overlay window (`#overlay`): the busy companion
 * in a glass box with the one focus anchor and a calm progress ring.
 * Drag it anywhere (all monitors); a click brings ToDoMe back from the tray.
 */
export function OverlayWindow() {
  const [cfg, setCfg] = useState<OverlayConfig | null>(null);
  const [st, setSt] = useState<OverlayState | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; moving: boolean; id: number } | null>(null);
  const resize = useRef<{ x: number; y: number; id: number } | null>(null);

  useEffect(() => {
    document.documentElement.classList.add('is-overlay');
    if (!desktop) return;
    const offCfg = desktop.onOverlayConfig((c) => {
      setCfg(c);
      document.documentElement.setAttribute('data-theme', c.theme);
      document.documentElement.setAttribute('data-palette', c.palette);
    });
    const offState = desktop.onOverlayState(setSt);
    return () => {
      offCfg();
      offState();
    };
  }, []);

  // The box fills the window (the user may have sized it); what it reports is
  // the height its content needs, so the window never cuts anything off.
  useLayoutEffect(() => {
    const el = box.current;
    const inner = content.current;
    if (!el || !inner || !desktop) return;
    const report = () => desktop?.overlayResize({ width: el.getBoundingClientRect().width, height: boxHeight(el, inner) });
    report();
    const ro = new ResizeObserver(report);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [cfg, st]);

  // Closed or reloaded mid-resize: let the window know the grip is released.
  useEffect(
    () => () => {
      if (resize.current) desktop?.overlayResizeEnd();
      resize.current = null;
    },
    [],
  );

  if (!cfg || !st) return null;
  const size = SIZES[cfg.avatarSize];
  const mod = cfg.modules ?? { avatar: true, anchor: true, progress: true, media: true };
  const ring = 2 * Math.PI * 21;

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as Element).closest('.mini__btn')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.screenX, y: e.screenY, moving: false, id: e.pointerId };
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.screenX - d.x;
    const dy = e.screenY - d.y;
    if (!d.moving && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!d.moving) {
      d.moving = true;
      desktop?.overlayDragStart();
    }
    desktop?.overlayDragMove({ dx, dy });
  };
  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId) return;
    if (d.moving) desktop?.overlayDragEnd();
    else desktop?.overlayOpenApp();
  };

  // Grips: screen coordinates, so a moving left or top edge never feeds back.
  const gripDown = (edge: OverlayEdge) => (e: React.PointerEvent<HTMLSpanElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    resize.current = { x: e.screenX, y: e.screenY, id: e.pointerId };
    desktop?.overlayResizeStart(edge);
  };
  const gripMove = (e: React.PointerEvent<HTMLSpanElement>) => {
    const r = resize.current;
    if (!r || r.id !== e.pointerId) return;
    desktop?.overlayResizeMove({ dx: e.screenX - r.x, dy: e.screenY - r.y });
  };
  const gripUp = (e: React.PointerEvent<HTMLSpanElement>) => {
    const r = resize.current;
    if (!r || r.id !== e.pointerId) return;
    resize.current = null;
    desktop?.overlayResizeEnd();
  };

  return (
    <>
      <div
        className={`mini${cfg.glow ? ' mini--glow' : ''}`}
        data-status={st.status}
        data-size={cfg.avatarSize}
        style={{ '--mini-alpha': cfg.opacity } as React.CSSProperties}
      >
        <div
          ref={box}
          className="mini__box"
          role="button"
          tabIndex={0}
          aria-label={`${st.title}. ToDoMe öffnen`}
          title="Klicken: ToDoMe öffnen. Ziehen: verschieben."
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={() => {
            if (drag.current?.moving) desktop?.overlayDragEnd();
            drag.current = null;
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') desktop?.overlayOpenApp();
          }}
        >
          <div ref={content} className="mini__content">
            {(mod.avatar || mod.anchor || mod.progress) && (
              <div className="mini__row">
                {mod.avatar && (
                  <div className="mini__buddy" aria-hidden="true">
                    <AvatarScene avatar={st.avatar} activity={st.activity} size={size} />
                  </div>
                )}
                {mod.anchor && (
                  <div className="mini__text">
                    <p className="mini__title">{st.title}</p>
                    <p className="mini__hint">{!mod.avatar ? st.hint : `${st.hint}. ${avatarName(st.avatar)} ${ACTIVITY_LABELS[st.activity]}.`}</p>
                  </div>
                )}
                {mod.progress && (
                  <svg className="mini__ring" viewBox="0 0 50 50" width="34" height="34" aria-hidden="true">
                    <circle cx="25" cy="25" r="21" className="mini__ring-track" />
                    <circle cx="25" cy="25" r="21" className="mini__ring-fill" strokeDasharray={ring} strokeDashoffset={ring * (1 - Math.min(1, st.progress))} transform="rotate(-90 25 25)" />
                  </svg>
                )}
              </div>
            )}
            {mod.media && (
              <div className="mini__media" onPointerDown={(e) => e.stopPropagation()}>
                <MediaControl variant="mini" />
              </div>
            )}
          </div>
          <div className="mini__tools">
            <button type="button" className="mini__btn" aria-label="ToDoMe öffnen" title="ToDoMe öffnen" onClick={() => desktop?.overlayOpenApp()}>
              <IconArrowUpRight size={14} />
            </button>
            <button type="button" className="mini__btn" aria-label="Overlay ausblenden" title="Overlay ausblenden" onClick={() => desktop?.overlayClose()}>
              <IconClose size={12} />
            </button>
          </div>
        </div>
      </div>
      <div className="mini__grips" aria-hidden="true">
        {EDGES.map((edge) => (
          <span
            key={edge}
            className={`mini__grip mini__grip--${edge}`}
            title="Ziehen: Größe ändern. Doppelklick: automatische Größe."
            onPointerDown={gripDown(edge)}
            onPointerMove={gripMove}
            onPointerUp={gripUp}
            onPointerCancel={gripUp}
            onDoubleClick={() => desktop?.overlayResizeReset()}
          />
        ))}
      </div>
    </>
  );
}
