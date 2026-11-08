import { useId } from 'react';
import { avatarName, type Mood } from '../domain/companion';
import type { AvatarId } from '../domain/types';

interface Props {
  id: AvatarId;
  mood?: Mood;
  size?: number;
  /** Idle animation (bob + blink). */
  animated?: boolean;
  title?: string;
  /** Tight, optically centred framing for small round badges (no floor shadow). */
  crop?: boolean;
  /** Level 50 look: an iridescent foil, clipped exactly to the figure. */
  holo?: boolean;
}

/**
 * Eight original companion characters, drawn as SVG: six free
 * (Spike, Mark, Bit, Spark, Kiki, Pixie) and two in Pro (Keimi, Woody).
 * Eyes and mouth change with the mood; bob and blink are CSS animations.
 */
export function Avatar({ id, mood = 'happy', size = 96, animated = true, title, crop = false, holo = false }: Props) {
  const uid = useId().replace(/:/g, '');
  const g = (name: string) => `${name}-${uid}`;
  const label = title ?? avatarName(id);

  return (
    <svg
      className={`avatar avatar--${id}${animated ? ' is-animated' : ''}${mood === 'sleepy' ? ' is-sleepy' : ''}`}
      width={size}
      height={size}
      viewBox={crop ? '4 6 112 112' : '0 0 120 120'}
      role="img"
      aria-label={label}
    >
      <defs>
        <linearGradient id={g('spike')} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor="#D4F7B4" />
          <stop offset="0.55" stopColor="#7CD67E" />
          <stop offset="1" stopColor="#3FA968" />
        </linearGradient>
        <linearGradient id={g('sand')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F6DDB6" />
          <stop offset="1" stopColor="#DDB07C" />
        </linearGradient>
        <linearGradient id={g('bark')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#9A6239" />
          <stop offset="0.45" stopColor="#C88D5B" />
          <stop offset="1" stopColor="#8A5432" />
        </linearGradient>
        <radialGradient id={g('rings')} cx="45%" cy="40%" r="70%">
          <stop offset="0" stopColor="#FBE3BC" />
          <stop offset="1" stopColor="#E9C08C" />
        </radialGradient>
        <linearGradient id={g('bit')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F7F8FA" />
          <stop offset="1" stopColor="#C9CED8" />
        </linearGradient>
        <radialGradient id={g('spark')} cx="38%" cy="30%" r="80%">
          <stop offset="0" stopColor="#C9F1FF" />
          <stop offset="0.55" stopColor="#5BB8F5" />
          <stop offset="1" stopColor="#3170E0" />
        </radialGradient>
        <radialGradient id={g('kiki')} cx="40%" cy="30%" r="80%">
          <stop offset="0" stopColor="#F6F0FB" />
          <stop offset="1" stopColor="#BFAEDB" />
        </radialGradient>
        <radialGradient id={g('pixie')} cx="40%" cy="30%" r="80%">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#FFD6EA" />
        </radialGradient>
        <linearGradient id={g('horn')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFF6C2" />
          <stop offset="1" stopColor="#F2BE3C" />
        </linearGradient>
        <linearGradient id={g('pot')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F0A47A" />
          <stop offset="1" stopColor="#D27650" />
        </linearGradient>
        <radialGradient id={g('leaf')} cx="40%" cy="30%" r="80%">
          <stop offset="0" stopColor="#D9F99D" />
          <stop offset="1" stopColor="#4CB86A" />
        </radialGradient>
        <radialGradient id={g('tomato')} cx="36%" cy="30%" r="82%">
          <stop offset="0" stopColor="#FFB4A0" />
          <stop offset="0.48" stopColor="#F25A4A" />
          <stop offset="1" stopColor="#CC342C" />
        </radialGradient>
        <radialGradient id={g('shadow')} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#000" stopOpacity="0.22" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>

      {!crop && <ellipse className="avatar__shadow" cx="60" cy="112" rx="30" ry="5" fill={`url(#${g('shadow')})`} />}

      <g className="avatar__body">
        <g id={g('figure')}>
        {id === 'spike' && (
          <>
            {/* arms behind the body */}
            <path d="M42 66H32a8 8 0 01-8-8V44a6 6 0 0112 0v12h6z" fill={`url(#${g('spike')})`} />
            <path d="M78 56h8V40a6 6 0 0112 0v10a8 8 0 01-8 8H78z" fill={`url(#${g('spike')})`} />
            <rect x="38" y="26" width="44" height="64" rx="22" fill={`url(#${g('spike')})`} />
            <path d="M51 34v50M69 34v50" stroke="#2F8A52" strokeWidth="2" strokeLinecap="round" opacity="0.28" />
            <g stroke="#F4FFE9" strokeWidth="1.6" strokeLinecap="round" opacity="0.9">
              <path d="M38 46l-4-1M38 64l-4 1M82 44l4-1M82 70l4 1M60 28v-4" />
              <path d="M26 46l-3-2M96 42l3-2" />
            </g>
            <ellipse cx="48" cy="38" rx="5" ry="8" fill="#fff" opacity="0.35" transform="rotate(-12 48 38)" />
            <g className="avatar__spark">
              <circle cx="54" cy="22" r="4.2" fill="#FF8FB1" />
              <circle cx="66" cy="22" r="4.2" fill="#FF8FB1" />
              <circle cx="60" cy="17" r="4.2" fill="#FF8FB1" />
              <circle cx="60" cy="27" r="4.2" fill="#FF8FB1" />
              <circle cx="60" cy="22" r="3.2" fill="#FFD36E" />
            </g>
            <path d="M34 88h52l-5 18a6 6 0 01-6 4H45a6 6 0 01-6-4z" fill={`url(#${g('sand')})`} />
            <rect x="30" y="84" width="60" height="10" rx="5" fill="#EAC18D" />
            <ellipse cx="45" cy="70" rx="5" ry="3.2" fill="#FF8FA8" opacity="0.5" />
            <ellipse cx="75" cy="70" rx="5" ry="3.2" fill="#FF8FA8" opacity="0.5" />
            <Face mood={mood} cx={60} cy={58} spread={11} ink="#1E4A2C" />
          </>
        )}

        {id === 'woody' && (
          <>
            <path d="M28 42h64v54a12 12 0 01-12 12H40a12 12 0 01-12-12z" fill={`url(#${g('bark')})`} />
            <path d="M24 104c4-6 8-8 12-6M96 104c-4-6-8-8-12-6" stroke="#8A5432" strokeWidth="6" strokeLinecap="round" fill="none" />
            <g stroke="#5E3A22" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.32">
              <path d="M36 54c2 10-2 18 0 30M84 52c-2 12 2 20 0 34M48 92c1 5 0 8 1 11M72 90c-1 6 0 9-1 13" />
            </g>
            <ellipse cx="60" cy="42" rx="32" ry="11" fill={`url(#${g('rings')})`} stroke="#B9824E" strokeWidth="1.5" />
            <g stroke="#C9955E" strokeWidth="1.4" fill="none" opacity="0.8">
              <ellipse cx="60" cy="42" rx="22" ry="7" />
              <ellipse cx="60" cy="42" rx="12" ry="3.8" />
            </g>
            <circle cx="60" cy="42" r="1.8" fill="#B9824E" />
            <g className="avatar__leaf">
              <path d="M74 36c1-6 4-10 8-12" stroke="#3E9C57" strokeWidth="2.6" strokeLinecap="round" fill="none" />
              <path d="M82 24c-2 7 3 11 10 9 0-7-4-11-10-9z" fill="#7CD67E" />
            </g>
            <ellipse cx="40" cy="80" rx="5.5" ry="3.4" fill="#FFB49A" opacity="0.55" />
            <ellipse cx="80" cy="80" rx="5.5" ry="3.4" fill="#FFB49A" opacity="0.55" />
            <Face mood={mood} cx={60} cy={70} spread={13} ink="#3A2213" />
          </>
        )}

        {id === 'mark' && (
          <>
            <ellipse cx="60" cy="72" rx="40" ry="35" fill={`url(#${g('tomato')})`} />
            <g stroke="#B32A24" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.22">
              <path d="M42 44c-9 14-10 40 0 58M78 44c9 14 10 40 0 58" />
            </g>
            <ellipse cx="41" cy="56" rx="6" ry="10" fill="#fff" opacity="0.32" transform="rotate(-28 41 56)" />
            <g className="avatar__leaf">
              <path d="M60 40C52 35 41 36 34 43c9 3 18 2 26-3z" fill={`url(#${g('leaf')})`} />
              <path d="M60 40c8-5 19-4 26 3-9 3-18 2-26-3z" fill={`url(#${g('leaf')})`} />
              <path d="M60 40c-4-6-10-10-17-11 2 7 8 11 17 11z" fill={`url(#${g('leaf')})`} />
              <path d="M60 40c4-6 10-10 17-11-2 7-8 11-17 11z" fill={`url(#${g('leaf')})`} />
              <path d="M60 40c0-6 2-12 6-16" stroke="#3E9C57" strokeWidth="3.2" strokeLinecap="round" fill="none" />
            </g>
            <ellipse cx="38" cy="82" rx="6" ry="3.6" fill="#FFD2C4" opacity="0.6" />
            <ellipse cx="82" cy="82" rx="6" ry="3.6" fill="#FFD2C4" opacity="0.6" />
            <Face mood={mood} cx={60} cy={72} spread={14} ink="#4A1410" />
          </>
        )}

        {id === 'bit' && (
          <>
            <line x1="60" y1="26" x2="60" y2="14" stroke="#9AA1AE" strokeWidth="3" strokeLinecap="round" />
            <circle className="avatar__spark" cx="60" cy="11" r="5" fill="#C8F23C" />
            <rect x="24" y="26" width="72" height="60" rx="22" fill={`url(#${g('bit')})`} stroke="#AEB4C0" strokeWidth="1.5" />
            <rect x="32" y="38" width="56" height="34" rx="14" fill="#151820" />
            <rect x="40" y="90" width="40" height="16" rx="8" fill="#C9CED8" />
            <circle cx="22" cy="58" r="5" fill="#C9CED8" />
            <circle cx="98" cy="58" r="5" fill="#C9CED8" />
            <Face mood={mood} cx={60} cy={55} spread={12} ink="#C8F23C" robot />
          </>
        )}

        {id === 'spark' && (
          <>
            <path className="avatar__leaf" d="M28 62C14 54 8 40 12 30c8 6 16 6 22 14z" fill="#A9E4FF" stroke="#5BB8F5" strokeWidth="1.5" />
            <path className="avatar__leaf avatar__leaf--r" d="M92 62c14-8 20-22 16-32-8 6-16 6-22 14z" fill="#A9E4FF" stroke="#5BB8F5" strokeWidth="1.5" />
            <path className="avatar__tail" d="M90 94c12 2 20-4 20-14" stroke="#4A9BEA" strokeWidth="8" strokeLinecap="round" fill="none" />
            <path className="avatar__spark" d="M110 74c-4 2-5 6-3 9 3-1 6-4 5-9z" fill="#FFB547" />
            <path d="M44 34l-6-16 14 10zM76 34l6-16-14 10z" fill="#FFE7B0" stroke="#E8B867" strokeWidth="1.2" />
            <ellipse cx="60" cy="68" rx="36" ry="36" fill={`url(#${g('spark')})`} />
            <path d="M54 32l6-7 6 7z" fill="#3170E0" opacity="0.7" />
            <ellipse cx="60" cy="86" rx="20" ry="15" fill="#FFE9BD" />
            <path d="M48 82h24M50 90h20" stroke="#E8C989" strokeWidth="1.6" strokeLinecap="round" />
            <ellipse cx="46" cy="44" rx="9" ry="5" fill="#fff" opacity="0.45" transform="rotate(-22 46 44)" />
            <ellipse cx="38" cy="70" rx="5.5" ry="3.4" fill="#FF8FA8" opacity="0.45" />
            <ellipse cx="82" cy="70" rx="5.5" ry="3.4" fill="#FF8FA8" opacity="0.45" />
            <Face mood={mood} cx={60} cy={60} spread={13} ink="#10284A" />
          </>
        )}

        {id === 'kiki' && (
          <>
            <path className="avatar__tail" d="M24 96c-14-2-18-16-8-24" stroke="#BFAEDB" strokeWidth="7" strokeLinecap="round" fill="none" />
            <path d="M26 50c-2-14 2-26 8-32 8 4 14 12 16 20z" fill={`url(#${g('kiki')})`} />
            <path d="M94 50c2-14-2-26-8-32-8 4-14 12-16 20z" fill={`url(#${g('kiki')})`} />
            <path d="M31 42c0-8 2-15 5-19 4 3 7 8 8 12z" fill="#FFC2D6" />
            <path d="M89 42c0-8-2-15-5-19-4 3-7 8-8 12z" fill="#FFC2D6" />
            <ellipse cx="60" cy="68" rx="40" ry="37" fill={`url(#${g('kiki')})`} />
            <ellipse cx="60" cy="84" rx="17" ry="11" fill="#FBF8FE" />
            <g transform="translate(84 30) rotate(18)">
              <path d="M0 0l-10-6v12zM0 0l10-6v12z" fill="#FF8FB1" />
              <circle r="3.2" fill="#FF6F9C" />
            </g>
            <g stroke="#8E7CB0" strokeWidth="1.5" strokeLinecap="round" opacity="0.65">
              <path d="M30 76h-12M31 82l-11 3" />
              <path d="M90 76h12M89 82l11 3" />
            </g>
            <ellipse cx="38" cy="78" rx="5" ry="3.2" fill="#FF9AB8" opacity="0.5" />
            <ellipse cx="82" cy="78" rx="5" ry="3.2" fill="#FF9AB8" opacity="0.5" />
            <Face mood={mood} cx={60} cy={66} spread={15} ink="#3D2E57" cat />
          </>
        )}

        {id === 'pixie' && (
          <>
            <g className="avatar__leaf">
              <circle cx="32" cy="46" r="12" fill="#FFB3D9" />
              <circle cx="24" cy="60" r="11" fill="#C9B6FF" />
              <circle cx="24" cy="75" r="10" fill="#A8F0D8" />
            </g>
            <path d="M40 40l-4-14 14 8z" fill={`url(#${g('pixie')})`} stroke="#F3C4DB" strokeWidth="1.2" />
            <path d="M80 40l4-14-14 8z" fill={`url(#${g('pixie')})`} stroke="#F3C4DB" strokeWidth="1.2" />
            <ellipse cx="62" cy="68" rx="38" ry="36" fill={`url(#${g('pixie')})`} stroke="#F6D2E4" strokeWidth="1.5" />
            <path d="M60 4l-8 30h16z" fill={`url(#${g('horn')})`} />
            <path d="M55 26l9-4M54 18l8-4M57 11l5-2" stroke="#E2A72A" strokeWidth="1.6" strokeLinecap="round" />
            <g fill="#FFB3D9">
              <circle cx="46" cy="36" r="8" />
              <circle cx="56" cy="34" r="7" fill="#C9B6FF" />
            </g>
            <path className="avatar__spark" d="M100 20l2 5.5 5.5 2-5.5 2-2 5.5-2-5.5-5.5-2 5.5-2z" fill="#F2BE3C" />
            <ellipse cx="40" cy="78" rx="5.5" ry="3.4" fill="#FF8FB8" opacity="0.5" />
            <ellipse cx="84" cy="78" rx="5.5" ry="3.4" fill="#FF8FB8" opacity="0.5" />
            <Face mood={mood} cx={62} cy={68} spread={14} ink="#4A2A44" />
          </>
        )}

        {id === 'keimi' && (
          <>
            <path className="avatar__leaf" d="M60 44c-4-14-16-22-30-20 2 14 14 22 30 20z" fill={`url(#${g('leaf')})`} />
            <path className="avatar__leaf avatar__leaf--r" d="M60 44c4-16 18-26 34-23-2 16-17 25-34 23z" fill={`url(#${g('leaf')})`} />
            <path d="M60 44v14" stroke="#3E9C57" strokeWidth="3" strokeLinecap="round" />
            <path d="M28 58h64l-8 46a6 6 0 01-6 5H42a6 6 0 01-6-5z" fill={`url(#${g('pot')})`} />
            <rect x="24" y="54" width="72" height="12" rx="6" fill="#E78F64" />
            <ellipse cx="40" cy="86" rx="5.5" ry="3.5" fill="#FFD0B8" opacity="0.6" />
            <ellipse cx="80" cy="86" rx="5.5" ry="3.5" fill="#FFD0B8" opacity="0.6" />
            <Face mood={mood} cx={60} cy={80} spread={12} ink="#5A2E1C" />
          </>
        )}
        </g>
        {holo && <HoloFoil g={g} />}
      </g>

      {mood === 'sleepy' && (
        <g className="avatar__zzz" fill="currentColor" fontFamily="inherit" fontWeight="700">
          <text x="92" y="30" fontSize="14">z</text>
          <text x="102" y="18" fontSize="10">z</text>
        </g>
      )}
    </svg>
  );
}

/**
 * Holofoil: a rainbow foil and a slow sheen, masked by the figure's own
 * silhouette (alpha mask of a <use> of the figure), so it never spills onto
 * the background. Sits inside the body group and bobs along with it.
 */
function HoloFoil({ g }: { g: (name: string) => string }) {
  return (
    <>
      <defs>
        {/* Two rainbow cycles over a foil twice the figure's size: it can shift under the pointer without ever showing an edge. */}
        <linearGradient id={g('holo')} gradientUnits="userSpaceOnUse" x1="-60" y1="-60" x2="180" y2="180">
          <stop offset="0" stopColor="#FF8AD8" />
          <stop offset="0.12" stopColor="#FFE27A" />
          <stop offset="0.24" stopColor="#8CF5C4" />
          <stop offset="0.36" stopColor="#7CC8FF" />
          <stop offset="0.48" stopColor="#C49BFF" />
          <stop offset="0.6" stopColor="#FF8AD8" />
          <stop offset="0.72" stopColor="#FFE27A" />
          <stop offset="0.84" stopColor="#8CF5C4" />
          <stop offset="1" stopColor="#7CC8FF" />
        </linearGradient>
        <linearGradient id={g('holo-sheen')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0.42" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.95" />
          <stop offset="0.58" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        {/* Light that follows the pointer: a crisp streak with a soft edge, and a glare spot. */}
        <linearGradient id={g('holo-streak')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0.4" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.46" stopColor="#fff" stopOpacity="0.45" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="1" />
          <stop offset="0.54" stopColor="#fff" stopOpacity="0.45" />
          <stop offset="0.6" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={g('holo-glare')}>
          <stop offset="0" stopColor="#fff" stopOpacity="1" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0.62" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id={g('holo-mask')} maskUnits="userSpaceOnUse" x="0" y="0" width="120" height="120" style={{ maskType: 'alpha' }}>
          <use href={`#${g('figure')}`} />
        </mask>
      </defs>
      {/*
        Foil and sheen tint the figure (overlay); streak and glare are light
        on top of it (screen). On its own the sheen sweeps by itself; inside
        <AvatarFx> with the pointer near, the foil shifts against the pointer
        while streak and glare follow it (CSS variables --fx-x/--fx-y).
        The tilts live on groups: a CSS translate would replace a transform attribute.
      */}
      <g className="avatar__holo" mask={`url(#${g('holo-mask')})`}>
        <rect className="avatar__holo-foil" x="-60" y="-60" width="240" height="240" fill={`url(#${g('holo')})`} opacity="0.6" />
        <g transform="rotate(-18 60 60)">
          <rect className="avatar__holo-sheen" x="-120" y="-20" width="240" height="160" fill={`url(#${g('holo-sheen')})`} />
        </g>
      </g>
      <g className="avatar__holo-light" mask={`url(#${g('holo-mask')})`}>
        <g transform="rotate(-18 60 60)">
          <rect className="avatar__holo-streak" x="-120" y="-20" width="240" height="160" fill={`url(#${g('holo-streak')})`} />
        </g>
        <circle className="avatar__holo-glare" cx="60" cy="60" r="36" fill={`url(#${g('holo-glare')})`} />
      </g>
    </>
  );
}

interface FaceProps {
  mood: Mood;
  cx: number;
  cy: number;
  spread: number;
  ink: string;
  robot?: boolean;
  cat?: boolean;
  noMouth?: boolean;
}

function Face({ mood, cx, cy, spread, ink, robot, cat, noMouth }: FaceProps) {
  const lx = cx - spread;
  const rx = cx + spread;
  const eyes = (() => {
    if (mood === 'happy') {
      return (
        <g stroke={ink} strokeWidth={robot ? 4 : 3.6} strokeLinecap="round" fill="none">
          <path d={`M${lx - 5} ${cy} q5 -7 10 0`} />
          <path d={`M${rx - 5} ${cy} q5 -7 10 0`} />
        </g>
      );
    }
    if (mood === 'calm' || mood === 'sleepy') {
      return (
        <g stroke={ink} strokeWidth={3.4} strokeLinecap="round" fill="none">
          {mood === 'sleepy' ? (
            <>
              <path d={`M${lx - 5} ${cy - 1} q5 5 10 0`} />
              <path d={`M${rx - 5} ${cy - 1} q5 5 10 0`} />
            </>
          ) : (
            <>
              <path d={`M${lx - 4.5} ${cy} h9`} />
              <path d={`M${rx - 4.5} ${cy} h9`} />
            </>
          )}
        </g>
      );
    }
    const r = mood === 'alert' ? 5.6 : 4.6;
    return (
      <g className="avatar__eyes" fill={ink}>
        {robot ? (
          <>
            <rect x={lx - 4} y={cy - 6} width="8" height="12" rx="4" />
            <rect x={rx - 4} y={cy - 6} width="8" height="12" rx="4" />
          </>
        ) : cat ? (
          <>
            <ellipse cx={lx} cy={cy} rx={r - 1.2} ry={r + 0.8} />
            <ellipse cx={rx} cy={cy} rx={r - 1.2} ry={r + 0.8} />
            <circle cx={lx + 1.2} cy={cy - 2.2} r="1.4" fill="#fff" />
            <circle cx={rx + 1.2} cy={cy - 2.2} r="1.4" fill="#fff" />
          </>
        ) : (
          <>
            <ellipse cx={lx} cy={cy} rx={r - 0.6} ry={r} />
            <ellipse cx={rx} cy={cy} rx={r - 0.6} ry={r} />
            <circle cx={lx + 1.5} cy={cy - 1.8} r="1.5" fill="#fff" />
            <circle cx={rx + 1.5} cy={cy - 1.8} r="1.5" fill="#fff" />
          </>
        )}
      </g>
    );
  })();
  const my = cy + (robot ? 11 : 12);
  const mouth = noMouth ? null : cat ? (
    <path d={`M${cx - 6} ${my} q3 3 6 0 q3 3 6 0`} stroke={ink} strokeWidth="2.6" strokeLinecap="round" fill="none" />
  ) : mood === 'curious' ? (
    <ellipse cx={cx} cy={my + 1} rx="3" ry="3.4" fill={ink} />
  ) : mood === 'alert' ? (
    <path d={`M${cx - 5} ${my + 2} h10`} stroke={ink} strokeWidth="3" strokeLinecap="round" />
  ) : mood === 'sleepy' ? (
    <ellipse cx={cx} cy={my + 1} rx="2.6" ry="2" fill={ink} opacity="0.7" />
  ) : (
    <path d={`M${cx - 7} ${my} q7 7 14 0`} stroke={ink} strokeWidth="3.2" strokeLinecap="round" fill="none" />
  );
  return (
    <g className="avatar__face">
      {eyes}
      {mouth}
    </g>
  );
}
