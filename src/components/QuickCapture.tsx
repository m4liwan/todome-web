import { useEffect, useRef, useState } from 'react';
import { draftChips, parseQuickAdd } from '../domain/quickAdd';
import { desktop } from '../lib/desktop';

/**
 * The quick-capture window (#quick): one line, Enter, done. A live preview
 * shows what the markers at the end mean; the app creates the task and
 * answers, then the window says so briefly and steps aside.
 */
export function QuickCaptureWindow() {
  const [text, setText] = useState('');
  const [reply, setReply] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const closeTimer = useRef(0);

  useEffect(() => {
    document.documentElement.classList.add('is-quick');
    if (!desktop) return;
    return desktop.onQuickOpen(({ theme }) => {
      document.documentElement.setAttribute('data-theme', theme);
      window.clearTimeout(closeTimer.current);
      setReply(null);
      setBusy(false);
      setText('');
      window.requestAnimationFrame(() => input.current?.focus());
    });
  }, []);

  const close = () => {
    window.clearTimeout(closeTimer.current);
    desktop?.quickClose();
  };

  const submit = async () => {
    if (busy || !desktop) return;
    if (!text.trim()) return close();
    setBusy(true);
    const r = await desktop.quickSubmit(text).catch(() => ({ ok: false, message: 'Das hat nicht geklappt. Versuch es noch einmal.' }));
    setBusy(false);
    setReply(r);
    if (r.ok) {
      setText('');
      closeTimer.current = window.setTimeout(close, 900);
    }
  };

  const draft = parseQuickAdd(text);
  const chips = text.trim() ? draftChips(draft) : [];

  return (
    <main className="quick">
      <form
        className="quick__card"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            close();
          }
        }}
      >
        <label className="sr-only" htmlFor="quick-input">
          Was willst du dir merken?
        </label>
        <input
          id="quick-input"
          ref={input}
          className="quick__input"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (reply && !reply.ok) setReply(null);
          }}
          maxLength={300}
          autoComplete="off"
          spellCheck
          placeholder="Was willst du dir merken?  z. B. Angebot Müller 45m morgen"
          aria-describedby="quick-hint"
        />
        <div className="quick__meta" aria-live="polite">
          {reply ? (
            <span className={reply.ok ? 'quick__reply quick__reply--ok' : 'quick__reply'} role={reply.ok ? 'status' : 'alert'}>
              {reply.ok ? '✓ ' : ''}
              {reply.message}
            </span>
          ) : chips.length > 0 ? (
            <span className="quick__chips">
              {chips.map((c) => (
                <span key={c} className="quick__chip">
                  {c}
                </span>
              ))}
            </span>
          ) : (
            <span id="quick-hint" className="quick__hint">
              Enter merkt es dir · Esc schließt · am Ende: 45m · !hoch · @Kunde · morgen
            </span>
          )}
        </div>
      </form>
    </main>
  );
}
