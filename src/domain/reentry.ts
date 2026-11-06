import { remainingMs, type SessionProjection } from './session';
import type { Client, ContextSnapshot, Id, Millis, Task } from './types';
import { MIN } from '../lib/time';

/**
 * Re-entry micro-briefing (concept §3.2): five lines that bring the user back
 * to exactly where they stopped.
 */
export interface Briefing {
  sessionId: Id;
  where: string;
  done: string | null;
  note: string | null;
  nextStep: string;
  frame: string;
  awayMs: Millis;
  /** Longer absence → suggest the 2-minute warm-up instead of the full block. */
  suggestWarmUp: boolean;
  resources: string[];
}

export function nextOpenItem(task: Task): string | null {
  return task.checklist.find((i) => i.doneAt === null)?.label ?? null;
}

export function lastDoneItem(task: Task): string | null {
  return (
    [...task.checklist]
      .filter((i) => i.doneAt !== null)
      .sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0))[0]?.label ?? null
  );
}

export function buildSnapshot(
  id: Id,
  projection: SessionProjection,
  task: Task,
  parkingNote: string,
  resources: string[],
  now: Millis,
): ContextSnapshot {
  return {
    id,
    sessionId: projection.sessionId,
    createdAt: now,
    parkingNote: parkingNote.trim(),
    lastDoneItem: lastDoneItem(task),
    nextItem: nextOpenItem(task),
    remainingMin: Math.max(0, Math.round(remainingMs(projection) / MIN)),
    resources,
  };
}

export function buildBriefing(
  projection: SessionProjection,
  task: Task,
  client: Client | null,
  snapshot: ContextSnapshot | null,
  now: Millis,
): Briefing {
  const awaySince =
    projection.currentPause?.since ?? projection.currentInterruption?.since ?? snapshot?.createdAt ?? now;
  const awayMs = Math.max(0, now - awaySince);
  const remainingMin = Math.max(0, Math.round(remainingMs(projection) / MIN));
  const note = snapshot?.parkingNote ? snapshot.parkingNote : null;
  const next = nextOpenItem(task);

  return {
    sessionId: projection.sessionId,
    where: client ? `${client.name} – ${task.title}` : task.title,
    done: lastDoneItem(task),
    note,
    nextStep: next ?? (note ? `Dort weitermachen: ${note}` : 'Kurz orientieren und den nächsten kleinen Schritt festlegen.'),
    frame:
      remainingMin > 0
        ? `${remainingMin} min übrig. Ziel bleibt: ${projection.intention}`
        : `Timebox ist aufgebraucht. Ziel: ${projection.intention}`,
    awayMs,
    suggestWarmUp: awayMs >= 60 * MIN,
    resources: snapshot?.resources ?? [],
  };
}
