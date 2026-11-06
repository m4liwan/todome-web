import { FIRST_TASKS_MAX, planFirstTasks } from '../domain/firstTasks';
import { FIRST_TASKS_QUESTION } from '../components/FirstTasks';

describe('first tasks after the onboarding', () => {
  it('turns up to three lines into tasks, the first one as the next step', () => {
    const tasks = planFirstTasks(['  Angebot   öffnen ', '', 'Steuer ablegen', 'angebot öffnen', 'Mails', 'Noch was'], { timeboxCapMin: 75, micro: false });
    expect(FIRST_TASKS_MAX).toBe(3);
    expect(tasks.map((t) => t.title)).toEqual(['Angebot öffnen', 'Steuer ablegen', 'Mails']);
    expect(tasks.map((t) => t.priority)).toEqual(['high', 'normal', 'normal']);
    expect(tasks.every((t) => t.estimateMin === 25 && t.clientId === null)).toBe(true);
  });

  it('keeps blocks small on low energy or a short focus span', () => {
    expect(planFirstTasks(['A'], { timeboxCapMin: 15, micro: true })[0]!.estimateMin).toBe(10);
    expect(planFirstTasks(['A'], { timeboxCapMin: 15, micro: false })[0]!.estimateMin).toBe(15);
    expect(planFirstTasks(['', '  '], { timeboxCapMin: 25, micro: false })).toEqual([]);
  });

  it('asks the question from the brief', () => {
    expect(FIRST_TASKS_QUESTION).toBe('Lass uns deinen Kopf kurz aufräumen. Was ist die allererste Sache, die du heute erledigen oder festhalten möchtest?');
  });
});
