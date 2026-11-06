/**
 * "Gedanken-Killer": lets a piece of text dissolve into soft particles that
 * drift up and fade, like breath on a cold window. Pure canvas, no deps.
 */
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  delay: number;
  size: number;
}

const reduced = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

export function dissolveText(el: HTMLElement, text: string, opts: { duration?: number; glow?: string } = {}): Promise<void> {
  const duration = opts.duration ?? 1300;
  if (reduced() || !text.trim()) {
    el.style.transition = 'opacity 0.3s ease';
    el.style.opacity = '0';
    return new Promise((r) => window.setTimeout(r, 300));
  }
  const rect = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const pad = 60;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = rect.width + pad * 2;
  const H = rect.height + pad * 2;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  Object.assign(canvas.style, {
    position: 'fixed',
    left: `${rect.left - pad}px`,
    top: `${rect.top - pad}px`,
    width: `${W}px`,
    height: `${H}px`,
    pointerEvents: 'none',
    zIndex: '400',
  } as Partial<CSSStyleDeclaration>);
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Draw the text as it looks on screen, then sample its pixels.
  const padL = parseFloat(cs.paddingLeft) || 0;
  const padT = parseFloat(cs.paddingTop) || 0;
  const lineH = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.35;
  ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  ctx.fillStyle = cs.color;
  ctx.textBaseline = 'middle';
  const lines = wrap(ctx, text, rect.width - padL - (parseFloat(cs.paddingRight) || 0));
  const isInput = el instanceof HTMLInputElement;
  const top = isInput ? rect.height / 2 - (lines.length - 1) * lineH * 0.5 : padT + lineH / 2;
  lines.forEach((l, i) => ctx.fillText(l, pad + padL, pad + top + i * lineH));
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const step = Math.max(2, Math.round(2 * dpr));
  const particles: Particle[] = [];
  const color = cs.color;
  for (let y = 0; y < canvas.height; y += step) {
    for (let x = 0; x < canvas.width; x += step) {
      if ((data[(y * canvas.width + x) * 4 + 3] ?? 0) > 110) {
        const px = x / dpr;
        const py = y / dpr;
        particles.push({
          x: px,
          y: py,
          vx: 0.3 + Math.random() * 1.4,
          vy: -(0.4 + Math.random() * 1.4),
          // Dissolve sweeps from left to right.
          delay: ((px - pad) / Math.max(1, rect.width)) * 0.45 + Math.random() * 0.12,
          size: 1 + Math.random() * 1.3,
        });
      }
    }
  }
  if (particles.length > 2600) particles.splice(2600);
  document.body.appendChild(canvas);
  el.style.transition = 'opacity 0.15s ease';
  el.style.opacity = '0';

  return new Promise((resolve) => {
    const start = performance.now();
    const frame = (now: number) => {
      const p = (now - start) / duration;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = color;
      if (opts.glow) {
        ctx.shadowColor = opts.glow;
        ctx.shadowBlur = 6;
      }
      for (const q of particles) {
        const local = Math.max(0, Math.min(1, (p - q.delay) / 0.55));
        if (local >= 1) continue;
        const e = local * local;
        const x = q.x + q.vx * e * 70 + Math.sin(local * 6 + q.y) * 4 * local;
        const y = q.y + q.vy * e * 60;
        ctx.globalAlpha = (1 - local) * (local > 0 ? 0.85 : 1);
        ctx.fillRect(x, y, q.size * (1 - local * 0.5), q.size * (1 - local * 0.5));
      }
      ctx.globalAlpha = 1;
      if (p < 1.05) requestAnimationFrame(frame);
      else {
        canvas.remove();
        resolve();
      }
    };
    requestAnimationFrame(frame);
  });
}
