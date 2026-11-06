import { useEffect, useState } from 'react';

/**
 * Keeps a small pop-up (menu, list) on screen for a short exit motion after it
 * was closed. `mounted` says whether to render it, `closing` whether it is
 * on its way out. Reduced motion closes at once.
 */
export function usePresence(open: boolean, ms = 140): { mounted: boolean; closing: boolean } {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) return setMounted(true);
    const instant = typeof window === 'undefined' || Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    if (instant) return setMounted(false);
    const id = window.setTimeout(() => setMounted(false), ms);
    return () => window.clearTimeout(id);
  }, [open, ms]);
  return { mounted: open || mounted, closing: !open && mounted };
}
