import type { AppState, AppearanceSettings, CompanionSettings, MediaSettings, OverlaySettings, Settings, Wellbeing } from '../domain/types';
import { emptyProgression } from '../domain/companionProgression';

export const DEFAULT_COMPANION: CompanionSettings = {
  enabled: true,
  avatar: 'spike',
  visitIntervalMin: 30,
  hydrationIntervalMin: 60,
  waterGoal: 8,
  motivation: true,
  position: 'right',
  softCheck: true,
};

export const DEFAULT_WELLBEING: Wellbeing = {
  waterDay: null,
  waterCount: 0,
  lastWaterAt: null,
  lastHydrationPromptAt: null,
  hydrationSnoozedUntil: null,
  lastVisitAt: null,
  lastMotivationAt: null,
  energyDay: null,
  energyLevel: null,
  waterLog: {},
  proud: {},
  energyLog: {},
  closedLog: {},
  routines: {},
  softCheckDay: null,
  breathLog: {},
  parkedLog: {},
  feelLog: {},
};

export const DEFAULT_APPEARANCE: AppearanceSettings = { palette: 'lime', ambience: 'none', layout: 'hub', standby: 'calm', xmas: 'december', focusStyle: 'breathe', sound: false, soundVolume: 0.5, timeline: 'wave', companionFx: true };

export const DEFAULT_MEDIA: MediaSettings = { enabled: true, inTopbar: false, rev: 2 };

export const DEFAULT_OVERLAY: OverlaySettings = {
  enabled: false,
  opacity: 0.82,
  glow: true,
  avatarSize: 'medium',
  modules: { avatar: true, anchor: true, progress: true, media: true },
};

export const DEFAULT_SETTINGS: Settings = {
  userName: '',
  onboarded: false,
  tourDone: false,
  companionIntroSeen: false,
  quickCapture: 'ctrl_alt_space',
  // New installs follow Windows (light or dark) right from the first frame.
  theme: 'system',
  tone: 'direct',
  // Existing installs and anything unclear: neutral everyday wording.
  userContext: 'allround',
  // GDPR: usage data only with an explicit tick.
  telemetryEnabled: false,
  workdayStart: '08:00',
  workdayEnd: '17:45',
  lunchStart: '12:15',
  lunchEnd: '13:00',
  dailyCapMin: 480,
  maxPromptsPerHour: 3,
  promptExpiryMin: 5,
  focusBudgetMin: 90,
  idleThresholdMin: 10,
  doNotDisturb: false,
  systemNotifications: false,
  idleDetection: false,
  companion: { ...DEFAULT_COMPANION },
  location: null,
  appearance: { ...DEFAULT_APPEARANCE },
  overlay: { ...DEFAULT_OVERLAY },
  media: { ...DEFAULT_MEDIA },
  brain: null,
  oneStep: false,
  uiSounds: true,
  breathBeforeStart: false,
  workspace: {},
};

export function emptyState(): AppState {
  return {
    schemaVersion: 4,
    clients: {},
    tasks: {},
    taskOrder: [],
    sessions: {},
    events: [],
    snapshots: {},
    checkIns: {},
    coach: { lastRaised: {}, snoozedUntil: {}, closedDay: null, secondShiftDay: null },
    settings: { ...DEFAULT_SETTINGS, companion: { ...DEFAULT_COMPANION }, appearance: { ...DEFAULT_APPEARANCE }, overlay: { ...DEFAULT_OVERLAY }, media: { ...DEFAULT_MEDIA } },
    wellbeing: { ...DEFAULT_WELLBEING },
    weather: null,
    thoughts: [],
    archive: [],
    progression: emptyProgression(),
  };
}
