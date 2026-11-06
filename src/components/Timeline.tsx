import { useMemo } from 'react';
import type { SessionProjection } from '../domain/session';
import type { AppState, Millis } from '../domain/types';
import { atTimeOfDay, dayKey, formatDuration, formatTime, HOUR, MIN } from '../lib/time';
import { contextLabels } from '../domain/userContext';

interface Props {
  state: AppState;
  projections: SessionProjection[];
  now: Millis;
}

type Kind = 'work' | 'interrupt' | 'pause';
type Seg = { key: string; from: Millis; to: Millis; kind: Kind; live: boolean; label: string; micro?: number };

/** Pauses shorter than this are folded into the surrounding focus block. */
const FOLD_PAUSE = 3 * MIN;

/**
 * Turn sessions into calm ribbon segments. Tiny pauses are folded into the
 * block around them, and very short blocks become a small dot (merged when
 * several sit close together) instead of a squeezed sliver.
 */
export function buildSegments(todays: SessionProjection[], state: AppState, span: Millis): Seg[] {
  const out: Seg[] = [];
  for (const p of todays) {
    const title = state.tasks[p.taskId]?.title ?? '';
    const kind: Kind = p.parentSessionId ? 'interrupt' : 'work';
    const merged: Array<[Millis, Millis]> = [];
    for (const [s0, e0] of p.runningIntervals) {
      const last = merged[merged.length - 1];
      if (last && s0 - last[1] < FOLD_PAUSE) last[1] = e0;
      else merged.push([s0, e0]);
    }
    merged.forEach(([s0, e0], i) =>
      out.push({
        key: `${p.sessionId}-r${i}`,
        from: s0,
        to: e0,
        kind,
        live: p.status === 'running' && i === merged.length - 1,
        label: `${title}: ${formatTime(s0)} bis ${formatTime(e0)}`,
      }),
    );
    p.pauseIntervals.forEach(([s0, e0], i) => {
      if (e0 - s0 >= FOLD_PAUSE) out.push({ key: `${p.sessionId}-p${i}`, from: s0, to: e0, kind: 'pause', live: false, label: `Pause ${formatTime(s0)} bis ${formatTime(e0)}` });
    });
  }
  const microLimit = Math.max(5 * MIN, span * 0.012);
  const big = out.filter((x) => x.live || x.to - x.from >= microLimit);
  const small = out.filter((x) => !x.live && x.to - x.from < microLimit && x.kind !== 'pause').sort((a, b) => a.from - b.from);
  const dots: Seg[] = [];
  for (const x of small) {
    const prev = dots[dots.length - 1];
    if (prev && x.from - prev.to < 10 * MIN) {
      prev.to = Math.max(prev.to, x.to);
      prev.micro = (prev.micro ?? 1) + 1;
      prev.label = `${prev.micro} kurze Momente, ${formatTime(prev.from)} bis ${formatTime(prev.to)}`;
      if (x.kind === 'work') prev.kind = 'work';
    } else dots.push({ ...x, key: `${x.key}-dot`, micro: 1 });
  }
  return [...big, ...dots];
}

/**
 * The day as a living ribbon: quarter-hour ticks, focus and interruption
 * segments with a shimmer on the live one, pauses, lunch, planned starts and a
 * glowing "now" marker that glides along.
 */
