import { describe, it, expect } from 'vitest';
import { resolveStyle, THEME_STYLES } from '../utils/themeStyle';
describe('theme style', () => {
  it('defaults to bold violet', () => { expect(resolveStyle(null)).toBe('bold_violet'); expect(resolveStyle('nope')).toBe('bold_violet'); });
  it('offers exactly three styles, light minimal is the only light one', () => {
    expect(Object.keys(THEME_STYLES)).toHaveLength(3);
    expect(Object.entries(THEME_STYLES).filter(([, s]) => !s.dark).map(([k]) => k)).toEqual(['light_minimal']);
  });
});
