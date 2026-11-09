import type { PomodoroPhase } from '../domain/pomodoro';
import { formatClock, formatDuration } from '../lib/time';

function label(phase: PomodoroPhase): string {
  if (phase.kind === 'focus') return phase.due ? 'Runde geschafft, gleich Pause' : `Fokus-Runde ${phase.round} von ${phase.rounds}`;
  if (phase.remainingMs <= 0) return 'Pause vorbei, weiter wenn du magst';
  return `${phase.long ? 'Lange Pause' : 'Pause'} nach Runde ${phase.round}`;
}

/** Focus timer inside the focus card: time of the phase, a calm line and four round marks. */
export function PomodoroClock({ phase }: { phase: PomodoroPhase }) {
  // Marks: finished rounds are done; the running round (or the one just finished, in its break) is on.
  const mark = (i: number) => {
    const n = i + 1;
    if (phase.kind === 'break') return n <= phase.round ? 'is-done' : '';
    return n < phase.round ? 'is-done' : n === phase.round ? 'is-on' : '';
  };
  return (
    <>
      <span className="focus__time" role="timer" aria-live="off" aria-label={`${formatDuration(phase.remainingMs)} ${phase.kind === 'focus' ? 'bis zur Pause' : 'Pause übrig'}`}>
        {formatClock(phase.remainingMs)}
      </span>
      <span className="focus__clock-label">{label(phase)}</span>
      <ol className="pomo-rounds" aria-label={`Runde ${phase.round} von ${phase.rounds}`}>
        {Array.from({ length: phase.rounds }, (_, i) => (
          <li key={i} className={mark(i)} />
        ))}
      </ol>
    </>
  );
}
