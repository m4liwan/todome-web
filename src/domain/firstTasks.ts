import type { TaskInput } from '../state/commands';

/** At most this many things are collected right after the onboarding. */
export const FIRST_TASKS_MAX = 3;

/**
 * The first one to three things someone writes down after the onboarding,
 * as tasks: trimmed, duplicates and empty lines dropped, the first one marked
 * important so it becomes "Dein nächster Schritt". Low energy or a short
 * focus span gives small blocks.
 */
export function planFirstTasks(lines: readonly string[], opts: { timeboxCapMin: number; micro: boolean }): TaskInput[] {
  const seen = new Set<string>();
  const titles: string[] = [];
  for (const raw of lines) {
    const title = raw.replace(/\s+/g, ' ').trim().slice(0, 120);
    const key = title.toLocaleLowerCase('de');
    if (!title || seen.has(key)) continue;
    seen.add(key);
    titles.push(title);
    if (titles.length === FIRST_TASKS_MAX) break;
  }
  const estimate = Math.max(5, Math.min(opts.micro ? 10 : 25, opts.timeboxCapMin));
  return titles.map((title, i) => ({
    title,
    type: 'admin',
    clientId: null,
    estimateMin: estimate,
    intention: title,
    priority: i === 0 ? 'high' : 'normal',
  }));
}
