import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FocusProgress } from '../components/FocusProgress';
import { buildSegments } from '../components/Timeline';
import { projectAll } from '../domain/session';
import { pauseSession, resumeSession, stopSession } from '../state/commands';
import { Harness, MIN, T0 } from '../test/helpers';

describe('timeline ribbon', () => {
  it('folds tiny pauses and turns very short blocks into dots', () => {
    const h = new Harness();
    const a = h.start(h.task(), 60);
    h.at(20).apply(pauseSession(h.state, h.deps(), a));
    h.at(21).apply(resumeSession(h.state, h.deps(), a));
    h.at(50).apply(stopSession(h.state, h.deps(), a, 'achieved'));
    const b = h.at(60).start(h.task('admin', 15), 15);
    h.at(62).apply(stopSession(h.state, h.deps(), b, 'achieved'));
    const segs = buildSegments(projectAll(h.state, h.now), h.state, 10 * 60 * MIN);
    const big = segs.filter((s) => !s.micro);
    expect(big).toHaveLength(1);
    expect(big[0]).toMatchObject({ from: T0, to: T0 + 50 * MIN });
    expect(segs.filter((s) => s.micro)).toHaveLength(1);
    expect(segs.some((s) => s.kind === 'pause')).toBe(false);
  });
});

describe('focus timeline looks', () => {
  it.each(['wave', 'bar', 'beads'] as const)('%s reports progress to assistive tech', (style) => {
    render(<FocusProgress style={style} progress={0.5} plannedMin={60} doneMin={30} />);
    const bar = screen.getByRole('progressbar', { name: 'Fortschritt der Timebox' });
    expect(bar.getAttribute('aria-valuenow')).toBe('30');
    expect(bar.getAttribute('aria-valuemax')).toBe('60');
  });

  it('fills the glass bar to the progress', () => {
    const { container } = render(<FocusProgress style="bar" progress={0.25} plannedMin={60} doneMin={15} />);
    expect((container.querySelector('.tl-bar__fill') as HTMLElement).style.width).toBe('25%');
  });
});
