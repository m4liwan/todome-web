import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss, { type Rule } from 'postcss';
import { describe, expect, it } from 'vitest';
import { COCKPIT, Cockpit } from '../components/Cockpit';

const IDS = ['greet', 'focus', 'hub', 'plan', 'tl', 'water', 'weather', 'times', 'week', 'impulse', 'thoughts', 'routines'];
const stubs = Object.fromEntries(IDS.map((id) => [id, <p key={id}>{id}</p>]));
const read = (...p: string[]) => readFileSync(join(process.cwd(), 'src', ...p), 'utf8');

describe('the focus cockpit', () => {
  it('places all twelve modules exactly once', () => {
    render(<Cockpit panels={stubs} />);
    for (const id of IDS) expect(document.querySelectorAll(`.panel--${id}`), id).toHaveLength(1);
    expect(document.querySelectorAll('.panel')).toHaveLength(12);
    expect(Object.values(COCKPIT).flat().sort()).toEqual([...IDS].sort());
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
    expect(document.querySelectorAll('.panel.enter')).toHaveLength(12);
  });

  it('labels the two bands', () => {
    render(<Cockpit panels={stubs} />);
    expect(screen.getByRole('region', { name: 'Für dich' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Kopf frei' })).toBeTruthy();
  });

  it('dims only the cockpit while a block runs, never the other views', () => {
    const offenders: string[] = [];
    postcss.parse(read('styles', 'layout', 'cockpit.css')).walkRules((r: Rule) => {
      for (const sel of r.selectors) if (/is-focusing|\.fs-/.test(sel) && !/\.cockpit/.test(sel)) offenders.push(sel);
    });
    expect(offenders).toEqual([]);
  });
});
