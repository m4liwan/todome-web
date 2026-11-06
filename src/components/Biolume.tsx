import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from '../app/theme';

interface Mote {
  x: number;
  y: number;
  r: number;
  phase: number;
  speed: number;
  drift: number;
}

function cssColor(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/**
 * A calm, organic bioluminescent wave: soft light bands that breathe like
 * plankton glowing in night water, with a few tiny motes drifting up.
 */
export function Biolume({ width = 620, height = 260 }: { width?: number; height?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    el.width = Math.round(width * dpr);
    el.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const colors = [cssColor('--accent-mesh', '#c8f23c'), cssColor('--accent-2', '#22c27a'), '#7fd8ff'];
    const motes: Mote[] = Array.from({ length: 34 }, () => ({
      x: Math.random() * width,
      y: height * (0.35 + Math.random() * 0.5),
      r: 0.8 + Math.random() * 1.8,
      phase: Math.random() * Math.PI * 2,
      speed: 0.12 + Math.random() * 0.25,
      drift: (Math.random() - 0.5) * 0.15,
    }));
    const reduced = prefersReducedMotion();
    let raf = 0;
    const start = performance.now();

    const draw = (now: number) => {
      const t = (now - start) / 1000;
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'lighter';
      const breath = 0.5 + 0.5 * Math.sin(t * 0.9);
      // Light bands: layered, slow sine waves with a soft glow.
      for (let b = 0; b < 4; b++) {
        const color = colors[b % colors.length] ?? '#c8f23c';
        const amp = 18 + b * 7 + breath * 10;
        const base = height * 0.52 + Math.sin(t * 0.35 + b) * 8;
        ctx.beginPath();
        for (let x = -10; x <= width + 10; x += 6) {
          const k = x / width;
          const env = Math.sin(Math.PI * Math.min(1, Math.max(0, k))) ** 1.4;
          const y =
            base +
            env *
              (Math.sin(k * 6.2 + t * (0.7 + b * 0.18) + b * 1.7) * amp +
                Math.sin(k * 13 - t * (0.45 + b * 0.1)) * amp * 0.28);
          if (x === -10) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.22 + breath * 0.14 - b * 0.03;
        ctx.lineWidth = 2.4 - b * 0.35;
        ctx.shadowColor = color;
        ctx.shadowBlur = 22 + breath * 16;
        ctx.stroke();
      }
      // A soft glow at the heart of the wave.
      const g = ctx.createRadialGradient(width / 2, height * 0.52, 0, width / 2, height * 0.52, width * 0.32);
      g.addColorStop(0, colors[0] ?? '#c8f23c');
      g.addColorStop(1, 'transparent');
      ctx.globalAlpha = 0.07 + breath * 0.07;
      ctx.shadowBlur = 0;
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
      // Motes rising slowly and twinkling.
      for (const m of motes) {
        if (!reduced) {
          m.y -= m.speed * 0.35;
          m.x += m.drift;
          if (m.y < height * 0.15) {
            m.y = height * (0.75 + Math.random() * 0.2);
            m.x = Math.random() * width;
          }
        }
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.3 + m.phase));
        ctx.globalAlpha = tw * 0.7;
        ctx.fillStyle = colors[1] ?? '#22c27a';
        ctx.shadowColor = colors[0] ?? '#c8f23c';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      if (!reduced) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [width, height]);

  return <canvas ref={canvas} className="biolume" style={{ width, height }} aria-hidden="true" />;
}
