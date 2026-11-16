import { describe, expect, it } from 'vitest';
import { emptyState } from '../state/defaults';
import { parseState } from '../state/store';

describe('state from schema 3', () => {
  it('migrates v3 state to v4 with an energy curve seed', () => {
    const base = emptyState();
    // v3 knew colour worlds but no layouts yet.
    const v3 = {
      ...base,
      schemaVersion: 3,
      thoughts: undefined,
      settings: { ...base.settings, appearance: { palette: 'lime', ambience: 'none' } },
      wellbeing: { ...base.wellbeing, energyDay: '2026-11-03', energyLevel: 4, energyLog: undefined },
    };
    const s = parseState(JSON.stringify(v3));
    expect(s?.schemaVersion).toBe(4);
    expect(s?.thoughts).toEqual([]);
    expect(s?.wellbeing.energyLog).toEqual({ '2026-11-03': 4 });
    // The rooms came back in 2.x: data without one starts in Classic.
    expect(s?.settings.appearance.layout).toBe('classic');
  });
});

describe('settings from 1.3 and older', () => {
  it('maps retired colour worlds and fills new settings', () => {
    const old = emptyState();
    const raw = {
      ...old,
      settings: {
        ...old.settings,
        appearance: { palette: 'solaris', ambience: 'none', layout: 'hub' },
        overlay: { enabled: true, opacity: 0.6 },
        media: undefined,
      },
    };
    const s = parseState(JSON.stringify(raw));
    expect(s?.settings.appearance).toMatchObject({ palette: 'mono', standby: 'calm', ambient: 0.55, corners: 'precise' });
    expect(s?.settings.overlay).toMatchObject({ enabled: true, opacity: 0.6, modules: { avatar: true, anchor: true } });
    // 1.7: the player leaves the home screen once and stays in the overlay.
    expect(s?.settings.media).toEqual({ enabled: true, inTopbar: false, rev: 2 });
    expect(s?.settings.overlay.modules.media).toBe(true);
    const moss = parseState(JSON.stringify({ ...raw, settings: { ...raw.settings, appearance: { palette: 'moss' } } }));
    expect(moss?.settings.appearance.palette).toBe('lime');
    // 1.17: Abendrot became Midnight; 1.18: Midnight became pure white light.
    const sunset = parseState(JSON.stringify({ ...raw, settings: { ...raw.settings, appearance: { palette: 'sunset' } } }));
    expect(sunset?.settings.appearance.palette).toBe('mono');
  });

  it('starts new installs dark (no bright flash)', () => {
    expect(emptyState().settings.theme).toBe('dark');
  });
});

describe('settings from 1.17 (OLED redesign)', () => {
  const withAppearance = (appearance: Record<string, unknown>, theme = 'light') => {
    const old = emptyState();
    return parseState(JSON.stringify({ ...old, settings: { ...old.settings, theme, appearance: { ...old.settings.appearance, ...appearance } } }));
  };

  it('moves every colour world to its closest ambient light', () => {
    const expected: Record<string, string> = {
      lime: 'lime',
      rose: 'rose',
      ocean: 'cyan',
      midnight: 'mono',
      lavender: 'violet',
      neon: 'cyan',
      pulse: 'rose',
      matrix: 'cyan',
      nonsense: 'lime',
    };
    for (const [from, to] of Object.entries(expected)) expect(withAppearance({ palette: from })?.settings.appearance.palette, from).toBe(to);
  });

  it('loads the system theme as dark; Tageslicht (light) is a choice again since 2.x', () => {
    expect(withAppearance({}, 'light')?.settings.theme).toBe('light');
    expect(withAppearance({}, 'system')?.settings.theme).toBe('dark');
  });

  it('keeps a valid light strength and corner style, repairs broken ones', () => {
    expect(withAppearance({ ambient: 0, corners: 'sharp' })?.settings.appearance).toMatchObject({ ambient: 0, corners: 'sharp' });
    expect(withAppearance({ ambient: 3, corners: 'round' })?.settings.appearance).toMatchObject({ ambient: 1, corners: 'precise' });
    expect(withAppearance({ ambient: 'bright' })?.settings.appearance.ambient).toBe(0.55);
  });
});

describe('settings from 1.4', () => {
  it('fills winter, silent focus and the afternoon check for older data', () => {
    const old = emptyState();
    const raw = {
      ...old,
      settings: {
        ...old.settings,
        appearance: { palette: 'lime', ambience: 'clouds', layout: 'flow', standby: 'drift' },
        companion: { ...old.settings.companion, softCheck: undefined },
      },
      wellbeing: { ...old.wellbeing, softCheckDay: undefined },
    };
    const s = parseState(JSON.stringify(raw));
    expect(s?.settings.appearance).toMatchObject({ standby: 'drift', xmas: 'december', focusStyle: 'breathe' });
    expect(s?.settings.companion.softCheck).toBe(true);
    expect(s?.wellbeing.softCheckDay ?? null).toBeNull();
  });
});

