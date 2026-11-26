import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CURATED_PALETTE,
  PALETTE,
  pickDistinctColors,
  contrastOnWhite,
  oklchToHex,
} from '../colors.js';

describe('colors.js perceptual palette', () => {
  it('ensures every curated and generated color has strong contrast on white', () => {
    for (const hex of CURATED_PALETTE) {
      assert.match(hex, /^#[0-9A-F]{6}$/);
      const ratio = contrastOnWhite(hex);
      assert.ok(ratio >= 3.3, `Expected ${hex} contrast >= 3.3 on white, got ${ratio.toFixed(2)}`);
    }

    const large = pickDistinctColors(40, { randomize: false });
    assert.equal(large.length, 40);
    for (const hex of large) {
      assert.match(hex, /^#[0-9A-F]{6}$/);
      const ratio = contrastOnWhite(hex);
      assert.ok(ratio >= 3.0, `Expected ${hex} contrast >= 3.0 on white, got ${ratio.toFixed(2)}`);
    }
  });

  it('produces unique colors with no duplicates up to 36 balls', () => {
    const colors = pickDistinctColors(36, { randomize: false });
    assert.equal(new Set(colors).size, 36);
    assert.equal(PALETTE.length, 36);
  });

  it('converts OKLCH hues cleanly without NaN or out-of-range bytes', () => {
    for (let h = 0; h < 360; h += 30) {
      assert.match(oklchToHex(0.52, 0.14, h), /^#[0-9A-F]{6}$/);
    }
  });
});
