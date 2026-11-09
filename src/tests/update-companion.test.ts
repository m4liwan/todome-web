import { act, renderHook } from '@testing-library/react';
import type { Services } from '../app/services';
import { canOfferUpdate, UPDATE_LATER, UPDATE_RESTART, updateReadyMessage } from '../domain/companion';
import type { CompanionPayload, UpdateReady, UpdateState } from '../lib/desktop';
import { emptyState } from '../state/defaults';
import type { AppState } from '../domain/types';

// A fake desktop bridge: records what the app sends and lets the test fire `todome:update-ready`.
const bridge = vi.hoisted(() => {
  const readyListeners = new Set<(r: UpdateReady) => void>();
  return {
    readyListeners,
    shown: [] as CompanionPayload[],
    state: { status: 'idle', auto: true, current: '1.14.1' } as UpdateState,
    restartAndInstall: vi.fn(async () => true),
    fireReady(r: UpdateReady) {
      readyListeners.forEach((l) => l(r));
    },
  };
});

vi.mock('../lib/desktop', () => ({
  isCompanionView: false,
  desktop: {
    isDesktop: true,
    companionShow: (p: CompanionPayload) => void bridge.shown.push(p),
    companionHide: () => undefined,
    focus: () => undefined,
    updateState: async () => bridge.state,
    restartAndInstall: bridge.restartAndInstall,
    onUpdateReady(callback: (r: UpdateReady) => void) {
      bridge.readyListeners.add(callback);
      return () => bridge.readyListeners.delete(callback);
    },
  },
}));

let services: Services;
vi.mock('../app/services', () => ({ useServices: () => services }));

const { handleCompanionReply, hideCompanion, useUpdateCompanion } = await import('../app/companion');

function ready(patch: Partial<AppState['settings']> = {}, companion: Partial<AppState['settings']['companion']> = {}): AppState {
  const s = emptyState();
  return { ...s, settings: { ...s.settings, onboarded: true, doNotDisturb: false, ...patch, companion: { ...s.settings.companion, enabled: true, ...companion } } };
}

function fakeServices(getState: () => AppState) {
  const announced: string[] = [];
  let n = 0;
  const s = {
    store: { getState, dispatch: () => undefined },
    clock: { now: () => Date.now() },
    deps: () => ({ now: Date.now(), newId: () => `m${++n}` }),
    announce: (m: string) => void announced.push(m),
  };
  return { services: s as unknown as Services, announced };
}

const flush = () => act(async () => {
  await Promise.resolve();
  await Promise.resolve();
});

describe('update offer through the companion', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
    bridge.shown.length = 0;
    bridge.readyListeners.clear();
    bridge.state = { status: 'idle', auto: true, current: '1.14.1' };
    bridge.restartAndInstall.mockClear();
  });
  afterEach(() => {
    for (const p of bridge.shown) hideCompanion(p.message.id);
    vi.useRealTimers();
  });

  it('says it calmly, with a restart button first', () => {
    const m = updateReadyMessage('u1', 'spike', '1.15.0');
    expect(m.kind).toBe('update');
    expect(m.title).toBe('Update auf 1.15.0');
    expect(m.text).toMatch(/^Hey! Ein neues Update ist bereit\. Starte mich kurz neu! 🚀/);
    expect(m.options.map((o) => o.id)).toEqual([UPDATE_RESTART, UPDATE_LATER]);
    expect(m.options[0]!.primary).toBe(true);
  });

  it('never offers during do-not-disturb, before the onboarding or with the companion off', () => {
    const now = Date.now();
    expect(canOfferUpdate(ready(), now)).toBe(true);
    expect(canOfferUpdate(ready({ doNotDisturb: true }), now)).toBe(false);
    expect(canOfferUpdate(ready({ onboarded: false }), now)).toBe(false);
    expect(canOfferUpdate(ready({}, { enabled: false }), now)).toBe(false);
  });

  it('shows the offer once per version when the download is done, and cleans up its listener', async () => {
    services = fakeServices(() => ready()).services;
    const { unmount } = renderHook(() => useUpdateCompanion());
    await flush();
    expect(bridge.readyListeners.size).toBe(1);

    act(() => bridge.fireReady({ version: '1.15.0' }));
    expect(bridge.shown).toHaveLength(1);
    expect(bridge.shown[0]!.message.kind).toBe('update');

    act(() => bridge.fireReady({ version: '1.15.0' }));
    expect(bridge.shown).toHaveLength(1);

    unmount();
    expect(bridge.readyListeners.size).toBe(0);
  });

  it('waits for a free moment instead of pushing aside a meeting', async () => {
    let state = ready({ doNotDisturb: true });
    services = fakeServices(() => state).services;
    renderHook(() => useUpdateCompanion());
    await flush();

    act(() => bridge.fireReady({ version: '1.15.0' }));
    expect(bridge.shown).toHaveLength(0);

    state = ready();
    act(() => vi.advanceTimersByTime(5000));
    expect(bridge.shown).toHaveLength(1);
  });

  it('waits for a pause in typing before it asks for the restart', async () => {
    const { setAttentionSample } = await import('../app/attention');
    services = fakeServices(() => ready()).services;
    renderHook(() => useUpdateCompanion());
    await flush();
    setAttentionSample(0);
    act(() => bridge.fireReady({ version: '1.15.0' }));
    expect(bridge.shown).toHaveLength(0);

    setAttentionSample(8);
    act(() => vi.advanceTimersByTime(5000));
    expect(bridge.shown).toHaveLength(1);
    setAttentionSample(null);
  });

  it('picks up an update that was downloaded before the window loaded', async () => {
    bridge.state = { status: 'ready', auto: true, current: '1.14.1', version: '1.15.0' };
    services = fakeServices(() => ready()).services;
    renderHook(() => useUpdateCompanion());
    await flush();
    expect(bridge.shown).toHaveLength(1);
    expect(bridge.shown[0]!.message.title).toBe('Update auf 1.15.0');
  });

  it('restarts and installs on "Jetzt neu starten", and only says so on "Später"', async () => {
    const fake = fakeServices(() => ready());
    services = fake.services;
    renderHook(() => useUpdateCompanion());
    await flush();

    act(() => bridge.fireReady({ version: '1.15.0' }));
    const first = bridge.shown[0]!.message;
    handleCompanionReply(services, () => undefined, first.id, UPDATE_RESTART);
    expect(bridge.restartAndInstall).toHaveBeenCalledTimes(1);

    act(() => bridge.fireReady({ version: '1.16.0' }));
    const second = bridge.shown[1]!.message;
    handleCompanionReply(services, () => undefined, second.id, UPDATE_LATER);
    expect(bridge.restartAndInstall).toHaveBeenCalledTimes(1);
    expect(fake.announced.at(-1)).toMatch(/beim nächsten Beenden installiert/);
  });
});
