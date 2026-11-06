import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../app/theme';
import { avatarName } from '../domain/companion';
import { theOneThing } from '../domain/energy';
import type { AppState, Millis, StandbyLayout } from '../domain/types';
import { AvatarScene } from './AvatarScene';
import { useFocusTrap } from '../lib/a11y';

interface Props {
  state: AppState;
  now: Millis;
  onWake: () => void;
}

const timeOf = (d: Date) => d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
const dateOf = (d: Date) => d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });

/**
 * The rest screen: calm, centred, in one of four looks. Moving the mouse
 * does nothing; a click brings the dashboard back.
 */
export function Standby({ state, now, onWake }: Props) {
  const [wall, setWall] = useState(() => new Date());
  const layout: StandbyLayout = state.settings.appearance.standby;

  useEffect(() => {
    const id = window.setInterval(() => setWall(new Date()), 10_000);
    return () => window.clearInterval(id);
  }, []);

  const trap = useFocusTrap<HTMLDivElement>(true);
  const one = theOneThing(state, now);
  const avatar = state.settings.companion.avatar;
  const line = `Alles ruht. ${one ? `„${one.title}“ wartet geduldig auf dich.` : `${avatarName(avatar)} hält solange die Stellung.`}`;

  return (
    <div ref={trap} data-focus-trap="" className={`standby standby--${layout}`} role="dialog" aria-modal="true" aria-label="Ruhemodus. Klicken, Leertaste, Enter oder Escape, um weiterzumachen." onClick={onWake}>
      <div className="standby__aura" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      {layout === 'drift' ? (
        <Drift time={timeOf(wall)} />
      ) : (
        <div className="standby__center">
          {layout === 'breath' && (
            <div className="standby__orb" aria-hidden="true">
              <span />
            </div>
          )}
          <p className="standby__time">{timeOf(wall)}</p>
          {layout !== 'bigclock' && <p className="standby__date">{dateOf(wall)}</p>}
          {layout === 'calm' && (
            <>
              <AvatarScene avatar={avatar} activity="sleeping" size={120} className="standby__buddy" />
              <p className="standby__line">{line}</p>
            </>
          )}
          {layout === 'breath' && <p className="standby__line">Einatmen, ausatmen. Hier gibt es gerade nichts zu tun.</p>}
        </div>
      )}
      <p className="standby__hint">Klicke irgendwo oder drücke die Leertaste, um weiterzumachen</p>
    </div>
  );
}

/** The time glides like the old DVD logo and softly changes colour at the walls. */
function Drift({ time }: { time: string }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    let x = window.innerWidth * 0.3;
    let y = window.innerHeight * 0.3;
    let vx = 0.55;
    let vy = 0.42;
    let hue = 0;
    let raf = 0;
    let last = performance.now();
    const step = (t: number) => {
      const dt = Math.min(48, t - last) / 16.7;
      last = t;
      const w = window.innerWidth - node.offsetWidth;
      const h = window.innerHeight - node.offsetHeight;
      x += vx * dt;
      y += vy * dt;
      let bounced = false;
      if (x <= 0 || x >= w) {
        vx = -vx;
        x = Math.max(0, Math.min(w, x));
        bounced = true;
      }
      if (y <= 0 || y >= h) {
        vy = -vy;
        y = Math.max(0, Math.min(h, y));
        bounced = true;
      }
      if (bounced) {
        hue = (hue + 1) % 4;
        node.dataset.hue = String(hue);
      }
      node.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      raf = requestAnimationFrame(step);
    };
    if (prefersReducedMotion()) {
      node.style.transform = `translate3d(${(window.innerWidth - node.offsetWidth) / 2}px, ${(window.innerHeight - node.offsetHeight) / 2}px, 0)`;
      return;
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div ref={el} className="standby__drift" data-hue="0">
      {time}
    </div>
  );
}
