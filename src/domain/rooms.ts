import type { LayoutId } from './types';

/** The names of the rooms of "Heute" (the cards themselves live in components/Cockpit). */
export const ROOM_LABELS: Record<LayoutId, string> = {
  classic: 'Classic',
  sanctuary: 'Sanctuary',
  hub: 'Hub',
  flow: 'Flow',
  duo: 'Duo',
};
