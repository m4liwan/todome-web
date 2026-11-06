import { browserStore, classifyStorageError, resetStorageHealth, storageHealth } from '../lib/storage';

describe('storage health', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetStorageHealth();
  });

  it('reports a full storage, keeps the value and recovers on retry', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    const seen: Array<string | null> = [];
    const off = storageHealth.subscribe(() => seen.push(storageHealth.get().problem));
    expect(browserStore.set('todome:test', 'neu')).toBe(false);
    expect(storageHealth.get().problem).toBe('full');
    expect(storageHealth.get().seq).toBe(1);
    expect(storageHealth.retry()).toBe(false);

    spy.mockRestore();
    expect(storageHealth.retry()).toBe(true);
    expect(window.localStorage.getItem('todome:test')).toBe('neu');
    expect(storageHealth.get().problem).toBeNull();
    expect(seen).toEqual(['full', null]);
    off();
  });

  it('tells a locked storage from a full one', () => {
    expect(classifyStorageError(new DOMException('no', 'SecurityError'))).toBe('blocked');
    expect(classifyStorageError({ code: 22 })).toBe('full');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('no', 'SecurityError');
    });
    expect(browserStore.get('todome:test')).toBeNull();
    expect(storageHealth.get().problem).toBe('blocked');
  });
});
