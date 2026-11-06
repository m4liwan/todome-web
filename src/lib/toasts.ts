/** Minimal visible toast queue (errors and confirmations). */
export interface Toast {
  id: number;
  message: string;
}

let toasts: Toast[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const toastStore = {
  get: () => toasts,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  push(message: string, ttlMs = 5000) {
    const id = ++seq;
    toasts = [...toasts.slice(-2), { id, message }];
    emit();
    setTimeout(() => toastStore.dismiss(id), ttlMs);
  },
  dismiss(id: number) {
    const next = toasts.filter((t) => t.id !== id);
    if (next.length !== toasts.length) {
      toasts = next;
      emit();
    }
  },
};
