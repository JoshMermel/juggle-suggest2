import {
  LEFT,
  RIGHT,
  destHandForThrow,
  expandMhn,
  classifyPrefixMode,
  formatMhnBeat,
} from './mhn.js';
import { asyncToToss } from './suggest.js';

const MAX_TOSS = 35;

// Counts the number of balls in a valid MHN pattern.
export function countMhnBalls(mhn, expanded = null) {
  if (!mhn || mhn.period === 0) {
    return 0;
  }
  const exp = expanded || expandMhn(mhn);
  let sum = 0;
  for (let h = 0; h < 2; h++) {
    for (let t = 0; t < exp.period; t++) {
      for (const thr of exp.cells[h][t]) {
        sum += thr.value;
      }
    }
  }
  return Math.round(sum / exp.period);
}

// Computes the 2D MHN landing state [leftCounts[], rightCounts[]] entering beat 0
// of `mhn`. Entry state[h][t] is the number of balls scheduled to land on hand `h`
// at beat `t >= 0` from throws made before beat 0.
export function computeMhnState(mhn, expanded = null) {
  const exp = expanded || expandMhn(mhn);
  const P = exp.period;
  if (P === 0) {
    return [[], []];
  }

  let maxIdx = -1;
  for (let h = 0; h < 2; h++) {
    for (let t = 0; t < P; t++) {
      for (const thr of exp.cells[h][t]) {
        if (thr.value > 0) {
          const land = t - P + thr.value;
          if (land > maxIdx) {
            maxIdx = land;
          }
        }
      }
    }
  }

  const len = maxIdx + 1;
  const state = [new Array(len).fill(0), new Array(len).fill(0)];
  for (let h = 0; h < 2; h++) {
    for (let t = 0; t < P; t++) {
      for (const thr of exp.cells[h][t]) {
        if (thr.value === 0) {
          continue;
        }
        const dh = destHandForThrow(h, thr.value, thr.crosses);
        for (let land = t - P + thr.value; land >= 0; land -= P) {
          state[dh][land] += 1;
        }
      }
    }
  }
  return trimState(state);
}

function trimState(state) {
  let len = Math.max(state[0].length, state[1].length);
  while (len > 0 && (state[0][len - 1] || 0) === 0 && (state[1][len - 1] || 0) === 0) {
    len--;
  }
  return [
    Array.from({ length: len }, (_, i) => state[0][i] || 0),
    Array.from({ length: len }, (_, i) => state[1][i] || 0),
  ];
}

function statesEqual(a, b) {
  const len = Math.max(a[0].length, b[0].length);
  for (let h = 0; h < 2; h++) {
    for (let t = 0; t < len; t++) {
      if ((a[h][t] || 0) !== (b[h][t] || 0)) {
        return false;
      }
    }
  }
  return true;
}

// Async ground state for `balls` balls, with beat 0 starting on `startHand`.
export function asyncGroundState(balls, startHand = RIGHT) {
  const state = [new Array(balls).fill(0), new Array(balls).fill(0)];
  for (let t = 0; t < balls; t++) {
    const h = (t % 2 === 0) ? startHand : (1 - startHand);
    state[h][t] = 1;
  }
  return state;
}

// Even-ball sync ground state (b,b) for `balls` (even): both hands land at 0, 2, ..., balls - 2.
export function syncGroundState(balls) {
  const len = Math.max(0, balls - 1);
  const state = [new Array(len).fill(0), new Array(len).fill(0)];
  for (let t = 0; t < balls; t += 2) {
    state[LEFT][t] = 1;
    state[RIGHT][t] = 1;
  }
  return trimState(state);
}

// Formats a `k`-beat transition throw matrix `cells[2][k]` into siteswap notation.
function formatTransitionCells(cells, k, { asyncOnly = false, syncOnly = false, initialLeftOnEven = false } = {}) {
  if (k === 0) {
    return '';
  }

  if (syncOnly) {
    let out = '';
    for (let t = 0; t < k; t += 2) {
      out += `(${formatMhnBeat(cells[LEFT][t])},${formatMhnBeat(cells[RIGHT][t])})`;
    }
    return out;
  }

  let out = '';
  let leftOnEven = initialLeftOnEven;
  let canAttachX = false;

  for (let t = 0; t < k; ) {
    const L = cells[LEFT][t];
    const R = cells[RIGHT][t];

    if (!asyncOnly && L.length > 0 && R.length > 0) {
      const nextOccupied = (t + 1 >= k) || cells[LEFT][t + 1].length > 0 || cells[RIGHT][t + 1].length > 0;
      out += `(${formatMhnBeat(L)},${formatMhnBeat(R)})` + (nextOccupied ? '!' : '');
      canAttachX = false;
      t += nextOccupied ? 1 : 2;
    } else if (L.length === 0 && R.length === 0) {
      out += '0';
      canAttachX = true;
      t += 1;
    } else {
      const h = L.length > 0 ? LEFT : RIGHT;
      const throws = h === LEFT ? L : R;
      if (!asyncOnly) {
        const expectedHand = ((t % 2 === 0) === leftOnEven) ? LEFT : RIGHT;
        if (h !== expectedHand) {
          out += (h === LEFT ? 'L' : 'R');
          leftOnEven = (t % 2 === 0) ? (h === LEFT) : (h !== LEFT);
          canAttachX = false;
        }
      }
      const text = formatMhnBeat(throws);
      if (canAttachX && text.startsWith('x')) {
        out += ' ';
      }
      out += text;
      canAttachX = throws.length === 1 && !throws[0].crosses;
      t += 1;
    }
  }

  return out;
}

