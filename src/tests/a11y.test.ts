import { focusables, speak, spokenDuration, timerAnnouncement, type TimerSnapshot } from '../lib/a11y';

const snap = (patch: Partial<TimerSnapshot> = {}): TimerSnapshot => ({ sessionId: 's1', status: 'running', remainingMs: 25 * 60_000, task: 'Angebot schreiben', ...patch });

describe('screen reader announcements for a running block', () => {
  it('speaks at the start, at pause and resume, five minutes before and at the planned end', () => {
    expect(timerAnnouncement(null, snap())).toBe('Fokusblock gestartet: Angebot schreiben. 25 Minuten geplant.');
    expect(timerAnnouncement(snap(), snap({ remainingMs: 24 * 60_000 }))).toBeNull();
    expect(timerAnnouncement(snap(), snap({ status: 'paused' }))).toBe('Pause. Die Zeit steht.');
    expect(timerAnnouncement(snap({ status: 'paused' }), snap({ remainingMs: 61 * 60_000 }))).toBe('Weiter geht es. Noch 1 Stunde 1 Minute.');
    expect(timerAnnouncement(snap({ remainingMs: 5 * 60_000 + 1000 }), snap({ remainingMs: 4 * 60_000 }))).toBe('Noch fünf Minuten bis zum geplanten Ende.');
    expect(timerAnnouncement(snap({ remainingMs: 1000 }), snap({ remainingMs: -1000 }))).toMatch(/^Die geplante Zeit ist um\./);
    expect(timerAnnouncement(snap({ remainingMs: -1000 }), snap({ remainingMs: -2000 }))).toBeNull();
    expect(timerAnnouncement(snap(), null)).toBe('Der Fokusblock ist beendet.');
    expect(timerAnnouncement(null, null)).toBeNull();
  });

  it('keeps the calm voice', () => {
    const all = [timerAnnouncement(null, snap()), timerAnnouncement(snap(), snap({ status: 'paused' })), timerAnnouncement(snap({ remainingMs: 1 }), snap({ remainingMs: -1 }))].join(' ');
    expect(all).not.toMatch(/überfällig|Deadline|\bmuss\b|\bmusst\b/i);
  });

  it('says durations in words', () => {
    expect(spokenDuration(40_000)).toBe('40 Sekunden');
    expect(spokenDuration(60_000)).toBe('1 Minute');
    expect(spokenDuration(125 * 60_000)).toBe('2 Stunden 5 Minuten');
  });
});

describe('screen reader live regions', () => {
  it('writes into a hidden polite region without any toast', async () => {
    vi.useFakeTimers();
    speak('Gespeichert.');
    vi.advanceTimersByTime(50);
    const el = document.getElementById('sr-polite')!;
    expect(el.getAttribute('aria-live')).toBe('polite');
    expect(el.className).toBe('sr-only');
    expect(el.textContent).toBe('Gespeichert.');
    speak('Achtung.', 'assertive');
    vi.advanceTimersByTime(50);
    expect(document.getElementById('sr-assertive')!.getAttribute('role')).toBe('alert');
    vi.useRealTimers();
  });
});

describe('focus order helper', () => {
  it('finds tabbable controls and skips hidden or inert ones', () => {
    document.body.innerHTML = `<div id="box">
      <button id="a">A</button><button disabled>B</button><a href="#x" id="c">C</a>
      <div inert><button>D</button></div><span tabindex="-1">E</span><input id="f" />
    </div>`;
    // jsdom has no layout: treat everything as rendered.
    for (const el of document.querySelectorAll<HTMLElement>('#box *')) Object.defineProperty(el, 'offsetParent', { get: () => document.body });
    expect(focusables(document.getElementById('box')!).map((e) => e.id)).toEqual(['a', 'c', 'f']);
  });
});

describe('keyboard mode', () => {
  it('marks keyboard navigation and drops it again on a click', async () => {
    const { installInputModality } = await import('../lib/a11y');
    const off = installInputModality();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(document.documentElement.dataset.input).toBe('keyboard');
    window.dispatchEvent(new Event('pointerdown'));
    expect(document.documentElement.dataset.input).toBe('pointer');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(document.documentElement.dataset.input).toBe('pointer');
    off();
  });
});
