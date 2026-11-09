import { useEffect, useRef, useState } from 'react';
import { deliverCompanion } from '../../app/companion';
import { useAppState } from '../../app/hooks';
import { useServices } from '../../app/services';
import { avatarName, avatarProfile } from '../../domain/companion';
import { OPERATOR } from '../../domain/legal';
import { speak } from '../../lib/a11y';
import { desktop, type ContactInfo, type ContactResult, type ContactTopic } from '../../lib/desktop';
import { Avatar } from '../Avatar';
import { Dialog } from '../Dialog';
import { Select } from '../Select';

export const CONTACT_TOPICS: Array<{ id: ContactTopic; label: string }> = [
  { id: 'idea', label: 'Feedback & Ideen' },
  { id: 'bug', label: 'Fehler melden (Bug)' },
  { id: 'question', label: 'Frage zur Bedienung' },
  { id: 'other', label: 'Sonstiges' },
];

const FALLBACK_EMAIL = 'admin@konturia.de';

/** Calm words for every way sending can go wrong (no alarm, a clear next step). */
export function contactError(reason: Exclude<ContactResult, { ok: true }>['reason'], email: string): string {
  switch (reason) {
    case 'invalid':
      return 'Schreib bitte ein paar Worte, dann kann es losgehen.';
    case 'email':
      return 'Die E-Mail-Adresse sieht noch nicht ganz vollständig aus. Du kannst das Feld auch leer lassen.';
    case 'offline':
      return 'Gerade ist keine Internetverbindung da. Deine Nachricht bleibt hier stehen, schick sie einfach gleich noch einmal.';
    case 'slow_down':
      return 'Kurze Atempause: In ein paar Sekunden kannst du wieder eine Nachricht schicken.';
    case 'server':
      return `Der Formular-Dienst hat gerade nicht geantwortet. Versuch es später noch einmal oder schreib direkt an ${email}.`;
    default:
      return `Das E-Mail-Programm ließ sich nicht öffnen. Schreib gern direkt an ${email}.`;
  }
}

/**
 * Feedback & contact: topic, message, optional reply address. Sent by the
 * desktop shell (form service) or prepared in the mail app. Afterwards the
 * companion says thanks and focus returns to the button that opened it.
 */
