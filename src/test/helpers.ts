import type { AppState, Id, Millis, TaskType } from '../domain/types';
import { createTask, startSession, upsertClient, type CommandResult, type Deps } from '../state/commands';
import { emptyState } from '../state/defaults';
import { reduceAll } from '../state/reducer';

/** Tuesday 2026-11-03, 09:00 local time. */
export const T0: Millis = new Date(2026, 10, 3, 9, 0, 0, 0).getTime();
export const MIN = 60_000;

export class Harness {
  state: AppState = emptyState();
  now: Millis = T0;
  private seq = 0;

  deps = (): Deps => ({ now: this.now, newId: () => `id-${++this.seq}` });

  at(minutes: number): this {
    this.now = T0 + minutes * MIN;
    return this;
  }

  apply<T extends CommandResult>(r: T): T {
    if (!r.ok) throw new Error(r.error);
    this.state = reduceAll(this.state, r.actions);
    return r;
  }

  client(name = 'Kunde A', rate = 100): Id {
    this.apply(upsertClient(this.state, this.deps(), { name, hourlyRate: rate, billableDefault: true, rounding: 'none' }));
    return Object.values(this.state.clients).find((c) => c.name === name)!.id;
  }

  task(type: TaskType = 'deep_work', estimateMin = 90, clientId: Id | null = null): Id {
    return this.apply(createTask(this.state, this.deps(), { title: `Task ${type}`, type, clientId, estimateMin, intention: 'Fertig' })).taskId!;
  }

  start(taskId: Id, timeboxMin = 90): Id {
    return this.apply(startSession(this.state, this.deps(), { taskId, timeboxMin, intention: 'Fertig' })).sessionId!;
  }
}
