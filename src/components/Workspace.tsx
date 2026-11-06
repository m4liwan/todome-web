import { useState, type ReactNode } from 'react';
import { useServices } from '../app/services';
import { hasPro, openPro } from '../app/pro';
import type { CardSize, LayoutId, Settings, Workspace } from '../domain/types';
import { IconChevronLeft, IconChevronRight, IconLock, IconPencil } from './icons';

const SPAN: Record<CardSize, number> = { s: 4, m: 6, l: 8, xl: 12 };
const SIZE_LABEL: Record<CardSize, string> = { s: 'S', m: 'M', l: 'L', xl: 'XL' };
const SIZES: CardSize[] = ['s', 'm', 'l', 'xl'];
const DEFAULT_SIZE: Record<string, CardSize> = {
  focus: 'l',
  hub: 's',
  plan: 's',
  water: 's',
  tl: 'xl',
  weather: 's',
  impulse: 's',
  times: 's',
  thoughts: 'm',
  week: 'm',
  routines: 'm',
};

const PANEL_NAMES: Record<string, string> = {
  focus: 'Fokus',
  hub: 'Begleiter',
  plan: 'Danach',
  water: 'Wasser',
  tl: 'Dein Tag',
  weather: 'Wetter',
  impulse: 'Gedanke für heute',
  times: 'Zeiten heute',
  thoughts: 'Gedanken-Parkplatz',
  week: 'Deine Woche',
  routines: 'Wohlfühl-Momente',
};

/** Start a workspace from the standard order of the layout. */
export function workspaceFrom(order: readonly string[]): Workspace {
  const cards = order.filter((id) => id !== 'greet');
  return { order: cards, size: Object.fromEntries(cards.map((id) => [id, DEFAULT_SIZE[id] ?? 'm'])) };
}

/** Moves `id` to the place of `target` (before it). */
export function moveCard(order: readonly string[], id: string, target: string): string[] {
  if (id === target) return [...order];
  const rest = order.filter((x) => x !== id);
  const at = rest.indexOf(target);
  rest.splice(at < 0 ? rest.length : at + (order.indexOf(id) < order.indexOf(target) ? 1 : 0), 0, id);
  return rest;
}

interface Props {
  layout: LayoutId;
  settings: Settings;
  /** Standard order of the layout (incl. "greet"). */
  standard: string[];
  panels: Record<string, ReactNode>;
  /** Hidden while a block runs or another view is open. */
  enabled: boolean;
}

/**
 * The home grid. Free: the calm, hand-tuned standard layouts. Pro: a
 * "Bearbeiten" mode to drag cards anywhere and give them a size.
 */
