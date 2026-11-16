import type { CompanionMessage } from './companion';
import type { CalendarEvent, CalendarKind, Id, Millis, ReminderId } from './types';
import { addDays, atTimeOfDay, dayKey, HOUR, MIN } from '../lib/time';

/**
 * The calendar: appointments, exams and private dates, each with gentle
 * reminders from the companion ("3 Tage vorher", "1 Tag vorher", hours
 * before). Pure logic; the companion delivers (app/companion.ts).
 */

export const EVENT_TITLE_MAX = 80;
export const MAX_EVENTS = 400;

/** The kinds of dates, as life brings them. Each has its own tone in the calendar. */
export const CALENDAR_KINDS: ReadonlyArray<{ id: CalendarKind; label: string }> = [
  { id: 'appointment', label: 'Termin' },
  { id: 'exam', label: 'Prüfung / Klausur' },
  { id: 'meeting', label: 'Meeting' },
  { id: 'deadline', label: 'Abgabe' },
  { id: 'focus', label: 'Fokus-Block' },
  { id: 'private', label: 'Privat / Arzt' },
  { id: 'birthday', label: 'Geburtstag' },
  { id: 'other', label: 'Sonstiges' },
];
export const kindLabel = (kind: CalendarKind) => CALENDAR_KINDS.find((k) => k.id === kind)?.label ?? 'Sonstiges';

/** The first calendar knew four kinds; they map to their closest successor. */
const LEGACY_KINDS: Record<string, CalendarKind> = { work: 'appointment', study: 'exam' };

/** Earliest first: how they are offered and stored. */
export const REMINDERS: ReadonlyArray<{ id: ReminderId; label: string }> = [
  { id: '3d', label: '3 Tage vorher' },
  { id: '1d', label: '1 Tag vorher' },
  { id: '3h', label: '3 Stunden vorher' },
  { id: '1h', label: '1 Stunde vorher' },
];
const REMINDER_IDS = REMINDERS.map((r) => r.id);
const KIND_IDS = CALENDAR_KINDS.map((k) => k.id);

/** All-day dates count from nine in the morning. */
export const ALL_DAY_AT = '09:00';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const eventTitle = (raw: string) => raw.replace(/\s+/g, ' ').trim().slice(0, EVENT_TITLE_MAX);

/** The moment the date begins (local time). */
export function eventAt(e: Pick<CalendarEvent, 'day' | 'time'>): Millis {
  const [y, m, d] = e.day.split('-').map(Number);
  const noon = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12).getTime();
  return atTimeOfDay(noon, e.time ?? ALL_DAY_AT);
}

/** When a reminder is due: days count from the morning (9:00) of that day, hours from the date itself. */
export function reminderAt(e: Pick<CalendarEvent, 'day' | 'time'>, r: ReminderId): Millis {
  const at = eventAt(e);
  if (r === '3h') return at - 3 * HOUR;
  if (r === '1h') return at - HOUR;
  const day = addDays(e.day, r === '3d' ? -3 : -1);
  const [y, m, d] = day.split('-').map(Number);
  // Never later than the date minus the full span (an early meeting the day after).
  return Math.min(atTimeOfDay(new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12).getTime(), ALL_DAY_AT), at - (r === '3d' ? 48 : 12) * HOUR);
}

export const sortReminders = (ids: readonly ReminderId[]): ReminderId[] => REMINDER_IDS.filter((r) => ids.includes(r));

/** Keeps only sound dates (one broken entry never costs the rest). */
export function sanitizeEvents(raw: unknown): CalendarEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: CalendarEvent[] = [];
  const seen = new Set<string>();
  for (const item of raw as unknown[]) {
    if (out.length >= MAX_EVENTS) break;
    if (typeof item !== 'object' || item === null) continue;
    const e = item as Record<string, unknown>;
    const title = typeof e.title === 'string' ? eventTitle(e.title) : '';
    if (typeof e.id !== 'string' || !e.id || seen.has(e.id) || !title) continue;
    if (typeof e.day !== 'string' || !DAY_RE.test(e.day)) continue;
    seen.add(e.id);
    const ids = (v: unknown) => (Array.isArray(v) ? sortReminders(v.filter((r): r is ReminderId => REMINDER_IDS.includes(r as ReminderId))) : []);
    out.push({
      id: e.id,
      title,
      kind: KIND_IDS.includes(e.kind as CalendarKind) ? (e.kind as CalendarKind) : (LEGACY_KINDS[String(e.kind)] ?? 'other'),
      day: e.day,
      time: typeof e.time === 'string' && TIME_RE.test(e.time) ? e.time : null,
      remind: ids(e.remind),
      sent: ids(e.sent),
      createdAt: typeof e.createdAt === 'number' && Number.isFinite(e.createdAt) ? e.createdAt : 0,
    });
  }
  return out;
}

/** In time order (all-day dates first on their day). */
export function sortEvents(events: readonly CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((a, b) => (a.day === b.day ? (a.time ?? '').localeCompare(b.time ?? '') : a.day.localeCompare(b.day)));
}

export const eventsOn = (events: readonly CalendarEvent[], day: string) => sortEvents(events.filter((e) => e.day === day));

/** What comes next, from today on (for the mini calendar). */
export function upcomingEvents(events: readonly CalendarEvent[], now: Millis, limit = 3): CalendarEvent[] {
  return sortEvents(events.filter((e) => eventAt(e) + (e.time ? HOUR : 15 * HOUR) > now)).slice(0, limit);
}

