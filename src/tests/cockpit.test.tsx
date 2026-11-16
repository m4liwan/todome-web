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
    expect(document.querySelectorAll('.cockpit > * > .panel.enter')).toHaveLength(7);
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
