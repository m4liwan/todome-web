import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { handleCompanionReply, inlineCompanion } from '../app/companion';
import type { OpenModal } from '../app/modal';
import { useServices } from '../app/services';
import { desktop, type CompanionPayload } from '../lib/desktop';
import { CompanionBubble } from './CompanionBubble';

/** Browser fallback: the companion appears inside the app window. */
export function InlineCompanion({ onOpen }: { onOpen: OpenModal }) {
  const services = useServices();
  const current = useSyncExternalStore(inlineCompanion.subscribe, inlineCompanion.get, inlineCompanion.get);
  const onClosed = useCallback((id: string) => {
    if (inlineCompanion.get()?.message.id === id) inlineCompanion.set(null);
  }, []);
  if (!current || desktop) return null;
  return (
    <div className="buddy-layer buddy-layer--left">
      <CompanionBubble
        key={current.message.id}
        message={current.message}
        avatar={current.avatar}
        position="left"
        dismissed={current.dismissed}
        variant="inline"
        onReply={(optionId) => handleCompanionReply(services, onOpen, current.message.id, optionId)}
        onClosed={() => onClosed(current.message.id)}
      />
    </div>
  );
}

/**
 * Root of the transparent desktop companion window (`#companion`). It only
 * renders what the main process sends and reports replies back.
 */
export function CompanionWindow() {
  const [payload, setPayload] = useState<CompanionPayload | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const current = useRef<CompanionPayload | null>(null);

  useEffect(() => {
    document.documentElement.classList.add('is-companion');
    if (!desktop) return;
    const offMessage = desktop.onCompanionMessage((p) => {
      current.current = p;
      setDismissed(false);
      setPayload(p);
      document.documentElement.setAttribute('data-theme', p.theme);
    });
    const offDismiss = desktop.onCompanionDismiss((id) => {
      const cur = current.current;
      if (cur && (id === null || cur.message.id === id)) setDismissed(true);
    });
    return () => {
      offMessage();
      offDismiss();
    };
  }, []);

  const onClosed = useCallback((id: string) => {
    // A newer message may already be showing; only close the one that left.
    if (current.current?.message.id !== id) return;
    current.current = null;
    setPayload(null);
    desktop?.companionHover(false);
    desktop?.companionClosed();
  }, []);

  if (!payload) return null;
  return (
    <div className={`buddy-layer buddy-layer--desktop buddy-layer--${payload.position}`}>
      <CompanionBubble
        key={payload.message.id}
        message={payload.message}
        avatar={payload.avatar}
        position={payload.position}
        dismissed={dismissed}
        variant="desktop"
        onHover={(h) => desktop?.companionHover(h)}
        onReply={(optionId) => desktop?.companionReply(payload.message.id, optionId)}
        onClosed={() => onClosed(payload.message.id)}
      />
    </div>
  );
}
