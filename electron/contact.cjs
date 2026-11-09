'use strict';
/**
 * Feedback & contact from the settings. The renderer never talks to the
 * internet for this (its CSP stays as strict as before): the main process
 * checks the message and posts it as JSON to the configured form endpoint
 * (Formspree or any HTTPS form service that needs no secret in the client).
 * Without an endpoint the message opens, filled in, in the mail app.
 */
const TOPICS = { idea: 'Feedback & Ideen', bug: 'Fehler melden (Bug)', question: 'Frage zur Bedienung', other: 'Sonstiges' };
const MAX_MESSAGE = 4000;
const EMAIL_RE = /^[^\s@<>()",;]{1,64}@[^\s@<>()",;]{1,190}\.[a-z]{2,24}$/i;
const MIN_GAP_MS = 20_000;
const MAX_PER_DAY = 10;

/** Validates what the renderer sends; returns a clean payload or an error code. */
function cleanMessage(input) {
  if (!input || typeof input !== 'object') return { error: 'invalid' };
  const topic = Object.prototype.hasOwnProperty.call(TOPICS, input.topic) ? input.topic : null;
  const message = typeof input.message === 'string' ? input.message.replace(/\r\n/g, '\n').trim() : '';
  const replyTo = typeof input.replyTo === 'string' ? input.replyTo.trim() : '';
  if (!topic || message.length < 3 || message.length > MAX_MESSAGE) return { error: 'invalid' };
  if (replyTo && (replyTo.length > 254 || !EMAIL_RE.test(replyTo))) return { error: 'email' };
  // The technical log goes along only with a bug report and the user's tick.
  return { topic, topicLabel: TOPICS[topic], message, replyTo, attachLog: topic === 'bug' && input.attachLog === true };
}

/** mailto: link with subject and body (fallback without endpoint). Mail links stay short: only a few log lines. */
function mailtoFor(email, clean, meta, log = '') {
  const subject = `ToDoMe.: ${clean.topicLabel}`;
  const body = `${clean.message}\n\n---\nToDoMe. ${meta.version} · ${meta.platform}${log ? `\n\n${log}` : ''}`;
  return `mailto:${encodeURIComponent(email).replace(/%40/g, '@')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * @param {{ config: { endpoint?: string, email?: string }, fetch: typeof fetch, openExternal: (url: string) => Promise<void>, meta: { version: string, platform: string }, now?: () => number }} deps
 */
/**
 * The form address from contact.json: a full HTTPS URL, or just the Formspree
 * form ID (e.g. "xyzabcde"), which becomes https://formspree.io/f/<id>.
 * Anything else (plain http, spaces, odd characters) is ignored.
 */
function resolveEndpoint(raw) {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return '';
  if (/^[a-z0-9]{6,32}$/i.test(value)) return `https://formspree.io/f/${value}`;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : '';
  } catch {
    return '';
  }
}

function createContact({ config, fetch: doFetch, openExternal, meta, now = Date.now, diagnostics = null }) {
  const endpoint = resolveEndpoint(config.endpoint);
  const email = typeof config.email === 'string' && EMAIL_RE.test(config.email) ? config.email : '';
  const sent = [];

  return {
    info: () => ({ mode: endpoint ? 'form' : email ? 'mail' : 'none', email }),

    /** Sends via the form endpoint, or opens the mail app. Never throws. */
    async send(input) {
      const clean = cleanMessage(input);
      if (clean.error) return { ok: false, reason: clean.error };
      const report = (lines, chars) => {
        if (!clean.attachLog || typeof diagnostics !== 'function') return '';
        try {
          return String(diagnostics(lines, chars));
        } catch {
          return '';
        }
      };
      if (!endpoint) {
        if (!email) return { ok: false, reason: 'not_configured' };
        try {
          await openExternal(mailtoFor(email, clean, meta, report(12, 1200)));
          return { ok: true, via: 'mail' };
        } catch {
          return { ok: false, reason: 'mail' };
        }
      }
      const t = now();
      while (sent.length && t - sent[0] > 24 * 60 * 60_000) sent.shift();
      if (sent.length >= MAX_PER_DAY || (sent.length && t - sent[sent.length - 1] < MIN_GAP_MS)) return { ok: false, reason: 'slow_down' };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      try {
        const res = await doFetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            _subject: `ToDoMe.: ${clean.topicLabel}`,
            topic: clean.topicLabel,
            message: clean.message,
            ...(clean.replyTo ? { email: clean.replyTo, _replyto: clean.replyTo } : {}),
            app: `ToDoMe. ${meta.version}`,
            platform: meta.platform,
            ...(clean.attachLog ? { diagnostics: report(200, 20_000) } : {}),
          }),
          signal: controller.signal,
        });
        if (!res.ok) return { ok: false, reason: res.status === 429 ? 'slow_down' : 'server' };
        sent.push(t);
        return { ok: true, via: 'form' };
      } catch {
        return { ok: false, reason: 'offline' };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

module.exports = { createContact, cleanMessage, mailtoFor, resolveEndpoint, TOPICS };
