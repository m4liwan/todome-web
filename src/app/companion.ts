import { effectiveTone, energyToday } from '../domain/energy';
import { useEffect, useRef } from 'react';
import {
  canMotivate,
  focusCheckMessage,
  helloMessage,
  hydrationMessage,
  motivationMessage,
  planCompanionVisit,
  shouldOfferSoftCheck,
  softCheckMessage,
  waterToday,
  type CompanionMessage,
  feelMessage,
  FEEL_REPLIES,
  avatarName,
  canOfferUpdate,
  updateReadyMessage,
  UPDATE_RESTART,
} from '../domain/companion';
import { promptFor, type AnswerId } from '../domain/copy';
import { foregroundSession, projectAll } from '../domain/session';
import type { AvatarId, CheckIn, Millis } from '../domain/types';
import { desktop, isCompanionView } from '../lib/desktop';
import { dayKey, MIN } from '../lib/time';
import { pauseSession } from '../state/commands';
import { handleAnswer } from '../state/promptHandlers';
import { modalForFollowUp, type OpenModal } from './modal';
import { promptVarsFor } from './promptVars';
import { useServices, type Services } from './services';
import { resolveTheme } from './theme';

/**
 * Companion delivery. On the desktop the avatar appears in its own transparent
 * window at the screen edge; in a browser it appears inside the app.
 * Replies come back here and are turned into state changes.
 */

export interface InlineCompanion {
  message: CompanionMessage;
  avatar: AvatarId;
  position: 'left' | 'right';
  dismissed: boolean;
}

// --- in-app overlay store (browser fallback) -------------------------------
let inline: InlineCompanion | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
export const inlineCompanion = {
  get: () => inline,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  set(next: InlineCompanion | null) {
    inline = next;
    emit();
  },
};

// Messages currently on screen, so replies can be routed by id.
const active = new Map<string, { message: CompanionMessage; shownAt: Millis }>();

export function isCompanionBusy(now: Millis): boolean {
  for (const [id, { message, shownAt }] of active) {
    if (now - shownAt < message.ttlMs + 2000) return true;
    active.delete(id);
  }
  return false;
}

export function deliverCompanion(services: Services, message: CompanionMessage): void {
  const s = services.store.getState();
  // A new message replaces whatever is showing.
  active.clear();
  active.set(message.id, { message, shownAt: Date.now() });
  const avatar = s.settings.companion.avatar;
  const position = s.settings.companion.position;
  if (desktop && !isCompanionView) {
    desktop.companionShow({ message, avatar, position, theme: resolveTheme(s.settings.theme) });
  } else {
    inlineCompanion.set({ message, avatar, position, dismissed: false });
  }
}

export function hideCompanion(messageId: string): void {
  if (!active.has(messageId)) return;
  active.delete(messageId);
  if (desktop && !isCompanionView) desktop.companionHide(messageId);
  else if (inline?.message.id === messageId) inlineCompanion.set({ ...inline, dismissed: true });
}

/** Say hello now (settings test button, end of onboarding). */
export function companionHello(services: Services): void {
  const s = services.store.getState();
  deliverCompanion(services, helloMessage(services.deps().newId(), s.settings.userName, s.settings.companion.avatar));
}

/** Mirror a session prompt through the companion (desktop, app not focused). */
export function companionForCheckIn(services: Services, checkIn: CheckIn, now: Millis): boolean {
  const s = services.store.getState();
  if (!s.settings.companion.enabled) return false;
  const content = promptFor(checkIn.kind, effectiveTone(s, now), promptVarsFor(s, checkIn, now));
  deliverCompanion(services, {
    id: services.deps().newId(),
    kind: 'checkin',
    checkInId: checkIn.id,
    title: content.title,
    text: content.body,
    mood: checkIn.kind === 'overrun' || checkIn.kind === 'idle' ? 'alert' : checkIn.kind === 'pause_over' || checkIn.kind === 'break_suggestion' ? 'calm' : 'curious',
    options: content.options.map((o) => ({ id: o.id, label: o.label, primary: o.primary })),
    ttlMs: s.settings.promptExpiryMin * MIN,
  });
  return true;
}

/** Celebrate a finished task (at most every 30 minutes). */
export function celebrate(services: Services, taskTitle: string): void {
  const s = services.store.getState();
  const now = services.clock.now();
  if (!canMotivate(s, now)) return;
  services.store.dispatch({ type: 'wellbeing/mark', patch: { lastMotivationAt: now } });
  deliverCompanion(services, motivationMessage(services.deps().newId(), taskTitle, now / MIN));
}

