import type { Id } from '../domain/types';
import type { FollowUp } from '../state/promptHandlers';
import type { SettingsTab } from '../components/dialogs/SettingsDialog';

/** Which dialog is open. Exactly one at a time keeps focus handling simple. */
export type Modal =
  | { kind: 'start'; taskId: Id }
  | { kind: 'task'; taskId: Id | null }
  | { kind: 'pause'; sessionId: Id }
  | { kind: 'interrupt'; sessionId: Id }
  | { kind: 'reentry'; sessionId: Id; mode: 'resume' | 'return' | 'info' }
  | { kind: 'stuck'; sessionId: Id }
  | { kind: 'end_check'; sessionId: Id }
  | { kind: 're_estimate'; sessionId: Id }
  | { kind: 'correct_time'; sessionId: Id }
  | { kind: 'sharpen_dod'; sessionId: Id }
  | { kind: 'shutdown' }
  | { kind: 'energy' }
  | { kind: 'weather' }
  /** Right after the onboarding: the companion collects the first tasks. */
  | { kind: 'first_tasks' }
  | { kind: 'settings'; tab?: SettingsTab };

export type OpenModal = (modal: Modal | null) => void;

export function modalForFollowUp(f: FollowUp): Modal {
  switch (f.kind) {
    case 'pause_details':
      return { kind: 'pause', sessionId: f.sessionId };
    case 'reentry':
      return { kind: 'reentry', sessionId: f.sessionId, mode: f.mode };
    case 'shutdown':
      return { kind: 'shutdown' };
    default:
      return { kind: f.kind, sessionId: f.sessionId };
  }
}
