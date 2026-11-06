import { useEffect, useRef, useState } from 'react';
import { useServices } from '../app/services';
import { deliverCompanion } from '../app/companion';
import { avatarName } from '../domain/companion';
import { energyProfile } from '../domain/energy';
import { FIRST_TASKS_MAX, planFirstTasks } from '../domain/firstTasks';
import { createTask } from '../state/commands';
import { useAppState } from '../app/hooks';
import { AvatarScene } from './AvatarScene';
import { Dialog } from './Dialog';
import { contextLabels } from '../domain/userContext';
import { trackEvent } from '../services/telemetry';

const ORDINAL = ['Erste Sache', 'Zweite Sache', 'Dritte Sache'];
export const FIRST_TASKS_QUESTION = 'Lass uns deinen Kopf kurz aufräumen. Was ist die allererste Sache, die du heute erledigen oder festhalten möchtest?';

/**
 * The bridge after the onboarding: the companion asks for the first one to
 * three things, the field has focus at once, and afterwards the home screen
 * shows exactly one of them as "Dein nächster Schritt", with focus on its
 * start button. Nobody lands in an empty app.
 */
export function FirstTasks({ open, onDone }: { open: boolean; onDone: (created: number) => void }) {
  const services = useServices();
  const state = useAppState();
  const avatar = state.settings.companion.avatar;
  const name = state.settings.userName.trim();
  const [lines, setLines] = useState<string[]>(['']);
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const filled = lines.filter((l) => l.trim()).length;

  // The dialog is mounted closed: put the cursor into the first field when it opens.
  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => refs.current[0]?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  const setLine = (i: number, value: string) => setLines((ls) => ls.map((l, j) => (j === i ? value : l)));
  const addLine = () => {
    if (lines.length >= FIRST_TASKS_MAX) return;
    setLines((ls) => [...ls, '']);
    window.requestAnimationFrame(() => refs.current[lines.length]?.focus());
  };

  const finish = (save: boolean) => {
    let created = 0;
    if (save) {
      const now = services.clock.now();
      const profile = energyProfile(services.store.getState(), now);
      const tasks = planFirstTasks(lines, { timeboxCapMin: profile?.timeboxCapMin ?? 25, micro: Boolean(profile?.micro) });
      for (const input of tasks) {
        const r = services.run(createTask(services.store.getState(), services.deps(), input));
        if (r) created += 1;
      }
    }
    onDone(created);
    trackEvent('first_tasks_finished', { count: created });
    if (created > 0) {
      deliverCompanion(services, {
        id: services.deps().newId(),
        kind: 'motivation',
        title: avatarName(avatar),
        text: created === 1 ? 'Da ist er: dein nächster Schritt. Mehr braucht es gerade nicht.' : 'Da ist dein nächster Schritt. Der Rest wartet geduldig unter „Danach“.',
        mood: 'happy',
        options: [{ id: 'thanks', label: 'Danke', primary: true }],
        ttlMs: 9000,
      });
    }
    // Keyboard focus lands on the start button of the next step (once it is rendered).
    let tries = 0;
    const focusStart = () => {
      const start = document.querySelector<HTMLButtonElement>('.focus--one .focus__actions .pill--dark');
      // The bridge fades out first (the page stays inert until then): try again until focus sits there.
      if (start) start.focus({ preventScroll: false });
      if (document.activeElement !== start && ++tries < 30) window.setTimeout(focusStart, 50);
    };
    window.setTimeout(focusStart, 60);
    setLines(['']);
  };

  return (
    <Dialog
      open={open}
      title={name ? `Kopf aufräumen, ${name}` : 'Kopf aufräumen'}
      onClose={() => finish(false)}
      className="first-tasks"
      footer={
        <>
          <button type="button" className="btn btn--quiet" onClick={() => finish(false)}>
            Später
          </button>
          <button type="submit" form="first-tasks-form" className="btn btn--primary" disabled={filled === 0}>
            {filled > 1 ? 'Festhalten und loslegen' : 'Das ist mein Anfang'}
          </button>
        </>
      }
    >
      <div className="first-tasks__talk">
        <AvatarScene avatar={avatar} activity="writing" size={96} />
        <p className="first-tasks__bubble">{FIRST_TASKS_QUESTION}</p>
      </div>
      <form
        id="first-tasks-form"
        className="first-tasks__form"
        onSubmit={(e) => {
          e.preventDefault();
          if (filled > 0) finish(true);
        }}
      >
        {lines.map((line, i) => (
          <label key={i} className="field">
            <span>{ORDINAL[i]}</span>
            <input
              ref={(el) => (refs.current[i] = el)}
              value={line}
              maxLength={120}
              placeholder={i === 0 ? contextLabels(state.settings.userContext).firstTaskExample : 'Noch etwas, das raus darf (optional)'}
              onChange={(e) => setLine(i, e.target.value)}
            />
          </label>
        ))}
        {lines.length < FIRST_TASKS_MAX && (
          <button type="button" className="link-btn first-tasks__more" onClick={addLine} disabled={!lines[lines.length - 1]?.trim()}>
            + Noch eine Sache festhalten
          </button>
        )}
        <p className="muted small">Bis zu drei Dinge. Danach siehst du nur die erste, der Rest wartet geduldig.</p>
      </form>
    </Dialog>
  );
}