/**
 * After a block: the companion asks how it felt (instead of a plain
 * "well done"). Returns false when the companion is switched off.
 */
export function askHowItFelt(services: Services, sessionId: string, taskTitle: string, achieved: boolean): boolean {
  const s = services.store.getState();
  if (!s.settings.companion.enabled) return false;
  const now = services.clock.now();
  if (achieved) services.store.dispatch({ type: 'wellbeing/mark', patch: { lastMotivationAt: now } });
  deliverCompanion(services, feelMessage(services.deps().newId(), sessionId, taskTitle, achieved));
  return true;
}

export function handleCompanionReply(services: Services, openModal: OpenModal, messageId: string, optionId: string): void {
  const entry = active.get(messageId);
  active.delete(messageId);
  if (!entry) return;
  const { message } = entry;
  const { store } = services;
  const now = services.clock.now();
  const bringToFront = () => desktop?.focus();

  switch (message.kind) {
    case 'focus_check': {
      store.dispatch({ type: 'wellbeing/mark', patch: { lastVisitAt: now } });
      const fg = foregroundSession(projectAll(store.getState(), now));
      if (!fg) return;
      if (optionId === 'drifted') {
        bringToFront();
        openModal({ kind: 'reentry', sessionId: fg.sessionId, mode: 'info' });
      } else if (optionId === 'pause' && fg.status === 'running') {
        if (services.run(pauseSession(store.getState(), services.deps(), fg.sessionId, 'none', null))) {
          bringToFront();
          openModal({ kind: 'pause', sessionId: fg.sessionId });
        }
      }
      return;
    }
    case 'soft_check': {
      if (optionId !== 'soft') return;
      const day = dayKey(now);
      const w = store.getState().wellbeing;
      const level = Math.min(3, energyToday(store.getState(), now) ?? 3);
      store.dispatch({ type: 'wellbeing/mark', patch: { energyDay: day, energyLevel: level, energyLog: { ...w.energyLog, [day]: level } } });
      services.announce('Sanft-Modus für den Rest des Tages. Schön, dass du auf dich hörst.');
      return;
    }
    case 'feel': {
      if (optionId !== 'smooth' && optionId !== 'tough' && optionId !== 'neutral') return;
      const w = store.getState().wellbeing;
      if (message.sessionId) store.dispatch({ type: 'wellbeing/mark', patch: { feelLog: { ...w.feelLog, [message.sessionId]: { at: now, feel: optionId } } } });
      const avatar = store.getState().settings.companion.avatar;
      deliverCompanion(services, { id: services.deps().newId(), kind: 'motivation', title: avatarName(avatar), text: FEEL_REPLIES[optionId], mood: optionId === 'tough' ? 'calm' : 'happy', options: [{ id: 'thanks', label: 'Danke', primary: true }], ttlMs: 10_000 });
      return;
    }
    case 'hydration': {
      if (optionId === 'drank') {
        store.dispatch({ type: 'wellbeing/water', at: now, day: dayKey(now), delta: 1 });
        const s = store.getState();
        services.announce(`Wasser: ${waterToday(s, now)} von ${s.settings.companion.waterGoal} Gläsern.`);
      } else {
        store.dispatch({ type: 'wellbeing/mark', patch: { hydrationSnoozedUntil: now + 15 * MIN, lastHydrationPromptAt: now } });
      }
      return;
    }
    case 'checkin': {
      const live = message.checkInId ? store.getState().checkIns[message.checkInId] : undefined;
      if (!live || live.answeredAt !== null || live.expiredAt !== null) return;
      const outcome = handleAnswer(store.getState(), services.deps(), live, optionId as AnswerId);
      if (services.run(outcome.result) && outcome.followUp) {
        bringToFront();
        openModal(modalForFollowUp(outcome.followUp));
      }
      return;
    }
    case 'update': {
      if (optionId !== UPDATE_RESTART) {
        services.announce('Alles klar. Das Update wird beim nächsten Beenden installiert.');
        return;
      }
      // The main process asks the app to save first, then quits and installs.
      void desktop
        ?.restartAndInstall()
        .then((started) => {
          if (!started) services.announce('Das Update ist gerade nicht bereit. Unter Einstellungen → Über kannst du erneut nachsehen.');
        })
        .catch(() => services.announce('Der Neustart hat nicht geklappt. Das Update wird beim nächsten Beenden installiert.'));
      return;
    }
    default:
      return;
  }
}

