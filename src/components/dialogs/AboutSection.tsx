import { useEffect, useState } from 'react';
import { desktop } from '../../lib/desktop';
import { COPYRIGHT, impressum, missingLegalFields, privacy, type LegalBlock, type LegalSection } from '../../domain/legal';
import { updateLine, useUpdates } from '../../app/updates';
import { useAppState } from '../../app/hooks';
import { useServices } from '../../app/services';
import { TELEMETRY_LABEL } from '../../services/telemetry';

/** Settings → Über: version, updates, privacy notice and Impressum. */
export function AboutSection() {
  const { state, check, download, setAuto, install } = useUpdates();
  const services = useServices();
  const { settings } = useAppState();
  const [version, setVersion] = useState('');
  useEffect(() => {
    let alive = true;
    desktop?.getInfo().then((i) => alive && setVersion(i.version)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  const active = Boolean(state && state.status !== 'disabled');
  const busy = state?.status === 'checking' || state?.status === 'downloading';
  const shown = version || state?.current || __APP_VERSION__;

  return (
    <>
      <section className="about">
        <h3>Version & Updates</h3>
        <p className="about__version">
          ToDoMe. <strong>{shown}</strong>
        </p>
        <p className="muted small" role="status" aria-live="polite">
          {updateLine(state)}
        </p>
        <label className="check">
          <input type="checkbox" checked={active && state!.auto} disabled={!active} onChange={(e) => setAuto(e.target.checked)} />
          <span>Automatisch nach Updates suchen</span>
        </label>
        <div className="row">
          {state?.status === 'ready' ? (
            <button type="button" className="btn btn--primary btn--small" onClick={install}>
              Jetzt neu starten und installieren
            </button>
          ) : state?.status === 'available' ? (
            <button type="button" className="btn btn--primary btn--small" onClick={download}>
              Update herunterladen
            </button>
          ) : (
            <button type="button" className="btn btn--small" disabled={!active || busy} onClick={check}>
              Jetzt nachsehen
            </button>
          )}
        </div>
      </section>

      <section className="about">
        <h3>Datenschutz</h3>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.telemetryEnabled === true}
            onChange={(e) => services.store.dispatch({ type: 'settings/update', patch: { telemetryEnabled: e.target.checked } })}
          />
          <span>{TELEMETRY_LABEL}</span>
        </label>
        <p className="muted small">
          Nur Ereignisse wie „Fokusblock gestartet“, nie deine Aufgaben, Notizen oder Zeiten. Keine Sitzungsaufzeichnung. Abschalten wirkt sofort. Mehr dazu unter „Datenschutz“ weiter unten.
        </p>
      </section>

      <section className="about">
        <h3>Rechtliches</h3>
        {missingLegalFields().length > 0 && <p className="about__draft small">Testversion: Die Anbieterangaben sind noch nicht vollständig.</p>}
        <LegalDetails title="Datenschutz" sections={privacy()} />
        <LegalDetails title="Impressum" sections={impressum()} />
        <p className="about__copyright">{COPYRIGHT}</p>
      </section>
    </>
  );
}

function LegalDetails({ title, sections }: { title: string; sections: LegalSection[] }) {
  return (
    <details className="legal">
      <summary>{title}</summary>
      <div className="legal__body">
        {sections.map((s) => (
          <div key={s.title} className="legal__part">
            <h4>{s.title}</h4>
            {s.blocks.map((b, i) => (
              <Block key={i} block={b} />
            ))}
          </div>
        ))}
      </div>
    </details>
  );
}

function Block({ block }: { block: LegalBlock }) {
  if (typeof block === 'string') return <p>{block}</p>;
  if ('list' in block)
    return (
      <ul>
        {block.list.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    );
  return (
    <p>
      <a href={block.link.href} target="_blank" rel="noopener noreferrer">
        {block.link.label}
      </a>
    </p>
  );
}