// Finds the shortest direct transition from `fromState` to `toState`.
// Returns `{ length, text, cells, maxThrow }` or `null` if no throw <= MAX_TOSS fits.
export function findTransitionBetweenStates(fromState, toState, options = {}) {
  const { asyncOnly = false, syncOnly = false, initialLeftOnEven = false } = options;

  if (statesEqual(fromState, toState)) {
    return { length: 0, text: '', cells: [[], []], maxThrow: 0 };
  }

  const step = syncOnly ? 2 : 1;
  const maxK = Math.max(fromState[0].length, toState[0].length) + 4;

  for (let k = step; k <= maxK; k += step) {
    let fits = true;
    const maxLen = Math.max(fromState[0].length - k, toState[0].length);
    for (let h = 0; h < 2 && fits; h++) {
      for (let t = 0; t < maxLen; t++) {
        const carry = fromState[h][t + k] || 0;
        const target = toState[h][t] || 0;
        if (carry > target) {
          fits = false;
          break;
        }
      }
    }
    if (!fits) {
      continue;
    }

    if (syncOnly) {
      let oddClean = true;
      for (let i = 1; i < k; i += 2) {
        if ((fromState[LEFT][i] || 0) > 0 || (fromState[RIGHT][i] || 0) > 0) {
          oddClean = false;
          break;
        }
      }
      if (!oddClean) {
        continue;
      }
    }

    const sources = [];
    for (let i = 0; i < k; i++) {
      for (let h = 0; h < 2; h++) {
        const count = fromState[h][i] || 0;
        for (let c = 0; c < count; c++) {
          sources.push({ hand: h, beat: i });
        }
      }
    }

    const targets = [];
    for (let t = 0; t < toState[0].length; t++) {
      for (let h = 0; h < 2; h++) {
        const rem = (toState[h][t] || 0) - (fromState[h][t + k] || 0);
        for (let c = 0; c < rem; c++) {
          targets.push({ hand: h, beat: t + k });
        }
      }
    }

    if (sources.length !== targets.length) {
      continue;
    }

    // Pairing earliest source with earliest target minimizes the maximum throw height.
    sources.sort((a, b) => a.beat - b.beat || a.hand - b.hand);
    targets.sort((a, b) => a.beat - b.beat || a.hand - b.hand);

    const cells = [
      Array.from({ length: k }, () => []),
      Array.from({ length: k }, () => []),
    ];

    let maxToss = 0;
    let valid = true;
    for (let i = 0; i < sources.length; i++) {
      const src = sources[i];
      const dst = targets[i];
      const v = dst.beat - src.beat;
      if (v <= 0 || v > MAX_TOSS) {
        valid = false;
        break;
      }
      const naturalDest = (v % 2 === 0) ? src.hand : (1 - src.hand);
      const crosses = naturalDest !== dst.hand;
      if (asyncOnly && crosses) {
        valid = false;
        break;
      }
      if (syncOnly && v % 2 === 1) {
        valid = false;
        break;
      }
      if (v > maxToss) {
        maxToss = v;
      }
      cells[src.hand][src.beat].push({ value: v, crosses });
    }

    if (!valid) {
      continue;
    }

    for (let h = 0; h < 2; h++) {
      for (let t = 0; t < k; t++) {
        cells[h][t].sort((a, b) => a.value - b.value || (a.crosses ? 1 : 0) - (b.crosses ? 1 : 0));
      }
    }

    const text = formatTransitionCells(cells, k, { asyncOnly, syncOnly, initialLeftOnEven });
    return { length: k, text, cells, maxThrow: maxToss };
  }

  return null;
}

