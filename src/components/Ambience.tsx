import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from '../app/theme';
import type { AmbienceId, WeatherSnapshot } from '../domain/types';
import { describeCode } from '../domain/weather';

type Effect = 'rain' | 'clouds' | 'snow' | 'leaves';

/** "Live" follows the weather outside; clear skies stay calm. */
export function resolveAmbience(kind: AmbienceId, weather: WeatherSnapshot | null): Effect | null {
  if (kind === 'none') return null;
  if (kind !== 'live') return kind;
  if (!weather) return null;
  const w = describeCode(weather.current.code).kind;
  if (w === 'rain' || w === 'drizzle' || w === 'storm') return 'rain';
  if (w === 'snow') return 'snow';
  if (w === 'cloudy' || w === 'fog' || w === 'partly') return 'clouds';
  return null;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  a: number;
  spin: number;
  rot: number;
  hue: number;
  /** For drops sliding down the glass. */
  stick?: number;
  /** Pre-rendered cloud. */
  img?: HTMLCanvasElement;
}

/**
 * A believable cumulus: overlapping puffs with a lit top and a soft, cooler
 * underside, rendered once into a sprite and then only moved.
 */
function makeCloud(w: number, dark: boolean): HTMLCanvasElement {
  const h = w * 0.55;
  const c = document.createElement('canvas');
  c.width = Math.round(w);
  c.height = Math.round(h);
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  const puffs = 7 + Math.floor(Math.random() * 5);
  const base = h * 0.68;
  ctx.filter = 'blur(1.5px)';
  for (let i = 0; i < puffs; i++) {
    const t = i / (puffs - 1);
    const r = w * (0.11 + Math.random() * 0.09) * (1 - Math.abs(t - 0.5) * 0.9);
    const x = w * (0.14 + t * 0.72) + (Math.random() - 0.5) * w * 0.05;
    const y = base - r * (0.55 + Math.random() * 0.5);
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.1, x, y, r);
    if (dark) {
      g.addColorStop(0, 'rgba(178,190,220,0.55)');
      g.addColorStop(0.65, 'rgba(120,134,170,0.38)');
      g.addColorStop(1, 'rgba(90,104,140,0)');
    } else {
      g.addColorStop(0, 'rgba(255,255,255,0.98)');
      g.addColorStop(0.6, 'rgba(240,245,252,0.9)');
      g.addColorStop(1, 'rgba(214,224,240,0)');
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Flat, slightly shaded base.
  const bg = ctx.createLinearGradient(0, base - h * 0.2, 0, base + h * 0.12);
  bg.addColorStop(0, dark ? 'rgba(130,145,180,0.35)' : 'rgba(246,249,253,0.9)');
  bg.addColorStop(1, dark ? 'rgba(80,92,125,0)' : 'rgba(200,212,232,0)');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.ellipse(w * 0.5, base, w * 0.4, h * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();
  return c;
}

const LEAF_HUES = [28, 18, 40, 8, 48];

/**
 * Subtle weather layer behind the glass: drizzle, drifting clouds, snow or
 * falling leaves. Runs on a single canvas, pauses when the window is hidden
 * and moves at a third of the pace for reduced motion.
 */
export function Ambience({ kind, weather, dark }: { kind: AmbienceId; weather: WeatherSnapshot | null; dark: boolean }) {
  const effect = resolveAmbience(kind, weather);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    if (!el || !effect) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    // Reduced motion: the weather still lives, just slower and calmer (never frozen).
    const pace = prefersReducedMotion() ? 0.3 : 1;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let parts: Particle[] = [];
    let drops: Particle[] = [];
    let raf = 0;
    let last = performance.now();

    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    const spawn = (initial: boolean): Particle => {
      if (effect === 'rain') return { x: rand(-50, w + 50), y: initial ? rand(-h, h) : rand(-120, -10), vx: -0.9, vy: rand(9, 14), r: rand(9, 18), a: rand(0.12, 0.28), spin: 0, rot: 0, hue: 0 };
      if (effect === 'snow') return { x: rand(0, w), y: initial ? rand(-h, h) : -10, vx: rand(-0.3, 0.3), vy: rand(0.35, 1.1), r: rand(1.2, 3.2), a: rand(0.35, 0.8), spin: rand(0.005, 0.02), rot: rand(0, 6.28), hue: 0 };
      if (effect === 'leaves')
        return { x: rand(0, w), y: initial ? rand(-h, h) : -20, vx: rand(-0.4, 0.4), vy: rand(0.5, 1.1), r: rand(5, 9), a: rand(0.35, 0.7), spin: rand(-0.03, 0.03), rot: rand(0, 6.28), hue: LEAF_HUES[Math.floor(rand(0, LEAF_HUES.length))] ?? 28 };
      // clouds: three depths, the far ones smaller, fainter and slower
      const depth = rand(0, 1);
      const size = (0.16 + depth * 0.22) * Math.max(w, 900);
      return { x: initial ? rand(-size, w) : -size - rand(0, w * 0.3), y: rand(-0.04 * h, 0.55 * h), vx: 0.04 + depth * 0.14, vy: 0, r: size, a: 0.45 + depth * 0.45, spin: 0, rot: 0, hue: 0, img: makeCloud(size, dark) };
    };
    const density = () => {
      const area = (w * h) / (1280 * 800);
      if (effect === 'rain') return Math.round(70 * area);
      if (effect === 'snow') return Math.round(80 * area);
      if (effect === 'leaves') return Math.round(16 * area);
      return Math.max(5, Math.round(8 * area));
    };

    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = window.innerWidth;
      h = window.innerHeight;
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      parts = Array.from({ length: density() }, () => spawn(true));
      if (effect === 'clouds') parts.sort((a, b) => a.r - b.r);
      drops = [];
    };

    const ink = dark ? '255,255,255' : '70,90,130';
    const draw = (dt: number) => {
      ctx.clearRect(0, 0, w, h);
      const k = Math.min(3, dt / 16.7) * pace;
      for (const p of parts) {
        p.x += p.vx * k;
        p.y += p.vy * k;
        p.rot += p.spin * k;
        if (effect === 'rain') {
          ctx.strokeStyle = `rgba(${ink},${p.a})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + p.vx * 1.6, p.y + p.r);
          ctx.stroke();
          if (p.y > h + 20) Object.assign(p, spawn(false));
        } else if (effect === 'snow') {
          p.x += Math.sin(p.rot) * 0.3 * k;
          ctx.fillStyle = `rgba(${dark ? '255,255,255' : '150,170,200'},${p.a})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
          if (p.y > h + 10) Object.assign(p, spawn(false));
        } else if (effect === 'leaves') {
          p.x += Math.sin(p.rot * 2) * 0.6 * k;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = `hsla(${p.hue}, 75%, ${dark ? 55 : 58}%, ${p.a})`;
          ctx.beginPath();
          ctx.ellipse(0, 0, p.r, p.r * 0.46, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = `hsla(${p.hue}, 60%, 35%, ${p.a * 0.6})`;
          ctx.beginPath();
          ctx.moveTo(-p.r, 0);
          ctx.lineTo(p.r, 0);
          ctx.stroke();
          ctx.restore();
          if (p.y > h + 20) Object.assign(p, spawn(false));
        } else if (p.img) {
          ctx.globalAlpha = p.a * (dark ? 0.75 : 0.85);
          ctx.drawImage(p.img, p.x, p.y);
          ctx.globalAlpha = 1;
          if (p.x > w) Object.assign(p, spawn(false));
        }
      }
      // Rain: a few drops that run down the glass and leave a short trail.
      if (effect === 'rain') {
        if (drops.length < 7 && Math.random() < 0.01 * k) drops.push({ x: rand(0, w), y: rand(0, h * 0.6), vx: 0, vy: 0, r: rand(1.8, 3.2), a: rand(0.2, 0.4), spin: 0, rot: 0, hue: 0, stick: rand(400, 1600) });
        drops = drops.filter((d) => d.y < h + 10 && d.a > 0.02);
        for (const d of drops) {
          if ((d.stick ?? 0) > 0) d.stick = (d.stick ?? 0) - dt;
          else {
            d.vy = Math.min(2.4, d.vy + 0.02 * k);
            d.y += d.vy * k;
            d.x += Math.sin(d.y / 30) * 0.2;
            d.a -= 0.0009 * k;
          }
          const trail = ctx.createLinearGradient(d.x, d.y - 40, d.x, d.y);
          trail.addColorStop(0, `rgba(${ink},0)`);
          trail.addColorStop(1, `rgba(${ink},${d.a * 0.5})`);
          ctx.strokeStyle = trail;
          ctx.lineWidth = d.r * 0.7;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(d.x, d.y - Math.min(40, d.vy * 18));
          ctx.lineTo(d.x, d.y);
          ctx.stroke();
          ctx.fillStyle = `rgba(${ink},${d.a})`;
          ctx.beginPath();
          ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    const loop = (t: number) => {
      const dt = t - last;
      // ~40 fps is plenty for ambience and kinder to the battery.
      if (dt >= 24) {
        last = t;
        draw(dt);
      }
      raf = requestAnimationFrame(loop);
    };
    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (document.visibilityState === 'visible') {
        last = performance.now();
        raf = requestAnimationFrame(loop);
      }
    };

    resize();
    draw(16);
    raf = requestAnimationFrame(loop);
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [effect, dark]);

  if (!effect) return null;
  return <canvas ref={canvas} className={`ambience ambience--${effect}`} aria-hidden="true" />;
}
