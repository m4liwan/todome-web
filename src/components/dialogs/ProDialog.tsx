import { closePro, PRO_COPY, useProPrompt, type ProFeature } from '../../app/pro';
import { Dialog } from '../Dialog';
import { IconCheck, IconSparkle } from '../icons';

type Cell = boolean | string;
interface Row {
  label: string;
  free: Cell;
  pro: Cell;
  /** Highlights the row that opened the dialog. */
  feature?: ProFeature;
}

const ROWS: Row[] = [
  { label: 'Fokus, nächster Schritt, Pausen und Tagesabschluss', free: true, pro: true },
  { label: 'Begleiter, Wasser und Wohlfühl-Momente', free: true, pro: true },
  { label: 'Zeiten pro Kunde (Summen)', free: true, pro: true },
  { label: 'Zeitbericht im Detail und CSV-Export', free: false, pro: true, feature: 'reports' },
  { label: 'Kunden anlegen', free: false, pro: true, feature: 'clients' },
  { label: 'Anti-Hustle-Statistiken', free: false, pro: true, feature: 'stats' },
  { label: 'Workspace-Editor (Karten frei anordnen)', free: false, pro: true, feature: 'workspace' },
  { label: 'Begleiter', free: '6', pro: '8', feature: 'avatars' },
  { label: 'Farbwelten', free: '6', pro: '8', feature: 'palettes' },
  { label: 'Layouts (Pro: mit Flow & Focus)', free: '3', pro: '4', feature: 'flow' },
];

function Value({ v }: { v: Cell }) {
  if (v === true)
    return (
      <span className="pro-compare__yes" role="img" aria-label="enthalten">
        <IconCheck size={16} />
      </span>
    );
  if (v === false) return <span className="pro-compare__dash" role="img" aria-label="nicht enthalten" />;
  return <span>{v}</span>;
}

/**
 * "Was bringt Pro?": a calm side-by-side of Free and Pro. No prices, no
 * countdown, no pressure. Everything that carries a workday stays free.
 */
export function ProDialog() {
  const feature = useProPrompt();
  const copy = feature ? PRO_COPY[feature] : null;
  return (
    <Dialog
      open={Boolean(feature)}
      title="Was bringt Pro?"
      onClose={closePro}
      className="dialog--pro"
      footer={
        <button type="button" className="btn btn--primary" onClick={closePro}>
          Alles klar
        </button>
      }
    >
      <div className="pro">
        <span className="pro__badge">
          <IconSparkle size={16} /> Bald in Pro
        </span>
        {copy && (
          <div className="pro__focus">
            <strong>{copy.title}</strong>
            <p>{copy.text}</p>
          </div>
        )}
        <table className="pro-compare">
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">Funktion</span>
              </th>
              <th scope="col">Free</th>
              <th scope="col" className="pro-compare__pro">
                Pro
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.label} className={r.feature && r.feature === feature ? 'is-current' : undefined}>
                <th scope="row">{r.label}</th>
                <td>
                  <Value v={r.free} />
                </td>
                <td className="pro-compare__pro">
                  <Value v={r.pro} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">Was du heute kostenlos nutzt, bleibt kostenlos. Pro kommt dazu, nimmt dir aber nichts weg.</p>
      </div>
    </Dialog>
  );
}
