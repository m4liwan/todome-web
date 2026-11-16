import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss, { type Rule } from 'postcss';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AREAS, COCKPIT, Cockpit, showArea } from '../components/Cockpit';

const IDS = ['greet', 'focus', 'hub', 'plan', 'tl', 'anchors', 'water', 'weather', 'times', 'week', 'impulse', 'thoughts', 'routines'];
const stubs = Object.fromEntries(IDS.map((id) => [id, <p key={id}>{id}</p>]));
const read = (...p: string[]) => readFileSync(join(process.cwd(), 'src', ...p), 'utf8');

describe('the focus cockpit', () => {
  it('places all thirteen modules exactly once', () => {
    render(<Cockpit panels={stubs} />);
    for (const id of IDS) expect(document.querySelectorAll(`.panel--${id}`), id).toHaveLength(1);
    expect(document.querySelectorAll('.panel')).toHaveLength(13);
    expect([...Object.values(COCKPIT).flat(), ...AREAS.flatMap((a) => a.panels)].sort()).toEqual([...IDS].sort());
  });

  it('keeps water and the Tages-Anker in plain sight, never behind the area switch', () => {
    render(<Cockpit panels={stubs} />);
    expect(document.querySelector('.cockpit__side .panel--water')).not.toBeNull();
    expect(screen.getByRole('region', { name: 'Tages-Anker' }).querySelector('.panel--anchors')).not.toBeNull();
    expect(AREAS.flatMap((a) => a.panels)).not.toContain('water');
    expect(AREAS.flatMap((a) => a.panels)).not.toContain('anchors');
  });

  it('greets across the full width, above the stage and the side column', () => {
    render(<Cockpit panels={stubs} />);
    expect(document.querySelector('.cockpit__head .panel--greet')).not.toBeNull();
    expect(document.querySelector('.cockpit__stage .panel--greet')).toBeNull();
  });

  it('keeps the targets of the companion tour', () => {
    render(<Cockpit panels={stubs} />);
    expect(document.querySelector('.panel--focus')).not.toBeNull();
    expect(document.querySelector('.panel--thoughts')).not.toBeNull();
    // The other tour targets live inside the modules themselves.
    expect(read('components', 'Greeting.tsx')).toMatch(/energy-chip/);
    expect(read('components', 'HomeExtras.tsx')).toMatch(/home-hub/);
  });

  it('staggers the entrance at most five steps deep', () => {
    render(<Cockpit panels={stubs} />);
    const steps = [...document.querySelectorAll<HTMLElement>('.panel')].map((p) => Number(p.style.getPropertyValue('--i')));
    expect(steps.every((n) => n >= 0 && n <= 5)).toBe(true);
    expect(document.querySelectorAll('.cockpit .panel.enter')).toHaveLength(7);
  });
});

