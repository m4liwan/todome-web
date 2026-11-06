import type { Task, TaskType } from './types';

/**
 * Mikro-Schritt-Modus: a task, broken into three small bites, so starting
 * never feels like a wall. Built from the task type and the intention; the
 * first bite is always tiny (two minutes), the last one closes the loop.
 */
const FIRST: Record<TaskType, string> = {
  deep_work: 'Datei öffnen und zwei Minuten nur reinschauen',
  communication: 'Die Nachricht öffnen und den ersten Satz schreiben',
  admin: 'Alle Unterlagen dafür auf den Tisch legen',
  acquisition: 'Kontakt und Anlass in einem Satz notieren',
  learning: 'Material öffnen und die Überschriften überfliegen',
  exploration: 'Drei Fragen notieren, die du klären willst',
  other: 'Alles dafür öffnen und zwei Minuten sichten',
};

const shorten = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export function microBites(task: Pick<Task, 'title' | 'type' | 'intention'>): [string, string, string] {
  const goal = (task.intention || task.title).trim();
  return [FIRST[task.type] ?? 'Alles dafür öffnen und kurz sichten', `Das kleinste sinnvolle Stück: ${shorten(goal)}`, 'Kurz notieren, wo es als Nächstes weitergeht'];
}
