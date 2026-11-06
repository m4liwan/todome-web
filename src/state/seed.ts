import type { AppState, Id, Millis } from '../domain/types';
import { atTimeOfDay, dayKey, HOUR, MIN } from '../lib/time';
import { demoWeather } from '../domain/weather';
import { createTask, startSession, stopSession, upsertClient, type CommandResult, type Deps } from './commands';
import { emptyState } from './defaults';
import { reduceAll } from './reducer';

/**
 * Demo data matching the concept's user journey ("Ein Dienstag mit ToDoMe"):
 * three clients, five tasks for today and a few finished days of history so
 * the estimation factor and reports have data.
 */
export function buildDemoState(now: Millis, newId: () => Id): AppState {
  let state = emptyState();
  state = { ...state, settings: { ...state.settings, userName: 'Lena', userContext: 'work', onboarded: true, location: { name: 'Wetzlar (Beispiel)', latitude: 50.5558, longitude: 8.5049 } } };
  const DAY = 24 * HOUR;

  const apply = <T extends CommandResult>(r: T): T => {
    if (!r.ok) throw new Error(`Seed failed: ${r.error}`);
    state = reduceAll(state, r.actions);
    return r;
  };
  const deps = (at: Millis): Deps => ({ now: at, newId });
  const clientId = (name: string) => Object.values(state.clients).find((c) => c.name === name)?.id ?? null;

  apply(upsertClient(state, deps(now), { name: 'Nordlicht Webshop', hourlyRate: 95, billableDefault: true, rounding: 'fifteen' }));
  apply(upsertClient(state, deps(now), { name: 'Brandt & Söhne', hourlyRate: 95, billableDefault: true, rounding: 'six' }));
  apply(upsertClient(state, deps(now), { name: 'Kanzlei Weber', hourlyRate: 110, billableDefault: false, rounding: 'fifteen' }));
  const A = clientId('Nordlicht Webshop');
  const B = clientId('Brandt & Söhne');
  const C = clientId('Kanzlei Weber');

  // History: three finished deep-work blocks (they ran ~10–25 % long).
  const history: Array<[number, string, number]> = [
    [-3, 'Produktseite Wireframes', 1.1],
    [-2, 'Navigation überarbeiten', 1.25],
    [-1, 'Warenkorb-Flow skizzieren', 1.2],
  ];
  for (const [offset, title, factor] of history) {
    const start = atTimeOfDay(now + offset * DAY, '09:00');
    const t = apply(createTask(state, deps(start - 30 * MIN), {
      title, type: 'deep_work', clientId: A, estimateMin: 90, intention: title,
    }));
    const s = apply(startSession(state, deps(start), { taskId: t.taskId as Id, timeboxMin: 90, intention: title }));
    apply(stopSession(state, deps(start + 90 * factor * MIN), s.sessionId as Id, 'achieved'));
    const comm = apply(createTask(state, deps(start), {
      title: 'Kundenmails', type: 'communication', clientId: B, estimateMin: 25, intention: 'Inbox Brandt leer',
    }));
    const cs = apply(startSession(state, deps(start + 3 * HOUR), { taskId: comm.taskId as Id, timeboxMin: 25, intention: 'Inbox Brandt leer' }));
    apply(stopSession(state, deps(start + 3 * HOUR + 28 * MIN), cs.sessionId as Id, 'achieved'));
  }

  const today = (hhmm: string) => atTimeOfDay(now, hhmm);
  apply(createTask(state, deps(now), {
    title: 'Checkout-Screens gestalten',
    type: 'deep_work',
    clientId: A,
    estimateMin: 90,
    intention: '3 Checkout-Screens in Figma',
    plannedStart: today('08:30'),
    priority: 'high',
    checklist: ['Screen 1: Warenkorb', 'Screen 2: Zahlungsart', 'Fehlerzustände', 'Screen 3: Bestätigung'],
  }));
  apply(createTask(state, deps(now), {
    title: 'Support-Tickets beantworten', type: 'communication', clientId: B, estimateMin: 25, intention: 'Alle offenen Tickets beantwortet',
  }));
  apply(createTask(state, deps(now), {
    title: 'Belege hochladen', type: 'admin', clientId: null, estimateMin: 25, intention: 'Alle Oktober-Belege im Buchhaltungstool',
  }));
  apply(createTask(state, deps(now), {
    title: 'Angebot nachfassen', type: 'acquisition', clientId: C, estimateMin: 30,
    intention: 'Follow-up-Mail an Kanzlei Weber verschickt', plannedStart: today('13:00'), priority: 'high',
  }));
  apply(createTask(state, deps(now), {
    title: 'Styleguide-Update', type: 'deep_work', clientId: A, estimateMin: 60, intention: 'Farben und Typo im Styleguide aktualisiert', priority: 'low',
  }));

  const day = (offset: number) => dayKey(now + offset * DAY);
  state = {
    ...state,
    weather: demoWeather(now),
    wellbeing: {
      ...state.wellbeing,
      waterDay: dayKey(now),
      waterCount: 1,
      lastWaterAt: now,
      energyDay: dayKey(now),
      energyLevel: 6,
      waterLog: { [day(-3)]: 8, [day(-2)]: 6, [day(-1)]: 8, [day(0)]: 1 },
      proud: { [day(-1)]: 'Den Warenkorb-Flow endlich aufs Papier gebracht.' },
      energyLog: { [day(-6)]: 5, [day(-5)]: 4, [day(-3)]: 6, [day(-2)]: 7, [day(-1)]: 6, [day(0)]: 6 },
      closedLog: { [day(-2)]: true, [day(-1)]: true },
      routines: { [day(-2)]: ['screen', 'air'], [day(-1)]: ['breathe'] },
    },
    thoughts: [
      { id: newId(), text: 'Steuerberaterin wegen Quartal anrufen', createdAt: now - 40 * MIN },
      { id: newId(), text: 'Idee: Newsletter mit Projekt-Einblicken', createdAt: now - DAY },
    ],
  };
  return state;
}