export function ContactDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const services = useServices();
  const avatar = useAppState().settings.companion.avatar;
  const [info, setInfo] = useState<ContactInfo>({ mode: 'mail', email: FALLBACK_EMAIL });
  const [topic, setTopic] = useState<ContactTopic>('idea');
  const [message, setMessage] = useState('');
  const [replyTo, setReplyTo] = useState('');
  // Bug reports: the technical log helps a lot, and the user sees and decides it.
  const [attachLog, setAttachLog] = useState(true);
  const offerLog = Boolean(desktop) && topic === 'bug';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    // Mounted closed with the settings: the cursor goes to the message when it opens.
    const id = window.requestAnimationFrame(() => field.current?.focus());
    desktop
      ?.contactInfo()
      .then(setInfo)
      .catch(() => undefined);
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  const email = info.email || FALLBACK_EMAIL;
  const viaForm = info.mode === 'form';

  const thank = (via: 'form' | 'mail') => {
    const text =
      via === 'form'
        ? `${avatarProfile(avatar).thanks} Deine Nachricht ist angekommen.`
        : 'Dein E-Mail-Programm ist offen, die Nachricht steht schon drin. Danke dir!';
    speak(via === 'form' ? 'Danke dir, deine Nachricht ist angekommen.' : 'Die Nachricht ist in deinem E-Mail-Programm vorbereitet.');
    deliverCompanion(services, { id: services.deps().newId(), kind: 'motivation', title: avatarName(avatar), text, mood: 'happy', options: [{ id: 'thanks', label: 'Gern', primary: true }], ttlMs: 9000 });
  };

  const submit = async () => {
    if (busy) return;
    setError(null);
    const payload = { topic, message: message.trim(), ...(replyTo.trim() ? { replyTo: replyTo.trim() } : {}), ...(offerLog && attachLog ? { attachLog: true } : {}) };
    if (payload.message.length < 3) return setError(contactError('invalid', email));
    let result: ContactResult;
    if (viaForm && typeof navigator !== 'undefined' && navigator.onLine === false) {
      // No connection: say so at once instead of waiting for a timeout.
      result = { ok: false, reason: 'offline' };
    } else if (desktop) {
      setBusy(true);
      result = await desktop.contactSend(payload).catch((): ContactResult => ({ ok: false, reason: 'offline' }));
      setBusy(false);
    } else {
      // Browser preview: prepare the mail.
      const label = CONTACT_TOPICS.find((t) => t.id === topic)?.label ?? 'Feedback';
      window.location.href = `mailto:${email}?subject=${encodeURIComponent(`ToDoMe.: ${label}`)}&body=${encodeURIComponent(payload.message)}`;
      result = { ok: true, via: 'mail' };
    }
    if (!result.ok) return setError(contactError(result.reason, email));
    setMessage('');
    setReplyTo('');
    setTopic('idea');
    onClose();
    window.setTimeout(() => thank(result.ok ? result.via : 'mail'), 150);
  };

  return (
    <Dialog
      open={open}
      title="Feedback & Kontakt"
      onClose={onClose}
      className="contact"
      footer={
        <>
          <button type="button" className="btn btn--quiet" onClick={onClose}>
            Abbrechen
          </button>
          <button type="submit" form="contact-form" className="btn btn--primary" disabled={busy || message.trim().length < 3} aria-busy={busy || undefined}>
            {busy ? 'Wird gesendet …' : viaForm ? 'Nachricht senden' : 'Im E-Mail-Programm öffnen'}
          </button>
        </>
      }
    >
      <form
        id="contact-form"
        className="contact__form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p className="muted small">Was fühlt sich gut an, was hakt noch? Jede Nachricht liest ein Mensch, ganz in Ruhe.</p>
        <div className="field">
          <span>Worum geht es?</span>
          <Select value={topic} onChange={(v) => setTopic(v as ContactTopic)} aria-label="Worum geht es?">
            {CONTACT_TOPICS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </Select>
        </div>
        <label className="field">
          <span>Deine Nachricht</span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            maxLength={4000}
            ref={field}
            required
            placeholder={topic === 'bug' ? 'Was ist passiert, und was hast du kurz davor gemacht?' : 'Schreib einfach drauflos.'}
          />
        </label>
        {offerLog && (
          <label className="check">
            <input type="checkbox" checked={attachLog} onChange={(e) => setAttachLog(e.target.checked)} />
            <span>Technisches Protokoll anhängen (App-Version, Fehlermeldungen der letzten Zeit, keine Aufgaben, Notizen oder Namen)</span>
          </label>
        )}
        <label className="field">
          <span>Deine E-Mail (optional, nur für eine Antwort)</span>
          <input type="email" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} maxLength={254} autoComplete="email" placeholder="name@beispiel.de" />
        </label>
        <p className="muted small">
          {viaForm
            ? `Deine Nachricht geht verschlüsselt an ${OPERATOR.kind === 'company' ? 'uns' : 'mich'}. Mehr dazu unter Einstellungen → Über → Datenschutz.`
            : `Dein E-Mail-Programm öffnet sich mit der fertigen Nachricht an ${email}. Du schickst sie selbst ab.`}
        </p>
        {error && (
          <div className="contact__error" role="alert">
            <span className="contact__error-buddy" aria-hidden="true">
              <Avatar id={avatar} mood="calm" size={44} animated={false} />
            </span>
            <p>
              <strong>{avatarName(avatar)}:</strong> {error}
            </p>
          </div>
        )}
      </form>
    </Dialog>
  );
}
