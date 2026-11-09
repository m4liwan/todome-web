import { pomodoroPhase } from '../domain/pomodoro';
import { foregroundSession, projectAll } from '../domain/session';
import type { AppState, FocusStyle, Millis } from '../domain/types';
import { canUseFeature } from './progression';

/**
 * Focus timer (Pomodoro), app side. The timer is a focus style that opens at
 * companion level 10 (or with Pro). A stored "pomodoro" below that level
 * (e.g. Pro preview switched off) quietly behaves like the breathing focus.
 */
export const focusTimerUnlocked = (state: Pick<AppState, 'progression'>): boolean => canUseFeature(state, 'focus_timer');

/** The focus style that really applies. */
export function effectiveFocusStyle(state: Pick<AppState, 'settings' | 'progression'>): FocusStyle {
  const style = state.settings.appearance.focusStyle;
  return style === 'pomodoro' && !focusTimerUnlocked(state) ? 'breathe' : style;
}

/** The focus timer is chosen and unlocked. */
export const focusTimerOn = (state: Pick<AppState, 'settings' | 'progression'>): boolean => effectiveFocusStyle(state) === 'pomodoro';

/** A focus timer round is running right now (visits, the afternoon check and the update offer wait). */
export function inFocusRound(state: AppState, now: Millis): boolean {
  if (!focusTimerOn(state)) return false;
  const fg = foregroundSession(projectAll(state, now));
  return fg !== null && pomodoroPhase(state, fg, now).kind === 'focus';
}
