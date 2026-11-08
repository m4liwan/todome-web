import { useEffect, useRef, useState } from 'react';
import { useProgressionEvents } from '../app/progression';

const FLOAT_MS = 1400;

type Timers = Set<ReturnType<typeof setTimeout>>;

/** setTimeout that forgets itself when done, so unmount can clear the rest. */
function later(timers: Timers, fn: () => void, ms: number): void {
  const t = setTimeout(() => {
    timers.delete(t);
    fn();
  }, ms);
  timers.add(t);
}

/**
 * "Lv. 4" in the main navigation. Each XP gain rises from it as a small
 * "+15" (aria-hidden: the toast and live region speak for it); a level-up
 * gives the badge one soft pop. Timers are cleared on unmount.
 */
export function LevelBadge({ level }: { level: number }) {
  const { seq, events } = useProgressionEvents();
  const [floats, setFloats] = useState<Array<{ id: number; amount: number }>>([]);
  const [popped, setPopped] = useState(false);
  const mountedSeq = useRef(seq);
  const prevLevel = useRef(level);
  const timers = useRef<Timers>(new Set());

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    // Only what happens while the badge is visible; never replay an old gain.
    if (seq <= mountedSeq.current) return;
    const gain = events.find((e) => e.type === 'xp_gained');
    if (!gain || gain.type !== 'xp_gained') return;
    setFloats((f) => [...f.slice(-2), { id: seq, amount: gain.amount }]);
    later(timers.current, () => setFloats((f) => f.filter((x) => x.id !== seq)), FLOAT_MS);
  }, [seq, events]);

  useEffect(() => {
    if (level > prevLevel.current) {
      setPopped(true);
      later(timers.current, () => setPopped(false), 700);
    }
    prevLevel.current = level;
  }, [level]);

  return (
    <span className={`level-badge${popped ? ' is-up' : ''}`}>
      {/* Level 50 (shell.is-legendary): a sheen glides over the badge now and then. Its own clip, so the floats stay free. */}
      <span className="level-badge__shine" aria-hidden="true" />
      <span aria-hidden="true">Lv. {level}</span>
      <span className="sr-only">, Level {level}</span>
      {floats.map((f) => (
        <span key={f.id} className="level-badge__float" aria-hidden="true">
          +{f.amount}
        </span>
      ))}
    </span>
  );
}
