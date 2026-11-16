import { avatarName } from './companion';
import { energyProfile, type Activity } from './energy';
import { foregroundSession, type SessionProjection } from './session';
import type { AppState, Millis, WeatherSnapshot } from './types';
import { describeCode } from './weather';
import { dayKey } from '../lib/time';

/**
 * The companion's room in the Begleiter tab: what the window shows (the time
 * of day, the weather outside) and what he is doing in there. He lives along
 * with you: works quietly while you work, has a tea in your pause, reads
 * after the day is done, sleeps at night. Pure; the room draws it.
 */

export type RoomPhase = 'dawn' | 'day' | 'dusk' | 'night';
export type RoomWeather = 'clear' | 'cloudy' | 'rain' | 'snow';

export function roomPhase(now: Millis): RoomPhase {
  const h = new Date(now).getHours();
  if (h >= 5 && h < 8) return 'dawn';
  if (h >= 8 && h < 17) return 'day';
  if (h >= 17 && h < 21) return 'dusk';
  return 'night';
}

/** The weather outside his window (clear without a forecast). */
export function roomWeather(weather: WeatherSnapshot | null): RoomWeather {
  if (!weather) return 'clear';
  const kind = describeCode(weather.current.code).kind;
  if (kind === 'rain' || kind === 'drizzle' || kind === 'storm') return 'rain';
  if (kind === 'snow') return 'snow';
  if (kind === 'cloudy' || kind === 'fog' || kind === 'partly') return 'cloudy';
  return 'clear';
}

export interface RoomLife {
  activity: Activity;
  /** One calm line about what he is doing, in his room. */
  line: string;
}

/** What he is doing right now, in tune with you. */
export function roomLife(state: AppState, projections: readonly SessionProjection[], now: Millis): RoomLife {
  const name = avatarName(state.settings.companion.avatar);
  const fg = foregroundSession(projections);
  const hour = new Date(now).getHours();
  if (fg?.status === 'running') return { activity: 'writing', line: `${name} arbeitet leise mit dir. Ihr seid zu zweit.` };
  if (fg?.status === 'paused') return { activity: 'tea', line: `${name} macht mit dir Pause und trinkt einen Tee.` };
  if (hour >= 22 || hour < 5) return { activity: 'sleeping', line: `${name} schläft schon. Ganz leise, er träumt von eurem Tag.` };
  if (state.coach.closedDay === dayKey(now)) return { activity: 'reading', line: `Feierabend. ${name} liest ein bisschen und ist stolz auf dich.` };
  if (energyProfile(state, now)?.mode === 'low') return { activity: 'tea', line: `${name} hat euch einen Tee gekocht. Heute machen wir es sanft.` };
  if (hour < 9) return { activity: 'tea', line: `${name} trinkt seinen Morgentee und wartet gemütlich auf dich.` };
  return { activity: 'reading', line: `${name} liest ein wenig und ist da, sobald du ihn brauchst.` };
}
