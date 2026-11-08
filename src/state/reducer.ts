import { dayKey } from '../lib/time';
import { applyTaskTransition } from '../domain/companionProgression';
import type {
  AppState,
  CheckIn,
  CheckInKind,
  Client,
  ContextSnapshot,
  Id,
  Millis,
  Session,
  SessionEvent,
  Settings,
  Task,
  Thought,
  WeatherSnapshot,
  Wellbeing,
} from '../domain/types';

export type Action =
  | { type: 'client/upsert'; client: Client }
  | { type: 'task/add'; task: Task; position?: 'start' | 'end' }
  | { type: 'task/update'; id: Id; patch: Partial<Omit<Task, 'id' | 'createdAt'>>; at: Millis }
  | { type: 'task/reorder'; order: Id[] }
  | { type: 'session/create'; session: Session }
  | { type: 'session/event'; event: SessionEvent }
  | { type: 'snapshot/save'; snapshot: ContextSnapshot }
  | { type: 'checkin/send'; checkIn: CheckIn }
  | { type: 'checkin/answer'; id: Id; answer: string; at: Millis }
  | { type: 'checkin/expire'; id: Id; at: Millis }
  | { type: 'coach/raised'; kind: CheckInKind; at: Millis }
  | { type: 'coach/snooze'; kind: CheckInKind; until: Millis }
  | { type: 'coach/closeDay'; day: string | null }
  | { type: 'coach/reopenDay'; day: string }
  | { type: 'settings/update'; patch: Partial<Settings> }
  | { type: 'wellbeing/water'; at: Millis; day: string; delta: 1 | -1 }
  | { type: 'wellbeing/mark'; patch: Partial<Wellbeing> }
  | { type: 'weather/set'; weather: WeatherSnapshot | null }
  | { type: 'thought/add'; thought: Thought }
  | { type: 'thought/remove'; id: Id }
  | { type: 'routine/toggle'; day: string; id: string }
  | { type: 'state/replace'; state: AppState };

/** Pure reducer. The event log is append-only: events are never edited or removed. */
export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'client/upsert':
      return { ...state, clients: { ...state.clients, [action.client.id]: action.client } };

    case 'task/add': {
      const order = state.taskOrder.filter((id) => id !== action.task.id);
      return {
        ...state,
        tasks: { ...state.tasks, [action.task.id]: action.task },
        taskOrder: action.position === 'start' ? [action.task.id, ...order] : [...order, action.task.id],
      };
    }

    case 'task/update': {
      const task = state.tasks[action.id];
      if (!task) return state;
      const updated: Task = { ...task, ...action.patch, updatedAt: action.at };
      return {
        ...state,
        tasks: { ...state.tasks, [action.id]: updated },
        // Completion hook: every path that finishes a task or ticks a step lands here.
        progression: applyTaskTransition(state.progression, task, updated, action.at),
      };
    }

    case 'task/reorder': {
      const known = new Set(Object.keys(state.tasks));
      const order = action.order.filter((id) => known.has(id));
      const rest = state.taskOrder.filter((id) => !order.includes(id));
      return { ...state, taskOrder: [...order, ...rest] };
    }

    case 'session/create':
      return { ...state, sessions: { ...state.sessions, [action.session.id]: action.session } };

    case 'session/event':
      if (!state.sessions[action.event.sessionId]) return state;
      return { ...state, events: [...state.events, action.event] };

    case 'snapshot/save':
      return { ...state, snapshots: { ...state.snapshots, [action.snapshot.id]: action.snapshot } };

    case 'checkin/send':
      return { ...state, checkIns: { ...state.checkIns, [action.checkIn.id]: action.checkIn } };

    case 'checkin/answer': {
      const c = state.checkIns[action.id];
      if (!c || c.answeredAt !== null) return state;
      return {
        ...state,
        checkIns: { ...state.checkIns, [action.id]: { ...c, answeredAt: action.at, answer: action.answer } },
      };
    }

    case 'checkin/expire': {
      const c = state.checkIns[action.id];
      if (!c || c.answeredAt !== null || c.expiredAt !== null) return state;
      return { ...state, checkIns: { ...state.checkIns, [action.id]: { ...c, expiredAt: action.at } } };
    }

    case 'coach/raised':
      return {
        ...state,
        coach: { ...state.coach, lastRaised: { ...state.coach.lastRaised, [action.kind]: action.at } },
      };

    case 'coach/snooze': {
      const lastRaised = { ...state.coach.lastRaised };
      delete lastRaised[action.kind];
      return {
        ...state,
        coach: { ...state.coach, lastRaised, snoozedUntil: { ...state.coach.snoozedUntil, [action.kind]: action.until } },
      };
    }

    case 'coach/closeDay':
      return { ...state, coach: { ...state.coach, closedDay: action.day } };

    case 'coach/reopenDay':
      // Second shift: the day opens again. Sessions, wins and the closed log stay untouched.
      if (state.coach.closedDay !== action.day) return state;
      return { ...state, coach: { ...state.coach, closedDay: null, secondShiftDay: action.day } };

    case 'settings/update':
      return { ...state, settings: { ...state.settings, ...action.patch } };

    case 'wellbeing/water': {
      const sameDay = state.wellbeing.waterDay === action.day;
      const count = Math.max(0, (sameDay ? state.wellbeing.waterCount : 0) + action.delta);
      return {
        ...state,
        wellbeing: {
          ...state.wellbeing,
          waterDay: action.day,
          waterCount: count,
          waterLog: { ...state.wellbeing.waterLog, [action.day]: count },
          lastWaterAt: action.delta > 0 ? action.at : state.wellbeing.lastWaterAt,
        },
      };
    }

    case 'wellbeing/mark':
      return { ...state, wellbeing: { ...state.wellbeing, ...action.patch } };

    case 'weather/set':
      return { ...state, weather: action.weather };

    case 'thought/add': {
      // Counted per day for the calm look back (thoughts may be released later).
      const day = dayKey(action.thought.createdAt);
      const parkedLog = { ...state.wellbeing.parkedLog, [day]: (state.wellbeing.parkedLog[day] ?? 0) + 1 };
      return { ...state, thoughts: [action.thought, ...state.thoughts].slice(0, 60), wellbeing: { ...state.wellbeing, parkedLog } };
    }

    case 'thought/remove':
      return { ...state, thoughts: state.thoughts.filter((t) => t.id !== action.id) };

    case 'routine/toggle': {
      const done = state.wellbeing.routines[action.day] ?? [];
      const next = done.includes(action.id) ? done.filter((x) => x !== action.id) : [...done, action.id];
      // Keep only the last 30 days.
      const days = Object.keys(state.wellbeing.routines).sort().slice(-29);
      const routines: Record<string, string[]> = {};
      for (const d of days) if (d !== action.day) routines[d] = state.wellbeing.routines[d] ?? [];
      routines[action.day] = next;
      return { ...state, wellbeing: { ...state.wellbeing, routines } };
    }

    case 'state/replace':
      return action.state;
  }
}

export function reduceAll(state: AppState, actions: readonly Action[]): AppState {
  return actions.reduce(reducer, state);
}
