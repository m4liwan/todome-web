import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaInfo } from '../lib/desktop';

const media = vi.hoisted(() => ({ info: null as MediaInfo | null, supported: true }));
vi.mock('../app/media', () => ({ useMedia: () => ({ info: media.info, supported: media.supported, send: () => {} }) }));

import { MediaControl } from '../components/MediaControl';

/** jsdom has no layout: the label's widths come from here (text width vs. the room it gets). */
let widths = { scroll: 0, client: 0 };
let observers: { disconnect: ReturnType<typeof vi.fn> }[] = [];

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, get: () => widths.scroll });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => widths.client });
  observers = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      disconnect = vi.fn();
      constructor() {
        observers.push(this);
      }
      observe() {}
    },
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete (HTMLElement.prototype as { scrollWidth?: number }).scrollWidth;
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
});

const playing = (title: string): MediaInfo => ({ ok: true, supported: true, active: true, playing: true, title, artist: 'Orchester' });
const label = () => document.querySelector<HTMLElement>('.media__label')!;

describe('media control: long titles', () => {
  it('marks an overflowing title and scrolls it exactly past its overflow plus the edge fade', () => {
    media.info = playing('Ein wirklich außergewöhnlich langer Songtitel');
    widths = { scroll: 500, client: 200 };
    render(<MediaControl variant="mini" />);
    expect(label().classList.contains('is-overflowing')).toBe(true);
    // 300 px overflow + 15 % of 200 px for the fade at the right edge.
    expect(label().style.getPropertyValue('--marquee-shift')).toBe('330px');
    expect(label().title).toBe('Ein wirklich außergewöhnlich langer Songtitel · Orchester');
  });

  it('leaves a short title alone: no marquee, nothing to shift', () => {
    media.info = playing('Calm');
    widths = { scroll: 70, client: 184 };
    render(<MediaControl variant="mini" />);
    expect(label().classList.contains('is-overflowing')).toBe(false);
    expect(label().style.getPropertyValue('--marquee-shift')).toBe('0px');
  });

  it('keeps the three transport buttons, and stops measuring when it goes away', () => {
    media.info = playing('Calm');
    const view = render(<MediaControl variant="mini" />);
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Zurück', 'Pause', 'Weiter']);
    expect(observers).toHaveLength(1);
    view.unmount();
    expect(observers[0]!.disconnect).toHaveBeenCalledTimes(1);
  });

  it('steps aside quietly where the media bridge is unavailable', () => {
    media.info = null;
    media.supported = false;
    render(<MediaControl variant="mini" fallback={<span>ohne Medien</span>} />);
    expect(screen.getByText('ohne Medien')).toBeTruthy();
    expect(document.querySelector('.media')).toBeNull();
    media.supported = true;
  });
});
