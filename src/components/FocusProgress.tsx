import { useId } from 'react';
import type { TimelineStyle } from '../domain/types';

const BEADS = 44;

/* The wave: two gentle harmonics, drawn twice as wide as the view so it can
   drift one full period to the left and loop without a seam. */
const VIEW_W = 640;
const VIEW_H = 44;
const PERIOD = 160;
const BASE = 22;
/** Width of the soft leading edge, in view units. */
const EDGE = 28;

function wavePath(closed: boolean): string {
  const pts: string[] = [];
  for (let x = 0; x <= VIEW_W + PERIOD; x += 8) {
    const y = BASE + Math.sin((x / PERIOD) * Math.PI * 2) * 6 + Math.sin((x / (PERIOD / 2)) * Math.PI * 2 + 1.2) * 1.8;
    pts.push(`${x === 0 ? 'M' : 'L'}${x} ${y.toFixed(2)}`);
  }
  return closed ? `${pts.join(' ')} L${VIEW_W + PERIOD} ${VIEW_H} L0 ${VIEW_H} Z` : pts.join(' ');
}
const WAVE_LINE = wavePath(false);
const WAVE_AREA = wavePath(true);

interface Props {
  style: TimelineStyle;
  /** 0 … 1 */
  progress: number;
  paused?: boolean;
  /** For screen readers: planned minutes and minutes done. */
  plannedMin: number;
  doneMin: number;
  /** Static preview (settings): no motion. */
  still?: boolean;
}

/**
 * How far the current block has come, in one of three calm looks:
 * a breathing wave (default), a quiet glass bar or the classic beads.
 */
export function FocusProgress({ style, progress, paused = false, plannedMin, doneMin, still = false }: Props) {
  const clipId = `tl-wave-${useId().replace(/:/g, '')}`;
  const p = Math.max(0, Math.min(1, progress));
  const done = p * VIEW_W;
  const aria = {
    role: 'progressbar' as const,
    'aria-label': 'Fortschritt der Timebox',
    'aria-valuemin': 0,
    'aria-valuemax': plannedMin,
    'aria-valuenow': doneMin,
  };

  if (style === 'bar') {
    return (
      <div className="tl-bar" {...aria}>
        <span className="tl-bar__fill" style={{ width: `${p * 100}%` }} />
      </div>
    );
  }

  if (style === 'beads') {
    const filled = Math.round(p * BEADS);
    return (
      <div className="dots" {...aria}>
        {Array.from({ length: BEADS }, (_, i) => (
          <span key={i} className={i < filled ? 'is-on' : i === filled && !paused && !still ? 'is-next' : undefined} />
        ))}
      </div>
    );
  }

  return (
    <div className={`tl-wave${paused ? ' is-paused' : ''}${still ? ' is-still' : ''}`} {...aria}>
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <defs>
          {/* The filled part fades out softly at the leading edge, no hard cut. */}
          <linearGradient id={`${clipId}-edge`} gradientUnits="userSpaceOnUse" x1={Math.max(0, done - EDGE)} x2={done} y1="0" y2="0">
            <stop offset="0" stopColor="#fff" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${clipId}-fill`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0.35" className="tl-wave__fill-top" />
            <stop offset="1" className="tl-wave__fill-bottom" />
          </linearGradient>
          <mask id={clipId} maskUnits="userSpaceOnUse" x="0" y="0" width={VIEW_W} height={VIEW_H}>
            <rect x="0" y="0" width={Math.max(0, done - EDGE)} height={VIEW_H} fill="#fff" />
            <rect x={Math.max(0, done - EDGE)} y="0" width={Math.min(EDGE, done)} height={VIEW_H} fill={`url(#${clipId}-edge)`} />
          </mask>
        </defs>
        <g className="tl-wave__drift">
          <path className="tl-wave__track" d={WAVE_LINE} />
        </g>
        <g className="tl-wave__done" mask={`url(#${clipId})`}>
          <g className="tl-wave__drift">
            <path className="tl-wave__area" d={WAVE_AREA} fill={`url(#${clipId}-fill)`} />
            <path className="tl-wave__line" d={WAVE_LINE} />
          </g>
        </g>
      </svg>
      <span className="tl-wave__now" style={{ left: `${p * 100}%` }} aria-hidden="true" />
    </div>
  );
}
