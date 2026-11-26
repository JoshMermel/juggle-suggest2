import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMixed,
  classifyPrefixMode,
  effectiveSwitchRepeat,
  expandMhn,
  fromLegacySiteswap,
  isValidMhn,
  suggestUnified,
} from '../mhn.js';
import { parseSiteswap } from '../suggest.js';

describe('mhn.js parser and validator', () => {
  it('parses and validates pure async patterns', () => {
    for (const pat of ['3', '531', '441', '97531', '3[11][22]', '504']) {
      const mhn = parseMixed(pat);
      assert.equal(mhn.error, undefined, `Unexpected error for ${pat}: ${mhn.error}`);
      assert.equal(classifyPrefixMode(mhn), 'async');
      assert.equal(isValidMhn(mhn), true, `Expected ${pat} to be valid`);
    }
    assert.equal(isValidMhn(parseMixed('54')), false);
    assert.equal(isValidMhn(parseMixed('52')), false);
  });

  it('parses and validates pure sync patterns and * shorthand', () => {
    for (const pat of ['(4,4)', '(4,2x)(2x,4)', '(6x,4)(4,6x)', '([44],2x)(2x,[44])', '(4,2x)*', '(6x,4)*', '([44],2x)*']) {
      const mhn = parseMixed(pat);
      assert.equal(mhn.error, undefined, `Unexpected error for ${pat}: ${mhn.error}`);
      assert.equal(classifyPrefixMode(mhn), 'sync');
      assert.equal(isValidMhn(mhn), true, `Expected ${pat} to be valid`);
    }

    // Invalid * patterns
    assert.equal(isValidMhn(parseMixed('(4,2)*')), false);
    assert.equal(isValidMhn(parseMixed('(6x,2)*')), false);
  });

  it('expands (4,2x)* to match (4,2x)(2x,4) and odd async 531 to period 6', () => {
    const star = expandMhn(parseMixed('(4,2x)*'));
    const full = expandMhn(parseMixed('(4,2x)(2x,4)'));
    assert.equal(star.period, 4);
    assert.deepEqual(star, full);

    const oddAsync = expandMhn(parseMixed('531'));
    assert.equal(oddAsync.period, 6);
    assert.equal(effectiveSwitchRepeat(parseMixed('531')), true);
    assert.equal(effectiveSwitchRepeat(parseMixed('441')), true);
    assert.equal(effectiveSwitchRepeat(parseMixed('51')), false);
  });

  it('parses and validates mixed sync/async patterns with !, async x, L/R, and odd throws in sync', () => {
    // Classic JugglingLab mixed patterns:
    // 4x: 4-ball crossing async fountain (even throw crossing hands!)
    // 3x: 3-ball non-crossing async (odd throw staying on same hand -> wait: period 1 with switchRepeat=false!)
    // Let's verify period-2 4x4x or 3x:
    // For 4x (period 1, leftOnEven=true, beat 0 = L): L throws 4x -> lands on (0, R)! Not valid at period 1 without *!
    // 4x* has period 1 with mirror: L4x -> (0, R) which mirrors to (0, L)! VALID!
    // 4x4x has period 2: beat 0 L4x -> (0, R) conflict! Wait: beat 0 L4x -> (4%2=0, R) while beat 1 is R!
    // 3x3x: beat 0 L3x -> (3%2=1, L) conflict!
    // 3x*: beat 0 L3x -> (3%1=0, L), wraps=3 (odd) -> flips to (0, R) conflict!
    // 2x: L2x -> (0, R) -> 2x* valid!
    // Let's check real valid mixed patterns:
    const validMixed = [
      '4x*',             // 4-ball crossing fountain (L4x then R4x via *)
      '2x*',             // 2-ball crossing hold/zip via *
      '(4,2x)!(2x,4)!',  // sync with suppressed empty beat (actually period 2: L4->(0,L), R2x->(0,L) collision! wait)
    ];
    // Instead of guessing, check exact known-valid mixed patterns mathematically:
    const knownValid = [
      '4x*',             // period 1 *: (L,0) 4x -> rawDest=4, wraps=4 (even) -> (R,0) wait: wraps=4 is even!
    ];
    void validMixed;
    void knownValid;

    // Official JugglingLab patterns + mathematically verified mixed patterns
    // (using JugglingLab's convention: async beat 0 = RIGHT, beat 1 = LEFT; sync = (LEFT, RIGHT)):
    const officialAndMixed = [
      '(3x,4)!3x',
      '(4,2x)!0(2x,4)!0',
      '(3x,2x)!L3',
      'R53',
      'R531',
      'L531',
      'R531*',
      '1x',
      '3x',
      '5xR3x',
      '4x1(4x,3x)*',
      '(4,3x)!(2,0)!(3x,0)!',
      '(0,6x)!(0,0)!(6x,0)!(0,0)!',
      '([42],4x)*',
      'R3R3xL3L3x',
      '(4,5x)(4,1x)!R5x41x',
    ];
    for (const pat of officialAndMixed) {
      assert.equal(isValidMhn(parseMixed(pat)), true, `Expected ${pat} to be valid`);
    }

    // Invalid mixed / * patterns
    assert.equal(isValidMhn(parseMixed('3x*')), false);
    assert.equal(isValidMhn(parseMixed('(4,3x)!3x')), false);

    // 0x is rejected cleanly (add a space for throw 33 after 0)
    assert.ok(parseMixed('x0x').error);
    assert.equal(isValidMhn(parseMixed('x0 x')), true);

    // Spaced high async pattern z x y (35, 33, 34)
    const zxy = parseMixed('z x y');
    assert.equal(zxy.error, undefined);
    assert.equal(classifyPrefixMode(zxy), 'async');
    assert.equal(isValidMhn(zxy), true);
  });

  it('rejects invalid syntax with clear error messages', () => {
    assert.ok(parseMixed('*').error);
    assert.ok(parseMixed('(4,2x)*3').error);
    assert.ok(parseMixed('531!').error);
    assert.ok(parseMixed('(4,2x)! !').error);
    assert.ok(parseMixed('[]').error);
    assert.ok(parseMixed('(4,2x)@').error);
  });

  it('converts legacy siteswaps accurately via fromLegacySiteswap', () => {
    const legacyAsync = parseSiteswap('531', false).siteswap;
    const mhnAsync = fromLegacySiteswap(legacyAsync, false);
    assert.equal(isValidMhn(mhnAsync), true);
    assert.equal(mhnAsync.period, 3);

    const legacySync = parseSiteswap('(4,2x)(2x,4)', true).siteswap;
    const mhnSync = fromLegacySiteswap(legacySync, true);
    assert.equal(isValidMhn(mhnSync), true);
    assert.equal(mhnSync.period, 4);
  });
});

