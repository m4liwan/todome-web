import { useMemo } from 'react';
import { careSummary, weekSummary, type CareSummary } from '../domain/reports';
import type { SessionProjection } from '../domain/session';
import type { AppState, Millis } from '../domain/types';
import { dayKey, formatDuration, formatEuro, HOUR, MIN } from '../lib/time';
import { contextLabels } from '../domain/userContext';

interface Props {
  state: AppState;
  projections: SessionProjection[];
  now: Millis;
}

const PEOPLE_COLORS = ['var(--accent-2)', 'var(--accent-mesh)', 'var(--accent-3)', '#5b8cff', '#a993ff', '#ff8fb4'];

const weekday = (day: string, style: 'short' | 'long' = 'short') => new Date(`${day}T12:00:00`).toLocaleDateString('de-DE', { weekday: style });

function hoursWord(ms: Millis): string {
  if (ms < HOUR) return `${Math.round(ms / MIN)} Minuten`;
  const h = ms / HOUR;
  return `${h.toLocaleString('de-DE', { maximumFractionDigits: 1 })} ${h === 1 ? 'Stunde' : 'Stunden'}`;
}

/** The headline sentence: recognition, not a spreadsheet. */
function recognition(focusMs: Millis, done: number, activeDays: number): { title: string; text: string } {
  if (focusMs === 0) return { title: 'Diese Woche beginnt gerade erst.', text: 'Jede Minute, die du hier sammelst, wird zu einem Bild davon, was du alles bewegst.' };
  const title = `Diese Woche hast du ${hoursWord(focusMs)} konzentriert gearbeitet.`;
  const parts = [
    done > 0 ? `${done === 1 ? 'Eine Sache' : `${done} Sachen`} hast du abgeschlossen` : 'Du bist an deinen Themen drangeblieben',
    activeDays > 1 ? `an ${activeDays} Tagen bist du für dich und deine Arbeit aufgestanden` : 'und hast den ersten Schritt gemacht',
  ];
  return { title, text: `${parts.join(', ')}. Das bist du. Das hast du bewegt.` };
}

