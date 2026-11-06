/// <reference types="vite/client" />

/** package.json version, injected by Vite. */
declare const __APP_VERSION__: string;

// Idle Detection API (Chromium). Not yet in lib.dom.
interface IdleDetector extends EventTarget {
  readonly userState: 'active' | 'idle' | null;
  readonly screenState: 'locked' | 'unlocked' | null;
  start(options: { threshold: number; signal?: AbortSignal }): Promise<void>;
}
interface IdleDetectorConstructor {
  new (): IdleDetector;
  requestPermission(): Promise<'granted' | 'denied'>;
}
interface Window {
  IdleDetector?: IdleDetectorConstructor;
}
