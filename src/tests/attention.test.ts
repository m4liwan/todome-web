import { AWAY_SEC, isGoodMoment, MAX_WAIT_FOR_PAUSE_MS, MICRO_PAUSE_SEC, momentFromIdle } from '../domain/companion';
import { currentMoment, setAttentionSample } from '../app/attention';

describe('interruption intelligence', () => {
  afterEach(() => setAttentionSample(null));

  it('reads the input rhythm from the idle seconds', () => {
    expect(momentFromIdle(0)).toBe('typing');
    expect(momentFromIdle(MICRO_PAUSE_SEC - 1)).toBe('typing');
    expect(momentFromIdle(MICRO_PAUSE_SEC)).toBe('micro_pause');
    expect(momentFromIdle(AWAY_SEC - 1)).toBe('micro_pause');
    expect(momentFromIdle(AWAY_SEC)).toBe('away');
  });

  it('holds a visit while typing, at most 3 minutes; never talks to an empty chair', () => {
    expect(isGoodMoment('focus_check', 'typing', 0)).toBe(false);
    expect(isGoodMoment('focus_check', 'typing', MAX_WAIT_FOR_PAUSE_MS)).toBe(true);
    expect(isGoodMoment('hydration', 'micro_pause', 0)).toBe(true);
    expect(isGoodMoment('update', 'away', 60 * 60_000)).toBe(false);
  });

  it('never holds back what belongs to the session or was just asked for', () => {
    for (const kind of ['checkin', 'hello', 'feel', 'motivation'] as const) expect(isGoodMoment(kind, 'typing', 0)).toBe(true);
  });

  it('without a fresh signal (browser, old sample) everything stays as before', () => {
    expect(currentMoment()).toBeNull();
    expect(isGoodMoment('focus_check', null, 0)).toBe(true);
    setAttentionSample(1, Date.now() - 10_000);
    expect(currentMoment()).toBeNull();
    setAttentionSample(1);
    expect(currentMoment()).toBe('typing');
  });
});