describe('mhn.js match-input suggestUnified', () => {
  it('keeps pure async prefixes in pure async mode (no !, no *, no L/R)', () => {
    const prefixes = ['5', '53', '531', '44', '[43]', '3[1', 'z x', '5 3'];
    for (const p of prefixes) {
      const res = suggestUnified(p, true, 0);
      assert.equal(res.error, undefined, `Unexpected error for "${p}": ${res.error}`);
      assert.equal(res.mode, 'async', `Expected async mode for "${p}"`);
      assert.ok(!/[!*LR()]/.test(res.suffix), `Pure async suffix "${res.suffix}" for "${p}" leaked mixed tokens`);
      assert.equal(isValidMhn(res.mhn), true);
    }
  });

  it('keeps pure sync prefixes in pure sync mode (no !, no *, no L/R)', () => {
    const prefixes = ['(', '(4', '(4,', '(4,2', '(4,2x', '(4,2x)', '([44],2x)(2x,[4', '(4, 2x)'];
    for (const p of prefixes) {
      const res = suggestUnified(p, true, 0);
      assert.equal(res.error, undefined, `Unexpected error for "${p}": ${res.error}`);
      assert.equal(res.mode, 'sync', `Expected sync mode for "${p}"`);
      assert.ok(!/[!*LR]/.test(res.suffix), `Pure sync suffix "${res.suffix}" for "${p}" leaked mixed tokens`);
      assert.equal(isValidMhn(res.mhn), true);
    }
  });

  it('supports * when user types it and NEVER emits * in any suffix', () => {
    const validStar = suggestUnified('(4,2x)*', false, 0);
    assert.equal(validStar.error, undefined);
    assert.equal(validStar.suffix, '');
    assert.equal(isValidMhn(validStar.mhn), true);

    const invalidStar = suggestUnified('(4,2)*', false, 0);
    assert.ok(invalidStar.error);

    const mixedPrefixes = [
      '(4,2x)!',
      '(4,2x)!3',
      '(4,3x)!',
      '531(',
      '531(4',
      '531(4,',
      '531(4,2',
      '531(4,2x)',
      '531([4',
      '(4,4)3',
      '(2x,4)3',
      '4x',
      '3x',
      '1x',
      '2x',
      'L',
      'R',
      'L5',
      'R53',
      '(5,4',
      '(5,3x',
      '(4,2x)!3(',
      '(4,2x)!3(4,',
    ];

    for (const p of mixedPrefixes) {
      for (const allowMultiplex of [false, true]) {
        const res = suggestUnified(p, allowMultiplex, 0);
        if (res.error !== undefined) {
          // Vanilla mode may legitimately reject a prefix that requires multiplex.
          assert.equal(allowMultiplex, false, `Expected multiplex mode to solve "${p}", got: ${res.error}`);
          continue;
        }
        assert.ok(!res.suffix.includes('*'), `Suggester must never emit '*' (got "${res.suffix}" for "${p}")`);
        const reparsed = parseMixed(p + res.suffix);
        assert.equal(reparsed.error, undefined, `Reparse error for "${p}" + "${res.suffix}": ${reparsed.error}`);
        assert.equal(isValidMhn(reparsed), true, `Invalid MHN for "${p}" + "${res.suffix}"`);
      }
    }
  });

  it('supports extraSteps > 0 in mixed mode with strictly increasing periods', () => {
    const r0 = suggestUnified('(4,2x)!', false, 0);
    const r1 = suggestUnified('(4,2x)!', false, 1);
    const r2 = suggestUnified('(4,2x)!', false, 2);
    assert.equal(r0.error, undefined);
    assert.equal(r1.error, undefined);
    assert.equal(r2.error, undefined);
    assert.ok(r0.mhn.period < r1.mhn.period, `Expected ${r0.mhn.period} < ${r1.mhn.period}`);
    assert.ok(r1.mhn.period < r2.mhn.period, `Expected ${r1.mhn.period} < ${r2.mhn.period}`);
    for (const r of [r0, r1, r2]) {
      assert.ok(!r.suffix.includes('*'));
      assert.equal(isValidMhn(parseMixed('(4,2x)!' + r.suffix)), true);
    }
  });

  it('explains when multiplex mode is needed in mixed mode and handles trailing spaces / 0x cleanly', () => {
    // Under JugglingLab's rightOnEven=true, (4,2)!1 has beat 0 R=2->(2,R) and beat 1 L=1->(2,R),
    // which collides unless 'x' is appended to '1' -> (4,2)!1x...
    const withAutoX = suggestUnified('(4,2)!1', false, 0);
    assert.equal(withAutoX.error, undefined);
    assert.ok(withAutoX.suffix.startsWith('x'), `Expected auto-x to avoid vanilla collision, got "${withAutoX.suffix}"`);
    assert.equal(isValidMhn(parseMixed('(4,2)!1' + withAutoX.suffix)), true);

    // With trailing space after '1', '1' is locked non-crossing, forcing a collision on (2,R) -> needs multiplex.
    const vanillaRes = suggestUnified('(4,2)!1 ', false, 0);
    assert.ok(vanillaRes.error);
    assert.match(vanillaRes.error, /Multiplex/i);

    const multiRes = suggestUnified('(4,2)!1 ', true, 0);
    assert.equal(multiRes.error, undefined, `Expected multiplex to solve "(4,2)!1 ", got ${multiRes.error}`);
    assert.equal(isValidMhn(parseMixed('(4,2)!1 ' + multiRes.suffix)), true);

    // Trailing space in pure sync must NOT emit 'x' across the space (regression from JugglingLab fuzzer)
    const spacedSync = suggestUnified('(4x,6 ', false, 0);
    assert.equal(spacedSync.error, undefined);
    assert.ok(!spacedSync.suffix.startsWith('x'), `Should not emit 'x' after space: "${spacedSync.suffix}"`);
    assert.equal(isValidMhn(parseMixed('(4x,6 ' + spacedSync.suffix)), true);

    // Trailing '0' in mixed mode must NOT have 'x' appended to it (regression from JugglingLab fuzzer)
    const trailingZero = suggestUnified('cu(4,4 )!( 2, 5)!0', false, 0);
    assert.equal(trailingZero.error, undefined);
    assert.ok(!trailingZero.suffix.startsWith('x'), `Should not emit 'x' after '0': "${trailingZero.suffix}"`);
    assert.equal(isValidMhn(parseMixed('cu(4,4 )!( 2, 5)!0' + trailingZero.suffix)), true);
  });
});
