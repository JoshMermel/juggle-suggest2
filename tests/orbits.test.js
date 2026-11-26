import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { maxThrow, maxLandings, splitOrbits, Pos } from '../orbits.js';
import { parseSiteswap } from '../suggest.js';
import { palette, recolorByOrbit, recolorRandomly, setSiteswap } from '../anim.js';

describe('orbits', () => {
  it('computes maxThrow for async and sync patterns', () => {
    assert.equal(maxThrow(parseSiteswap('531', false).siteswap, false), 5);
    assert.equal(maxThrow(parseSiteswap('(4,2x)(2x,4)', true).siteswap, true), 4);
    assert.equal(maxThrow(parseSiteswap('(6x,4)(4,6x)', true).siteswap, true), 6);
  });

  it('splits 531 into 3 balls across 2 orbits ([5,1] and [3])', () => {
    const orbits = splitOrbits(parseSiteswap('531', false).siteswap, false);
    assert.equal(orbits.length, 3);
    assert.equal(new Set(orbits.map(o => o.id)).size, 2);
  });

  it('splits 441 into 3 balls in 1 orbit ([4,4,1])', () => {
    const orbits = splitOrbits(parseSiteswap('441', false).siteswap, false);
    assert.equal(orbits.length, 3);
    assert.equal(new Set(orbits.map(o => o.id)).size, 1);
  });

  it('splits 42 into 3 balls across 2 orbits', () => {
    const orbits = splitOrbits(parseSiteswap('42', false).siteswap, false);
    assert.equal(orbits.length, 3);
    assert.equal(new Set(orbits.map(o => o.id)).size, 2);
  });

  it('does not mutate caller siteswap array in splitOrbits', () => {
    const siteswap = parseSiteswap('531', false).siteswap;
    const snapshot = siteswap.map(b => [...b]);
    splitOrbits(siteswap, false);
    assert.deepEqual(siteswap, snapshot);
  });

  it('skips 0 throws inside multiplexes (e.g. 3[30])', () => {
    const siteswap = parseSiteswap('3[30]', false).siteswap;
    const orbits = splitOrbits(siteswap, false);
    assert.equal(orbits.length, 3);
    for (const orbit of orbits) {
      assert.ok(orbit.toss_seq.every(t => t > 0), `Found 0 throw in orbit: ${orbit.toss_seq}`);
    }
  });

  it('returns 0 orbits for all-zero patterns', () => {
    assert.equal(splitOrbits(parseSiteswap('0', false).siteswap, false).length, 0);
    assert.equal(splitOrbits(parseSiteswap('(0,0)', true).siteswap, true).length, 0);
  });

  it('initializes maxLandings entries to numeric 0 on empty beats', () => {
    const landings = maxLandings(parseSiteswap('504', false).siteswap, false);
    assert.deepEqual(landings, [4, 0, 5]);
    const sparse = maxLandings([[3], [], [3]], false);
    assert.deepEqual(sparse, [3, 0, 3]);
    for (const val of sparse) {
      assert.equal(typeof val, 'number');
    }
  });

  it('computes Pos without throwing across time range', () => {
    const orbits = splitOrbits(parseSiteswap('(4,2x)(2x,4)', true).siteswap, true);
    assert.equal(orbits.length, 3);
    for (const orbit of orbits) {
      for (let t = 0; t < 20; t += 0.37) {
        const pos = Pos(orbit, t, true);
        assert.ok(pos.time >= 0 && pos.time < pos.toss);
      }
    }
  });

  it('does not mutate global palette when recoloring', () => {
    const originalPalette = [...palette];
    setSiteswap(parseSiteswap('531', false).siteswap, true, false);
    recolorByOrbit();
    recolorRandomly();
    assert.deepEqual(palette, originalPalette);
  });
});
