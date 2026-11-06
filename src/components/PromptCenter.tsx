import { effectiveTone } from '../domain/energy';
import { useEffect, useRef } from 'react';
import { useServices } from '../app/services';
import { modalForFollowUp, type OpenModal } from '../app/modal';
import { promptVarsFor } from '../app/promptVars';
import { promptFor, type AnswerId } from '../domain/copy';
import type { AppState, CheckIn, Millis } from '../domain/types';
import { MIN } from '../lib/time';
import { handleAnswer } from '../state/promptHandlers';
import { Avatar } from './Avatar';

interface Props {
  state: AppState;
  now: Millis;
  openPrompts: CheckIn[];
  onOpen: OpenModal;
}

/** In-app check-ins, spoken by your companion. One tap answers. */
export function PromptCenter({ state, now, openPrompts, onOpen }: Props) {
  if (openPrompts.length === 0) return null;
  return (
    <aside className="prompts" aria-label="Nachfragen" aria-live="polite">
      {openPrompts.map((c) => (
        <PromptCard key={c.id} checkIn={c} state={state} now={now} onOpen={onOpen} />
      ))}
    </aside>
  );
}

const MOOD: Partial<Record<CheckIn['kind'], 'curious' | 'alert' | 'calm' | 'happy'>> = {
  overrun: 'alert',
  idle: 'alert',
  pause_over: 'calm',
  break_suggestion: 'calm',
  shutdown: 'calm',
  daily_cap: 'calm',
  milestone: 'happy',
};

function PromptCard({ checkIn, state, now, onOpen }: { checkIn: CheckIn; state: AppState; now: Millis; onOpen: OpenModal }) {
  const services = useServices();
  const content = promptFor(checkIn.kind, effectiveTone(state, now), promptVarsFor(state, checkIn, now));
  const firstRef = useRef<HTMLButtonElement>(null);
  const total = state.settings.promptExpiryMin * MIN;
  const expiresIn = Math.max(0, checkIn.sentAt + total - now);

  useEffect(() => {
    const active = document.activeElement;
    if (!active || active === document.body) firstRef.current?.focus({ preventScroll: true });
  }, []);

  const answer = (id: AnswerId) => {
    const current = services.store.getState();
    const live = current.checkIns[checkIn.id];
    if (!live || live.answeredAt !== null) return;
    const outcome = handleAnswer(current, services.deps(), live, id);
    if (services.run(outcome.result) && outcome.followUp) onOpen(modalForFollowUp(outcome.followUp));
  };

  return (
    <section className={`prompt prompt--${checkIn.kind}`} aria-label={content.title}>
      <div className="prompt__avatar" aria-hidden="true">
        <Avatar id={state.settings.companion.avatar} mood={MOOD[checkIn.kind] ?? 'curious'} size={56} />
      </div>
      <div className="prompt__content">
        <p className="prompt__title">{content.title}</p>
        <p className="prompt__body">{content.body}</p>
        <div className="prompt__options">
          {content.options.map((o, i) => (
            <button key={o.id} ref={i === 0 ? firstRef : undefined} type="button" className={`pill pill--sm${o.primary ? ' pill--dark' : ''}`} onClick={() => answer(o.id)}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <span className="prompt__timer" style={{ transform: `scaleX(${expiresIn / total})` }} aria-hidden="true" />
    </section>
  );
}
