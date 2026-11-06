import { useSyncExternalStore } from 'react';
import { toastStore } from '../lib/toasts';

export function Toasts() {
  const toasts = useSyncExternalStore(toastStore.subscribe, toastStore.get, toastStore.get);
  if (toasts.length === 0) return null;
  return (
    <div className="toasts" aria-hidden="true">
      {toasts.map((t) => (
        <div key={t.id} className="toast" onClick={() => toastStore.dismiss(t.id)}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
