import { posthog } from '../lib/posthog';

type Runtime = 'desktop' | 'web';

/**
 * Dedicated PostHog Logs writer. Keep records limited to fixed lifecycle
 * messages and non-user-data attributes added by this integration.
 */
const posthogLogger = {
  info(message: string, attributes?: Record<string, string>): void {
    posthog?.logger.info(message, attributes);
  },
};

export function logApplicationBootstrapped(mode: 'live' | 'demo', runtime: Runtime): void {
  posthogLogger.info('application_bootstrapped', { app_mode: mode, runtime });
}

export function logApplicationFramePainted(runtime: Runtime): void {
  posthogLogger.info('application_frame_painted', { runtime });
}

export function logApplicationDataReset(): void {
  posthogLogger.info('application_data_reset');
}
