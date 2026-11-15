import { act, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss, { type Rule } from 'postcss';
import { beforeEach, describe, expect, it } from 'vitest';
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
    expect(document.querySelectorAll('.cockpit > * > .panel.enter')).toHaveLength(5);
  });
});

describe('the areas (sub-navigation)', () => {
  // The last area is remembered per device: every test starts fresh.
  beforeEach(() => window.localStorage.clear());

  it('shows one area at a time, Tages-Anker first, the others reachable as tabs', () => {
    render(<Cockpit panels={stubs} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.querySelector('.areas__name')?.textContent)).toEqual(['Tages-Anker', 'Für dich', 'Kopf frei', 'Dein Rhythmus']);
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true');
    const panes = screen.getAllByRole('tabpanel', { hidden: true });
    expect(panes.filter((p) => !p.hasAttribute('inert'))).toHaveLength(1);
    fireEvent.click(tabs[2]!);
    expect(screen.getByRole('tab', { name: 'Kopf frei' }).getAttribute('aria-selected')).toBe('true');
    expect(document.getElementById('area-mind')!.hasAttribute('inert')).toBe(false);
    expect(document.getElementById('area-anchors')!.hasAttribute('inert')).toBe(true);
  });

  it('moves between areas with the arrow keys and wraps around', () => {
    render(<Cockpit panels={stubs} />);
    const first = screen.getByRole('tab', { name: 'Tages-Anker' });
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: 'Dein Rhythmus' }).getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement?.querySelector('.areas__name')?.textContent).toBe('Dein Rhythmus');
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(first.getAttribute('aria-selected')).toBe('true');
  });

  it('can be pointed to an area from outside (the companion tour)', () => {
    render(<Cockpit panels={stubs} />);
    act(() => showArea('mind'));
    expect(screen.getByRole('tab', { name: 'Kopf frei' }).getAttribute('aria-selected')).toBe('true');
  });

  it('shows a small count next to an area name', () => {
    render(<Cockpit panels={stubs} meta={{ anchors: '1/3' }} />);
    expect(screen.getByRole('tab', { name: 'Tages-Anker' }).querySelector('.areas__meta')?.textContent).toBe('1/3');
  });

  it('dims only the cockpit while a block runs, never the other views', () => {
    const offenders: string[] = [];
    postcss.parse(read('styles', 'layout', 'cockpit.css')).walkRules((r: Rule) => {
      for (const sel of r.selectors) if (/is-focusing|\.fs-/.test(sel) && !/\.cockpit/.test(sel)) offenders.push(sel);
    });
    expect(offenders).toEqual([]);
  });
});
