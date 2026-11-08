import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServicesContext, type Services } from '../app/services';
import { Avatar } from '../components/Avatar';
import { AvatarFx, holoFor, useLegendaryShell } from '../components/AvatarFx';
import { LevelBadge } from '../components/LevelBadge';
import { CompanionHub } from '../components/CompanionHub';
import { CompanionFxSection } from '../components/dialogs/SettingsSections';
import { totalXpForLevel } from '../domain/companionProgression';
import type { AppState } from '../domain/types';
import { resolveEffects } from '../lib/effects';
import { createMemoryStore } from '../lib/storage';
import { emptyState } from '../state/defaults';
import { createStore, parseState } from '../state/store';
import { T0 } from '../test/helpers';

/** The system's reduced-motion preference, with a count of how often it was asked. */
function system(reduce: boolean) {
  const asked = vi.fn();
  window.matchMedia = ((query: string) => {
    asked(query);
    return { matches: reduce && query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {} };
  }) as unknown as typeof window.matchMedia;
  return asked;
}

function atLevel(level: number, companionFx = true): AppState {
  const s = emptyState();
  s.progression = { ...s.progression, stats: { ...s.progression.stats, xp: totalXpForLevel(level) + 40, level } };
  s.settings = { ...s.settings, appearance: { ...s.settings.appearance, companionFx } };
  return s;
}

function withStore(state: AppState) {
  const store = createStore({ storage: createMemoryStore(), key: 'k', initial: state, persistDelayMs: 0 });
  const services = { store } as unknown as Services;
  const wrap = (ui: React.ReactNode) => <ServicesContext.Provider value={services}>{ui}</ServicesContext.Provider>;
  return { store, wrap };
}

describe('the effects switch: data', () => {
  it('is on for everyone who never chose, and a real choice survives', () => {
    const base = emptyState();
    const raw = (companionFx: unknown) => JSON.stringify({ ...base, settings: { ...base.settings, appearance: { ...base.settings.appearance, companionFx } } });
    expect(parseState(raw(undefined))!.settings.appearance.companionFx).toBe(true);
    expect(parseState(raw('yes'))!.settings.appearance.companionFx).toBe(true);
    expect(parseState(raw(false))!.settings.appearance.companionFx).toBe(false);
  });

  it("puts the user's choice above everything the system allows", () => {
    expect(resolveEffects(false, 'full')).toBe('off');
    expect(resolveEffects(false, 'calm')).toBe('off');
    expect(resolveEffects(true, 'calm')).toBe('calm');
    expect(resolveEffects(true, 'full')).toBe('full');
  });
});

describe('the effects switch: companion', () => {
  beforeEach(() => void system(false));
  afterEach(() => void system(false));

  it('shows the plain companion at level 50 when switched off, and does not even listen to the system', () => {
    const asked = system(false);
    const { container } = render(
      <AvatarFx level={50} enabled={false}>
        <Avatar id="spike" holo={holoFor(50, false)} />
      </AvatarFx>,
    );
    expect(container.querySelector('.avatar-fx')).toBeNull();
    expect(container.querySelector('.avatar__holo')).toBeNull();
    expect(asked).not.toHaveBeenCalled();
  });

  it('lets the hub tell the plain story and keep the earned looks as earned', () => {
    const { container } = render(<CompanionHub state={atLevel(55, false)} now={T0} />);
    expect(container.querySelector('.avatar-fx')).toBeNull();
    expect(container.querySelector('.avatar__holo')).toBeNull();
    expect(container.querySelector('.companion-hub__hero')!.classList.contains('is-standard')).toBe(true);
    expect(screen.getAllByText(/Freigeschaltet, ruht gerade/)).toHaveLength(3);
  });
});

describe('the effects switch: settings', () => {
  beforeEach(() => void system(false));
  afterEach(() => void system(false));

  it('switches every level effect off and on again, with a word on what that means', () => {
    const { store, wrap } = withStore(atLevel(30));
    render(wrap(<CompanionFxSection />));
    const box = screen.getByRole('checkbox', { name: 'Glitzern, Aura, Holofoil und Sternenstaub zeigen' });
    expect((box as HTMLInputElement).checked).toBe(true);
    expect(box.getAttribute('aria-describedby')).toBe('settings-companion-fx-hint');

    fireEvent.click(box);
    expect(store.getState().settings.appearance.companionFx).toBe(false);
    expect(screen.getByText(/Dein Begleiter und die App erscheinen überall schlicht/)).toBeTruthy();
    // Earned stays earned: the switch never touches the progression.
    expect(store.getState().progression.stats.level).toBe(30);

    fireEvent.click(box);
    expect(store.getState().settings.appearance.companionFx).toBe(true);
  });

  it('says honestly when the system keeps the effects calm', () => {
    system(true);
    const { wrap } = withStore(atLevel(30));
    render(wrap(<CompanionFxSection />));
    expect(screen.getByText(/Gerade ruht alle Bewegung/)).toBeTruthy();
  });

  it('tells a newcomer what is ahead', () => {
    const { wrap } = withStore(atLevel(3));
    render(wrap(<CompanionFxSection />));
    expect(screen.getByText(/Ab Level 10 funkelt dein Begleiter/)).toBeTruthy();
  });
});

describe('the app-wide touch at level 50', () => {
  afterEach(() => void system(false));

  function Shell({ level, fx }: { level: number; fx: boolean }) {
    return <div className={`shell${useLegendaryShell(level, fx)}`} data-testid="shell" />;
  }
  const classes = () => screen.getByTestId('shell').className;

  it('marks the shell only at level 50 with effects on', () => {
    system(false);
    const { rerender } = render(<Shell level={50} fx />);
    expect(classes()).toBe('shell is-legendary');
    rerender(<Shell level={49} fx />);
    expect(classes()).toBe('shell');
    rerender(<Shell level={80} fx={false} />);
    expect(classes()).toBe('shell');
  });

  it('keeps the touch but stills it in calm mode', () => {
    system(true);
    render(<Shell level={50} fx />);
    expect(classes()).toBe('shell is-legendary is-fx-calm');
  });

  it('gives the level badge its own clipped shine, outside of the floats', () => {
    const { container } = render(<LevelBadge level={50} />);
    const shine = container.querySelector('.level-badge > .level-badge__shine');
    expect(shine?.getAttribute('aria-hidden')).toBe('true');
  });
});
