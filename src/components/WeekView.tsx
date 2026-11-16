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

/** The arrival numbers: hours as a light number with its unit. */
function hoursParts(ms: Millis): { value: string; unit: string } {
  if (ms < HOUR) return { value: String(Math.round(ms / MIN)), unit: 'Minuten Fokus' };
  return { value: (ms / HOUR).toLocaleString('de-DE', { maximumFractionDigits: 1 }), unit: 'Stunden Fokus' };
}

/**
 * Week deep-dive: an arrival. Warmer and calmer than the working home: a
 * soft light gathers around a monumental sentence of recognition, then what
 * you created as three large, light numbers; beneath, the week as quiet
 * columns and the calm zones under hairlines.
 */
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
    <section className="weekview" aria-label="Deine Woche">
      <div className="weekview__arrival">
        <span className="weekview__glow" aria-hidden="true" />
        <p className="weekview__kicker">Angekommen. Schau, was du geschaffen hast.</p>
        <dl className="weekview__pride">
          <div style={{ '--i': 0 } as React.CSSProperties}>
            <dd>{hoursParts(w.focusMs).value}</dd>
            <dt>{hoursParts(w.focusMs).unit}</dt>
          </div>
          <div style={{ '--i': 1 } as React.CSSProperties}>
            <dd>{w.tasksDone.length}</dd>
            <dt>{w.tasksDone.length === 1 ? 'Sache geschafft' : 'Sachen geschafft'}</dt>
          </div>
          <div style={{ '--i': 2 } as React.CSSProperties}>
            <dd>{w.activeDays}</dd>
            <dt>{w.activeDays === 1 ? 'Tag für dich da gewesen' : 'Tage für dich da gewesen'}</dt>
          </div>
        </dl>
      </div>
      <div className="weekview__hero">
        <p className="zone__label">Dein Rückblick · die letzten sieben Tage</p>
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

      <div className="band weekview__tiles" style={{ '--cols': w.amount > 0 ? 4 : 3 } as React.CSSProperties}>
        <article className="tile">
          <p className="tile__label">Längster Block am Stück</p>
          <p className="tile__value">{w.longestBlockMs > 0 ? formatDuration(w.longestBlockMs) : '–'}</p>
          <p className="muted small">So lange warst du ganz bei einer Sache. Das können nicht viele.</p>
        </article>
        <article className="tile">
          <p className="tile__label">Dein stärkster Tag</p>
          <p className="tile__value">{w.bestDay ? weekday(w.bestDay.day, 'long') : '–'}</p>
          <p className="muted small">{w.bestDay ? `${formatDuration(w.bestDay.netMs)} Fokus. Merk dir, wie sich das angefühlt hat.` : 'Kommt noch. Ganz in deinem Tempo.'}</p>
        </article>
        <article className="tile">
          <p className="tile__label">Gut für dich gesorgt</p>
          <p className="tile__value">
            {w.waterGoalDays}
            <small> von 7 Tagen</small>
          </p>
          <p className="muted small">Wasserziel erreicht. Dein Körper arbeitet mit dir, nicht gegen dich.</p>
        </article>
        {w.amount > 0 && (
          <article className="tile">
            <p className="tile__label">Wert deiner Arbeit</p>
            <p className="tile__value">{formatEuro(w.amount)}</p>
            <p className="muted small">Abrechenbar diese Woche. Deine Zeit ist etwas wert.</p>
          </article>
        )}
      </div>

      {/* Your balance: three calm sentences, no scores. Only the energy keeps its gentle line. */}
      <section className="zone" aria-labelledby="weekview-balance">
        <header>
          <h2 id="weekview-balance">Deine Balance</h2>
          <p className="zone__sub">Ohne Wertung, nur damit du dich siehst.</p>
        </header>
        <div className="band weekview__care" style={{ '--cols': 3 } as React.CSSProperties}>
          <article className="care">
            <p className="tile__label">Mit dir selbst</p>
            <p className="care__word">{care.selfCompassionWord}</p>
          </article>
          <article className="care">
            <p className="tile__label">Pausen</p>
            <p className="care__word">{care.pauseWord}</p>
          </article>
          <article className="care care--energy">
            <p className="tile__label">Deine Energie</p>
            <EnergyCurve energy={care.energy} today={today} />
            <p className="care__word">{care.energyWord}</p>
          </article>
        </div>
      </section>

      <div className="zone weekview__row">
        <article className="wins">
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

        <article className="people">
          <h2>{labels.forWhom}</h2>
          {w.clients.length === 0 ? (
            <p className="muted">Noch keine Zeiten in dieser Woche.</p>
          ) : (
              <ul className="people__list">
                {w.clients.map((c) => (
                  <li key={c.clientId ?? 'internal'}>
                    <span className="people__name">{c.clientName}</span>
                    <span className="people__share muted">{clientTotal > 0 ? `${Math.round((c.netMs / clientTotal) * 100)} %` : ''}</span>
                    <span className="num">{formatDuration(c.netMs)}</span>
                  </li>
                ))}
              </ul>
          )}
        </article>
      </div>
    </section>
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
          <stop offset="0" stopColor="var(--ink-3)" />
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
