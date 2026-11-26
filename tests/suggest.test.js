import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  suggest,
  suggestWithX,
  suggestBest,
  parseSiteswap,
  getUps,
  getDowns,
  initialState,
  suffixMap,
  isValidAsyncToss,
  toInt,
  asyncToToss,
  syncToToss,
} from '../suggest.js';

function checkPrefix(prefix, allowMultiplex, isSync) {
  const suffix = suggest(prefix, allowMultiplex, isSync);
  assert.equal(typeof suffix, 'string', `Expected suffix string for "${prefix}", got ${JSON.stringify(suffix)}`);
  const full = prefix + suffix;
  const s = parseSiteswap(full, isSync);
  assert.equal(s.error, undefined, `Expected "${full}" to parse cleanly, got: ${s.error}`);
  assert.equal(s.parse_state, initialState(isSync), `Expected "${full}" to end in initial parse state`);
  assert.deepEqual(getUps(s), getDowns(s, 0), `Expected ups === downs for "${full}"`);
}

describe('suggest (sync & multiplex)', () => {
  const syncCases = [
    '(4',
    '(4,4)',
    '(4,2x',
    '(4,2x)',
    '(4,2x)(',
    '(4,4)([',
    '(4,2x)(2x',
    '(4,2x)(2x,',
    '(2x,4)(4,2',
    '(2x,4x)(4,[',
    '(2,4)(8,4)([',
    '(4,4)([2',
    '(4,4)([2x',
    '(4,4)([44',
    '(4,4)([4x4x',
    '([2x2x],4)(4,[2x',
    '([6x2x],4)(4,[2x8x',
    '([44],2x)(2x,[4',
    '([64],2x)(2x,[44',
    '(4,2x)(2x,4',
    '([44],2x)(2x,[44',
    '([2x2x],4)(4,[2x2x',
    '([2x2x],4)(4,[2x2x]',
    '(4,4)(0,0)(',
    '(',
    '(0,0',
    '(2x,0)(8,ax)(cx,8)',
  ];

  for (const prefix of syncCases) {
    it(`completes sync prefix "${prefix}"`, () => {
      checkPrefix(prefix, true, true);
    });
  }
});

describe('suggest (async)', () => {
  it('completes vanilla async prefixes', () => {
    checkPrefix('1468', false, false);
    checkPrefix('0', false, false);
    checkPrefix('0[', false, false);
    checkPrefix('531', false, false);
  });

  it('completes multiplex async prefixes', () => {
    checkPrefix('745[25', true, false);
    checkPrefix('1468', true, false);
    checkPrefix('0[', true, false);
    checkPrefix('32', true, false);
  });
});

describe('suggest regression & error cases', () => {
  it('returns error on unparseable inputs', () => {
    const res1 = suggest('53!', false, false);
    assert.ok(res1.error);
    const res2 = suggest('(3,4)', true, true); // odd throw in sync
    assert.ok(res2.error);
    const res3 = suggest('[]', true, false); // empty multiplex
    assert.ok(res3.error);
  });

  it('returns error when no valid vanilla suffix exists (e.g. "32")', () => {
    const res = suggest('32', false, false);
    assert.ok(res.error);
  });

  it('returns clean error when all suffixes require throws > z (35)', () => {
    const prefix = '6'.repeat(36) + '[67]';
    const res = suggest(prefix, true, false);
    assert.equal(typeof res, 'object');
    assert.ok(res.error, 'Expected structured error object instead of "undefined" string');
    assert.match(res.error, /higher than 'z'/);
  });

  it('anchors isValidAsyncToss and rejects uppercase in toInt', () => {
    assert.equal(isValidAsyncToss('a'), true);
    assert.equal(isValidAsyncToss('!a'), false);
    assert.equal(isValidAsyncToss('A'), false);
    assert.throws(() => toInt('A'), RangeError);
  });

  it('throws RangeError on out-of-range throws in asyncToToss and syncToToss', () => {
    assert.equal(asyncToToss(35), 'z');
    assert.throws(() => asyncToToss(36), RangeError);
    assert.throws(() => asyncToToss(-1), RangeError);
    assert.equal(syncToToss(35, -1), 'yx');
    assert.throws(() => syncToToss(35, 1), RangeError);
    assert.throws(() => syncToToss(1, -1), RangeError);
  });

  it('sorts multiplex throws numerically in suffixMap', () => {
    // Throw beat 0 needs catches at beats 2 and 10 in a length-12 pattern -> tosses [2, 10]
    const map = suffixMap([0, 0], [10, 2], 12, false);
    assert.deepEqual(map[0], [2, 10]);
  });

  it('suggestWithX works inside sync multiplex brackets and skips async mode', () => {
    // Async mode should immediately return undefined
    assert.equal(suggestWithX('53', true, false), undefined);

    // Sync simple throw: (4,2 -> adding x gives (4,2x which completes as )
    const simpleX = suggestWithX('(4,2', true, true);
    assert.equal(typeof simpleX, 'string');
    const parsedSimple = parseSiteswap('(4,2x' + simpleX, true);
    assert.equal(parsedSimple.error, undefined);
    assert.deepEqual(getUps(parsedSimple), getDowns(parsedSimple, 0));

    // Sync first-hand multiplex: ([4 -> adding x gives ([4x
    const firstBraceX = suggestWithX('([4', true, true);
    assert.equal(typeof firstBraceX, 'string');
    const parsedFirst = parseSiteswap('([4x' + firstBraceX, true);
    assert.equal(parsedFirst.error, undefined);
    assert.deepEqual(getUps(parsedFirst), getDowns(parsedFirst, 0));

    // Sync second-hand multiplex: (4,[2 -> adding x gives (4,[2x
    const secondBraceX = suggestWithX('(4,[2', true, true);
    assert.equal(typeof secondBraceX, 'string');
    const parsedSecond = parseSiteswap('(4,[2x' + secondBraceX, true);
    assert.equal(parsedSecond.error, undefined);
    assert.deepEqual(getUps(parsedSecond), getDowns(parsedSecond, 0));

    // Already has x -> cannot add another x
    assert.equal(suggestWithX('([4x', true, true), undefined);
  });

  it('suggestBest returns siteswap identical to re-parsing prefix + suffix', () => {
    const cases = [
      ['531', false, false],
      ['745[25', true, false],
      ['0[', false, false],
      ['(', true, true],
      ['(4,2', true, true],
      ['([4', true, true],
      ['(4,[2', true, true],
      ['([64],2x)(2x,[44', true, true],
      ['(4,4)(0,0)(', true, true],
    ];
    for (const [prefix, allowMultiplex, isSync] of cases) {
      const result = suggestBest(prefix, allowMultiplex, isSync);
      assert.equal(result.error, undefined, `Unexpected error for "${prefix}": ${result.error}`);
      const reparsed = parseSiteswap(prefix + result.suffix, isSync);
      assert.equal(reparsed.error, undefined);
      assert.equal(reparsed.parse_state, initialState(isSync));
      assert.deepEqual(result.siteswap, reparsed.siteswap);
      assert.deepEqual(getUps(reparsed), getDowns(reparsed, 0));
    }
  });
});
