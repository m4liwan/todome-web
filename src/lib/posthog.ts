import type { PostHog } from 'posthog-js/dist/module.full.no-external';

/** Public browser configuration (.env). The CSP only allows the EU ingestion host. */
export const POSTHOG_KEY: string | undefined = import.meta.env.VITE_POSTHOG_KEY || undefined;
export const POSTHOG_HOST: string = import.meta.env.VITE_POSTHOG_HOST || 'https://eu.i.posthog.com';

/**
 * Loads the PostHog bundle on demand. It is never initialised here: only
 * services/telemetry.ts does that, and only after the user's opt-in, with the
 * privacy options. Without a configured key there is no client at all.
 */
export async function loadPostHog(): Promise<PostHog | null> {
  if (!POSTHOG_KEY) {
    if (import.meta.env.DEV) {
      console.warn('[PostHog] VITE_POSTHOG_KEY is missing: telemetry stays off.');
    }
    return null;
  }
  const mod = await import('posthog-js/dist/module.full.no-external');
  return mod.default;
}
