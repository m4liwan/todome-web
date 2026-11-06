import type { CompanionMessage } from '../domain/companion';
import type { Activity } from '../domain/energy';
import type { AvatarId, OverlaySettings, PaletteId, ThemePreference } from '../domain/types';

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
export type UpdateStatus = 'disabled' | 'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'ready' | 'error';

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
  contactSend(payload: { topic: ContactTopic; message: string; replyTo?: string }): Promise<ContactResult>;
  updateState(): Promise<UpdateState>;
  updateCheck(): Promise<UpdateState>;
  /** Downloads the update found by the last check (status 'available'). */
  updateDownload(): Promise<UpdateState>;
  updateSetAuto(auto: boolean): Promise<UpdateState>;
  updateInstall(): void;
  onUpdate(callback: (state: UpdateState) => void): () => void;
  setStatus(status: { text: string; attention: boolean }): void;
  setTheme(theme: ThemePreference): void;
  onPower(callback: (event: PowerEvent) => void): () => void;
  onBeforeQuit(callback: () => void): () => void;
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
  companionHover(hovering: boolean): void;
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
