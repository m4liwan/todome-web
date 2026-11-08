import type { UserContext } from './userContext';
import type { CompanionProgression } from './companionProgression';
/**
 * ToDoMe domain model.
 *
 * Time is never stored as a mutable counter. Every session is an append-only
 * list of events; durations, status and time entries are projections of that
 * log (see `session.ts`). All timestamps are epoch milliseconds (UTC).
 */

export type Id = string;
export type Millis = number;

// ---------------------------------------------------------------------------
// Master data
// ---------------------------------------------------------------------------

export type Rounding = 'none' | 'six' | 'fifteen';

export interface Client {
  id: Id;
  name: string;
  /** Hourly rate in EUR (net). */
  hourlyRate: number;
  billableDefault: boolean;
  rounding: Rounding;
  archived: boolean;
}

export type TaskType =
  | 'deep_work'
  | 'communication'
  | 'admin'
  | 'acquisition'
  | 'learning'
  | 'exploration'
  | 'other';

export type TaskStatus = 'planned' | 'in_progress' | 'waiting' | 'done' | 'dropped';

/** Drives how often the companion checks in during a session (high = more often). */
export type TaskPriority = 'high' | 'normal' | 'low';

export interface ChecklistItem {
  id: Id;
  label: string;
  doneAt: Millis | null;
}

export interface Task {
  id: Id;
  title: string;
  type: TaskType;
  /** Own name for the kind of work when type is "other" ("Sonstiges…"). */
  typeLabel?: string;
  clientId: Id | null;
  /** User estimate in minutes (before personal estimation factor). */
  estimateMin: number;
  /** "Was ist am Ende fertig?" – definition of done for the next session. */
  intention: string;
  status: TaskStatus;
  priority: TaskPriority;
  billable: boolean;
  checklist: ChecklistItem[];
  notes: string;
  /** Optional planned start; enables the start-delay nudge. */
  plannedStart: Millis | null;
  /** Local calendar day (YYYY-MM-DD) the task is planned for. */
  plannedDay: string;
  createdAt: Millis;
  updatedAt: Millis;
}

// ---------------------------------------------------------------------------
// Sessions & events (append-only)
// ---------------------------------------------------------------------------

export type PauseReason =
  | 'none'
  | 'planned_break'
  | 'client'
  | 'private'
  | 'distraction'
  | 'energy'
  | 'meeting'
  | 'tech';

export type IdleResolution = 'working' | 'break' | 'distracted';

export type SessionOutcome = 'achieved' | 'partial' | 'not_achieved' | 'unconfirmed';

export interface Session {
  id: Id;
  taskId: Id;
  /** Set when this session interrupted another one (session stack). */
  parentSessionId: Id | null;
  createdAt: Millis;
}

interface EventBase<T extends string> {
  id: Id;
  sessionId: Id;
  type: T;
  at: Millis;
}

export type SessionEvent =
  | (EventBase<'started'> & { timeboxMin: number; intention: string })
  | (EventBase<'paused'> & { reason: PauseReason; plannedMin: number | null })
  /** Annotates the currently open pause (reason picked after the instant pause). */
  | (EventBase<'pause_annotated'> & { reason: PauseReason; plannedMin: number | null })
  | EventBase<'resumed'>
  | (EventBase<'interrupted'> & { reason: PauseReason; bySessionId: Id })
  | EventBase<'returned'>
  | (EventBase<'extended'> & { minutes: number })
  | (EventBase<'idle_resolved'> & { from: Millis; to: Millis; resolution: IdleResolution })
  /** Manual time correction: deducts minutes from net time (audit-safe, original stays). */
  | (EventBase<'corrected'> & { deductMin: number; note: string })
  | (EventBase<'snapshot_saved'> & { snapshotId: Id })
  | (EventBase<'stopped'> & { outcome: SessionOutcome });


/** Distributive Omit over the event union (keeps discriminated payloads). */
export type NewSessionEvent = SessionEvent extends infer E
  ? E extends SessionEvent
    ? Omit<E, 'id'>
    : never
  : never;

export interface ContextSnapshot {
  id: Id;
  sessionId: Id;
  createdAt: Millis;
  /** "Ein Satz für dein zukünftiges Ich". */
  parkingNote: string;
  lastDoneItem: string | null;
  nextItem: string | null;
  remainingMin: number;
  /** URLs / file references the user wants reopened. */
  resources: string[];
}

// ---------------------------------------------------------------------------
// Check-ins (prompts) – session prompts and coach prompts
// ---------------------------------------------------------------------------

export type CheckInKind =
  | 'first_step'
  | 'pulse'
  | 'milestone'
  | 'overrun'
  | 'pause_over'
  | 'idle'
  | 'start_delay'
  | 'break_suggestion'
  | 'daily_cap'
  | 'shutdown';

/** From quiet to loud. Web maps them to: badge only / vibrate+card / card+system notification. */
export type Channel = 'ambient' | 'haptic' | 'push';

