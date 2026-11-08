import type { ReactNode, SVGProps } from 'react';
import type { WeatherKind } from '../domain/weather';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 20, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconPlay = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none" />
  </Svg>
);
export const IconPause = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8.5 5.5v13M15.5 5.5v13" strokeWidth={2.4} />
  </Svg>
);
export const IconPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
export const IconClose = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);
export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" strokeWidth={2.2} />
  </Svg>
);
export const IconChevronLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14.5 6l-6 6 6 6" />
  </Svg>
);
export const IconChevronRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9.5 6l6 6-6 6" />
  </Svg>
);
export const IconArrowUpRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 17L17 7M8.5 7H17v8.5" />
  </Svg>
);
export const IconPencil = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 19.5l1-4L15.8 5.2a2 2 0 012.8 0l.2.2a2 2 0 010 2.8L8.5 18.5z" />
  </Svg>
);
export const IconSettings = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 13.5a7.6 7.6 0 000-3l2-1.6-2-3.4-2.4 1a7.5 7.5 0 00-2.6-1.5L14 2.5h-4l-.4 2.5A7.5 7.5 0 007 6.5l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 000 3l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 002.6 1.5l.4 2.5h4l.4-2.5a7.5 7.5 0 002.6-1.5l2.4 1 2-3.4z" />
  </Svg>
);
export const IconSun = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M4.6 4.6L6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" />
  </Svg>
);
export const IconMoon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" />
  </Svg>
);
export const IconBellOff = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 18.5a3 3 0 006 0M18 14V10a6 6 0 00-9.6-4.8M6 9.5V14l-2 3h12M3 3l18 18" />
  </Svg>
);
export const IconBell = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 18.5a3 3 0 006 0M6 14v-4a6 6 0 0112 0v4l2 3H4z" />
  </Svg>
);
export const IconMoveTomorrow = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="15" rx="3" />
    <path d="M3.5 9.5h17M8 3v4M16 3v4M10 15h5M13 12.5l2.5 2.5-2.5 2.5" />
  </Svg>
);
export const IconStop = (p: IconProps) => (
  <Svg {...p}>
    <rect x="6.5" y="6.5" width="11" height="11" rx="2.5" fill="currentColor" stroke="none" />
  </Svg>
);
export const IconSwap = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 4L3.5 7.5 7 11M3.5 7.5H17M17 13l3.5 3.5L17 20M20.5 16.5H7" />
  </Svg>
);
export const IconHelp = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5a2.5 2.5 0 114 2c-.9.6-1.5 1.1-1.5 2.2M12 17h.01" />
  </Svg>
);
export const IconLocation = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 21s7-6 7-11.5a7 7 0 00-14 0C5 15 12 21 12 21z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </Svg>
);
export const IconMinus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12h14" />
  </Svg>
);

export function WeatherIcon({ kind, size = 28, isDay = true }: { kind: WeatherKind; size?: number; isDay?: boolean }) {
  const sun = isDay ? (
    <g>
      <circle cx="9" cy="9" r="3.4" fill="currentColor" stroke="none" opacity="0.9" />
      <path d="M9 2.8v1.2M9 14v1.2M2.8 9h1.2M14 9h1.2M4.6 4.6l.9.9M12.5 12.5l.9.9M4.6 13.4l.9-.9M12.5 5.5l.9-.9" />
    </g>
  ) : (
    <path d="M12.5 11.5A5 5 0 016.5 5a5 5 0 106 6.5z" fill="currentColor" stroke="none" opacity="0.9" />
  );
  const cloud = <path d="M7.5 19h9.5a4 4 0 00.4-8A5.5 5.5 0 007 12a3.5 3.5 0 00.5 7z" fill="var(--surface-solid)" />;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" aria-hidden="true">
      {(kind === 'clear' || kind === 'partly') && sun}
      {kind !== 'clear' && cloud}
      {(kind === 'rain' || kind === 'drizzle' || kind === 'storm') && <path d="M9 21l-.6 1.4M13 21l-.6 1.4M17 21l-.6 1.4" />}
      {kind === 'snow' && <path d="M9 21.5h.01M13 22h.01M17 21.5h.01" strokeWidth={2.6} />}
      {kind === 'fog' && <path d="M5 21.5h14" />}
      {kind === 'storm' && <path d="M12.5 13.5L11 16.5h2.5L12 19.5" />}
    </svg>
  );
}

export const IconSkipNext = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6.5v11l8.5-5.5z" fill="currentColor" stroke="none" />
    <path d="M17.5 6v12" strokeWidth={2.2} />
  </Svg>
);

export const IconSkipPrev = (p: IconProps) => (
  <Svg {...p}>
    <path d="M18 6.5v11l-8.5-5.5z" fill="currentColor" stroke="none" />
    <path d="M6.5 6v12" strokeWidth={2.2} />
  </Svg>
);

export const IconPauseFilled = (p: IconProps) => (
  <Svg {...p}>
    <rect x="6.5" y="5.5" width="4" height="13" rx="1.2" fill="currentColor" stroke="none" />
    <rect x="13.5" y="5.5" width="4" height="13" rx="1.2" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconMusic = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 18V6l10-2v12" />
    <circle cx="6.5" cy="18" r="2.5" />
    <circle cx="16.5" cy="16" r="2.5" />
  </Svg>
);

export const IconLock = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="10.5" width="14" height="10" rx="3" />
    <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
  </Svg>
);

export const IconChat = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5.5 17.5 4 21l4.2-2.1A8.6 8.6 0 0 0 12 19.7c4.7 0 8.5-3.3 8.5-7.4S16.7 5 12 5 3.5 8.2 3.5 12.3c0 1.9.7 3.7 2 5.2Z" />
  </Svg>
);

export const IconFlame = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 21c-3.6 0-6-2.4-6-5.8 0-3.1 2.1-5 3.4-7.2.4 1.6 1.2 2.6 2.2 3.1C11.4 7.6 12.6 5 15 3c-.2 3 1 4.6 2.2 6.3 1 1.5 1.8 3 1.8 5.1C19 18.2 16 21 12 21Z" />
    <path d="M12 21c-1.5 0-2.6-1-2.6-2.5 0-1.6 1.3-2.5 2.1-3.8.9 1.1 3.1 2 3.1 3.9 0 1.4-1.1 2.4-2.6 2.4Z" />
  </Svg>
);

export const IconSnowflake = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" />
    <path d="M9.5 4.5 12 6.5l2.5-2M9.5 19.5 12 17.5l2.5 2M4.6 10.4 7.6 9 7.1 5.9M19.4 13.6 16.4 15l.5 3.1M4.6 13.6 7.6 15l-.5 3.1M19.4 10.4 16.4 9l.5-3.1" />
  </Svg>
);

export const IconSparkle = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.5c.6 3.9 2.6 5.9 6.5 6.5-3.9.6-5.9 2.6-6.5 6.5-.6-3.9-2.6-5.9-6.5-6.5 3.9-.6 5.9-2.6 6.5-6.5Z" />
    <path d="M18.5 15.5c.2 1.4 1 2.1 2.3 2.3-1.3.2-2.1.9-2.3 2.3-.2-1.4-1-2.1-2.3-2.3 1.3-.2 2.1-.9 2.3-2.3Z" />
  </Svg>
);
