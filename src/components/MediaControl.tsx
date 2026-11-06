import { useMedia } from '../app/media';
import { IconMusic, IconPauseFilled, IconPlay, IconSkipNext, IconSkipPrev } from './icons';

/**
 * Compact transport for whatever plays on Windows (Spotify, browser, …):
 * back, play/pause, skip, plus a calm "now playing" line.
 */
export function MediaControl({ variant = 'bar', fallback = null }: { variant?: 'bar' | 'mini'; fallback?: React.ReactNode }) {
  const { info, supported, send } = useMedia(true);
  // Blocked or unavailable on this PC: step aside quietly.
  if (!supported) return <>{fallback}</>;
  const active = info?.active ?? false;
  const label = active ? [info?.title, info?.artist].filter(Boolean).join(' · ') || 'Wiedergabe' : 'Nichts läuft gerade';
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
      <span className="media__label" title={label}>
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