describe('the areas (sub-navigation)', () => {
  // The last area is remembered per device: every test starts fresh.
  beforeEach(() => window.localStorage.clear());

  const trigger = () => document.querySelector<HTMLButtonElement>('.orbit__current')!;

  it('rests as one round pill naming the current area, and unfolds into all of them', () => {
    render(<Cockpit panels={stubs} />);
    expect(trigger().textContent).toContain('Kopf frei');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('.orbit__options')!.hasAttribute('inert')).toBe(true);
    fireEvent.click(trigger());
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Kopf frei', 'Dein Rhythmus', 'Draußen']);
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true');
  });

  it('switches the area, folds back and shows one pane at a time', () => {
    render(<Cockpit panels={stubs} />);
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('tab', { name: 'Dein Rhythmus' }));
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(trigger().textContent).toContain('Dein Rhythmus');
    expect(document.getElementById('area-rhythm')!.hasAttribute('inert')).toBe(false);
    expect(document.getElementById('area-mind')!.hasAttribute('inert')).toBe(true);
    expect(screen.getAllByRole('tabpanel', { hidden: true }).filter((p) => !p.hasAttribute('inert'))).toHaveLength(1);
  });

  it('moves with the arrow keys and folds on Escape', () => {
    render(<Cockpit panels={stubs} />);
    fireEvent.click(trigger());
    const first = screen.getByRole('tab', { name: 'Kopf frei' });
    fireEvent.keyDown(first, { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: 'Draußen' }).getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement?.textContent).toBe('Draußen');
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger());
  });

  it('can be pointed to an area from outside (the companion tour)', () => {
    render(<Cockpit panels={stubs} />);
    act(() => showArea('rhythm'));
    expect(trigger().textContent).toContain('Dein Rhythmus');
  });

  it('counts the Tages-Anker of today next to its title', () => {
    render(<Cockpit panels={stubs} meta={{ anchors: '1/3' }} />);
    expect(screen.getByRole('region', { name: 'Tages-Anker' }).querySelector('.cockpit__meta')?.textContent).toBe('1/3');
  });

  it('dims only the cockpit while a block runs, never the other views', () => {
    const offenders: string[] = [];
    postcss.parse(read('styles', 'layout', 'cockpit.css')).walkRules((r: Rule) => {
      for (const sel of r.selectors) if (/is-focusing|\.fs-/.test(sel) && !/\.cockpit/.test(sel)) offenders.push(sel);
    });
    expect(offenders).toEqual([]);
  });
});

