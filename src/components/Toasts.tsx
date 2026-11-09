import { useSyncExternalStore } from 'react';
import { toastStore } from '../lib/toasts';

export function Toasts() {
  const toasts = useSyncExternalStore(toastStore.subscribe, toastStore.get, toastStore.get);
  if (toasts.length === 0) return null;
  return (
    // The live region (#announcer) reads the text; only an action button is for assistive tech.
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={t.action ? 'toast toast--action' : 'toast'} onClick={() => toastStore.dismiss(t.id)}>
          <span aria-hidden="true">{t.message}</span>
          {t.action && (
            <button
              type="button"
              className="toast__action"
              aria-label={`${t.action.label}: ${t.message}`}
              onClick={(e) => {
                e.stopPropagation();
                t.action!.run();
                toastStore.dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
