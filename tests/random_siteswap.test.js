import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomSiteswap, sampleRange } from '../random_siteswap.js';
import { parseSiteswap, printSiteswap, getUps, getDowns, initialState } from '../suggest.js';

describe('randomSiteswap', () => {
  for (const [label, vanilla, isSync] of [
    ['vanilla async', true, false],
    ['multiplex async', false, false],
    ['vanilla sync', true, true],
    ['multiplex sync', false, true],
  ]) {
    it(`generates 500 valid ${label} patterns`, () => {
      for (let i = 0; i < 500; i++) {
        const list = randomSiteswap(vanilla, isSync);
        const str = printSiteswap(list, isSync);
        const parsed = parseSiteswap(str, isSync);
        assert.equal(parsed.error, undefined, `Failed to parse "${str}": ${parsed.error}`);
        assert.equal(parsed.parse_state, initialState(isSync));
        assert.deepEqual(getUps(parsed), getDowns(parsed, 0), `Invalid siteswap "${str}"`);
      }
    });
  }

  it('sampleRange reaches all endpoints uniformly without duplicates', () => {
    const seen = new Set();
    for (let i = 0; i < 200; i++) {
      const [val] = sampleRange(1, 6, 1);
      assert.ok(val >= 1 && val < 6);
      seen.add(val);
    }
    // Previously the top value (5) had 0% probability on single draws.
    assert.deepEqual([...seen].sort((a, b) => a - b), [1, 2, 3, 4, 5]);

    const full = sampleRange(3, 8, 5);
    assert.equal(new Set(full).size, 5);
    assert.deepEqual([...full].sort((a, b) => a - b), [3, 4, 5, 6, 7]);
  });
});
