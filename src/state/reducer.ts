import { dayKey } from '../lib/time';
import { applyTaskTransition } from '../domain/companionProgression';
import { anchorTitle, canAddAnchor, normalizeDays } from '../domain/anchors';
import { MAX_EVENTS, sanitizeEvents, sortReminders } from '../domain/calendar';
import type {
  AppState,
  CalendarEvent,
  ReminderId,
  CheckIn,
  CheckInKind,
  Client,
  ContextSnapshot,
  DailyAnchor,
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
  /** Undo of a fresh capture only: a task with sessions is never removed. */
  | { type: 'task/remove'; id: Id }
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
  /** Ignored once there are MAX_ANCHORS or the title is empty. */
  | { type: 'anchor/add'; anchor: DailyAnchor }
  /** New title and/or rhythm; an empty title is ignored. */
  | { type: 'anchor/update'; id: Id; title?: string; days?: number[] }
  /** One place up (-1) or down (1) in the user's order. */
  | { type: 'anchor/move'; id: Id; by: -1 | 1 }
  | { type: 'anchor/remove'; id: Id }
  /** Set (done) or loosen (not done) an anchor for the given day. */
  | { type: 'anchor/mark'; id: Id; day: string; done: boolean }
  /** Adds a calendar date or replaces the one with the same id. */
  | { type: 'event/upsert'; event: CalendarEvent }
  | { type: 'event/remove'; id: Id }
  /** The companion gave these reminders for a date (each only once). */
  | { type: 'event/reminded'; id: Id; reminders: ReminderId[] }
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

    case 'task/remove': {
      if (!state.tasks[action.id] || Object.values(state.sessions).some((s) => s.taskId === action.id)) return state;
      const tasks = { ...state.tasks };
      delete tasks[action.id];
      return { ...state, tasks, taskOrder: state.taskOrder.filter((id) => id !== action.id) };
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

    case 'anchor/add': {
      const title = anchorTitle(action.anchor.title);
      if (!title || !canAddAnchor(state.anchors) || state.anchors.some((a) => a.id === action.anchor.id)) return state;
      return { ...state, anchors: [...state.anchors, { ...action.anchor, title, days: normalizeDays(action.anchor.days) }] };
    }

    case 'anchor/update': {
      const title = action.title === undefined ? undefined : anchorTitle(action.title);
      return {
        ...state,
        anchors: state.anchors.map((a) =>
          a.id === action.id ? { ...a, ...(title ? { title } : {}), ...(action.days ? { days: normalizeDays(action.days) } : {}) } : a,
        ),
      };
    }

    case 'anchor/move': {
      const from = state.anchors.findIndex((a) => a.id === action.id);
      const to = from + action.by;
      if (from < 0 || to < 0 || to >= state.anchors.length) return state;
      const anchors = [...state.anchors];
      const [moved] = anchors.splice(from, 1);
      if (moved) anchors.splice(to, 0, moved);
      return { ...state, anchors };
    }

    case 'anchor/remove':
      return { ...state, anchors: state.anchors.filter((a) => a.id !== action.id) };

    case 'anchor/mark':
      return {
        ...state,
        anchors: state.anchors.map((a) => {
          if (a.id !== action.id) return a;
          if (action.done) return { ...a, lastDoneDay: action.day };
          // Loosening only undoes today's tick; it never reaches into other days.
          return a.lastDoneDay === action.day ? { ...a, lastDoneDay: null } : a;
        }),
      };

    case 'event/upsert': {
      const [clean] = sanitizeEvents([action.event]);
      if (!clean) return state;
      const exists = state.calendar.some((e) => e.id === clean.id);
      if (!exists && state.calendar.length >= MAX_EVENTS) return state;
      return { ...state, calendar: exists ? state.calendar.map((e) => (e.id === clean.id ? clean : e)) : [...state.calendar, clean] };
    }

    case 'event/remove':
      return { ...state, calendar: state.calendar.filter((e) => e.id !== action.id) };

    case 'event/reminded':
      return {
        ...state,
        calendar: state.calendar.map((e) => (e.id === action.id ? { ...e, sent: sortReminders([...new Set([...e.sent, ...action.reminders])]) } : e)),
      };

    case 'state/replace':
      return action.state;
  }
}

export function reduceAll(state: AppState, actions: readonly Action[]): AppState {
  return actions.reduce(reducer, state);
}