export function Timeline({ state, projections, now }: Props) {
  const { settings } = state;
  const labels = contextLabels(state.settings.userContext);
  const today = dayKey(now);
  const todays = useMemo(() => projections.filter((p) => dayKey(p.startedAt) === today), [projections, today]);

  const workStart = atTimeOfDay(now, settings.workdayStart);
  const workEnd = atTimeOfDay(now, settings.workdayEnd);
  const from = Math.min(workStart, ...todays.map((p) => p.startedAt));
  const to = Math.max(workEnd, now + 20 * MIN, ...todays.map((p) => p.stoppedAt ?? now));
  const span = to - from;
  const pos = (t: Millis) => (Math.min(Math.max(t, from), to) - from) / span;
  const pct = (t: Millis) => `${(pos(t) * 100).toFixed(3)}%`;
  const width = (a: Millis, b: Millis) => `${Math.max(0, (pos(b) - pos(a)) * 100).toFixed(3)}%`;

  const segs = useMemo(() => buildSegments(todays, state, span), [todays, state, span]);

  const ticks: Array<{ at: Millis; hour: boolean }> = [];
  for (let t = Math.ceil(from / (15 * MIN)) * 15 * MIN; t <= to; t += 15 * MIN) {
    ticks.push({ at: t, hour: new Date(t).getMinutes() === 0 });
  }

  const lunchS = atTimeOfDay(now, settings.lunchStart);
  const lunchE = atTimeOfDay(now, settings.lunchEnd);
  const planned = Object.values(state.tasks)
    .filter((t) => t.plannedDay === today && t.plannedStart !== null && t.status === 'planned' && t.plannedStart >= from)
    .sort((a, b) => (a.plannedStart ?? 0) - (b.plannedStart ?? 0));

  const dayProgress = Math.min(1, Math.max(0, (now - workStart) / Math.max(1, workEnd - workStart)));
  const left = Math.max(0, workEnd - now);
  const live = todays.some((p) => p.status === 'running');

  return (
    <section className="card timeline rise" style={{ '--i': 1 } as React.CSSProperties} aria-label="Tagesverlauf">
      <header className="timeline__head">
        <div>
          <h2>Dein Tag</h2>
          <p className="muted">
            {now < workStart
              ? labels.dayStartsAt(settings.workdayStart)
              : now >= workEnd
                ? labels.dayEndReached
                : `${Math.round(dayProgress * 100)} % geschafft, noch ${formatDuration(left)} ${labels.untilDayEnd}`}
          </p>
        </div>
        <ul className="legend" aria-label="Legende">
          <li className="legend__work">Fokus</li>
          <li className="legend__interrupt">Unterbrechung</li>
          <li className="legend__pause">Pause</li>
          <li className="legend__lunch">Mittag</li>
        </ul>
      </header>

      <div className="timeline__scroll">
        <div className="timeline__canvas">
          <div className="timeline__planned" aria-label="Geplante Starts">
            {planned.map((t) => (
              <span key={t.id} className="plan-pin" style={{ left: pct(t.plannedStart ?? 0) }} title={`Geplant: ${t.title} um ${formatTime(t.plannedStart ?? 0)}`}>
                <span className="plan-pin__label">{t.title}</span>
              </span>
            ))}
          </div>

          <div className={`track${live ? ' is-live' : ''}`}>
            <div className="track__past" style={{ width: pct(now) }} />
            <div className="track__lunch" style={{ left: pct(lunchS), width: width(lunchS, lunchE) }} title="Mittag, geschützt" />
            <div className="track__ticks" aria-hidden="true">
              {ticks.map((t) => (
                <span key={t.at} className={t.hour ? 'is-hour' : undefined} style={{ left: pct(t.at) }} />
              ))}
            </div>
            {segs.map((s) =>
              s.micro ? (
                <div key={s.key} className={`seg-dot seg-dot--${s.kind}`} style={{ left: pct((s.from + s.to) / 2) }} title={s.label}>
                  {s.micro > 1 && <span>{s.micro}</span>}
                </div>
              ) : (
                <div
                  key={s.key}
                  className={`seg seg--${s.kind}${s.live ? ' is-live' : ''}`}
                  style={{ left: pct(s.from), width: width(s.from, s.to) }}
                  title={s.label}
                />
              ),
            )}
            <div className="now" style={{ left: pct(now) }}>
              <span className="now__dot" />
              <span className="now__label">{formatTime(now)}</span>
            </div>
          </div>

          <div className="timeline__scale" aria-hidden="true">
            {ticks
              .filter((t) => t.hour)
              .map((t) => (
                <span key={t.at} style={{ left: pct(t.at) }}>
                  {String(new Date(t.at).getHours()).padStart(2, '0')}
                </span>
              ))}
          </div>
        </div>
      </div>
      {span > 16 * HOUR && <p className="muted small">Langer Tag: Denk an deine Erholung.</p>}
    </section>
  );
}
