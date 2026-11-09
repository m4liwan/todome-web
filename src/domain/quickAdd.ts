import { addDays } from '../lib/time';
import type { Client, Id, TaskPriority } from './types';

/**
 * Quick capture: one line becomes a task. Markers count only at the end of
 * the line, so "Folien für morgen vorbereiten" keeps its words, while
 * "Angebot Müller 45m !hoch @Kanzlei morgen" becomes
 * title "Angebot Müller", 45 min, high, client Kanzlei, tomorrow.
 *
 *   45m · 45min · 1h · 1,5h     estimate
 *   !  · !hoch · !!             high priority;  !niedrig  low priority
 *   heute · morgen · übermorgen planned day
 *   @Kunde                      client (unique prefix of an active client's name)
 */
export interface QuickDraft {
  title: string;
  estimateMin?: number;
  priority?: TaskPriority;
  /** Days from today: 0, 1 or 2. */
  dayOffset: 0 | 1 | 2;
  /** The @name as typed (resolved against the clients by resolveClient). */
  clientQuery?: string;
}

const DAYS: Record<string, 0 | 1 | 2> = { heute: 0, morgen: 1, übermorgen: 2, uebermorgen: 2 };
const HIGH = new Set(['!', '!!', '!hoch', '!wichtig']);
const LOW = new Set(['!niedrig', '!später', '!spaeter']);

export function parseQuickAdd(input: string): QuickDraft {
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  const draft: QuickDraft = { title: '', dayOffset: 0 };
  // Markers are read from the end; the title always keeps at least one word.
  while (tokens.length > 1) {
    const raw = tokens[tokens.length - 1]!;
    const t = raw.toLowerCase();
    const min = /^(\d{1,3})(m|min)$/.exec(t);
    const hours = /^(\d{1,2}(?:[.,]\d{1,2})?)(h|std)$/.exec(t);
    if (min && draft.estimateMin === undefined) draft.estimateMin = Number(min[1]);
    else if (hours && draft.estimateMin === undefined) draft.estimateMin = Math.round(parseFloat(hours[1]!.replace(',', '.')) * 60);
    else if (HIGH.has(t) && !draft.priority) draft.priority = 'high';
    else if (LOW.has(t) && !draft.priority) draft.priority = 'low';
    else if (t in DAYS && draft.dayOffset === 0) draft.dayOffset = DAYS[t]!;
    else if (/^@[^@\s]{2,40}$/.test(raw) && !draft.clientQuery) draft.clientQuery = raw.slice(1);
    else break;
    tokens.pop();
  }
  draft.title = tokens.join(' ').slice(0, 200);
  return draft;
}

const norm = (s: string) => s.toLocaleLowerCase('de-DE').replace(/[\s_-]+/g, '');

/** The one active client whose name starts with (or equals) the query; null when none or ambiguous. */
export function resolveClient(query: string | undefined, clients: Record<Id, Client>): Client | null {
  if (!query) return null;
  const q = norm(query);
  const active = Object.values(clients).filter((c) => !c.archived);
  const exact = active.filter((c) => norm(c.name) === q);
  if (exact.length === 1) return exact[0]!;
  const prefix = active.filter((c) => norm(c.name).startsWith(q));
  if (prefix.length > 0) return prefix.length === 1 ? prefix[0]! : null;
  // "@weber" also finds "Kanzlei Weber": the start of any word in the name.
  const word = active.filter((c) => c.name.split(/[\s_-]+/).some((w) => norm(w).startsWith(q)));
  return word.length === 1 ? word[0]! : null;
}

export function plannedDayFor(draft: QuickDraft, today: string): string {
  return draft.dayOffset === 0 ? today : addDays(today, draft.dayOffset);
}

/** Short chips for the live preview while typing ("45 Min", "Wichtig", "Morgen", "@Kanzlei"). */
export function draftChips(draft: QuickDraft): string[] {
  const chips: string[] = [];
  if (draft.estimateMin !== undefined) chips.push(draft.estimateMin >= 60 && draft.estimateMin % 30 === 0 ? `${(draft.estimateMin / 60).toLocaleString('de-DE')} Std` : `${draft.estimateMin} Min`);
  if (draft.priority === 'high') chips.push('Wichtig');
  if (draft.priority === 'low') chips.push('Kann warten');
  if (draft.dayOffset === 1) chips.push('Morgen');
  if (draft.dayOffset === 2) chips.push('Übermorgen');
  if (draft.clientQuery) chips.push(`@${draft.clientQuery}`);
  return chips;
}
