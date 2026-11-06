import { describe, expect, it } from 'vitest';
import { moveCard, workspaceFrom } from '../components/Workspace';

describe('workspace editor', () => {
  it('starts from the layout order without the greeting', () => {
    const ws = workspaceFrom(['greet', 'focus', 'plan', 'tl']);
    expect(ws.order).toEqual(['focus', 'plan', 'tl']);
    expect(ws.size.tl).toBe('xl');
  });
  it('moves a card onto the place of another', () => {
    expect(moveCard(['a', 'b', 'c', 'd'], 'a', 'c')).toEqual(['b', 'c', 'a', 'd']);
    expect(moveCard(['a', 'b', 'c', 'd'], 'd', 'b')).toEqual(['a', 'd', 'b', 'c']);
  });
});
