import type { Services } from '../app/services';
import { deliverCompanion, handleCompanionReply } from '../app/companion';
import { DOCK_LATER, DOCK_START, dockInMessage, dockInTask } from '../domain/companion';
import type { AppState, Task } from '../domain/types';
import { emptyState } from '../state/defaults';
import { parseState } from '../state/store';

const NOW = new Date(2026, 10, 10, 9, 30).getTime();
const task: Task = { id: 't1', title: 'Angebot Müller', type: 'deep_work', clientId: null, estimateMin: 45, intention: '', status: 'planned', priority: 'normal', billable: false, checklist: [], notes: '', plannedStart: null, plannedDay: '2026-11-10', createdAt: 1, updatedAt: 1 };

function morning(patch: Partial<AppState['wellbeing']> = {}, settings: Partial<AppState['settings']> = {}): AppState {
  const s = emptyState();
  return {
    ...s,
    tasks: { t1: task },
    taskOrder: ['t1'],
    settings: { ...s.settings, onboarded: true, doNotDisturb: false, workdayStart: '08:00', workdayEnd: '18:00', lunchStart: '12:30', lunchEnd: '13:15', ...settings, companion: { ...s.settings.companion, enabled: true } },
    wellbeing: { ...s.wellbeing, firstStep: { day: '2026-11-10', taskId: 't1' }, ...patch },
  };
}

describe('morning dock-in', () => {
  it("offers yesterday's first step once, in working hours", () => {
    expect(dockInTask(morning(), [], NOW)?.id).toBe('t1');
    expect(dockInTask(morning({ dockedDay: '2026-11-10' }), [], NOW)).toBeNull();
    expect(dockInTask(morning({ firstStep: { day: '2026-11-09', taskId: 't1' } }), [], NOW)).toBeNull();
    expect(dockInTask(morning(), [], new Date(2026, 10, 10, 7, 0).getTime())).toBeNull();
    expect(dockInTask(morning({}, { doNotDisturb: true }), [], NOW)).toBeNull();
    const done = morning();
    done.tasks = { t1: { ...task, status: 'done' } };
    expect(dockInTask(done, [], NOW)).toBeNull();
  });

  it('greets by name and offers to start right away', () => {
    const m = dockInMessage('m1', 'Lena', task);
    expect(m).toMatchObject({ kind: 'dock_in', taskId: 't1', title: 'Guten Morgen, Lena' });
    expect(m.text).toBe('Gestern hast du dir vorgenommen: „Angebot Müller“. Direkt damit loslegen?');
    expect(m.options.map((o) => o.id)).toEqual([DOCK_START, DOCK_LATER]);
  });

  it('"Loslegen" opens the start dialog of that task; "Erst planen" just steps aside', () => {
    const state = morning();
    const services = { store: { getState: () => state, dispatch: () => undefined }, clock: { now: () => NOW }, deps: () => ({ now: NOW, newId: () => 'x' }), announce: () => undefined } as unknown as Services;
    const open = vi.fn();
    deliverCompanion(services, dockInMessage('a', '', task));
    handleCompanionReply(services, open, 'a', DOCK_START);
    expect(open).toHaveBeenCalledWith({ kind: 'start', taskId: 't1' });
    deliverCompanion(services, dockInMessage('b', '', task));
    handleCompanionReply(services, open, 'b', DOCK_LATER);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('survives storage: broken first-step data is dropped', () => {
    const s = emptyState();
    const good = parseState(JSON.stringify({ ...s, wellbeing: { ...s.wellbeing, firstStep: { day: '2026-11-10', taskId: 't1' } } }))!;
    expect(good.wellbeing.firstStep).toEqual({ day: '2026-11-10', taskId: 't1' });
    const bad = parseState(JSON.stringify({ ...s, wellbeing: { ...s.wellbeing, firstStep: 'kaputt', dockedDay: 5 } }))!;
    expect(bad.wellbeing.firstStep).toBeNull();
    expect(bad.wellbeing.dockedDay).toBeNull();
    expect(parseState(JSON.stringify({ ...s, wellbeing: undefined }))!.wellbeing.firstStep).toBeNull();
  });
});
