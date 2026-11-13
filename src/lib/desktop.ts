import type { CompanionMessage } from '../domain/companion';
import type { Activity } from '../domain/energy';
import type { AvatarId, OverlaySettings, PaletteId, QuickCaptureKey, ThemePreference } from '../domain/types';

/**
 * Bridge to the Electron shell (`electron/preload.cjs`). In a normal browser
 * `desktop` is null and every feature degrades gracefully.
 */
export type SystemIdleState = 'active' | 'idle' | 'locked' | 'unknown';

export interface PowerEvent {
  type: 'resume';
  suspendedAt: number;
  resumedAt: number;
}

export interface CompanionPayload {
  message: CompanionMessage;
  avatar: AvatarId;
  position: 'left' | 'right';
  theme: 'light' | 'dark';
}

export interface CompanionReply {
  messageId: string;
  optionId: string;
}

export interface OverlayConfig extends OverlaySettings {
  theme: 'light' | 'dark';
  palette: PaletteId;
}

/** What the mini overlay shows: calm, no hectic numbers. */
export interface OverlayState {
  avatar: AvatarId;
  activity: Activity;
  status: 'idle' | 'running' | 'paused' | 'over';
  /** The one focus anchor. */
  title: string;
  /** 0 … 1, rendered as a soft ring. */
  progress: number;
  /** One calm sentence, e.g. "Gut im Fluss". */
  hint: string;
}

/** A grip of the mini overlay: the side or corner that moves. */
export type OverlayEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export type MediaCommand = 'info' | 'toggle' | 'next' | 'prev';

export interface MediaInfo {
  ok: boolean;
  supported: boolean;
  active?: boolean;
  playing?: boolean;
  title?: string;
  artist?: string;
  app?: string;
}

/** Auto-update (electron/updater.cjs). 'disabled' = no update channel in this build. */
export type UpdateStatus = 'disabled' | 'idle' | 'checking' | 'none' | 'downloading' | 'ready' | 'error';

/** Sent once per version when the update finished downloading (`todome:update-ready`). */
export interface UpdateReady {
  version?: string;
}

export interface UpdateState {
  status: UpdateStatus;
  /** Search automatically in the background. */
  auto: boolean;
  /** Installed version. */
  current: string;
  /** Version found or downloaded. */
  version?: string;
  percent?: number;
  checkedAt?: number;
}

/** Datensafe (electron/vault.cjs): rotating backups in the user profile. */
export type VaultKind = 'daily' | 'pre-update' | 'pre-import' | 'unreadable';
export interface VaultEntry {
  name: string;
  kind: VaultKind;
  /** Written at (ms). */
  at: number;
  size: number;
}

/** Feedback & contact (electron/contact.cjs). */
export type ContactTopic = 'idea' | 'bug' | 'question' | 'other';
export interface ContactInfo {
  /** 'form': posted to the form service; 'mail': opens the mail app; 'none': not set up. */
  mode: 'form' | 'mail' | 'none';
  email: string;
}
export type ContactResult = { ok: true; via: 'form' | 'mail' } | { ok: false; reason: 'invalid' | 'email' | 'not_configured' | 'mail' | 'slow_down' | 'server' | 'offline' };

