import { useEffect } from 'react';
import { quietReason } from '../domain/checkinEngine';
import type { Moment } from '../domain/companion';
import { focusStartKey, pomodoroBreakMessage, pomodoroFocusMessage, pomodoroPhase, pomodoroStep } from '../domain/pomodoro';
import { foregroundSession, projectAll } from '../domain/session';
import { isCompanionView } from '../lib/desktop';
import { trackEvent } from '../services/telemetry';
import { pauseSession } from '../state/commands';
import { currentMoment } from './attention';
import { deliverCompanion } from './companion';
import { focusTimerOn } from './focusTimer';
import { useServices, type Services } from './services';

/**
 * Focus timer (Pomodoro) at work: once a second it looks at the foreground
 * session. A fresh round gets one word from the companion; a full round
 * becomes a real pause (reason "pomodoro") at the next pause of the hands.
 * The end of the break is the existing "Pause vorbei" check-in.
 */

/** May the companion speak right now? Otherwise the app says it quietly. */
function companionCanSpeak(services: Services): boolean {
  const s = services.store.getState();
  return s.settings.companion.enabled && quietReason(services.clock.now(), s.settings) !== 'dnd';
}

/** One step of the focus timer. `seen`: round starts already commented on. */
export function pomodoroTick(services: Services, moment: Moment | null, seen: Set<string>): void {
  const state = services.store.getState();
  if (!state.settings.onboarded || !focusTimerOn(state)) return;
  const now = services.clock.now();
  const fg = foregroundSession(projectAll(state, now));
  if (!fg) return;
  const task = state.tasks[fg.taskId];
  const phase = pomodoroPhase(state, fg, now);

  const key = focusStartKey(fg.sessionId, phase, now);
  if (key && !seen.has(key) && phase.kind === 'focus') {
    seen.add(key);
    if (task && companionCanSpeak(services)) {
      deliverCompanion(services, pomodoroFocusMessage(services.deps().newId(), phase.round, state.settings.pomodoro.focusMin, task.title));
    }
    return;
  }

  const pause = pomodoroStep(phase, moment, state.settings);
  if (!pause) return;
  if (!services.run(pauseSession(state, services.deps(), fg.sessionId, 'pomodoro', pause.plannedMin))) return;
  trackEvent('pomodoro_break_started', { round: pause.round, long: pause.long });
  const message = pomodoroBreakMessage(services.deps().newId(), pause);
  if (companionCanSpeak(services)) deliverCompanion(services, message);
  else services.announce(`${message.title}: ${message.text}`);
}

/** Runs the focus timer while the app window is open. */
export function usePomodoro(): void {
  const services = useServices();
  useEffect(() => {
    if (isCompanionView) return;
    const seen = new Set<string>();
    const id = window.setInterval(() => pomodoroTick(services, currentMoment(), seen), 1000);
    return () => window.clearInterval(id);
  }, [services]);
}
