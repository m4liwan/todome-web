import type { Activity } from '../domain/energy';
import type { Mood } from '../domain/companion';
import type { AvatarId } from '../domain/types';
import { Avatar } from './Avatar';

interface Props {
  avatar: AvatarId;
  activity: Activity;
  size?: number;
  className?: string;
  /** Level 50 holofoil look (see Avatar). */
  holo?: boolean;
}

const MOOD: Record<Activity, Mood> = {
  tea: 'calm',
  reading: 'calm',
  writing: 'curious',
  treadmill: 'happy',
  weights: 'alert',
  waiting: 'happy',
  sleeping: 'sleepy',
};

/**
 * The living companion: the avatar plus a small prop that shows what it is
 * "working on" (tea, book, notepad, treadmill, dumbbells). Purely decorative,
 * so the props are hidden from assistive tech; the label lives next to it.
 */
export function AvatarScene({ avatar, activity, size = 120, className = '', holo = false }: Props) {
  return (
    <div className={`scene scene--${activity} ${className}`} style={{ ['--scene-size' as string]: `${size}px` }}>
      {activity === 'treadmill' && <Treadmill />}
      <div className="scene__actor">
        <Avatar id={avatar} mood={MOOD[activity]} size={size} holo={holo} />
      </div>
      {activity === 'tea' && <Tea />}
      {activity === 'reading' && <Book />}
      {activity === 'writing' && <Notepad />}
      {activity === 'weights' && <Dumbbell />}
      {activity === 'sleeping' && <Pillow />}
    </div>
  );
}

function Tea() {
  return (
    <svg className="scene__prop scene__prop--tea" viewBox="0 0 60 60" aria-hidden>
      <g className="scene__steam" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" fill="none" opacity="0.5">
        <path d="M22 18c-3-4 3-6 0-11" />
        <path d="M32 18c-3-4 3-6 0-11" />
      </g>
      <path d="M12 24h32v14a12 12 0 01-12 12h-8a12 12 0 01-12-12z" fill="var(--prop-a)" />
      <path d="M44 28h3a6 6 0 010 12h-4" stroke="var(--prop-a)" strokeWidth="4" fill="none" />
      <rect x="12" y="24" width="32" height="5" rx="2.5" fill="var(--prop-b)" />
      <ellipse cx="28" cy="54" rx="18" ry="3" fill="var(--prop-shadow)" />
    </svg>
  );
}

function Book() {
  return (
    <svg className="scene__prop scene__prop--book" viewBox="0 0 70 50" aria-hidden>
      <path d="M35 12C26 6 14 6 6 9v32c8-3 20-3 29 3z" fill="var(--prop-paper)" stroke="var(--prop-line)" strokeWidth="1.5" />
      <path d="M35 12c9-6 21-6 29-3v32c-8-3-20-3-29 3z" fill="var(--prop-paper)" stroke="var(--prop-line)" strokeWidth="1.5" />
      <path className="scene__page" d="M35 12c6-5 15-6 22-5v31c-7-1-16 0-22 5z" fill="var(--prop-paper)" stroke="var(--prop-line)" strokeWidth="1" />
      <g stroke="var(--prop-line)" strokeWidth="1.4" strokeLinecap="round" opacity="0.7">
        <path d="M12 17h16M12 23h16M12 29h12" />
      </g>
      <path d="M35 12v32" stroke="var(--prop-a)" strokeWidth="2" />
    </svg>
  );
}

function Notepad() {
  return (
    <svg className="scene__prop scene__prop--notepad" viewBox="0 0 60 60" aria-hidden>
      <rect x="8" y="10" width="38" height="44" rx="5" fill="var(--prop-paper)" stroke="var(--prop-line)" strokeWidth="1.5" />
      <g stroke="var(--prop-line)" strokeWidth="1.6" strokeLinecap="round" opacity="0.6">
        <path d="M15 22h24M15 30h24M15 38h14" />
      </g>
      <path className="scene__ink" d="M15 46h0" stroke="var(--prop-a)" strokeWidth="2.4" strokeLinecap="round" />
      <g className="scene__pen">
        <path d="M40 44l14-22 4 3-14 22-6 3z" fill="var(--prop-a)" />
        <path d="M54 22l2-3 4 3-2 3z" fill="var(--prop-b)" />
      </g>
    </svg>
  );
}

function Dumbbell() {
  return (
    <svg className="scene__prop scene__prop--dumbbell" viewBox="0 0 80 30" aria-hidden>
      <rect x="18" y="13" width="44" height="4" rx="2" fill="var(--prop-line)" />
      <rect x="8" y="5" width="9" height="20" rx="3" fill="var(--prop-a)" />
      <rect x="2" y="9" width="6" height="12" rx="2" fill="var(--prop-a)" />
      <rect x="63" y="5" width="9" height="20" rx="3" fill="var(--prop-a)" />
      <rect x="72" y="9" width="6" height="12" rx="2" fill="var(--prop-a)" />
    </svg>
  );
}

function Treadmill() {
  return (
    <svg className="scene__treadmill" viewBox="0 0 160 50" aria-hidden>
      <path d="M128 40V10l10-6" stroke="var(--prop-line)" strokeWidth="4" strokeLinecap="round" fill="none" />
      <rect x="132" y="2" width="16" height="7" rx="3" fill="var(--prop-a)" />
      <rect x="10" y="34" width="132" height="12" rx="6" fill="var(--prop-belt)" />
      <rect className="scene__belt" x="16" y="38" width="120" height="4" rx="2" fill="none" stroke="var(--prop-line)" strokeWidth="1.5" strokeDasharray="6 8" />
    </svg>
  );
}

function Pillow() {
  return (
    <svg className="scene__pillow" viewBox="0 0 160 40" aria-hidden>
      <path d="M14 22c0-10 10-14 66-14s66 4 66 14-10 14-66 14-66-4-66-14z" fill="var(--prop-paper)" stroke="var(--prop-line)" strokeWidth="1.2" />
    </svg>
  );
}
