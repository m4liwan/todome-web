import type { Millis } from '../domain/types';

export const MIN = 60_000;
export const HOUR = 60 * MIN;

/** Local calendar day as YYYY-MM-DD. */
export function dayKey(at: Millis): string {
  const d = new Date(at);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function startOfDay(at: Millis): Millis {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  date.setDate(date.getDate() + days);
  return dayKey(date.getTime());
}

/** "17:45" on the local day of `ref` → epoch ms. Invalid input falls back to 00:00. */
export function atTimeOfDay(ref: Millis, hhmm: string): Millis {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  const d = new Date(ref);
  d.setHours(match ? Number(match[1]) : 0, match ? Number(match[2]) : 0, 0, 0);
  return d.getTime();
}

export function isWithin(at: Millis, from: Millis, to: Millis): boolean {
  return at >= from && at < to;
}

/** 5400000 → "1:30 h", 1500000 → "25 min". */
export function formatDuration(ms: Millis): string {
  const totalMin = Math.max(0, Math.round(ms / MIN));
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}:${String(m).padStart(2, '0')} h`;
}

/** Decimal hours with German formatting: 6.1 → "6,1 h". */
export function formatHours(ms: Millis, digits = 1): string {
  return `${(ms / HOUR).toLocaleString('de-DE', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} h`;
}

/** Clock face for timers: "1:05:09" / "42:07". Negative values render with a leading "+". */
export function formatClock(ms: Millis): string {
  const sign = ms < 0 ? '+' : '';
  const s = Math.floor(Math.abs(ms) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${sign}${h}:${mm}:${ss}` : `${sign}${mm}:${ss}`;
}

export function formatTime(at: Millis): string {
  return new Date(at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

export function formatDate(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export function formatEuro(value: number): string {
  return value.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}
