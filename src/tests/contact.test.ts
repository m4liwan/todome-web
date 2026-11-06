// @vitest-environment node
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createContact, cleanMessage, mailtoFor, TOPICS } = require('../../electron/contact.cjs');
const meta = { version: '1.12.0', platform: 'win32 10.0' };

describe('feedback & contact (desktop shell)', () => {
  it('offers the four topics from the brief', () => {
    expect(Object.values(TOPICS)).toEqual(['Feedback & Ideen', 'Fehler melden (Bug)', 'Frage zur Bedienung', 'Sonstiges']);
  });

  it('checks what the app sends', () => {
    expect(cleanMessage({ topic: 'bug', message: '  Absturz beim Start  ' })).toMatchObject({ topic: 'bug', message: 'Absturz beim Start', replyTo: '' });
    expect(cleanMessage({ topic: 'hack', message: 'Hallo du' }).error).toBe('invalid');
    expect(cleanMessage({ topic: 'idea', message: 'ok' }).error).toBe('invalid');
    expect(cleanMessage({ topic: 'idea', message: 'x'.repeat(4001) }).error).toBe('invalid');
    expect(cleanMessage({ topic: 'idea', message: 'Hallo du', replyTo: 'kein-mail' }).error).toBe('email');
    expect(cleanMessage({ topic: 'idea', message: 'Hallo du', replyTo: 'lena@beispiel.de' }).replyTo).toBe('lena@beispiel.de');
  });

  it('posts JSON to the form endpoint and slows down repeated sends', async () => {
    const calls: Array<{ url: string; body: Record<string, string> }> = [];
    let t = 1_000_000;
    const c = createContact({
      config: { endpoint: 'https://formspree.io/f/abc123', email: 'admin@konturia.de' },
      fetch: async (url: string, init: { body: string }) => {
        calls.push({ url, body: JSON.parse(init.body) });
        return { ok: true, status: 200 };
      },
      openExternal: async () => undefined,
      meta,
      now: () => t,
    });
    expect(c.info()).toEqual({ mode: 'form', email: 'admin@konturia.de' });
    expect(await c.send({ topic: 'question', message: 'Wie stelle ich die Arbeitszeit ein?', replyTo: 'lena@beispiel.de' })).toEqual({ ok: true, via: 'form' });
    expect(calls[0]!.url).toBe('https://formspree.io/f/abc123');
    expect(calls[0]!.body).toMatchObject({ topic: 'Frage zur Bedienung', _replyto: 'lena@beispiel.de', app: 'ToDoMe. 1.12.0', _subject: 'ToDoMe.: Frage zur Bedienung' });
    expect(await c.send({ topic: 'idea', message: 'Noch eine Idee' })).toEqual({ ok: false, reason: 'slow_down' });
    t += 25_000;
    expect((await c.send({ topic: 'idea', message: 'Noch eine Idee' })).ok).toBe(true);
  });

  it('reports server and network problems calmly', async () => {
    const base = { config: { endpoint: 'https://formspree.io/f/abc123' }, openExternal: async () => undefined, meta };
    expect(await createContact({ ...base, fetch: async () => ({ ok: false, status: 500 }) }).send({ topic: 'bug', message: 'Fehler da' })).toEqual({ ok: false, reason: 'server' });
    expect(
      await createContact({
        ...base,
        fetch: async () => {
          throw new Error('offline');
        },
      }).send({ topic: 'bug', message: 'Fehler da' }),
    ).toEqual({ ok: false, reason: 'offline' });
  });

  it('without an endpoint, prepares the message in the mail app', async () => {
    const opened: string[] = [];
    const c = createContact({ config: { endpoint: '', email: 'admin@konturia.de' }, fetch: async () => ({ ok: true }), openExternal: async (u: string) => void opened.push(u), meta });
    expect(c.info().mode).toBe('mail');
    expect(await c.send({ topic: 'other', message: 'Hallo Rocco' })).toEqual({ ok: true, via: 'mail' });
    expect(opened[0]).toMatch(/^mailto:admin@konturia\.de\?subject=ToDoMe\.%3A%20Sonstiges&body=Hallo%20Rocco/);
    expect(mailtoFor('admin@konturia.de', { topicLabel: 'X', message: 'a&b' }, meta)).toContain('a%26b');
    // Not even an address: says so instead of failing silently.
    expect(await createContact({ config: {}, fetch: async () => ({ ok: true }), openExternal: async () => undefined, meta }).send({ topic: 'idea', message: 'Hallo du' })).toEqual({ ok: false, reason: 'not_configured' });
  });

  it('only accepts an https endpoint', () => {
    const c = createContact({ config: { endpoint: 'http://example.com/form', email: 'admin@konturia.de' }, fetch: async () => ({ ok: true }), openExternal: async () => undefined, meta });
    expect(c.info().mode).toBe('mail');
  });
});

describe('form address (1.12.3)', () => {
  it('takes a Formspree ID or an HTTPS address and ignores anything else', () => {
    const { resolveEndpoint } = require('../../electron/contact.cjs');
    expect(resolveEndpoint('xyzabcde')).toBe('https://formspree.io/f/xyzabcde');
    expect(resolveEndpoint(' https://formspree.io/f/abc123 ')).toBe('https://formspree.io/f/abc123');
    expect(resolveEndpoint('http://formspree.io/f/abc123')).toBe('');
    expect(resolveEndpoint('https://user:pw@example.com/')).toBe('');
    expect(resolveEndpoint('')).toBe('');
  });
});