describe('defaults for new installs', () => {
  it('starts in the Classic room and knows no workspace editor', () => {
    expect(emptyState().settings.appearance.layout).toBe('classic');
    expect(emptyState().settings).not.toHaveProperty('workspace');
  });
});

describe('settings from 1.17 (home layouts)', () => {
  it('keeps a known room, drops the workspace editor', () => {
    const old = emptyState();
    const raw = {
      ...old,
      settings: {
        ...old.settings,
        appearance: { ...old.settings.appearance, palette: 'cyan', layout: 'flow', standby: 'drift' },
        workspace: { hub: { order: ['focus'], size: { focus: 'l' } } },
      },
    };
    const s = parseState(JSON.stringify(raw));
    expect(s?.settings.appearance.layout).toBe('flow');
    expect(s?.settings).not.toHaveProperty('workspace');
    expect(s?.settings.appearance).toMatchObject({ palette: 'cyan', standby: 'drift' });
  });
});

describe('settings from 1.6', () => {
  it('keeps the player off the home screen but in the overlay, once', () => {
    const old = emptyState();
    const raw = {
      ...old,
      settings: {
        ...old.settings,
        media: { enabled: true, inTopbar: true },
        overlay: { ...old.settings.overlay, modules: { avatar: true, anchor: true, progress: true, media: false } },
      },
    };
    const s = parseState(JSON.stringify(raw));
    expect(s?.settings.media).toEqual({ enabled: true, inTopbar: false, rev: 2 });
    expect(s?.settings.overlay.modules.media).toBe(true);
    // A later choice for the home screen is respected.
    const again = parseState(JSON.stringify({ ...s, settings: { ...s?.settings, media: { enabled: true, inTopbar: true, rev: 2 } } }));
    expect(again?.settings.media.inTopbar).toBe(true);
  });

  it('drops retired overlay options', () => {
    const old = emptyState();
    const raw = {
      ...old,
      settings: { ...old.settings, overlay: { ...old.settings.overlay, compact: true, modules: { ...old.settings.overlay.modules, timeline: true } } },
    };
    const s = parseState(JSON.stringify(raw));
    expect(s?.settings.overlay).not.toHaveProperty('compact');
    expect(s?.settings.overlay.modules).not.toHaveProperty('timeline');
  });

  it('starts with the ambience sound off and at half volume', () => {
    expect(emptyState().settings.appearance).toMatchObject({ sound: false, soundVolume: 0.5 });
  });
});

describe('defaults and the companion tour', () => {
  it('starts with the gentle wave and a tour that has not been shown yet', () => {
    const s = emptyState();
    expect(s.settings.appearance.timeline).toBe('wave');
    expect(s.settings.tourDone).toBe(false);
  });

  it('shows the tour once to people updating from 1.7', () => {
    const old = emptyState();
    const { tourDone: _drop, ...settings } = { ...old.settings, onboarded: true };
    void _drop;
    const s = parseState(JSON.stringify({ ...old, settings: { ...settings, appearance: { ...old.settings.appearance, timeline: undefined } } }));
    expect(s?.settings.onboarded).toBe(true);
    expect(s?.settings.tourDone).toBe(false);
    expect(s?.settings.appearance.timeline).toBe('wave');
  });
});

describe('settings from 1.8', () => {
  it('turns the quiet focus switch into the tunnel focus style', () => {
    const old = emptyState();
    const raw = { ...old, settings: { ...old.settings, appearance: { ...old.settings.appearance, focusStyle: undefined, silentFocus: true } } };
    const s = parseState(JSON.stringify(raw));
    expect(s?.settings.appearance.focusStyle).toBe('tunnel');
    expect(s?.settings.appearance).not.toHaveProperty('silentFocus');
    expect(s?.settings).toMatchObject({ uiSounds: true, oneStep: false, brain: null });
  });
});

describe('the room of Heute', () => {
  it('keeps the four rooms and falls back to Classic for anything else', () => {
    const base = emptyState();
    const load = (layout: unknown) =>
      parseState(JSON.stringify({ ...base, settings: { ...base.settings, appearance: { ...base.settings.appearance, layout } } }))?.settings.appearance.layout;
    for (const room of ['classic', 'sanctuary', 'hub', 'flow', 'duo']) expect(load(room)).toBe(room);
    expect(load('diagonal')).toBe('classic');
    expect(load(undefined)).toBe('classic');
  });
});