/**
 * The reminder the companion should give now: the latest one that is due
 * and not yet given, while the date still lies ahead. Earlier ones that were
 * missed (the app was closed) are marked as given with it, so it speaks once.
 */
export function dueReminder(events: readonly CalendarEvent[], now: Millis): { event: CalendarEvent; reminder: ReminderId; covers: ReminderId[] } | null {
  let best: { event: CalendarEvent; reminder: ReminderId; covers: ReminderId[]; at: Millis } | null = null;
  for (const e of events) {
    if (eventAt(e) <= now) continue;
    const due = e.remind.filter((r) => !e.sent.includes(r) && reminderAt(e, r) <= now);
    if (!due.length) continue;
    const reminder = due[due.length - 1]!;
    const at = reminderAt(e, reminder);
    if (!best || at < best.at) best = { event: e, reminder, covers: due, at };
  }
  return best && { event: best.event, reminder: best.reminder, covers: best.covers };
}

/** "Heute", "Morgen", "Übermorgen", "In 3 Tagen" (calendar days). */
export function relativeDay(day: string, now: Millis): string {
  const today = dayKey(now);
  if (day === today) return 'Heute';
  if (day === addDays(today, 1)) return 'Morgen';
  if (day === addDays(today, 2)) return 'Übermorgen';
  for (let n = 3; n <= 14; n++) if (day === addDays(today, n)) return `In ${n} Tagen`;
  return new Date(`${day}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
}

const KIND_WORDS: Record<CalendarKind, (soon: boolean) => string> = {
  appointment: (soon) => (soon ? 'Atme kurz durch und schau, was du dafür brauchst. Du bist gut vorbereitet.' : 'Du hast genug Zeit. Ein kleiner Schritt zur Vorbereitung reicht heute völlig.'),
  exam: (soon) => (soon ? 'Du hast gelernt, was du lernen konntest. Vertrau dir. Ich drück dir die Daumen.' : 'Du musst nicht alles auf einmal. Heute ein kleines Stück wiederholen genügt.'),
  meeting: (soon) => (soon ? 'Ein Glas Wasser, ein Blick auf deine Notizen, und los. Du machst das gut.' : 'Wenn du magst, notier dir heute schon eine Frage dafür. Mehr braucht es nicht.'),
  deadline: (soon) => (soon ? 'Fertig ist besser als perfekt. 80 % reichen, versprochen.' : 'Ein kleiner Schritt heute nimmt dem Tag den Druck. Den Rest teilen wir uns auf.'),
  focus: (soon) => (soon ? 'Gleich gehört die Zeit dir und deiner Sache. Ich halte dir den Rücken frei.' : 'Dein Fokus-Block steht. Schön, dass du dir Zeit für dich reservierst.'),
  private: (soon) => (soon ? 'Schön, dass du dir Zeit dafür nimmst.' : 'Nur damit es dir nicht durchrutscht. Ganz ohne Druck.'),
  birthday: (soon) => (soon ? 'Ein paar liebe Worte reichen völlig. Das wird schön.' : 'Noch genug Zeit für eine kleine Idee oder einen Gruß.'),
  other: (soon) => (soon ? 'Nimm dir einen ruhigen Moment, bevor es losgeht.' : 'Nur ein leiser Hinweis, damit nichts drängelt.'),
};

/** The companion's calm reminder. */
export function reminderMessage(id: Id, e: CalendarEvent, reminder: ReminderId, now: Millis): CompanionMessage {
  const soon = reminder === '3h' || reminder === '1h';
  const when = `${relativeDay(e.day, now)}${e.time ? ` um ${e.time}` : ''}`;
  return {
    id,
    kind: 'reminder',
    eventId: e.id,
    title: soon ? 'Gleich ist es so weit' : 'Ein Blick nach vorn',
    text: `${when}: „${e.title}“. ${KIND_WORDS[e.kind](soon)}`,
    mood: soon ? 'alert' : 'calm',
    options: [
      { id: 'ok', label: 'Danke, ich hab’s im Blick', primary: true },
      { id: 'open', label: 'Kalender öffnen' },
    ],
    ttlMs: 3 * MIN,
  };
}

/**
 * The companion's words above the horizon: what the coming days hold, in
 * one calm breath. Never a count against you; an empty horizon is good news.
 */
export function horizonLine(events: readonly CalendarEvent[], now: Millis, name: string): string {
  const week = upcomingEvents(events, now, 50).filter((e) => e.day <= addDays(dayKey(now), 6));
  const next = upcomingEvents(events, now, 1)[0];
  if (!next) return `Dein Horizont ist frei. Wenn etwas ansteht, trag es ein. ${name} behält es für dich im Blick.`;
  const rel = relativeDay(next.day, now);
  const day = /^(Heute|Morgen|Übermorgen|In )/.test(rel) ? rel.charAt(0).toLowerCase() + rel.slice(1) : `am ${rel}`;
  const when = `${day}${next.time ? ` um ${next.time}` : ''}`;
  const lead = week.length > 1 ? `In den nächsten sieben Tagen stehen ${week.length} Dinge an, eins nach dem anderen.` : week.length === 1 ? 'Diese Woche steht genau eine Sache an.' : 'Diese Woche ist ruhig.';
  return `${lead} Als Nächstes: „${next.title}“, ${when}. ${name} erinnert dich rechtzeitig.`;
}
