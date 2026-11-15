import { useServices } from '../app/services';
import type { AppState } from '../domain/types';
import { desktop } from '../lib/desktop';
import { MediaControl } from './MediaControl';

export type View = 'today' | 'times' | 'companion' | 'closing';

/**
 * The header, reduced to what a window needs: an invisible strip along the
 * top edge that moves the window (desktop) and keeps media and the demo hint
 * beside the window buttons. Navigation, wordmark and the day end live in the
 * dock; where you are is said by the page itself.
 */
export function Topbar({ state }: { state: AppState }) {
  const { mode, clock } = useServices();
  const showMedia = Boolean(desktop) && state.settings.media.enabled && state.settings.media.inTopbar;

  return (
    <header className="topbar-wrap">
      <div className="topbar">
        {showMedia && <MediaControl />}
        {mode === 'demo' && (
          <span className="tag" title="Entwickler-Vorschau mit Beispieldaten">
            Demo {clock.speed}×
          </span>
        )}
      </div>
    </header>
  );
}
