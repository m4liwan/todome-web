// @vitest-environment node
import { impressum, type LegalSection, MISSING, missingLegalFields, type Operator, OPERATOR, privacy } from '../domain/legal';

const text = (sections: LegalSection[]) => JSON.stringify(sections);

const full: Operator = {
  ...OPERATOR,
  kind: 'company',
  name: 'Konturia',
  legalForm: 'GmbH',
  representatives: 'Max Muster',
  street: 'Musterstraße 1',
  postalCode: '35578',
  city: 'Wetzlar',
  email: 'hallo@example.com',
  register: '',
  vatId: '',
};

describe('Impressum and privacy notice', () => {
  it('ships the private-person data, complete', () => {
    expect(OPERATOR).toMatchObject({
      kind: 'person',
      name: 'Rocco Hanke',
      street: 'Grüner Weg 26a',
      postalCode: '35606',
      city: 'Solms',
      email: 'admin@konturia.de',
    });
    expect(missingLegalFields()).toEqual([]);
  });

  it('builds a private-person Impressum and names the controller', () => {
    const imp = text(impressum());
    expect(imp).toContain('§ 5 DDG');
    expect(imp).toContain('Rocco Hanke');
    expect(imp).toContain('Grüner Weg 26a');
    expect(imp).toContain('35606 Solms');
    expect(imp).toContain('admin@konturia.de');
    expect(imp).not.toMatch(/Vertreten durch|Registereintrag|Umsatzsteuer/);
    const p = text(privacy());
    expect(p).toContain('Verantwortlicher im Sinne der Datenschutz-Grundverordnung');
    expect(p).toContain('Rocco Hanke');
    expect(p).toContain('Ich erhalte diese Daten nicht');
    expect(p).toContain('an Tally und an mich');
    expect(p).not.toMatch(/\b(wir|uns|unser)\b/i);
  });

  it('lists the fields still to fill for each kind', () => {
    expect(missingLegalFields(full)).toEqual([]);
    expect(missingLegalFields({ ...full, street: ' ', email: '' })).toEqual(['street', 'email']);
    expect(missingLegalFields({ ...full, representatives: '' })).toEqual(['representatives']);
    expect(missingLegalFields({ ...full, kind: 'person', representatives: '' })).toEqual([]);
  });

  it('company mode: marks gaps visibly and shows register and VAT ID only when given', () => {
    expect(text(impressum({ ...full, representatives: '' }))).toContain(MISSING);
    const plain = text(impressum(full));
    expect(plain).not.toContain(MISSING);
    expect(plain).toContain('Konturia GmbH');
    expect(plain).not.toContain('Registereintrag');
    const more = text(impressum({ ...full, register: 'Amtsgericht Wetzlar, HRB 0000', vatId: 'DE000000000' }));
    expect(more).toContain('Amtsgericht Wetzlar, HRB 0000');
    expect(more).toContain('§ 27a UStG: DE000000000');
    expect(text(privacy(full))).toContain('Wir erhalten diese Daten nicht');
  });

  it('covers every service the app talks to', () => {
    const p = text(privacy());
    for (const word of ['Open-Meteo', 'GitHub', 'Tally', 'Art. 6 Abs. 1 lit. f', 'Art. 6 Abs. 1 lit. a', 'Aufsichtsbehörde']) expect(p).toContain(word);
  });

  it('keeps the calm voice', () => {
    expect(text(privacy()) + text(impressum()) + text(privacy(full))).not.toMatch(/überfällig|Deadline|\bmuss\b|\bmusst\b/i);
  });
});

describe('contact and copyright (1.12)', () => {
  it('names the contact form in the privacy notice and shows the copyright line', async () => {
    const { COPYRIGHT, impressum, privacy } = await import('../domain/legal');
    expect(COPYRIGHT).toBe('© 2026 ToDoMe by Rocco Hanke');
    expect(JSON.stringify(impressum())).toContain('© 2026 ToDoMe by Rocco Hanke');
    const p = JSON.stringify(privacy());
    expect(p).toContain('Feedback & Kontakt');
    expect(p).toContain('Formspree');
    expect(p).toContain('Nur fünf Funktionen');
    expect(p).toContain('nur mit Einwilligung');
  });
});
