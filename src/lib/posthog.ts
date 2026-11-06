import posthogClient, { type PostHog } from 'posthog-js/dist/module.full.no-external';

const projectToken = import.meta.env.VITE_POSTHOG_KEY;
const host = import.meta.env.VITE_POSTHOG_HOST;

function missingConfiguration(variable: 'VITE_POSTHOG_KEY' | 'VITE_POSTHOG_HOST'): PostHog | null {
  if (import.meta.env.DEV) {
    throw new Error(
      `${variable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${variable} is configured`,
    );
  }
  return null;
}

/** Browser-wide PostHog singleton. Import this client at every analytics call site. */
export const posthog: PostHog | null = !projectToken
  ? missingConfiguration('VITE_POSTHOG_KEY')
  : !host
    ? missingConfiguration('VITE_POSTHOG_HOST')
    : (() => {
        posthogClient.init(projectToken, {
          api_host: host,
          defaults: '2026-08-30',
          logs: {
            serviceName: 'todome-renderer',
            environment: import.meta.env.MODE,
          },
          capture_exceptions: {
            capture_unhandled_errors: true,
            capture_unhandled_rejections: true,
            capture_console_errors: false,
          },
        });
        return posthogClient;
      })();
