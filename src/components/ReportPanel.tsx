import { useState } from 'react';
import { OUTCOME_LABELS } from '../domain/copy';
import { entriesToCsv, toTimeEntries, totalsByClient, type TimeEntry } from '../domain/reports';
import type { SessionProjection } from '../domain/session';
import type { AppState, Millis } from '../domain/types';
import { addDays, dayKey, formatDate, formatDuration, formatEuro, formatTime } from '../lib/time';
import { hasPro, openPro } from '../app/pro';
import { IconArrowUpRight, IconChevronLeft, IconChevronRight, IconLock } from './icons';
import { businessShown, contextLabels } from '../domain/userContext';

interface Props {
  state: AppState;
  projections: SessionProjection[];
  now: Millis;
}

function downloadCsv(entries: TimeEntry[], state: AppState, day: string) {
  const blob = new Blob([entriesToCsv(entries, state.clients)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `todome-zeiten-${day}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Compact "today" card for the dashboard. */
export function TodayTimesCard({ state, projections, now, onMore }: Props & { onMore: () => void }) {
  const labels = contextLabels(state.settings.userContext);
  const business = businessShown(state);
  const today = dayKey(now);
  const entries = toTimeEntries(state, projections).filter((e) => e.day === today);
  const totals = totalsByClient(entries, state.clients);
  const amount = totals.reduce((a, t) => a + t.amount, 0);
  const max = Math.max(1, ...totals.map((t) => t.netMs));
  return (
    <section className="card times-mini rise" style={{ '--i': 6 } as React.CSSProperties} aria-label="Zeiten heute">
      <header className="card__head">
        <div>
          <h2>Zeiten heute</h2>
          <p className="muted">{entries.length === 0 ? 'Noch nichts erfasst' : `${entries.length} Sessions`}</p>
        </div>
        <button type="button" className="round-btn" aria-label="Alle Zeiten" title="Alle Zeiten" onClick={onMore}>
          <IconArrowUpRight size={18} />
        </button>
      </header>
      {business && (
        <p className="times-mini__amount">
          {formatEuro(amount)}
          <small>abrechenbar</small>
        </p>
      )}
      {totals.length === 0 && <p className="muted small">Starte eine Session, dann erscheinen hier deine Zeiten pro {labels.client}.</p>}
      <ul className="bars">
        {totals.slice(0, 4).map((t) => (
          <li key={t.clientId ?? 'internal'}>
            <span className="bars__name">{t.clientName}</span>
            <span className="bars__track">
              <span className={t.amount > 0 ? 'is-billable' : undefined} style={{ width: `${(t.netMs / max) * 100}%` }} />
            </span>
            <span className="bars__value">{formatDuration(t.netMs)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Full day report: sessions, totals per client and CSV export for invoicing. */
export function ReportPanel({ state, projections, now }: Props) {
  const labels = contextLabels(state.settings.userContext);
  const business = businessShown(state);
  const today = dayKey(now);
  const [day, setDay] = useState(today);
  const entries = toTimeEntries(state, projections).filter((e) => e.day === day);
  const totals = totalsByClient(entries, state.clients);
  const amount = totals.reduce((a, t) => a + t.amount, 0);
  const pro = hasPro();

  return (
    <section className="card report rise" style={{ '--i': 2 } as React.CSSProperties} aria-label="Zeitbericht">
      <header className="card__head">
        <div>
          <h2>Zeitbericht</h2>
          <p className="muted">{day === today ? 'Heute' : formatDate(day)}</p>
        </div>
        <div className="report__tools">
          <div className="daynav">
            <button type="button" className="round-btn round-btn--sm" aria-label="Vorheriger Tag" onClick={() => setDay(addDays(day, -1))}>
              <IconChevronLeft size={16} />
            </button>
            <button type="button" className="round-btn round-btn--sm" aria-label="Nächster Tag" disabled={day >= today} onClick={() => setDay(addDays(day, 1))}>
              <IconChevronRight size={16} />
            </button>
          </div>
          {pro ? (
            <button type="button" className="pill pill--sm" onClick={() => downloadCsv(entries, state, day)} disabled={entries.length === 0}>
              CSV exportieren
            </button>
          ) : (
            <button type="button" className="pill pill--sm pill--pro" onClick={() => openPro('reports')} title="Bald in Pro">
              <IconLock size={14} />
              CSV exportieren
            </button>
          )}
        </div>
      </header>

      {entries.length === 0 ? (
        <p className="muted">Keine Einträge an diesem Tag.</p>
      ) : (
        <>
          <div className={`table-wrap${pro ? '' : ' pro-veil'}`} aria-hidden={pro ? undefined : true}>
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Zeit</th>
                  <th scope="col">{labels.client}</th>
                  <th scope="col">Tätigkeit</th>
                  <th scope="col" className="num">
                    Netto
                  </th>
                  <th scope="col" className="hide-sm">
                    Ergebnis
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.sessionId} className={e.open ? 'is-open' : undefined}>
                    <td className="nowrap">{e.archived ? 'Tagessumme' : `${formatTime(e.start)}–${e.end ? formatTime(e.end) : 'läuft'}`}</td>
                    <td>{e.clientName}</td>
                    <td>
                      {e.taskTitle}
                      {e.archived && <span className="muted small"> ({e.archived.sessions} Sessions)</span>}
                      {e.interruptions > 0 && <span className="muted small"> ({e.interruptions}× unterbrochen)</span>}
                    </td>
                    <td className="num">{formatDuration(e.netMs)}</td>
                    <td className="hide-sm">{e.outcome ? OUTCOME_LABELS[e.outcome as keyof typeof OUTCOME_LABELS] : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!pro && (
            <div className="pro-veil__note">
              <span className="pro-lock">
                <IconLock size={12} />
                Pro
              </span>
              <p>Jede Session im Detail und der CSV-Export kommen mit Pro. Deine Summen pro {labels.client} bleiben frei.</p>
              <button type="button" className="pill pill--sm pill--glass-soft" onClick={() => openPro('reports')}>
                Vorschau ansehen
              </button>
            </div>
          )}
          <ul className="totals">
            {totals.map((t) => (
              <li key={t.clientId ?? 'internal'}>
                <span>{t.clientName}</span>
                <span className="num">{formatDuration(t.netMs)}</span>
                {business && <span className="num muted">{t.amount > 0 ? formatEuro(t.amount) : 'intern'}</span>}
              </li>
            ))}
            <li className="totals__sum">
              <span>Abrechenbar (gerundet)</span>
              <span />
              <span className="num">{formatEuro(amount)}</span>
            </li>
          </ul>
        </>
      )}
    </section>
  );
}
