import { dockInMessage, FLOW_TRUST, planCompanionVisit } from '../domain/companion';
import { focusRhythm, inFocusWindow, windowLabel } from '../domain/rhythm';
import type { AppState, SessionFeel } from '../domain/types';
import { emptyState } from '../state/defaults';

const NOW = new Date(2026, 10, 10, 9, 30).getTime();
const at = (daysAgo: number, hour: number) => new Date(2026, 10, 10 - daysAgo, hour, 5).getTime();

/** Blocks started at `hour`, answered with `feel`. */
function withFeels(entries: Array<[hour: number, feel: SessionFeel, daysAgo?: number]>): AppState {
  const s = emptyState();
  const sessions: AppState['sessions'] = {};
  const feelLog: AppState['wellbeing']['feelLog'] = {};
  entries.forEach(([hour, feel, daysAgo = 1], i) => {
    const id = `s${i}`;
    sessions[id] = { id, taskId: 't', parentSessionId: null, createdAt: at(daysAgo, hour) };
    feelLog[id] = { at: at(daysAgo, hour) + 45 * 60_000, feel };
  });
  return { ...s, sessions, wellbeing: { ...s.wellbeing, feelLog } };
}

const morningPerson = withFeels([
  [9, 'smooth'], [9, 'smooth'], [10, 'smooth'], [10, 'smooth'], [9, 'neutral'],
  [14, 'tough'], [14, 'neutral'], [15, 'tough'], [16, 'tough'], [16, 'neutral'], [15, 'tough'],
]);

describe('rhythm memory', () => {
  it('finds the two hours in which blocks feel smoothest', () => {
    const w = focusRhythm(morningPerson, NOW);
    expect(w).toEqual({ from: 9, to: 11, samples: 5 });
    expect(windowLabel(w!)).toBe('zwischen 9 und 11 Uhr');
    expect(inFocusWindow(w, NOW)).toBe(true);
    expect(inFocusWindow(w, new Date(2026, 10, 10, 11).getTime())).toBe(false);
  });

  it('never invents a pattern: too few answers, no clear lead, or too old', () => {
    expect(focusRhythm(withFeels([[9, 'smooth'], [9, 'smooth'], [10, 'smooth'], [10, 'smooth']]), NOW)).toBeNull();
    const even = withFeels(Array.from({ length: 12 }, (_, i): [number, SessionFeel] => [8 + (i % 6), 'smooth']));
    expect(focusRhythm(even, NOW)).toBeNull();
    const old = withFeels([
      [9, 'smooth', 40], [9, 'smooth', 40], [10, 'smooth', 40], [10, 'smooth', 40], [9, 'neutral', 40],
      [14, 'tough', 40], [14, 'neutral', 40], [15, 'tough', 40], [16, 'tough', 40], [16, 'neutral', 40], [15, 'tough', 40],
    ]);
    expect(focusRhythm(old, NOW)).toBeNull();
  });

  it('mentions the window in the morning, only when there is one', () => {
    const task = { id: 't', title: 'Angebot' };
    expect(dockInMessage('m', '', task, { from: 9, to: 11, samples: 5 }).text).toMatch(/Deine flüssigsten Blöcke liegen meist zwischen 9 und 11 Uhr\.$/);
    expect(dockInMessage('m', '', task, null).text).not.toMatch(/flüssigsten/);
  });

  it('visits less often inside the flow window', () => {
    const base = emptyState();
    const running = (state: AppState): AppState => ({
      ...state,
      settings: { ...base.settings, onboarded: true, doNotDisturb: false, workdayStart: '08:00', workdayEnd: '18:00', companion: { ...base.settings.companion, enabled: true, hydrationIntervalMin: 0 } },
      tasks: { t: { id: 't', title: 'A', type: 'deep_work', clientId: null, estimateMin: 60, intention: '', status: 'in_progress', priority: 'normal', billable: false, checklist: [], notes: '', plannedStart: null, plannedDay: '2026-11-10', createdAt: 1, updatedAt: 1 } },
    });
    const projection = [{ sessionId: 'live', taskId: 't', status: 'running', phaseStartedAt: NOW - 60_000 }] as never;
    const plain = planCompanionVisit(running(emptyState()), projection, NOW);
    const flow = planCompanionVisit(running(morningPerson), projection, NOW);
    expect(plain && flow).toBeTruthy();
    const interval = plain!.dueAt - (NOW - 60_000);
    expect(flow!.dueAt - (NOW - 60_000)).toBeCloseTo(interval * FLOW_TRUST);
  });
});
