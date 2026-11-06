import { useCallback, useEffect, useRef, useState } from 'react';
import { desktop, type MediaCommand, type MediaInfo } from '../lib/desktop';

const POLL_MS = 5000;
/** Remembers a PC where Windows does not allow the media bridge, so the control never flashes there. */
const SUPPORT_KEY = 'todome:media-supported';
const readSupport = () => {
  try {
    return window.localStorage.getItem(SUPPORT_KEY) !== '0';
  } catch {
    return true;
  }
};
const writeSupport = (ok: boolean) => {
  try {
    window.localStorage.setItem(SUPPORT_KEY, ok ? '1' : '0');
  } catch {
    /* only a hint */
  }
};
/** After play/pause the system player needs a moment; until then our optimistic state wins. */
const SETTLE_MS = 1600;

const same = (a: MediaInfo | null, b: MediaInfo | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.supported === b.supported &&
    a.active === b.active &&
    a.playing === b.playing &&
    a.title === b.title &&
    a.artist === b.artist);

/**
 * Now playing + transport for the system player. Polls gently while the
 * window is visible. Calm state handling, so nothing flickers:
 * - an unchanged answer never re-renders,
 * - play/pause switches at once and stays until the player has settled,
 * - buttons never toggle a disabled look; a second click while a command
 *   runs is simply ignored.
 */
export function useMedia(enabled: boolean): { info: MediaInfo | null; supported: boolean; send: (cmd: MediaCommand) => void } {
  const [info, setInfo] = useState<MediaInfo | null>(null);
  const alive = useRef(true);
  const inFlight = useRef(false);
  const settleUntil = useRef(0);
  const optimistic = useRef<boolean | null>(null);
  /** Unavailable on this PC: no more polling. */
  const stopped = useRef(false);
  const [known] = useState(readSupport);
  const supported = Boolean(desktop) && (info ? info.supported : known);

  const accept = useCallback((r: MediaInfo) => {
    if (!alive.current) return;
    stopped.current = r.supported === false;
    let next = r;
    if (optimistic.current !== null && Date.now() < settleUntil.current) next = { ...r, playing: optimistic.current };
    else optimistic.current = null;
    setInfo((prev) => {
      if (!prev || prev.supported !== next.supported) writeSupport(next.supported);
      return same(prev, next) ? prev : next;
    });
  }, []);

  const ask = useCallback(
    async (cmd: MediaCommand) => {
      if (!desktop) return;
      try {
        accept(await desktop.media(cmd));
      } catch {
        /* the shell may not support media keys */
      }
    },
    [accept],
  );

  useEffect(() => {
    alive.current = true;
    if (!enabled || !desktop) return;
    void ask('info');
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible' && !inFlight.current && !stopped.current) void ask('info');
    }, POLL_MS);
    return () => {
      alive.current = false;
      window.clearInterval(id);
    };
  }, [enabled, ask]);

  const send = useCallback(
    (cmd: MediaCommand) => {
      if (inFlight.current) return;
      inFlight.current = true;
      if (cmd === 'toggle') {
        setInfo((i) => {
          if (!i) return i;
          optimistic.current = !i.playing;
          settleUntil.current = Date.now() + SETTLE_MS;
          return { ...i, playing: !i.playing };
        });
      }
      void ask(cmd).finally(() => {
        inFlight.current = false;
        // One calm re-check once the player has settled.
        window.setTimeout(() => void ask('info'), SETTLE_MS + 50);
      });
    },
    [ask],
  );

  return { info, supported, send };
}
