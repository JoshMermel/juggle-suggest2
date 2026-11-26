import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LEFT, RIGHT, parseMixed, isValidMhn, destHandForThrow, expandMhn } from '../mhn.js';
import {
  countMhnBalls,
  computeMhnState,
  asyncGroundState,
  syncGroundState,
  computeGroundTransitions,
} from '../transitions.js';

function applyTransition(startState, transText, initialLeftOnEven) {
  const mhn = parseMixed(transText);
  assert.equal(mhn.error, undefined, `Failed to parse transition "${transText}": ${mhn.error}`);
  // Re-evaluate beats with specified starting hand parity (when no explicit L/R overrides beat 0)
  const startsWithHandSpec = transText.startsWith('L') || transText.startsWith('R');
  const parsed = startsWithHandSpec
    ? mhn
    : parseMixed((initialLeftOnEven ? 'L' : 'R') + transText);
  assert.equal(parsed.error, undefined);

  const cur = [startState[0].slice(), startState[1].slice()];
  for (let t = 0; t < parsed.period; t++) {
    for (let h = 0; h < 2; h++) {
      const throws = parsed.cells[h][t].filter(x => x.value > 0);
      const due = cur[h][0] || 0;
      assert.equal(throws.length, due, `Mismatch at beat ${t} hand ${h} in "${transText}": threw ${throws.length}, due ${due}`);
      for (const thr of throws) {
        const dh = destHandForThrow(h, thr.value, thr.crosses);
        while (cur[dh].length <= thr.value) cur[dh].push(0);
        cur[dh][thr.value] += 1;
      }
    }
    cur[0].shift();
    cur[1].shift();
  }
  while (cur[0].length > 0 && cur[0][cur[0].length - 1] === 0 && (cur[1][cur[1].length - 1] || 0) === 0) {
    cur[0].pop();
    if (cur[1].length > cur[0].length) cur[1].pop();
  }
  const len = Math.max(cur[0].length, cur[1].length);
  return [
    Array.from({ length: len }, (_, i) => cur[0][i] || 0),
    Array.from({ length: len }, (_, i) => cur[1][i] || 0),
  ];
}

