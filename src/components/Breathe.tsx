import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../app/theme';
import { avatarName } from '../domain/companion';
import type { AvatarId } from '../domain/types';
import { breathTone } from '../lib/chimes';
import { AvatarScene } from './AvatarScene';
import { useFocusTrap } from '../lib/a11y';

/** One slow breath: 4 s in, 6 s out. */
const CYCLE_S = 10;
const ASK_AFTER_MS = 60_000;

interface Props {
  avatar: AvatarId;
  /** Play the quiet 432 Hz binaural tone. */
  sound: boolean;
  onClose: (feelingBetter: boolean) => void;
}

/**
 * "Durchatmen": the emergency calm. Everything disappears; only the companion
 * stays and breathes in slow motion. After a minute it quietly asks whether
 * things are better. Nothing in the app changes meanwhile.
 */
export function Breathe({ avatar, sound, onClose }: Props) {
  const [ask, setAsk] = useState(false);
  const [round, setRound] = useState(0);
  const stop = useRef<() => void>(() => undefined);
  const close = useRef(onClose);
  close.current = onClose;
  // Keyboard focus stays in the breathing screen and returns afterwards.
  const trap = useFocusTrap<HTMLDivElement>(true);

  useEffect(() => {
    if (!sound) return;
    stop.current = breathTone(CYCLE_S);
    return () => stop.current();
  }, [sound]);

  useEffect(() => {
    setAsk(false);
    const id = window.setTimeout(() => setAsk(true), prefersReducedMotion() ? ASK_AFTER_MS / 2 : ASK_AFTER_MS);
    return () => window.clearTimeout(id);
  }, [round]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div ref={trap} data-focus-trap="" className="calm-breath" role="dialog" aria-modal="true" aria-label="Durchatmen" style={{ '--cycle': `${CYCLE_S}s` } as React.CSSProperties}>
      <div className="calm-breath__aura" aria-hidden="true" />
      <div className="calm-breath__center">
        <div className="calm-breath__buddy" aria-hidden="true">
          <AvatarScene avatar={avatar} activity="sleeping" size={170} />
        </div>
        <p className="calm-breath__cue" aria-hidden="true">
          <span className="calm-breath__in">Einatmen</span>
          <span className="calm-breath__out">Ausatmen</span>
        </p>
        {ask ? (
          <div className="calm-breath__ask">
            <p className="calm-breath__question">Geht es wieder?</p>
            <div className="calm-breath__actions">
              <button type="button" className="glass-cta" onClick={() => onClose(true)}>
                Ja, danke
              </button>
              <button type="button" className="link-btn" onClick={() => setRound((r) => r + 1)}>
                Noch einen Moment
              </button>
            </div>
          </div>
        ) : (
          <p className="calm-breath__line">{avatarName(avatar)} atmet mit dir. Gerade gibt es nichts zu tun.</p>
        )}
      </div>
      {!ask && (
        <button type="button" className="calm-breath__leave link-btn" onClick={() => onClose(false)}>
          Zurück
        </button>
      )}
    </div>
  );
}
