import { useEffect, useRef, useState } from 'react';
import { avatarName } from '../../domain/companion';
import { COMPANION_SIZES, LIGHT_MODES, lightLabel, UI_SCALES } from '../../domain/lights';
import type { AppState } from '../../domain/types';
import type { Activity } from '../../domain/energy';
import { AvatarScene } from '../AvatarScene';

const CORNER_WORDS = { sharp: 'Kantig', precise: 'Präzise', soft: 'Weich' } as const;

/** What changed between two looks, in his words (null when nothing he notices). */
function reaction(before: AppState['settings'], after: AppState['settings'], name: string): string | null {
  const a = before.appearance;
  const b = after.appearance;
  if (a.palette !== b.palette) return `Oh, ${lightLabel(b.palette)}! Das Licht fühlt sich gleich anders an.`;
  if (a.lightMode !== b.lightMode) return `${LIGHT_MODES.find((m) => m.id === b.lightMode)?.label}. Schau mal, wie es sich bewegt.`;
  if (a.corners !== b.corners) return `${CORNER_WORDS[b.corners]}. Alle Ecken folgen dir sofort.`;
  if (a.uiScale !== b.uiScale) return `${Math.round(b.uiScale * 100)} %. So liest es sich für dich am ruhigsten?`;
  if (a.companionSize !== b.companionSize) return `${COMPANION_SIZES.find((z) => z.id === b.companionSize)?.label}? Ich mag das.`;
  if (before.theme !== after.theme) return after.theme === 'light' ? 'Tageslicht. Wach und klar.' : 'Die Nacht. Still und tief.';
  if (a.ambience !== b.ambience) return 'Eine neue Atmosphäre. Hörst du sie auch?';
  if (before.companion.home !== after.companion.home) return `${name} fühlt sich zu Hause.`;
  return null;
}

/**
 * The studio's live preview: a small sheet of the app in the current look
 * (theme, light colour and how it moves, corners, interface size), and the
 * companion beside it, who notices every change and says so.
 */
export function SettingsPreview({ state }: { state: AppState }) {
  const s = state.settings;
  const name = avatarName(s.companion.avatar);
  const [line, setLine] = useState<string>(`Ich bin ${name}. Was du hier änderst, sehe ich sofort.`);
  const [cheer, setCheer] = useState(0);
  const previous = useRef(s);
  useEffect(() => {
    const said = reaction(previous.current, s, name);
    previous.current = s;
    if (!said) return;
    setLine(said);
    setCheer((n) => n + 1);
  }, [s, name]);
  const activity: Activity = cheer % 2 === 1 ? 'tea' : 'reading';
  const scale = UI_SCALES.find((u) => u.id === s.appearance.uiScale);

  return (
    <aside className="studio-preview" aria-label="Live-Vorschau">
      <p className="label">Live-Vorschau</p>
      <div className={`studio-preview__sheet studio-preview__sheet--${s.appearance.lightMode}`} aria-hidden="true">
        <span className="studio-preview__light" />
        <span className="studio-preview__light studio-preview__light--b" />
        <div className="studio-preview__card" style={{ fontSize: `${13 * s.appearance.uiScale}px` }}>
          <span className="studio-preview__kicker">Dein nächster Schritt</span>
          <strong>Checkout gestalten</strong>
          <span className="studio-preview__button">Ankommen und starten</span>
        </div>
      </div>
      <dl className="studio-preview__facts">
        <div>
          <dt>Licht</dt>
          <dd>{lightLabel(s.appearance.palette)}</dd>
        </div>
        <div>
          <dt>Bewegung</dt>
          <dd>{LIGHT_MODES.find((m) => m.id === s.appearance.lightMode)?.label}</dd>
        </div>
        <div>
          <dt>Ecken</dt>
          <dd>{CORNER_WORDS[s.appearance.corners]}</dd>
        </div>
        <div>
          <dt>Größe</dt>
          <dd>{scale ? `${scale.label}, ${Math.round(scale.id * 100)} %` : '100 %'}</dd>
        </div>
      </dl>
      <div className="studio-preview__buddy">
        <span key={cheer} className="studio-preview__figure" aria-hidden="true">
          <AvatarScene avatar={s.companion.avatar} activity={activity} size={88} />
        </span>
        <p className="studio-preview__says" aria-live="polite">
          {line}
        </p>
      </div>
    </aside>
  );
}
