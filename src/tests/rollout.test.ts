// @vitest-environment node
// @ts-expect-error plain ESM script without types
import { setStaging, stagingOf } from '../../scripts/rollout.mjs';

const latest = `version: 1.15.3
files:
  - url: ToDoMe-Setup-1.15.3.exe
    sha512: abc==
    size: 113466264
path: ToDoMe-Setup-1.15.3.exe
sha512: abc==
releaseDate: '2026-11-09T07:00:00.000Z'
`;

describe('staged rollout (scripts/rollout.mjs)', () => {
  it('sets, changes and removes the staging percentage, leaving the rest untouched', () => {
    const ten = setStaging(latest, 10);
    expect(ten).toBe(`${latest}stagingPercentage: 10\n`);
    expect(stagingOf(ten)).toBe(10);
    const fifty = setStaging(ten.replace(/\n/g, '\r\n'), 50);
    expect(fifty.match(/stagingPercentage/g)).toHaveLength(1);
    expect(stagingOf(fifty)).toBe(50);
    expect(setStaging(fifty, 100)).toBe(latest);
    expect(stagingOf(latest)).toBe(100);
    expect(stagingOf(setStaging(latest, 0))).toBe(0);
  });

  it('refuses anything but 0 to 100', () => {
    expect(() => setStaging(latest, 101)).toThrow();
    expect(() => setStaging(latest, Number.NaN)).toThrow();
    expect(() => setStaging(latest, 12.5)).toThrow();
  });
});