/** Week deep-dive: what you achieved, made visible and warm. */
export function WeekView({ state, projections, now }: Props) {
  const labels = contextLabels(state.settings.userContext);
  const w = useMemo(() => weekSummary(state, projections, now), [state, projections, now]);
  const care = useMemo(() => careSummary(state, w), [state, w]);
  const today = dayKey(now);
  const max = Math.max(2 * HOUR, ...w.days.map((d) => d.netMs));
  const r = recognition(w.focusMs, w.tasksDone.length, w.activeDays);
  const clientTotal = w.clients.reduce((a, c) => a + c.netMs, 0);
  const proud = w.days.map((d) => ({ day: d.day, note: state.wellbeing.proud[d.day] })).filter((p): p is { day: string; note: string } => Boolean(p.note));

  return (
    <section className="weekview rise" aria-label="Deine Woche">
      <div className="weekview__hero card">
        <div className="weekview__glow" aria-hidden="true" />
        <p className="weekview__kicker">Dein Rückblick, die letzten sieben Tage</p>
        <h1 className="weekview__title">{r.title}</h1>
        <p className="weekview__text">{r.text}</p>

        <ol className="lights" aria-label="Fokus pro Tag">
          {w.days.map((d) => {
            const h = d.netMs / max;
            const isBest = w.bestDay?.day === d.day;
            return (
              <li key={d.day} className={`${d.day === today ? 'is-today' : ''}${isBest ? ' is-best' : ''}`}>
                <span className="lights__value">{d.netMs > 0 ? formatDuration(d.netMs) : ''}</span>
                <span className="lights__track">
                  <span className="lights__col" style={{ '--h': h } as React.CSSProperties} title={`${weekday(d.day, 'long')}: ${formatDuration(d.netMs)}`} />
                </span>
                <span className="lights__day">{weekday(d.day)}</span>
                <span className={`lights__water${d.water >= state.settings.companion.waterGoal ? ' is-full' : ''}`} title={`${d.water} Gläser Wasser`} role="img" aria-label={`${d.water} Gläser Wasser`} />
              </li>
            );
          })}
        </ol>
        <p className="weekview__legend muted small">
          Leuchtende Säulen zeigen deine Fokuszeit. Der blaue Punkt darunter: Wasserziel erreicht.
        </p>
      </div>

      <div className="weekview__tiles">
        <article className="card tile">
          <p className="tile__label">Längster Block am Stück</p>
          <p className="tile__value">{w.longestBlockMs > 0 ? formatDuration(w.longestBlockMs) : '–'}</p>
          <p className="muted small">So lange warst du ganz bei einer Sache. Das können nicht viele.</p>
        </article>
        <article className="card tile">
          <p className="tile__label">Dein stärkster Tag</p>
          <p className="tile__value">{w.bestDay ? weekday(w.bestDay.day, 'long') : '–'}</p>
          <p className="muted small">{w.bestDay ? `${formatDuration(w.bestDay.netMs)} Fokus. Merk dir, wie sich das angefühlt hat.` : 'Kommt noch. Ganz in deinem Tempo.'}</p>
        </article>
        <article className="card tile">
          <p className="tile__label">Gut für dich gesorgt</p>
          <p className="tile__value">
            {w.waterGoalDays}
            <small> von 7 Tagen</small>
          </p>
          <p className="muted small">Wasserziel erreicht. Dein Körper arbeitet mit dir, nicht gegen dich.</p>
        </article>
        {w.amount > 0 && (
          <article className="card tile">
            <p className="tile__label">Wert deiner Arbeit</p>
            <p className="tile__value">{formatEuro(w.amount)}</p>
            <p className="muted small">Abrechenbar diese Woche. Deine Zeit ist etwas wert.</p>
          </article>
        )}
      </div>

      <div className="weekview__care">
        <article className="card care">
          <p className="tile__label">Selbstmitgefühl</p>
          <div className="care__ring">
            <Ring value={care.selfCompassion / 100} />
            <span className="care__score">{care.selfCompassion}</span>
          </div>
          <p className="care__word">{care.selfCompassionWord}</p>
          <ul className="care__parts">
            {care.parts.map((part) => (
              <li key={part.id}>
                <span>{part.label}</span>
                <span className="care__bar" aria-hidden="true">
                  <span style={{ width: `${Math.round(part.value * 100)}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </article>
        <article className="card care">
          <p className="tile__label">Pausen-Index</p>
          <PauseGauge ratio={care.pauseRatio} />
          <p className="care__word">{care.pauseWord}</p>
          <p className="muted small">
            {w.focusMs > 0 ? `${formatDuration(w.pauseMs)} Pause auf ${formatDuration(w.focusMs)} Fokus.` : ''} Zwischen 10 und 25 % fühlt sich für die meisten am leichtesten an.
          </p>
        </article>
        <article className="card care care--energy">
          <p className="tile__label">Deine Energie</p>
          <EnergyCurve energy={care.energy} today={today} />
          <p className="care__word">{care.energyWord}</p>
        </article>
      </div>

      <div className="weekview__row">
        <article className="card wins">
          <h2>Was du geschafft hast</h2>
          {w.tasksDone.length === 0 ? (
            <p className="muted">Sobald du etwas abschließt, sammelt es sich hier. Auch kleine Dinge zählen.</p>
          ) : (
            <ul className="wins__list">
              {w.tasksDone.map((t, i) => (
                <li key={t} style={{ '--i': i } as React.CSSProperties}>
                  {t}
                </li>
              ))}
            </ul>
          )}
          {proud.length > 0 && (
            <div className="wins__proud">
              <h3>Worauf du stolz warst</h3>
              <ul>
                {proud.map((p) => (
                  <li key={p.day}>
                    <span className="muted small">{weekday(p.day, 'long')}</span>
                    <p>„{p.note}“</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </article>

        <article className="card people">
          <h2>{labels.forWhom}</h2>
          {w.clients.length === 0 ? (
            <p className="muted">Noch keine Zeiten in dieser Woche.</p>
          ) : (
            <>
              <div className="people__bar" aria-hidden="true">
                {w.clients.map((c, i) => (
                  <span key={c.clientId ?? 'internal'} style={{ flexGrow: c.netMs, '--pc': PEOPLE_COLORS[i % PEOPLE_COLORS.length] } as React.CSSProperties} />
                ))}
              </div>
              <ul className="people__list">
                {w.clients.map((c, i) => (
                  <li key={c.clientId ?? 'internal'} style={{ '--pc': PEOPLE_COLORS[i % PEOPLE_COLORS.length] } as React.CSSProperties}>
                    <span className="people__dot" aria-hidden="true" />
                    <span className="people__name">{c.clientName}</span>
                    <span className="people__share muted">{clientTotal > 0 ? `${Math.round((c.netMs / clientTotal) * 100)} %` : ''}</span>
                    <span className="num">{formatDuration(c.netMs)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </article>
      </div>
    </section>
  );
}

function Ring({ value }: { value: number }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 110 110" width="120" height="120" aria-hidden="true">
      <circle cx="55" cy="55" r={r} className="care__track" />
      <circle cx="55" cy="55" r={r} className="care__fill" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, value))} transform="rotate(-90 55 55)" />
    </svg>
  );
}

/** Half gauge with a soft "comfort zone" between 10 and 25 %. */
function PauseGauge({ ratio }: { ratio: number }) {
  const clamp = Math.min(0.5, Math.max(0, ratio));
  const angle = Math.PI * (1 - clamp / 0.5);
  const x = 70 + 54 * Math.cos(angle);
  const y = 70 - 54 * Math.sin(angle);
  const arc = (from: number, to: number) => {
    const a1 = Math.PI * (1 - from / 0.5);
    const a2 = Math.PI * (1 - to / 0.5);
    return `M${70 + 54 * Math.cos(a1)} ${70 - 54 * Math.sin(a1)} A54 54 0 0 1 ${70 + 54 * Math.cos(a2)} ${70 - 54 * Math.sin(a2)}`;
  };
  return (
    <svg className="gauge" viewBox="0 0 140 84" width="180" height="108" role="img" aria-label={`${Math.round(ratio * 100)} Prozent Pausen im Verhältnis zur Fokuszeit`}>
      <path d={arc(0, 0.5)} className="gauge__track" />
      <path d={arc(0.1, 0.25)} className="gauge__zone" />
      <circle cx={x} cy={y} r="7" className="gauge__dot" />
      <text x="70" y="74" textAnchor="middle" className="gauge__value">
        {Math.round(ratio * 100)} %
      </text>
    </svg>
  );
}

/** Gentle line of the energy scale over the week; gaps stay gaps. */
function EnergyCurve({ energy, today }: { energy: CareSummary['energy']; today: string }) {
  const W = 300;
  const H = 120;
  const pad = 14;
  const step = (W - pad * 2) / Math.max(1, energy.length - 1);
  const pts = energy.map((e, i) => ({ x: pad + i * step, y: e.level === null ? null : pad + (1 - (e.level - 1) / 9) * (H - pad * 2), e }));
  const segs: string[] = [];
  let cur = '';
  for (const p of pts) {
    if (p.y === null) {
      if (cur) segs.push(cur);
      cur = '';
      continue;
    }
    cur += `${cur ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)} `;
  }
  if (cur) segs.push(cur);
  return (
    <svg className="curve" viewBox={`0 0 ${W} ${H + 22}`} width="100%" role="img" aria-label="Energieverlauf der letzten sieben Tage">
      <defs>
        <linearGradient id="curve-line" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#8ab4ff" />
          <stop offset="1" stopColor="var(--accent-2)" />
        </linearGradient>
      </defs>
      {[1, 5.5, 10].map((v) => (
        <line key={v} x1={pad} x2={W - pad} y1={pad + (1 - (v - 1) / 9) * (H - pad * 2)} y2={pad + (1 - (v - 1) / 9) * (H - pad * 2)} className="curve__grid" />
      ))}
      {segs.map((d) => (
        <path key={d} d={d} className="curve__line" stroke="url(#curve-line)" />
      ))}
      {pts.map((p) =>
        p.y === null ? (
          <circle key={p.e.day} cx={p.x} cy={H - pad} r="2.5" className="curve__empty" />
        ) : (
          <circle key={p.e.day} cx={p.x} cy={p.y} r={p.e.day === today ? 5.5 : 4} className={`curve__dot${p.e.day === today ? ' is-today' : ''}`}>
            <title>{`${weekday(p.e.day, 'long')}: ${p.e.level} von 10`}</title>
          </circle>
        ),
      )}
      {pts.map((p) => (
        <text key={`${p.e.day}-l`} x={p.x} y={H + 16} textAnchor="middle" className="curve__day">
          {weekday(p.e.day)}
        </text>
      ))}
    </svg>
  );
}
