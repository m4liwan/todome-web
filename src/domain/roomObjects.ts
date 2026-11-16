import type { Activity } from './energy';
import type { CompanionObjectId } from './types';

/**
 * The furniture of his room and what he does with it. Each thing has its
 * place on the floor (x in % of the room) and an activity; the idle spots
 * are where he goes on his own. Pure; the room draws and animates it.
 */
export interface RoomThing {
  id: CompanionObjectId;
  label: string;
  /** Where he stands to use it (x in % of the room). */
  x: number;
  activity: Activity;
  /** What he does there, after his name. */
  doing: string;
}

export const ROOM_THINGS: ReadonlyArray<RoomThing> = [
  { id: 'tea', label: 'Teekanne', x: 30, activity: 'tea', doing: 'gießt sich einen Tee ein und wärmt die Hände daran.' },
  { id: 'book', label: 'Buch', x: 75, activity: 'reading', doing: 'blättert in seinem Lieblingsbuch.' },
  { id: 'plant', label: 'Pflanze', x: 18, activity: 'waiting', doing: 'gießt die Pflanze. Sie wächst mit euch.' },
  { id: 'hearth', label: 'Kamin', x: 62, activity: 'tea', doing: 'sitzt am Kamin und schaut ins Feuer.' },
  { id: 'instrument', label: 'Instrument', x: 84, activity: 'waiting', doing: 'spielt eine leise Melodie, nur für dich.' },
  { id: 'candle', label: 'Kerze', x: 44, activity: 'reading', doing: 'liest im Schein der Kerze.' },
];

export const roomThing = (id: CompanionObjectId) => ROOM_THINGS.find((t) => t.id === id);

/** Where he wanders on his own when nothing else calls him. */
export interface IdleSpot {
  id: 'window' | 'middle' | 'sit';
  x: number;
  activity: Activity;
  doing: string;
}
export const IDLE_SPOTS: ReadonlyArray<IdleSpot> = [
  { id: 'window', x: 40, activity: 'waiting', doing: 'schaut aus dem Fenster und träumt ein bisschen.' },
  { id: 'middle', x: 56, activity: 'waiting', doing: 'schlendert gemütlich durch sein Zimmer.' },
  { id: 'sit', x: 50, activity: 'reading', doing: 'hat sich hingesetzt und liest.' },
];

/** The next place for a stroll: an idle spot or one of his things, never where he already is. */
export function nextStroll(at: number, owned: readonly CompanionObjectId[], seed: number): { x: number; activity: Activity; doing: string; thing?: CompanionObjectId } {
  const options = [...IDLE_SPOTS.map((s) => ({ x: s.x, activity: s.activity, doing: s.doing })), ...owned.flatMap((id) => {
    const t = roomThing(id);
    return t ? [{ x: t.x, activity: t.activity, doing: t.doing, thing: t.id }] : [];
  })].filter((o) => Math.abs(o.x - at) > 2);
  return options[Math.abs(Math.floor(seed)) % options.length] ?? { x: 56, activity: 'waiting', doing: IDLE_SPOTS[1]!.doing };
}
