import type { PostHog } from 'posthog-js/dist/module.full.no-external';
import type { Services } from '../app/services';
import type { CompanionMessage } from '../domain/companion';
import { emptyState } from '../state/defaults';
import { connectTelemetry, resetTelemetryForTests } from '../services/telemetry';

vi.mock('../lib/desktop', () => ({
  isCompanionView: false,
  desktop: { isDesktop: true, companionShow: () => undefined, companionHide: () => undefined, focus: () => undefined },
}));

const { deliverCompanion, handleCompanionReply, hideCompanion, isCompanionBusy, responseBucket } = await import('../app/companion');

function telemetry() {
  const events: Array<[string, Record<string, unknown>]> = [];
  const ph = { init: () => undefined, capture: (name: string, props: Record<string, unknown>) => void events.push([name, props]) };
  connectTelemetry(() => true, () => ({}), async () => ph as unknown as PostHog);
  return events;
}

const services = {
  store: { getState: () => emptyState(), dispatch: () => undefined },
  clock: { now: () => Date.now() },
  deps: () => ({ now: Date.now(), newId: () => 'x' }),
  announce: () => undefined,
} as unknown as Services;

const msg = (id: string, kind: CompanionMessage['kind'], ttlMs = 60_000): CompanionMessage => ({ id, kind, title: 'Spike', text: 'Geheimer Text', mood: 'happy', options: [{ id: 'on_track', label: 'Bin dran' }], ttlMs });
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('companion engagement telemetry (opt-in)', () => {
  afterEach(() => {
    vi.useRealTimers();
    resetTelemetryForTests();
  });

  it('buckets the reaction time coarsely', () => {
    expect([5_000, 20_000, 45_000, 120_000, 600_000].map(responseBucket)).toEqual(['lt_10s', 'lt_30s', 'lt_1m', 'lt_5m', 'gte_5m']);
  });

  it('tracks shown, answered, replaced and expired, never the text', async () => {
    const events = telemetry();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.UTC(2026, 10, 9, 9));

    deliverCompanion(services, msg('a', 'focus_check'));
    vi.setSystemTime(Date.UTC(2026, 10, 9, 9, 0, 12));
    handleCompanionReply(services, () => undefined, 'a', 'on_track');

    deliverCompanion(services, msg('b', 'hydration'));
    deliverCompanion(services, msg('c', 'motivation', 5_000));
    vi.setSystemTime(Date.UTC(2026, 10, 9, 9, 1));
    expect(isCompanionBusy(Date.now())).toBe(false);
    await settle();

    expect(events).toEqual([
      ['companion_shown', { kind: 'focus_check', surface: 'window' }],
      ['companion_answered', { kind: 'focus_check', option: 'on_track', response: 'lt_30s' }],
      ['companion_shown', { kind: 'hydration', surface: 'window' }],
      ['companion_unanswered', { kind: 'hydration', reason: 'replaced' }],
      ['companion_shown', { kind: 'motivation', surface: 'window' }],
      ['companion_unanswered', { kind: 'motivation', reason: 'expired' }],
    ]);
    expect(JSON.stringify(events)).not.toContain('Geheimer Text');
  });

  it('never forwards an unexpected option id', async () => {
    const events = telemetry();
    deliverCompanion(services, msg('d', 'focus_check'));
    handleCompanionReply(services, () => undefined, 'd', 'Lena hat <script>');
    hideCompanion('d');
    await settle();
    expect(events.at(-1)).toEqual(['companion_answered', expect.objectContaining({ option: 'other' })]);
  });
});