function pickBestTransition(candidates) {
  let best = null;
  for (const cand of candidates) {
    if (!cand) {
      continue;
    }
    if (
      !best ||
      cand.length < best.length ||
      (cand.length === best.length && cand.maxThrow < best.maxThrow) ||
      (cand.length === best.length && cand.maxThrow === best.maxThrow && cand.text.length < best.text.length)
    ) {
      best = cand;
    }
  }
  return best;
}

// Computes ground-state entry & exit transitions for any valid MHN pattern:
// - Pure async (b balls): base pattern is `b` (pure async transitions).
// - Even-ball pure sync (b balls): base pattern is `(b,b)` (pure sync transitions).
// - Odd-ball pure sync or mixed (b balls): base pattern is `b` (mixed MHN transitions).
export function computeGroundTransitions(mhn) {
  if (!mhn || mhn.period === 0) {
    return {
      balls: 0,
      baseLabel: '0',
      isGroundState: true,
      entry: '',
      exit: '',
    };
  }

  const expanded = expandMhn(mhn);
  const balls = countMhnBalls(mhn, expanded);
  if (balls === 0) {
    return {
      balls: 0,
      baseLabel: '0',
      isGroundState: true,
      entry: '',
      exit: '',
    };
  }

  if (balls > MAX_TOSS) {
    return {
      balls,
      baseLabel: String(balls),
      isGroundState: false,
      entry: null,
      exit: null,
    };
  }

  const mode = classifyPrefixMode(mhn);
  const patternState = computeMhnState(mhn, expanded);

  // Even-ball pure sync -> ground state is the sync fountain (b, b)
  if (mode === 'sync' && balls % 2 === 0) {
    const bChar = asyncToToss(balls);
    const baseLabel = `(${bChar},${bChar})`;
    const baseState = syncGroundState(balls);
    if (statesEqual(patternState, baseState)) {
      return { balls, baseLabel, isGroundState: true, entry: '', exit: '' };
    }
    const entry = findTransitionBetweenStates(baseState, patternState, { syncOnly: true });
    const exit = findTransitionBetweenStates(patternState, baseState, { syncOnly: true });
    return {
      balls,
      baseLabel,
      isGroundState: false,
      entry: entry ? entry.text : null,
      exit: exit ? exit.text : null,
    };
  }

  // Pure async -> ground state is b-ball cascade/fountain (checking both hand polarities so
  // odd-length pure-async transitions like `4` into `51` work without hand-flipping).
  const baseLabel = asyncToToss(balls);
  const baseR = asyncGroundState(balls, RIGHT);
  const baseL = asyncGroundState(balls, LEFT);

  if (mode === 'async' && mhn.isVanillaAsync) {
    if (statesEqual(patternState, baseR) || statesEqual(patternState, baseL)) {
      return { balls, baseLabel, isGroundState: true, entry: '', exit: '' };
    }
    const entry = pickBestTransition([
      findTransitionBetweenStates(baseR, patternState, { asyncOnly: true, initialLeftOnEven: false }),
      findTransitionBetweenStates(baseL, patternState, { asyncOnly: true, initialLeftOnEven: true }),
    ]);
    const exit = pickBestTransition([
      findTransitionBetweenStates(patternState, baseR, { asyncOnly: true, initialLeftOnEven: mhn.leftOnEven }),
      findTransitionBetweenStates(patternState, baseL, { asyncOnly: true, initialLeftOnEven: mhn.leftOnEven }),
    ]);
    return {
      balls,
      baseLabel,
      isGroundState: false,
      entry: entry ? entry.text : null,
      exit: exit ? exit.text : null,
    };
  }

  // Odd-ball pure sync OR mixed sync/async -> universal ground state is b-ball async cascade/fountain `b`.
  if (statesEqual(patternState, baseR) || statesEqual(patternState, baseL)) {
    return { balls, baseLabel, isGroundState: true, entry: '', exit: '' };
  }

  // Expected hand at beat 0 of exit (right after a full expanded cycle of `mhn`,
  // which returns to `patternState`).
  const exitLeftOnEven = (expanded.period % 2 === 0) ? mhn.leftOnEven : !mhn.leftOnEven;

  const entry = pickBestTransition([
    findTransitionBetweenStates(baseR, patternState, { initialLeftOnEven: false }),
    findTransitionBetweenStates(baseL, patternState, { initialLeftOnEven: true }),
  ]);
  const exit = pickBestTransition([
    findTransitionBetweenStates(patternState, baseR, { initialLeftOnEven: exitLeftOnEven }),
    findTransitionBetweenStates(patternState, baseL, { initialLeftOnEven: exitLeftOnEven }),
  ]);

  return {
    balls,
    baseLabel,
    isGroundState: false,
    entry: entry ? entry.text : null,
    exit: exit ? exit.text : null,
  };
}