export function WorkspaceHome({ layout, settings, standard, panels, enabled }: Props) {
  const services = useServices();
  const pro = hasPro();
  const saved = pro ? settings.workspace[layout] : undefined;
  const [draft, setDraft] = useState<Workspace | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const editing = draft !== null;
  const ws = draft ?? saved ?? null;

  const save = (next: Workspace | null) => {
    const workspace = { ...settings.workspace };
    if (next) workspace[layout] = next;
    else delete workspace[layout];
    services.store.dispatch({ type: 'settings/update', patch: { workspace } });
  };

  const wrap = (id: string, inner: ReactNode, style?: React.CSSProperties, extra = '') => (
    <div key={id} className={`panel panel--${id}${extra}`} style={style}>
      {inner}
    </div>
  );

  const bar = enabled && (
    <div className="ws-fab">
      {editing ? (
        <div className="ws-toolbar" role="toolbar" aria-label="Workspace bearbeiten">
          <span className="ws-toolbar__hint">Karte greifen und auf ihren neuen Platz ziehen, Größe mit S M L XL</span>
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setDraft(null);
              save(null);
              services.announce('Standard-Layout ist wieder da.');
            }}
          >
            Zurücksetzen
          </button>
          <button
            type="button"
            className="btn btn--primary btn--small"
            onClick={() => {
              if (draft) save(draft);
              setDraft(null);
              services.announce('Dein Workspace ist gespeichert.');
            }}
          >
            Fertig
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="ws-edit"
          onClick={() => (pro ? setDraft(saved ?? workspaceFrom(standard)) : openPro('workspace'))}
          title={pro ? 'Karten frei anordnen' : 'Workspace-Editor: bald in Pro'}
        >
          {pro ? <IconPencil size={15} /> : <IconLock size={14} />}
          Bearbeiten
        </button>
      )}
    </div>
  );

  if (!ws) {
    return (
      <>
        <div className={`home home--${layout}`} key={layout}>
          {standard.map((id) => wrap(id, panels[id]))}
        </div>
        {bar}
      </>
    );
  }

  const setSize = (id: string, size: CardSize) => draft && setDraft({ ...draft, size: { ...draft.size, [id]: size } });
  const nudge = (id: string, dir: -1 | 1) => {
    if (!draft) return;
    const i = draft.order.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= draft.order.length) return;
    const order = [...draft.order];
    [order[i], order[j]] = [order[j] as string, order[i] as string];
    setDraft({ ...draft, order });
  };

  return (
    <>
      <div className={`home home--custom${editing ? ' is-editing' : ''}`} key={`custom-${layout}`}>
        {wrap('greet', panels.greet)}
        {ws.order
          .filter((id) => id in panels)
          .map((id) => {
            const size = ws.size[id] ?? 'm';
            const style = { '--span': SPAN[size] } as React.CSSProperties;
            if (!editing) return wrap(id, panels[id], style, ` is-${size}`);
            return (
              <div
                key={id}
                className={`panel panel--${id} is-${size} ws-card${dragging === id ? ' is-dragging' : ''}${over === id && dragging !== id ? ' is-over' : ''}`}
                style={style}
                onPointerDown={(e) => {
                  // Buttons in the tool bar keep working; anywhere else picks the card up.
                  if (e.button !== 0 || (e.target as Element).closest('button')) return;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setDragging(id);
                  setGhost({ x: e.clientX, y: e.clientY });
                }}
                onPointerMove={(e) => {
                  if (dragging !== id) return;
                  setGhost({ x: e.clientX, y: e.clientY });
                  // Near the top or bottom edge the page scrolls along.
                  const edge = 90;
                  if (e.clientY < edge) window.scrollBy(0, -Math.ceil((edge - e.clientY) / 4));
                  else if (e.clientY > window.innerHeight - edge) window.scrollBy(0, Math.ceil((e.clientY - window.innerHeight + edge) / 4));
                  const hit = document.elementsFromPoint(e.clientX, e.clientY).find((el) => el instanceof HTMLElement && el.dataset.card && el.dataset.card !== id) as HTMLElement | undefined;
                  setOver(hit?.dataset.card ?? null);
                }}
                onPointerUp={() => {
                  if (dragging === id && over && draft) setDraft({ ...draft, order: moveCard(draft.order, id, over) });
                  setDragging(null);
                  setOver(null);
                  setGhost(null);
                }}
                onPointerCancel={() => {
                  setDragging(null);
                  setOver(null);
                  setGhost(null);
                }}
                data-card={id}
              >
                <div className="ws-card__content" aria-hidden="true">
                  {panels[id]}
                </div>
                <div className="ws-card__tools">
                  <span className="ws-card__name">{PANEL_NAMES[id] ?? id}</span>
                  <span className="ws-card__sizes" role="radiogroup" aria-label={`Größe von ${PANEL_NAMES[id] ?? id}`}>
                    {SIZES.map((s) => (
                      <button key={s} type="button" role="radio" aria-checked={size === s} className={size === s ? 'is-on' : undefined} onClick={() => setSize(id, s)}>
                        {SIZE_LABEL[s]}
                      </button>
                    ))}
                  </span>
                  <span className="ws-card__move">
                    <button type="button" aria-label={`${PANEL_NAMES[id] ?? id} nach vorne`} onClick={() => nudge(id, -1)}>
                      <IconChevronLeft size={14} />
                    </button>
                    <button type="button" aria-label={`${PANEL_NAMES[id] ?? id} nach hinten`} onClick={() => nudge(id, 1)}>
                      <IconChevronRight size={14} />
                    </button>
                  </span>
                </div>
              </div>
            );
          })}
      </div>
      {editing && dragging && ghost && (
        <div className="ws-ghost" style={{ transform: `translate3d(${ghost.x + 14}px, ${ghost.y + 14}px, 0)` }} aria-hidden="true">
          {PANEL_NAMES[dragging] ?? dragging}
        </div>
      )}
      {bar}
    </>
  );
}