describe('transitions.js ground-state entry & exit', () => {
  it('identifies ground-state async and even-sync patterns', () => {
    for (const pat of ['3', '531', '441', '5', '(4,4)', '(6,6)']) {
      const t = computeGroundTransitions(parseMixed(pat));
      assert.equal(t.isGroundState, true, `Expected ${pat} to be ground state`);
      assert.equal(t.entry, '');
      assert.equal(t.exit, '');
    }
  });

  it('computes classic excited async transitions (51, 741, 615)', () => {
    const t51 = computeGroundTransitions(parseMixed('51'));
    assert.equal(t51.balls, 3);
    assert.equal(t51.baseLabel, '3');
    assert.equal(t51.isGroundState, false);
    assert.equal(t51.entry, '4');
    assert.equal(t51.exit, '2');

    const t741 = computeGroundTransitions(parseMixed('741'));
    assert.equal(t741.balls, 4);
    assert.equal(t741.baseLabel, '4');
    assert.equal(t741.isGroundState, false);
    assert.equal(t741.entry, '5');
    assert.equal(t741.exit, '3');

    const t615 = computeGroundTransitions(parseMixed('615'));
    assert.equal(t615.balls, 4);
    assert.equal(t615.baseLabel, '4');
    assert.equal(t615.isGroundState, false);
    assert.equal(t615.entry, '55');
    assert.equal(t615.exit, '2');

    // Verify full round-trip compound siteswaps are valid MHN!
    const roundTrip51 = parseMixed(`333${t51.entry}5151${t51.exit}333`);
    assert.equal(roundTrip51.error, undefined);
    assert.equal(isValidMhn(roundTrip51), true);

    const roundTrip741 = parseMixed(`4444${t741.entry}741741${t741.exit}4444`);
    assert.equal(roundTrip741.error, undefined);
    assert.equal(isValidMhn(roundTrip741), true);

    const roundTrip615 = parseMixed(`4444${t615.entry}615615${t615.exit}4444`);
    assert.equal(roundTrip615.error, undefined);
    assert.equal(isValidMhn(roundTrip615), true);
  });

  it('computes pure-sync transitions for excited even-ball sync patterns', () => {
    // (6x,2x)* is a 4-ball excited sync pattern (base state (4,4))
    const t = computeGroundTransitions(parseMixed('(6x,2x)*'));
    assert.equal(t.balls, 4);
    assert.equal(t.baseLabel, '(4,4)');
    assert.equal(t.isGroundState, false);
    assert.ok(t.entry && t.entry.startsWith('(') && !t.entry.includes('!'));
    assert.ok(t.exit && t.exit.startsWith('(') && !t.exit.includes('!'));

    const roundTrip = parseMixed(`(4,4)${t.entry}(6x,2x)(2x,6x)${t.exit}(4,4)`);
    assert.equal(roundTrip.error, undefined);
    assert.equal(isValidMhn(roundTrip), true);
  });

  it('transitions odd-ball sync patterns like (4,2x)* and (6x,4)* from/to async cascade', () => {
    const box = computeGroundTransitions(parseMixed('(4,2x)*'));
    assert.equal(box.balls, 3);
    assert.equal(box.baseLabel, '3');
    assert.equal(box.isGroundState, false);
    assert.ok(box.entry && box.entry.length > 0);
    assert.ok(box.exit && box.exit.length > 0);

    const fiveSync = computeGroundTransitions(parseMixed('(6x,4)*'));
    assert.equal(fiveSync.balls, 5);
    assert.equal(fiveSync.baseLabel, '5');
    assert.equal(fiveSync.isGroundState, false);
    assert.ok(fiveSync.entry && fiveSync.entry.length > 0);
    assert.ok(fiveSync.exit && fiveSync.exit.length > 0);
  });

  it('handles mixed patterns and 0-ball patterns cleanly', () => {
    const mixed = computeGroundTransitions(parseMixed('4x1(4x,3x)*'));
    assert.equal(mixed.balls, 3);
    assert.equal(mixed.baseLabel, '3');
    assert.ok(mixed.entry !== null && mixed.exit !== null);

    const zero = computeGroundTransitions(parseMixed('0'));
    assert.equal(zero.balls, 0);
    assert.equal(zero.isGroundState, true);
    assert.equal(countMhnBalls(parseMixed('531')), 3);
    assert.deepEqual(computeMhnState(parseMixed('0')), [[], []]);
  });

  it('mathematically arrives at exact target state for entry and exit across diverse patterns', () => {
    const patterns = [
      '51', '741', '615', '7531', '9551', '423', '534', '3[11][22]',
      '(6x,2x)*', '(8x,4x)*', '(8,4)(4,8)', '(6x,6x)', '([44],2x)(2x,[44])',
      '(4,2x)*', '(6x,4)*', '([42],4x)*', '4x1(4x,3x)*', '(3x,4)!3x',
      '(4,5x)(4,1x)!R5x41x', 'R3R3xL3L3x', '(4,2x)!2L1', '(2x,4)301x',
    ];

    const stateEq = (a, b) => {
      const len = Math.max(a[0].length, b[0].length);
      for (let h = 0; h < 2; h++) {
        for (let i = 0; i < len; i++) {
          if ((a[h][i] || 0) !== (b[h][i] || 0)) return false;
        }
      }
      return true;
    };

    for (const pat of patterns) {
      const mhn = parseMixed(pat);
      assert.equal(isValidMhn(mhn), true, `Expected ${pat} to be valid`);
      const res = computeGroundTransitions(mhn);
      if (res.isGroundState) continue;

      const patState = computeMhnState(mhn);
      const bases = res.baseLabel.startsWith('(')
        ? [{ st: syncGroundState(res.balls), leftOnEven: false }]
        : [
            { st: asyncGroundState(res.balls, RIGHT), leftOnEven: false },
            { st: asyncGroundState(res.balls, LEFT), leftOnEven: true },
          ];

      // Entry must transform at least one polarity of base into exact patState
      assert.ok(res.entry !== null, `Missing entry for ${pat}`);
      const entryOk = bases.some(({ st, leftOnEven }) => {
        try {
          return stateEq(applyTransition(st, res.entry, leftOnEven), patState);
        } catch {
          return false;
        }
      });
      assert.ok(entryOk, `Entry "${res.entry}" for ${pat} did not reach exact pattern state`);

      // Exit must transform patState into at least one polarity of base
      assert.ok(res.exit !== null, `Missing exit for ${pat}`);
      const fullPeriod = expandMhn(mhn).period;
      const exitLeftOnEven = (fullPeriod % 2 === 0) ? mhn.leftOnEven : !mhn.leftOnEven;
      const reached = applyTransition(patState, res.exit, exitLeftOnEven);
      const exitOk = bases.some(({ st }) => stateEq(reached, st));
      assert.ok(exitOk, `Exit "${res.exit}" for ${pat} did not reach base ${res.baseLabel}`);
    }
  });
});