export interface CheckIn {
  id: Id;
  kind: CheckInKind;
  sessionId: Id | null;
  taskId: Id | null;
  channel: Channel;
  sentAt: Millis;
  answeredAt: Millis | null;
  expiredAt: Millis | null;
  answer: string | null;
  /** Kind-specific data (e.g. idle window, overrun minutes at send time). */
  data: Record<string, number | string | null>;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export type Tone = 'gentle' | 'direct' | 'sporty';
export type ThemePreference = 'system' | 'light' | 'dark';
/** Six free companions (Spike, Mark, Bit, Spark, Kiki, Pixie) and two in Pro (Keimi, Woody). */
export type AvatarId = 'spike' | 'mark' | 'bit' | 'spark' | 'kiki' | 'pixie' | 'keimi' | 'woody';

/** Accent palette of the whole app. */
export type PaletteId = 'lime' | 'rose' | 'ocean' | 'sunset' | 'lavender' | 'neon' | 'pulse' | 'matrix';

/** How the rest screen looks. */
export type StandbyLayout = 'calm' | 'bigclock' | 'drift' | 'breath';

/** How the home screen is arranged. */
export type LayoutId = 'classic' | 'flow' | 'sanctuary' | 'hub';

/** Subtle animated environment behind the glass. */
export type AmbienceId = 'none' | 'rain' | 'clouds' | 'snow' | 'leaves' | 'live';

export interface AppearanceSettings {
  palette: PaletteId;
  ambience: AmbienceId;
  layout: LayoutId;
  standby: StandbyLayout;
  /** Winter magic: off, 1–26 December, or always. */
  xmas: 'off' | 'december' | 'always';
  /** How the screen behaves while a block runs. */
  focusStyle: FocusStyle;
  /** Ambience sound (synthesised), off by default. */
  sound: boolean;
  /** 0 … 1 */
  soundVolume: number;
  /** How the running block shows its progress. */
  timeline: TimelineStyle;
  /**
   * The companion's earned level effects (sparkle, aura, holofoil) and their
   * glow in the app. On by default; off shows the plain companion everywhere.
   */
  companionFx: boolean;
}

/**
 * Focus styles for different kinds of distractibility:
 * breathe (soft: side cards blur and dim), tunnel (medium: side cards leave,
 * a centred glass container), cocoon (strong: only timer, task and a
 * companion dot), micro (ADHD / paralysis: the task in three small bites).
 */
export type FocusStyle = 'breathe' | 'tunnel' | 'cocoon' | 'micro';

/** "Wie tickt dein Kopf am liebsten?" */
export type BrainProfile = 'overload' | 'adhd' | 'procrastination' | 'creative';

export type CardSize = 's' | 'm' | 'l' | 'xl';
/** Pro workspace editor: own order and card sizes per layout. */
export interface Workspace {
  order: string[];
  size: Record<string, CardSize>;
}

/** Progress look of the running block: breathing wave, glass bar or beads. */
export type TimelineStyle = 'wave' | 'bar' | 'beads';

/** Floating mini overlay (desktop only), e.g. for a second monitor. */
export interface OverlaySettings {
  enabled: boolean;
  /** 0.35 … 1 */
  opacity: number;
  glow: boolean;
  avatarSize: 'small' | 'medium' | 'large';
  /** Which modules the floating box shows. */
  modules: OverlayModules;
}

export interface OverlayModules {
  avatar: boolean;
  anchor: boolean;
  progress: boolean;
  media: boolean;
}

/** Media keys for the system player (Windows media session). */
export interface MediaSettings {
  enabled: boolean;
  /** Player on the home screen (header). Off by default since 1.7. */
  inTopbar: boolean;
  /** Settings revision of this block (2 = 1.7 defaults applied once). */
  rev?: number;
}

export interface CompanionSettings {
  enabled: boolean;
  avatar: AvatarId;
  /** Focus visits during a session, base interval in minutes (0 = off). Scaled by task priority. */
  visitIntervalMin: number;
  /** Hydration reminder interval in minutes (0 = off). */
  hydrationIntervalMin: number;
  /** Glasses per day. */
  waterGoal: number;
  motivation: boolean;
  /** Screen edge the desktop companion appears on. */
  position: 'right' | 'left';
  /** Gentle afternoon question: switch to the soft mode for the rest of the day? */
  softCheck: boolean;
}

export interface WeatherLocation {
  name: string;
  latitude: number;
  longitude: number;
}

export interface Settings {
  userName: string;
  /** What ToDoMe is used for; only changes wording (see domain/userContext). */
  userContext: UserContext;
  /** Opt-in: anonymous usage events (PostHog). Off unless the user ticks it. */
  telemetryEnabled: boolean;
  onboarded: boolean;
  /** The companion's guided tour through the interface was shown. */
  tourDone: boolean;
  /** The companion's short intro in the "Begleiter" hub was finished or skipped. */
  companionIntroSeen: boolean;
  theme: ThemePreference;
  tone: Tone;
  /** HH:MM local time. */
  workdayStart: string;
  workdayEnd: string;
  lunchStart: string;
  lunchEnd: string;
  dailyCapMin: number;
  maxPromptsPerHour: number;
  /** Minutes until an unanswered prompt counts as ignored. */
  promptExpiryMin: number;
  /** Continuous focus before a break is suggested. */
  focusBudgetMin: number;
  idleThresholdMin: number;
  /** Manual "Termin läuft / Bitte nicht stören". */
  doNotDisturb: boolean;
  systemNotifications: boolean;
  idleDetection: boolean;
  companion: CompanionSettings;
  location: WeatherLocation | null;
  appearance: AppearanceSettings;
  overlay: OverlaySettings;
  media: MediaSettings;
  /** Brain profile from the onboarding (null = not chosen). */
  brain: BrainProfile | null;
  /** Only the one next step on the home screen; "Danach" stays folded. */
  oneStep: boolean;
  /** Soft UI sounds (432 Hz pads, binaural focus tone). */
  uiSounds: boolean;
  /** A short breathing exercise before a block starts (off by default). */
  breathBeforeStart: boolean;
  /** Pro: own card arrangement per layout. */
  workspace: Partial<Record<LayoutId, Workspace>>;
}

/** Small wellbeing counters behind the companion (water, last visits). */
export interface Wellbeing {
  waterDay: string | null;
  waterCount: number;
  lastWaterAt: Millis | null;
  lastHydrationPromptAt: Millis | null;
  hydrationSnoozedUntil: Millis | null;
  lastVisitAt: Millis | null;
  lastMotivationAt: Millis | null;
  /** Energy 1–10 for the given day (null = not asked yet). */
  energyDay: string | null;
  energyLevel: number | null;
  /** Glasses per day, kept for the weekly look back. */
  waterLog: Record<string, number>;
  /** "Worauf bist du heute stolz?" per day. */
  proud: Record<string, string>;
  /** Energy 1–10 per day, for the gentle energy curve in the look back. */
  energyLog: Record<string, number>;
  /** Days that ended with a calm Feierabend. */
  closedLog: Record<string, boolean>;
  /** Micro routines done per day (ids). No streaks, just a gentle tick. */
  routines: Record<string, string[]>;
  /** Day the afternoon soft-mode question was asked. */
  softCheckDay: string | null;
  /** "Durchatmen" moments per day. */
  breathLog: Record<string, number>;
  /** Thoughts parked per day (they may be released later). */
  parkedLog: Record<string, number>;
  /** "Wie hat sich das angefühlt?" after a block, per session. */
  feelLog: Record<string, { at: Millis; feel: SessionFeel }>;
}

export type SessionFeel = 'smooth' | 'tough' | 'neutral';

/** Gedanken-Parkplatz: a thought that waits, tidy, until you want it. */
export interface Thought {
  id: Id;
  text: string;
  createdAt: Millis;
}

export interface WeatherHour {
  at: Millis;
  temp: number;
  precipProb: number;
  code: number;
}

export interface WeatherSnapshot {
  fetchedAt: Millis;
  locationName: string;
  latitude: number;
  longitude: number;
  current: { temp: number; code: number; isDay: boolean };
  hourly: WeatherHour[];
  today: { min: number; max: number };
}

export interface CoachState {
  /** Last time each coach prompt kind was raised (avoid repetition). */
  lastRaised: Partial<Record<CheckInKind, Millis>>;
  /** Coach prompt kinds the user postponed ("Noch 20 min", "In 15 min"). */
  snoozedUntil: Partial<Record<CheckInKind, Millis>>;
  /** Day (YYYY-MM-DD) the shutdown routine was completed. */
  closedDay: string | null;
  /** Day on which the user came back after Feierabend ("second shift"). */
  secondShiftDay?: string | null;
}

/**
 * Sessions older than 12 months are condensed into one summary per day and
 * task (1.11). Totals and billing stay exact: `billableMin` keeps the sum of
 * the per-session rounded minutes from the time the sessions were recorded.
 */
export interface DaySummary {
  day: string;
  taskId: Id;
  taskTitle: string;
  clientId: Id | null;
  clientName: string;
  billable: boolean;
  netMs: Millis;
  pauseMs: Millis;
  billableMin: number;
  sessions: number;
  interruptions: number;
  achieved: number;
}

export interface AppState {
  schemaVersion: 4;
  clients: Record<Id, Client>;
  tasks: Record<Id, Task>;
  taskOrder: Id[];
  sessions: Record<Id, Session>;
  events: SessionEvent[];
  snapshots: Record<Id, ContextSnapshot>;
  checkIns: Record<Id, CheckIn>;
  coach: CoachState;
  settings: Settings;
  wellbeing: Wellbeing;
  weather: WeatherSnapshot | null;
  thoughts: Thought[];
  /** Condensed old sessions (see DaySummary). */
  archive: DaySummary[];
  /** Companion XP, level, streak and unlocks (see domain/companionProgression). */
  progression: CompanionProgression;
}
