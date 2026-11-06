import type { Channel } from '../domain/types';
import { desktop } from './desktop';

/**
 * Web mapping of the concept's channels:
 * - ambient: only the in-app card / tab title
 * - haptic:  vibration (mobile) + in-app card
 * - push:    in-app card + system notification when the tab is in the background
 *
 * Action buttons on system notifications require a service worker; the
 * in-app card always carries the one-tap answers.
 */
export function notify(channel: Channel, title: string, body: string, tag: string, systemEnabled: boolean): void {
  if (channel !== 'ambient') {
    try {
      navigator.vibrate?.(channel === 'push' ? [80, 60, 80] : [60]);
    } catch {
      /* not supported */
    }
  }
  if (channel !== 'push' || !systemEnabled) return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible' && document.hasFocus()) return;
  try {
    const n = new Notification(title, { body, tag, silent: false });
    n.onclick = () => {
      if (desktop) desktop.focus();
      else window.focus();
      n.close();
    };
  } catch {
    /* some browsers only allow notifications via service worker */
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (desktop) return true; // granted by the desktop shell
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

export const idleDetectionSupported = (): boolean => desktop !== null || (typeof window !== 'undefined' && 'IdleDetector' in window);

export async function requestIdlePermission(): Promise<boolean> {
  if (desktop) return true; // the OS idle time needs no permission
  try {
    return (await window.IdleDetector?.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}
