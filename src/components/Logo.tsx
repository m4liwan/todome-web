import logoDark from '../assets/logo-schwarz.png';
import logoLight from '../assets/logo-weiss.png';

/**
 * The ToDoMe. wordmark. Both versions are in the page; CSS shows the black
 * one in light mode and the white one in dark mode (incl. "like the system"),
 * so the right logo is there from the first frame and never flips late.
 */
export function Logo({ className = '', height = 22 }: { className?: string; height?: number }) {
  const width = Math.round(height * (1200 / 225));
  return (
    <span className={`brand-logo ${className}`} role="img" aria-label="ToDoMe." style={{ height, width }}>
      <img className="brand-logo__ink" src={logoDark} alt="" width={width} height={height} draggable={false} />
      <img className="brand-logo__light" src={logoLight} alt="" width={width} height={height} draggable={false} />
    </span>
  );
}
