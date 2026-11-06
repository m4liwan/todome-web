import { useCallback, useEffect, useRef, useState } from 'react';
import type { CompanionMessage } from '../domain/companion';
import type { AvatarId } from '../domain/types';
import { Avatar } from './Avatar';
import { IconClose } from './icons';

interface Props {
  message: CompanionMessage;
  avatar: AvatarId;
  position: 'left' | 'right';
  onReply: (optionId: string) => void;
  /** Called after the exit animation finished. */
  onClosed: () => void;
  onHover?: (hovering: boolean) => void;
  /** External request to leave (e.g. answered elsewhere). */
  dismissed?: boolean;
  variant: 'desktop' | 'inline';
}

const EXIT_MS = 420;

/**
 * The companion peeking in from the screen edge with a speech bubble.
 * Auto-hides after `ttlMs`; hovering pauses the timer.
 */
export function CompanionBubble({ message, avatar, position, onReply, onClosed, onHover, dismissed, variant }: Props) {
  const [phase, setPhase] = useState<'in' | 'out'>('in');
  const [hovered, setHovered] = useState(false);
  const remaining = useRef(message.ttlMs);
  const startedAt = useRef(Date.now());
  const closedRef = useRef(false);
  const onClosedRef = useRef(onClosed);
  useEffect(() => {
    onClosedRef.current = onClosed;
  }, [onClosed]);

  const leave = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    setPhase('out');
    window.setTimeout(() => onClosedRef.current(), EXIT_MS);
  }, []);

  // Auto-hide timer, paused while hovered.
  useEffect(() => {
    if (hovered || phase === 'out') return;
    startedAt.current = Date.now();
    const id = window.setTimeout(leave, Math.max(0, remaining.current));
    return () => {
      window.clearTimeout(id);
      remaining.current -= Date.now() - startedAt.current;
    };
  }, [hovered, phase, leave]);

  useEffect(() => {
    if (dismissed) leave();
  }, [dismissed, leave]);

  const hover = (h: boolean) => {
    setHovered(h);
    onHover?.(h);
  };

  return (
    <div
      className={`buddy buddy--${position} buddy--${variant} is-${phase}`}
      role="dialog"
      aria-live="polite"
      aria-label={message.title}
    >
      <div className="buddy__avatar" aria-hidden="true">
        <Avatar id={avatar} mood={message.mood} size={variant === 'desktop' ? 112 : 88} />
      </div>
      <div className="buddy__bubble" onMouseEnter={() => hover(true)} onMouseLeave={() => hover(false)}>
        <div className="buddy__head">
          <span className="buddy__title">{message.title}</span>
          <button type="button" className="buddy__close" aria-label="Schließen" onClick={leave}>
            <IconClose size={14} />
          </button>
        </div>
        <p className="buddy__text">{message.text}</p>
        <div className="buddy__options">
          {message.options.map((o, i) => (
            <button
              key={o.id}
              type="button"
              className={`pill pill--sm${o.primary ? ' pill--dark' : ''}`}
              autoFocus={variant === 'inline' && i === 0}
              onClick={() => {
                onReply(o.id);
                leave();
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
        <span
          className="buddy__timer"
          style={{ animationDuration: `${message.ttlMs}ms`, animationPlayState: hovered ? 'paused' : 'running' }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
