import pkg from '../../package.json';
import { BETA_GREETING } from '../components/Onboarding';
import { COPYRIGHT, OPERATOR } from '../domain/legal';

describe('beta build (1.12.4)', () => {
  it('names the private operator in the Windows file details, like the Impressum', () => {
    expect(pkg.author.name).toBe(OPERATOR.name);
    expect(pkg.build.copyright).toBe(COPYRIGHT);
    expect(JSON.stringify(pkg)).not.toMatch(/"Konturia"|© 2026 Konturia/);
  });

  it('greets with the beta note in calm words', () => {
    expect(BETA_GREETING).toContain('ToDoMe ist aktuell in der Beta-Phase.');
    expect(BETA_GREETING).toContain('dein Wohlbefinden im Alltag zu unterstützen');
    expect(BETA_GREETING).not.toMatch(/muss|Deadline|überfällig/i);
  });
});
