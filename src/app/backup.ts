import type { AppState } from '../domain/types';

/** todome-backup-2026-11-05.json (local date). */
export function backupFileName(at: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `todome-backup-${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}.json`;
}

/** Downloads the complete state as a JSON backup (works without any storage). */
export function downloadBackup(state: AppState): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = backupFileName();
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