describe('the four rooms', () => {
  beforeEach(() => window.localStorage.clear());
  const ROOMS = ['classic', 'sanctuary', 'hub', 'flow'] as const;

  it('places all thirteen modules exactly once in every room, the main card always on the stage', () => {
    for (const layout of ROOMS) {
      const { unmount } = render(<Cockpit panels={stubs} layout={layout} />);
      for (const id of IDS) expect(document.querySelectorAll(`.panel--${id}`), `${layout}: ${id}`).toHaveLength(1);
      expect(document.querySelector('.cockpit__stage .panel--focus'), layout).not.toBeNull();
      expect(document.querySelector(`.cockpit--${layout}`), layout).not.toBeNull();
      unmount();
    }
  });

  it('gives the companion its own place in every room', () => {
    const place = (layout: (typeof ROOMS)[number]) => {
      const { unmount } = render(<Cockpit panels={stubs} layout={layout} />);
      const hub = document.querySelector('.panel--hub')!;
      const where = hub.parentElement!.className;
      unmount();
      return where;
    };
    expect(place('classic')).toContain('cockpit__side');
    // Sanctuary: a whisper right under the main card.
    expect(place('sanctuary')).toContain('cockpit__stage');
    expect(place('hub')).toContain('cockpit__command');
    expect(place('flow')).toContain('cockpit__stream');
  });

  it('Sanctuary: everything but the main card and the companion waits behind "Wenn du magst"', () => {
    render(<Cockpit panels={stubs} layout="sanctuary" />);
    const stage = document.querySelector('.cockpit__stage')!;
    expect([...stage.querySelectorAll('.panel')].map((p) => p.className.match(/panel--(\w+)/)?.[1])).toEqual(['focus', 'hub']);
    const toggle = screen.getByRole('button', { name: /Wenn du magst/ });
    const body = document.getElementById(toggle.getAttribute('aria-controls')!)!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(body.hasAttribute('inert')).toBe(true);
    for (const id of ['water', 'plan', 'tl', 'anchors', 'thoughts']) expect(body.querySelector(`.panel--${id}`), id).not.toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(body.hasAttribute('inert')).toBe(false);
  });

  it('Sanctuary: the companion tour can still reach an area', () => {
    render(<Cockpit panels={stubs} layout="sanctuary" />);
    act(() => showArea('mind'));
    expect(screen.getByRole('button', { name: /Wenn du magst/ }).getAttribute('aria-expanded')).toBe('true');
  });

  it('Hub: the day comes first, the command room couples companion, water and the times of today', () => {
    render(<Cockpit panels={stubs} layout="hub" />);
    const order = [...document.querySelectorAll('.cockpit > *, .cockpit__fold > *')].map((r) => r.className.match(/cockpit__(\w+)/)?.[1]);
    expect(order.indexOf('day')).toBeLessThan(order.indexOf('stage'));
    const command = document.querySelector('.cockpit__command')!;
    for (const id of ['hub', 'water', 'times']) expect(command.querySelector(`.panel--${id}`), id).not.toBeNull();
    expect(screen.getByRole('region', { name: 'Tages-Anker' })).not.toBeNull();
  });

  it('Flow: one reading lane from the step to what comes next to the companion stream', () => {
    render(<Cockpit panels={stubs} layout="flow" />);
    const lane = [...document.querySelectorAll('.cockpit > *, .cockpit__fold > *')].map((r) => r.className.match(/cockpit__(\w+)/)?.[1]);
    expect(lane.indexOf('stage')).toBeLessThan(lane.indexOf('next'));
    expect(lane.indexOf('next')).toBeLessThan(lane.indexOf('stream'));
    expect(document.querySelector('.cockpit__next .panel--plan')).not.toBeNull();
    expect(document.querySelector('.cockpit__next .panel--water')).not.toBeNull();
    // The companion has the stream to himself.
    expect([...document.querySelectorAll('.cockpit__stream .panel')].map((p) => p.className)).toEqual([expect.stringContaining('panel--hub')]);
  });

  it('switches rooms from the head of Heute', () => {
    const onLayout = vi.fn();
    render(<Cockpit panels={stubs} layout="classic" onLayout={onLayout} />);
    const group = screen.getByRole('radiogroup', { name: 'Aufbau von Heute' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((r) => r.getAttribute('aria-label'))).toEqual(['Classic', 'Sanctuary', 'Hub', 'Flow']);
    expect(radios[0]!.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(radios[3]!);
    expect(onLayout).toHaveBeenCalledWith('flow');
  });

  it('arranges three rooms on top of the Classic base, and the focus styles reach the Sanctuary drawer too', () => {
    const css = read('styles', 'layout', 'cockpit.css');
    for (const layout of ROOMS.filter((r) => r !== 'classic')) expect(css, layout).toMatch(new RegExp(String.raw`\.cockpit--${layout}\b`));
    const quieted: string[] = [];
    postcss.parse(css).walkRules((r: Rule) => {
      if (/\.fs-(breathe|tunnel)/.test(r.selector) && /cockpit__hush/.test(r.selector)) quieted.push(r.selector);
    });
    expect(quieted.length).toBeGreaterThanOrEqual(2);
  });

  it('keeps the first screen of every room in one frame: main card and companion above the fold, the rest after it', () => {
    const above: Record<(typeof ROOMS)[number], string[]> = {
      classic: ['focus', 'hub', 'water', 'plan'],
      sanctuary: ['focus', 'hub'],
      hub: ['tl', 'focus', 'hub', 'water', 'times'],
      flow: ['focus', 'plan', 'water', 'hub'],
    };
    for (const layout of ROOMS) {
      const { unmount } = render(<Cockpit panels={stubs} layout={layout} />);
      const fold = document.querySelector('.cockpit__fold')!;
      expect(fold.parentElement?.classList.contains('cockpit'), layout).toBe(true);
      expect(fold.querySelector('.cockpit__head .panel--greet'), layout).not.toBeNull();
      for (const id of above[layout]) expect(fold.querySelector(`.panel--${id}`), `${layout}: ${id}`).not.toBeNull();
      expect(fold.querySelector('.panel--anchors'), layout).toBeNull();
      unmount();
    }
  });

  it('sizes the first screen to the window, so the edge never cuts a module in half', () => {
    const css = read('styles', 'layout', 'cockpit.css');
    expect(css).toMatch(/\.cockpit__fold\s*\{[^}]*--fold-h:\s*calc\(100svh - var\(--frame-t\) - var\(--frame-b\)/);
    expect(css).toMatch(/\.cockpit__fold\s*\{[^}]*min-height:\s*var\(--fold-h\)/);
  });
});
