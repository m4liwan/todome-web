import { desktop } from './desktop';

/**
 * Renderer errors: always into the local log file of the desktop shell
 * (electron/log.cjs), never anywhere else from here. PostHog error reports
 * (opt-in only) are sent by the caller via services/telemetry.
 */
export function describeError(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack };
  if (typeof error === 'string') return { name: 'Error', message: error };
  try {
    return { name: 'Error', message: JSON.stringify(error) ?? String(error) };
  } catch {
    return { name: 'Error', message: String(error) };
  }
}

export function logError(scope: string, error: unknown, level: 'error' | 'warn' = 'error'): void {
  if (!desktop) return;
  const { name, message, stack } = describeError(error);
  try {
    desktop.log({ level, scope, message: `${name}: ${message}`.slice(0, 1000), stack: stack?.slice(0, 3000) });
  } catch {
    /* the log must never cause the next error */
  }
}

/** Uncaught errors and rejections of this window go into the local log. Returns the uninstall function. */
export function installErrorLog(scope: string): () => void {
  const onError = (e: ErrorEvent) => logError(scope, e.error ?? e.message);
  const onRejection = (e: PromiseRejectionEvent) => logError(scope, e.reason);
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}