export interface DesktopBridge {
  isDesktop: true;
  platform: string;
  getIdleState(thresholdSec: number): Promise<{ state: SystemIdleState; idleSeconds: number }>;
  getAutostart(): Promise<{ supported: boolean; enabled: boolean }>;
  setAutostart(enabled: boolean): Promise<{ supported: boolean; enabled: boolean }>;
  getInfo(): Promise<{ version: string; platform: string; packaged: boolean }>;
  focus(): void;
  appReady(): void;
  /** The page colour actually painted, so the next window start matches it. */
  reportWindowBg(mode: 'light' | 'dark', color: string): void;
  media(cmd: MediaCommand): Promise<MediaInfo>;
  contactInfo(): Promise<ContactInfo>;
  /** `attachLog`: with a bug report, the redacted technical log goes along (electron/log.cjs). */
  contactSend(payload: { topic: ContactTopic; message: string; replyTo?: string; attachLog?: boolean }): Promise<ContactResult>;
  /** Writes a renderer error into the local log file. */
  log(entry: { level: 'error' | 'warn'; scope: string; message: string; stack?: string }): void;
  updateState(): Promise<UpdateState>;
  updateCheck(): Promise<UpdateState>;
  updateSetAuto(auto: boolean): Promise<UpdateState>;
  updateInstall(): void;
  onUpdate(callback: (state: UpdateState) => void): () => void;
  /** The update is downloaded and waits for a restart. Returns the unsubscribe function. */
  onUpdateReady(callback: (ready: UpdateReady) => void): () => void;
  /** Saves, quits and installs the downloaded update. False when none is waiting. */
  restartAndInstall(): Promise<boolean>;
  setStatus(status: { text: string; attention: boolean }): void;
  setTheme(theme: ThemePreference): void;
  onPower(callback: (event: PowerEvent) => void): () => void;
  /** The shell is about to quit; `update` = a downloaded update installs on this quit. */
  onBeforeQuit(callback: (info: { update: boolean }) => void): () => void;
  vaultSave(kind: VaultKind, json: string): void;
  vaultList(): Promise<VaultEntry[]>;
  vaultRead(name: string): Promise<string | null>;
  /** Opens the backup folder in Explorer. */
  vaultOpen(): Promise<boolean>;
  companionShow(payload: CompanionPayload): void;
  companionHide(messageId: string | null): void;
  onCompanionReply(callback: (reply: CompanionReply) => void): () => void;
  onCompanionMessage(callback: (payload: CompanionPayload) => void): () => void;
  onCompanionDismiss(callback: (messageId: string | null) => void): () => void;
  companionReply(messageId: string, optionId: string): void;
  overlayConfig(cfg: OverlayConfig): void;
  overlayState(state: OverlayState): void;
  onOverlayClosed(callback: () => void): () => void;
  onToggleOverlay(callback: () => void): () => void;
  onOverlayConfig(callback: (cfg: OverlayConfig) => void): () => void;
  onOverlayState(callback: (state: OverlayState) => void): () => void;
  overlayOpenApp(): void;
  overlayClose(): void;
  overlayResize(size: { width: number; height: number }): void;
  overlayDragStart(): void;
  overlayDragMove(delta: { dx: number; dy: number }): void;
  overlayDragEnd(): void;
  /** Resizing by the overlay's own grips (frameless transparent windows have no OS border). */
  overlayResizeStart(edge: OverlayEdge): void;
  overlayResizeMove(delta: { dx: number; dy: number }): void;
  overlayResizeEnd(): void;
  /** Back to the automatic size. */
  overlayResizeReset(): void;
  companionHover(hovering: boolean): void;
  /** Registers the global quick-capture shortcut (or none with 'off'). `ok: false` = taken by another app. */
  quickConfig(key: QuickCaptureKey): Promise<{ ok: boolean; active: boolean }>;
  onQuickAdd(callback: (request: { id: number; text: string }) => void): () => void;
  quickResult(result: { id: number; ok: boolean; message: string }): void;
  onQuickOpen(callback: (info: { theme: 'light' | 'dark' }) => void): () => void;
  quickSubmit(text: string): Promise<{ ok: boolean; message: string }>;
  quickClose(): void;
  companionClosed(): void;
}

declare global {
  interface Window {
    todome?: DesktopBridge;
  }
}

export const desktop: DesktopBridge | null = typeof window !== 'undefined' && window.todome?.isDesktop ? window.todome : null;
export const isDesktop = desktop !== null;
export const isCompanionView = typeof window !== 'undefined' && window.location.hash === '#companion';
export const isOverlayView = typeof window !== 'undefined' && window.location.hash === '#overlay';
/** The small quick-capture window (global shortcut). */
export const isQuickView = typeof window !== 'undefined' && window.location.hash === '#quick';
/** Opened by the shell after repeated renderer crashes (electron/crash-guard.cjs). */
export const isRecoveryView = typeof window !== 'undefined' && window.location.hash === '#recovery';