/**
 * Plans and delivers visits (focus checks, hydration), routes replies, and
 * removes a mirrored prompt from the screen once it was answered elsewhere.
 */
export function useCompanion(openModal: OpenModal): void {
  const services = useServices();
  const openRef = useRef(openModal);
  openRef.current = openModal;

  useEffect(() => {
    const unsubscribe = desktop?.onCompanionReply((r) => handleCompanionReply(services, openRef.current, r.messageId, r.optionId));
    return () => unsubscribe?.();
  }, [services]);

  useEffect(() => {
    const tick = () => {
      const state = services.store.getState();
      const now = services.clock.now();

      // Mirrored prompt answered in the app (or expired)? Take the bubble away.
      for (const [id, { message }] of active) {
        if (message.kind !== 'checkin' || !message.checkInId) continue;
        const c = state.checkIns[message.checkInId];
        if (!c || c.answeredAt !== null || c.expiredAt !== null) hideCompanion(id);
      }

      if (!state.settings.onboarded || isCompanionBusy(Date.now())) return;
      if (shouldOfferSoftCheck(state, now, energyToday(state, now))) {
        services.store.dispatch({ type: 'wellbeing/mark', patch: { softCheckDay: dayKey(now) } });
        deliverCompanion(services, softCheckMessage(services.deps().newId(), state.settings.userName.trim()));
        return;
      }
      const plan = planCompanionVisit(state, projectAll(state, now), now);
      if (!plan || plan.dueAt > now) return;
      const id = services.deps().newId();
      if (plan.kind === 'focus_check') {
        const fg = foregroundSession(projectAll(state, now));
        const task = fg ? state.tasks[fg.taskId] : undefined;
        if (!task) return;
        services.store.dispatch({ type: 'wellbeing/mark', patch: { lastVisitAt: now } });
        deliverCompanion(services, focusCheckMessage(id, effectiveTone(state, now), task.title, now / MIN));
      } else {
        services.store.dispatch({ type: 'wellbeing/mark', patch: { lastHydrationPromptAt: now, hydrationSnoozedUntil: null } });
        deliverCompanion(services, hydrationMessage(id, waterToday(state, now), state.settings.companion.waterGoal, now / MIN));
      }
    };
    const timer = window.setInterval(tick, 3000);
    return () => window.clearInterval(timer);
  }, [services]);
}

/** How often a waiting update offer looks for a free moment (companion busy, meeting). */
const UPDATE_RETRY_MS = 5000;

/**
 * Update downloaded in the background → the companion offers the restart,
 * once per version. If the companion is busy (an open check-in) or the user
 * is in a meeting, the offer waits for the next free moment instead of
 * pushing a question aside. With the companion off, useUpdateNotice speaks.
 */
export function useUpdateCompanion(): void {
  const services = useServices();

  useEffect(() => {
    if (!desktop || isCompanionView) return;
    const bridge = desktop;
    let alive = true;
    /** Version waiting for a free moment ('' = unknown version), or null. */
    let pending: string | null = null;
    /** Version already offered in this session. */
    let offered: string | null = null;

    const offer = () => {
      if (!alive || pending === null) return;
      const state = services.store.getState();
      // Companion switched off meanwhile: the in-app notice takes over.
      if (!state.settings.companion.enabled) {
        pending = null;
        return;
      }
      if (!canOfferUpdate(state, services.clock.now()) || isCompanionBusy(Date.now())) return;
      deliverCompanion(services, updateReadyMessage(services.deps().newId(), state.settings.companion.avatar, pending || undefined));
      offered = pending;
      pending = null;
    };

    const onReady = (version: string | undefined) => {
      const key = version ?? '';
      if (key === offered || key === pending) return;
      pending = key;
      offer();
    };

    const unsubscribe = bridge.onUpdateReady((r) => onReady(r.version));
    // Downloaded before this window (re)loaded? Then the event is long gone.
    bridge
      .updateState()
      .then((s) => s.status === 'ready' && onReady(s.version))
      .catch(() => undefined);
    const timer = window.setInterval(offer, UPDATE_RETRY_MS);

    return () => {
      alive = false;
      unsubscribe();
      window.clearInterval(timer);
    };
  }, [services]);
}
