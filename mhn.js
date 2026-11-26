import { mod, shuffled } from './utils.js';
import {
  isValidAsyncToss,
  toInt,
  asyncToToss,
  suggestBest as legacySuggestBest,
} from './suggest.js';

export const LEFT = 0;
export const RIGHT = 1;
const MAX_TOSS = 35;

// JugglingLab destination hand rule:
// Even throws stay on the same hand, odd throws cross; 'x' flips destination hand.
export function destHandForThrow(srcHand, value, crosses) {
  let dest = (value % 2 === 0) ? srcHand : (1 - srcHand);
  if (crosses) {
    dest = 1 - dest;
  }
  return dest;
}

// Destination (hand, beat) modulo `period`, accounting for `*` switch-repeat mirror flips.
export function destCellForThrow(srcHand, srcBeat, value, crosses, period, switchRepeat) {
  let destHand = destHandForThrow(srcHand, value, crosses);
  const rawDest = srcBeat + value;
  const wraps = Math.floor(rawDest / period);
  if (switchRepeat && wraps % 2 === 1) {
    destHand = 1 - destHand;
  }
  return { hand: destHand, beat: mod(rawDest, period) };
}

export function formatMhnThrow(t) {
  return asyncToToss(t.value) + (t.crosses ? 'x' : '');
}

export function formatMhnBeat(throws) {
  if (!throws || throws.length === 0) {
    return '0';
  }
  if (throws.length === 1) {
    return formatMhnThrow(throws[0]);
  }
  return '[' + throws.map(formatMhnThrow).join('') + ']';
}

// Parser states for unified JugglingLab solo siteswap notation.
export const MixedState = Object.freeze({
  NORMAL: 0,
  A_AFTER_TOSS: 1,
  A_EMPTY_BRACE: 2,
  A_BRACE: 3,
  A_BRACE_AFTER_TOSS: 4,
  S_FIRST: 5,
  S_FIRST_X: 6,
  S_FIRST_EMPTY_BRACE: 7,
  S_FIRST_BRACE: 8,
  S_FIRST_X_OR_BRACE: 9,
  S_COMMA: 10,
  S_SECOND: 11,
  S_SECOND_X: 12,
  S_SECOND_EMPTY_BRACE: 13,
  S_SECOND_BRACE: 14,
  S_SECOND_X_OR_BRACE: 15,
  S_PAREN: 16,
  S_AFTER_PAREN: 17,
  AFTER_STAR: 18,
});

const OPEN_BRACE_STATES = new Set([
  MixedState.A_EMPTY_BRACE,
  MixedState.A_BRACE,
  MixedState.A_BRACE_AFTER_TOSS,
  MixedState.S_FIRST_EMPTY_BRACE,
  MixedState.S_FIRST_BRACE,
  MixedState.S_FIRST_X_OR_BRACE,
  MixedState.S_SECOND_EMPTY_BRACE,
  MixedState.S_SECOND_BRACE,
  MixedState.S_SECOND_X_OR_BRACE,
]);

function unexpected(ch, pos, expected) {
  return `Unexpected '${ch}' (expected ${expected}) at position ${pos}.`;
}

// Parses a JugglingLab solo siteswap (or prefix) into an MHN structure:
// {
//   cells: [leftBeats[], rightBeats[]], // each beat is array of { value, crosses }
//   period: number,                     // number of beats currently in cells
//   items: Array<...>,                  // structured items for SVG rendering
//   state: MixedState,
//   leftOnEven: boolean,                // hand alternation polarity for async beats
//   hasAsync: boolean,
//   hasSync: boolean,
//   hasMixed: boolean,                  // true if !, L/R, async x, odd-in-sync, or sync+async mixed
//   switchRepeat: boolean,              // explicit '*'
//   openBeat: number,                   // beat index of currently open construct (if any)
//   openHand: number,                   // hand index of currently open construct (if any)
//   error?: string,
// }
export function parseMixed(str) {
  const s = {
    cells: [[], []],
    period: 0,
    items: [],
    state: MixedState.NORMAL,
    // Matches JugglingLab default: rightOnEven = true (beat 0 async = RIGHT, beat 1 = LEFT).
    leftOnEven: false,
    hasAsync: false,
    hasSync: false,
    hasMixed: false,
    isVanillaAsync: true,
    switchRepeat: false,
    openBeat: -1,
    openHand: RIGHT,
    error: undefined,
  };

  const ensureBeat = (beat) => {
    while (s.cells[LEFT].length <= beat) {
      s.cells[LEFT].push([]);
      s.cells[RIGHT].push([]);
    }
    if (beat + 1 > s.period) {
      s.period = beat + 1;
    }
  };

  const activeAsyncHand = (beat) => ((beat % 2 === 0) === s.leftOnEven) ? LEFT : RIGHT;

  const markAsync = () => {
    if (s.hasSync) {
      s.hasMixed = true;
    }
    s.hasAsync = true;
  };

  const markSync = () => {
    if (s.hasAsync) {
      s.hasMixed = true;
    }
    s.hasSync = true;
    s.isVanillaAsync = false;
  };

  let curSyncItem = null;
  let curAsyncItem = null;

  const stepNormal = (ch, pos) => {
    if (ch === ' ') {
      s.state = MixedState.NORMAL;
      return;
    }
    if (ch === '*') {
      if (s.period === 0) {
        s.error = unexpected(ch, pos, "a toss, '(', '[', 'L', or 'R' before '*'");
        return;
      }
      s.switchRepeat = true;
      s.items.push({ kind: 'star' });
      s.state = MixedState.AFTER_STAR;
      return;
    }
    if (ch === 'L' || ch === 'R') {
      const wantLeft = ch === 'L';
      s.leftOnEven = (s.period % 2 === 0) ? wantLeft : !wantLeft;
      s.hasMixed = true;
      if (s.period > 0) {
        s.isVanillaAsync = false;
      }
      s.items.push({ kind: 'hand', text: ch, beat: s.period });
      s.state = MixedState.NORMAL;
      return;
    }
    if (ch === '(') {
      markSync();
      const beat = s.period;
      ensureBeat(beat);
      s.openBeat = beat;
      s.openHand = LEFT;
      curSyncItem = { kind: 'sync', beat, hasBang: false };
      s.items.push(curSyncItem);
      s.state = MixedState.S_FIRST;
      return;
    }
    if (ch === '[') {
      markAsync();
      const beat = s.period;
      const hand = activeAsyncHand(beat);
      ensureBeat(beat);
      s.openBeat = beat;
      s.openHand = hand;
      curAsyncItem = { kind: 'async', beat, hand, isMultiplex: true };
      s.items.push(curAsyncItem);
      s.state = MixedState.A_EMPTY_BRACE;
      return;
    }
    if (isValidAsyncToss(ch)) {
      markAsync();
      const beat = s.period;
      const hand = activeAsyncHand(beat);
      ensureBeat(beat);
      const val = toInt(ch);
      s.cells[hand][beat].push({ value: val, crosses: false });
      s.openBeat = beat;
      s.openHand = hand;
      curAsyncItem = { kind: 'async', beat, hand, isMultiplex: false };
      s.items.push(curAsyncItem);
      s.state = MixedState.A_AFTER_TOSS;
      return;
    }
    s.error = unexpected(ch, pos, "a toss 0-9/a-z, '(', '[', 'L', 'R', or '*'");
  };

  const stepABrace = (ch, pos) => {
    if (ch === ' ') {
      s.state = MixedState.A_BRACE;
      return;
    }
    if (ch === ']') {
      s.openBeat = -1;
      curAsyncItem = null;
      s.state = MixedState.NORMAL;
      return;
    }
    if (isValidAsyncToss(ch)) {
      const val = toInt(ch);
      s.cells[s.openHand][s.openBeat].push({ value: val, crosses: false });
      s.state = MixedState.A_BRACE_AFTER_TOSS;
      return;
    }
    s.error = unexpected(ch, pos, "a toss 0-9/a-z or ']'");
  };

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    switch (s.state) {
      case MixedState.NORMAL:
        stepNormal(ch, i);
        break;

      case MixedState.A_AFTER_TOSS:
        if (ch === 'x') {
          const list = s.cells[s.openHand][s.openBeat];
          const last = list[list.length - 1];
          if (last.value === 0) {
            s.error = `Cannot apply crossing 'x' to '0' at position ${i} (add a space before 'x' for throw 33).`;
          } else {
            last.crosses = true;
            s.hasMixed = true;
            s.isVanillaAsync = false;
            s.state = MixedState.NORMAL;
          }
        } else {
          stepNormal(ch, i);
        }
        break;

      case MixedState.A_EMPTY_BRACE:
        if (ch === ' ') {
          break;
        }
        if (isValidAsyncToss(ch)) {
          const val = toInt(ch);
          s.cells[s.openHand][s.openBeat].push({ value: val, crosses: false });
          s.state = MixedState.A_BRACE_AFTER_TOSS;
        } else {
          s.error = unexpected(ch, i, "a toss 0-9/a-z inside '['");
        }
        break;

      case MixedState.A_BRACE:
        stepABrace(ch, i);
        break;

      case MixedState.A_BRACE_AFTER_TOSS:
        if (ch === 'x') {
          const list = s.cells[s.openHand][s.openBeat];
          const last = list[list.length - 1];
          if (last.value === 0) {
            s.error = `Cannot apply crossing 'x' to '0' at position ${i} (add a space before 'x' for throw 33).`;
          } else {
            last.crosses = true;
            s.hasMixed = true;
            s.isVanillaAsync = false;
            s.state = MixedState.A_BRACE;
          }
        } else {
          stepABrace(ch, i);
        }
        break;

      case MixedState.S_FIRST:
        if (ch === ' ') {
          break;
        }
        if (ch === '[') {
          s.state = MixedState.S_FIRST_EMPTY_BRACE;
        } else if (ch === '0') {
          s.cells[LEFT][s.openBeat].push({ value: 0, crosses: false });
          s.state = MixedState.S_COMMA;
        } else if (isValidAsyncToss(ch)) {
          const val = toInt(ch);
          if (val % 2 === 1) {
            s.hasMixed = true;
          }
          s.cells[LEFT][s.openBeat].push({ value: val, crosses: false });
          s.state = MixedState.S_FIRST_X;
        } else {
          s.error = unexpected(ch, i, "a toss or '['");
        }
        break;

      case MixedState.S_FIRST_X:
        if (ch === ' ') {
          s.state = MixedState.S_COMMA;
        } else if (ch === ',') {
          s.openHand = RIGHT;
          s.state = MixedState.S_SECOND;
        } else if (ch === 'x') {
          const list = s.cells[LEFT][s.openBeat];
          list[list.length - 1].crosses = true;
          s.state = MixedState.S_COMMA;
        } else {
          s.error = unexpected(ch, i, "',' or 'x'");
        }
        break;

      case MixedState.S_FIRST_EMPTY_BRACE:
        if (ch === ' ') {
          break;
        }
        if (ch === '0') {
          s.cells[LEFT][s.openBeat].push({ value: 0, crosses: false });
          s.state = MixedState.S_FIRST_BRACE;
        } else if (isValidAsyncToss(ch)) {
          const val = toInt(ch);
          if (val % 2 === 1) {
            s.hasMixed = true;
          }
          s.cells[LEFT][s.openBeat].push({ value: val, crosses: false });
          s.state = MixedState.S_FIRST_X_OR_BRACE;
        } else {
          s.error = unexpected(ch, i, "a toss inside '['");
        }
        break;

      case MixedState.S_FIRST_BRACE:
        if (ch === ' ') {
          break;
        }
        if (ch === '0') {
          s.cells[LEFT][s.openBeat].push({ value: 0, crosses: false });
        } else if (ch === ']') {
          s.state = MixedState.S_COMMA;
        } else if (isValidAsyncToss(ch)) {
          const val = toInt(ch);
          if (val % 2 === 1) {
            s.hasMixed = true;
          }
          s.cells[LEFT][s.openBeat].push({ value: val, crosses: false });
          s.state = MixedState.S_FIRST_X_OR_BRACE;
        } else {
          s.error = unexpected(ch, i, "a toss or ']'");
        }
        break;

      case MixedState.S_FIRST_X_OR_BRACE:
        if (ch === ' ') {
          s.state = MixedState.S_FIRST_BRACE;
        } else if (ch === 'x') {
          const list = s.cells[LEFT][s.openBeat];
          list[list.length - 1].crosses = true;
          s.state = MixedState.S_FIRST_BRACE;
        } else if (ch === '0') {
          s.cells[LEFT][s.openBeat].push({ value: 0, crosses: false });
          s.state = MixedState.S_FIRST_BRACE;
        } else if (ch === ']') {
          s.state = MixedState.S_COMMA;
        } else if (isValidAsyncToss(ch)) {
          const val = toInt(ch);
          if (val % 2 === 1) {
            s.hasMixed = true;
          }
          s.cells[LEFT][s.openBeat].push({ value: val, crosses: false });
        } else {
          s.error = unexpected(ch, i, "a toss, 'x', or ']'");
        }
        break;

      case MixedState.S_COMMA:
        if (ch === ' ') {
          break;
        }
        if (ch === ',') {
          s.openHand = RIGHT;
          s.state = MixedState.S_SECOND;
        } else {
          s.error = unexpected(ch, i, "','");
        }
        break;

      case MixedState.S_SECOND:
        if (ch === ' ') {
          break;
        }
        if (ch === '[') {
          s.state = MixedState.S_SECOND_EMPTY_BRACE;
        } else if (ch === '0') {
          s.cells[RIGHT][s.openBeat].push({ value: 0, crosses: false });
          s.state = MixedState.S_PAREN;
        } else if (isValidAsyncToss(ch)) {
          const val = toInt(ch);
          if (val % 2 === 1) {
            s.hasMixed = true;
          }
          s.cells[RIGHT][s.openBeat].push({ value: val, crosses: false });
          s.state = MixedState.S_SECOND_X;
        } else {
          s.error = unexpected(ch, i, "a toss or '['");
        }
        break;

      case MixedState.S_SECOND_X:
        if (ch === ' ') {
          s.state = MixedState.S_PAREN;
        } else if (ch === ')') {
          // Standard sync pair consumes 2 beats (adding empty beat openBeat + 1).
          ensureBeat(s.openBeat + 1);
          s.state = MixedState.S_AFTER_PAREN;
        } else if (ch === 'x') {
          const list = s.cells[RIGHT][s.openBeat];
          list[list.length - 1].crosses = true;
          s.state = MixedState.S_PAREN;
        } else {
          s.error = unexpected(ch, i, "')' or 'x'");
        }
        break;

      case MixedState.S_SECOND_EMPTY_BRACE:
        if (ch === ' ') {
          break;
        }
        if (ch === '0') {
          s.cells[RIGHT][s.openBeat].push({ value: 0, crosses: false });
          s.state = MixedState.S_SECOND_BRACE;
        } else if (isValidAsyncToss(ch)) {
          const val = toInt(ch);
          if (val % 2 === 1) {
            s.hasMixed = true;
          }
          s.cells[RIGHT][s.openBeat].push({ value: val, crosses: false });
          s.state = MixedState.S_SECOND_X_OR_BRACE;
        } else {
          s.error = unexpected(ch, i, "a toss inside '['");
        }
        break;

      case MixedState.S_SECOND_BRACE:
        if (ch === ' ') {
          break;
        }
        if (ch === '0') {
          s.cells[RIGHT][s.openBeat].push({ value: 0, crosses: false });
        } else if (ch === ']') {
          s.state = MixedState.S_PAREN;
        } else if (isValidAsyncToss(ch)) {
          const val = toInt(ch);
          if (val % 2 === 1) {
            s.hasMixed = true;
          }
          s.cells[RIGHT][s.openBeat].push({ value: val, crosses: false });
          s.state = MixedState.S_SECOND_X_OR_BRACE;
        } else {
          s.error = unexpected(ch, i, "a toss or ']'");
        }
        break;

      case MixedState.S_SECOND_X_OR_BRACE:
        if (ch === ' ') {
          s.state = MixedState.S_SECOND_BRACE;
        } else if (ch === 'x') {
          const list = s.cells[RIGHT][s.openBeat];
          list[list.length - 1].crosses = true;
          s.state = MixedState.S_SECOND_BRACE;
        } else if (ch === '0') {
          s.cells[RIGHT][s.openBeat].push({ value: 0, crosses: false });
          s.state = MixedState.S_SECOND_BRACE;
        } else if (ch === ']') {
          s.state = MixedState.S_PAREN;
        } else if (isValidAsyncToss(ch)) {
          const val = toInt(ch);
          if (val % 2 === 1) {
            s.hasMixed = true;
          }
          s.cells[RIGHT][s.openBeat].push({ value: val, crosses: false });
        } else {
          s.error = unexpected(ch, i, "a toss, 'x', or ']'");
        }
        break;

      case MixedState.S_PAREN:
        if (ch === ' ') {
          break;
        }
        if (ch === ')') {
          ensureBeat(s.openBeat + 1);
          s.state = MixedState.S_AFTER_PAREN;
        } else {
          s.error = unexpected(ch, i, "')'");
        }
        break;

      case MixedState.S_AFTER_PAREN:
        if (ch === '!') {
          // Suppress the implicit empty beat after the sync pair.
          s.cells[LEFT].pop();
          s.cells[RIGHT].pop();
          s.period -= 1;
          s.hasMixed = true;
          if (curSyncItem) {
            curSyncItem.hasBang = true;
          }
          s.openBeat = -1;
          curSyncItem = null;
          s.state = MixedState.NORMAL;
        } else {
          s.openBeat = -1;
          curSyncItem = null;
          stepNormal(ch, i);
        }
        break;

      case MixedState.AFTER_STAR:
        if (ch === ' ') {
          break;
        }
        s.error = unexpected(ch, i, "end of pattern after '*'");
        break;
    }

    if (s.error !== undefined) {
      break;
    }
  }

  return s;
}

// Determines whether a parsed prefix is pure 'async', pure 'sync', or 'mixed'.
export function classifyPrefixMode(parsed) {
  if (parsed.hasMixed) {
    return 'mixed';
  }
  if (parsed.hasSync) {
    return 'sync';
  }
  return 'async';
}

// Returns true if the parsed pattern implicitly uses switch-repeat (odd-period vanilla async)
// or explicitly has '*', matching JugglingLab's SiteswapPattern.kt rule.
export function effectiveSwitchRepeat(mhn) {
  if (mhn.switchRepeat) {
    return true;
  }
  return mhn.isVanillaAsync && mhn.hasAsync && (mhn.period % 2 === 1);
}

// Expands an MHN pattern (with explicit '*' or implicit odd-period async symmetry)
// into a concrete full-period 2-hand matrix `cells[2][fullPeriod]`.
export function expandMhn(mhn) {
  const sr = effectiveSwitchRepeat(mhn);
  const P = mhn.period;
  if (!sr) {
    return {
      period: P,
      cells: [
        mhn.cells[LEFT].map(b => b.map(t => ({ ...t }))),
        mhn.cells[RIGHT].map(b => b.map(t => ({ ...t }))),
      ],
    };
  }
  const left = [];
  const right = [];
  for (let t = 0; t < P; t++) {
    left.push(mhn.cells[LEFT][t].map(x => ({ ...x })));
    right.push(mhn.cells[RIGHT][t].map(x => ({ ...x })));
  }
  for (let t = 0; t < P; t++) {
    left.push(mhn.cells[RIGHT][t].map(x => ({ ...x })));
    right.push(mhn.cells[LEFT][t].map(x => ({ ...x })));
  }
  return { period: P * 2, cells: [left, right] };
}

// Converts a legacy siteswap[][] (from randomSiteswap or old tests) into an MHN object.
export function fromLegacySiteswap(siteswap, is_sync) {
  if (!is_sync) {
    const P = siteswap.length;
    const left = Array.from({ length: P }, () => []);
    const right = Array.from({ length: P }, () => []);
    const items = [];
    for (let t = 0; t < P; t++) {
      const hand = t % 2 === 0 ? RIGHT : LEFT;
      for (const v of siteswap[t]) {
        (hand === LEFT ? left : right)[t].push({ value: v, crosses: false });
      }
      items.push({ kind: 'async', beat: t, hand, isMultiplex: siteswap[t].length > 1 });
    }
    return {
      cells: [left, right],
      period: P,
      items,
      state: MixedState.NORMAL,
      leftOnEven: false,
      hasAsync: true,
      hasSync: false,
      hasMixed: false,
      isVanillaAsync: true,
      switchRepeat: false,
    };
  }

  // Legacy sync: even indices are left throws at beat 2k, odd are right throws at beat 2k.
  const P = siteswap.length;
  const left = Array.from({ length: P }, () => []);
  const right = Array.from({ length: P }, () => []);
  const items = [];
  for (let t = 0; t < P; t += 2) {
    for (const raw of siteswap[t]) {
      const crosses = raw % 2 === 1;
      const value = crosses ? raw - 1 : raw;
      left[t].push({ value, crosses });
    }
    if (t + 1 < P) {
      for (const raw of siteswap[t + 1]) {
        const crosses = raw % 2 === 1;
        const value = crosses ? raw + 1 : raw;
        right[t].push({ value, crosses });
      }
    }
    items.push({ kind: 'sync', beat: t, hasBang: false });
  }
  return {
    cells: [left, right],
    period: P,
    items,
    state: MixedState.NORMAL,
    leftOnEven: false,
    hasAsync: false,
    hasSync: true,
    hasMixed: false,
    isVanillaAsync: false,
    switchRepeat: false,
  };
}

// Checks whether a completely parsed MHN pattern is valid (ups === downs on every (hand, beat)).
export function isValidMhn(mhn) {
  if (mhn.error !== undefined || mhn.period === 0) {
    return false;
  }
  const closedStates = new Set([
    MixedState.NORMAL,
    MixedState.A_AFTER_TOSS,
    MixedState.S_AFTER_PAREN,
    MixedState.AFTER_STAR,
  ]);
  if (!closedStates.has(mhn.state)) {
    return false;
  }
  const P = mhn.period;
  const sr = effectiveSwitchRepeat(mhn);
  const ups = [new Array(P).fill(0), new Array(P).fill(0)];
  const downs = [new Array(P).fill(0), new Array(P).fill(0)];

  for (let h = 0; h < 2; h++) {
    for (let t = 0; t < P; t++) {
      for (const thr of mhn.cells[h][t]) {
        if (thr.value === 0) {
          continue;
        }
        ups[h][t] += 1;
        const { hand: dh, beat: dt } = destCellForThrow(h, t, thr.value, thr.crosses, P, sr);
        downs[dh][dt] += 1;
      }
    }
  }

  for (let h = 0; h < 2; h++) {
    for (let t = 0; t < P; t++) {
      if (ups[h][t] !== downs[h][t]) {
        return false;
      }
    }
  }
  return true;
}

// Computes locked/open status for every prefix cell (h, t) in [0, prefixBeats).
function getPrefixConstraints(parsed) {
  const P = parsed.period;
  const ups = [new Array(P).fill(0), new Array(P).fill(0)];
  const locked = [new Array(P).fill(true), new Array(P).fill(true)];
  const openMultiplex = [new Array(P).fill(false), new Array(P).fill(false)];

  for (let h = 0; h < 2; h++) {
    for (let t = 0; t < P; t++) {
      for (const thr of parsed.cells[h][t]) {
        if (thr.value > 0) {
          ups[h][t] += 1;
        }
      }
    }
  }

  const st = parsed.state;
  const ob = parsed.openBeat;
  if (ob >= 0 && ob < P) {
    if (st === MixedState.A_EMPTY_BRACE || st === MixedState.A_BRACE || st === MixedState.A_BRACE_AFTER_TOSS) {
      locked[parsed.openHand][ob] = false;
      openMultiplex[parsed.openHand][ob] = true;
    } else if (st === MixedState.S_FIRST) {
      locked[LEFT][ob] = false;
      locked[RIGHT][ob] = false;
    } else if (st === MixedState.S_FIRST_EMPTY_BRACE || st === MixedState.S_FIRST_BRACE || st === MixedState.S_FIRST_X_OR_BRACE) {
      locked[LEFT][ob] = false;
      openMultiplex[LEFT][ob] = true;
      locked[RIGHT][ob] = false;
    } else if (st === MixedState.S_FIRST_X || st === MixedState.S_COMMA || st === MixedState.S_SECOND) {
      locked[RIGHT][ob] = false;
    } else if (st === MixedState.S_SECOND_EMPTY_BRACE || st === MixedState.S_SECOND_BRACE || st === MixedState.S_SECOND_X_OR_BRACE) {
      locked[RIGHT][ob] = false;
      openMultiplex[RIGHT][ob] = true;
    }
  }

  return { ups, locked, openMultiplex };
}

function computeMixedDowns(parsed, totalPeriod) {
  const downs = [new Array(totalPeriod).fill(0), new Array(totalPeriod).fill(0)];
  for (let h = 0; h < 2; h++) {
    for (let t = 0; t < parsed.period; t++) {
      for (const thr of parsed.cells[h][t]) {
        if (thr.value === 0) {
          continue;
        }
        const { hand: dh, beat: dt } = destCellForThrow(h, t, thr.value, thr.crosses, totalPeriod, false);
        downs[dh][dt] += 1;
      }
    }
  }
  return downs;
}

function maxMixedLengthToCheck(parsed) {
  let maxEnd = 0;
  for (let h = 0; h < 2; h++) {
    for (let t = 0; t < parsed.period; t++) {
      for (const thr of parsed.cells[h][t]) {
        if (thr.value > 0) {
          maxEnd = Math.max(maxEnd, t + thr.value);
        }
      }
    }
  }
  return Math.max(maxEnd - parsed.period + 1, 2);
}

function mixedNoConflict(parsed, constraints, downs, totalPeriod, allowMultiplex) {
  const { ups, locked, openMultiplex } = constraints;
  for (let h = 0; h < 2; h++) {
    for (let t = 0; t < totalPeriod; t++) {
      if (t < parsed.period) {
        if (locked[h][t]) {
          if (downs[h][t] > ups[h][t]) {
            return false;
          }
        } else if (!allowMultiplex && !openMultiplex[h][t] && downs[h][t] > 1) {
          return false;
        }
      } else if (!allowMultiplex && downs[h][t] > 1) {
        return false;
      }
    }
  }
  return true;
}

// Formats a mixed-mode suffix from the solved 2D added throws `added[2][totalPeriod]`.
function buildMixedSuffix(parsed, added, totalPeriod) {
  let suffix = '';
  let leftOnEven = parsed.leftOnEven;
  let nextBeat = parsed.period;
  const st = parsed.state;
  const ob = parsed.openBeat;

  const beatHasAnyThrow = (beat) => {
    if (beat < 0 || beat >= totalPeriod) {
      return false;
    }
    const check = (h) => {
      const existing = beat < parsed.period ? parsed.cells[h][beat] : [];
      const extra = added[h][beat] || [];
      return existing.some(x => x.value > 0) || extra.some(x => x.value > 0);
    };
    return check(LEFT) || check(RIGHT);
  };

  const formatAddedList = (list, canAttach) => {
    const text = list.map(formatMhnThrow).join('');
    if (canAttach && text.startsWith('x')) {
      return ' ' + text;
    }
    return text;
  };

  const closeSyncAfterRight = (syncBeat) => {
    // A sync pair at syncBeat needs '!' if it's the last beat of the pattern
    // OR if beat syncBeat + 1 is occupied.
    if (syncBeat + 1 >= totalPeriod || beatHasAnyThrow(syncBeat + 1)) {
      nextBeat = syncBeat + 1;
      return ')!';
    }
    nextBeat = syncBeat + 2;
    return ')';
  };

  // Step 1: Close any unfinished prefix construct.
  if (st === MixedState.A_EMPTY_BRACE || st === MixedState.A_BRACE || st === MixedState.A_BRACE_AFTER_TOSS) {
    const extra = added[parsed.openHand][ob] || [];
    suffix += formatAddedList(extra, st === MixedState.A_BRACE_AFTER_TOSS) + ']';
  } else if (st === MixedState.S_FIRST) {
    const leftExtra = added[LEFT][ob] || [];
    const rightExtra = added[RIGHT][ob] || [];
    suffix += formatMhnBeat(leftExtra) + ',' + formatMhnBeat(rightExtra) + closeSyncAfterRight(ob);
  } else if (st === MixedState.S_FIRST_EMPTY_BRACE || st === MixedState.S_FIRST_BRACE || st === MixedState.S_FIRST_X_OR_BRACE) {
    const leftExtra = added[LEFT][ob] || [];
    const rightExtra = added[RIGHT][ob] || [];
    suffix += formatAddedList(leftExtra, st === MixedState.S_FIRST_X_OR_BRACE) + '],' + formatMhnBeat(rightExtra) + closeSyncAfterRight(ob);
  } else if (st === MixedState.S_FIRST_X || st === MixedState.S_COMMA) {
    const rightExtra = added[RIGHT][ob] || [];
    suffix += ',' + formatMhnBeat(rightExtra) + closeSyncAfterRight(ob);
  } else if (st === MixedState.S_SECOND) {
    const rightExtra = added[RIGHT][ob] || [];
    suffix += formatMhnBeat(rightExtra) + closeSyncAfterRight(ob);
  } else if (st === MixedState.S_SECOND_EMPTY_BRACE || st === MixedState.S_SECOND_BRACE || st === MixedState.S_SECOND_X_OR_BRACE) {
    const rightExtra = added[RIGHT][ob] || [];
    suffix += formatAddedList(rightExtra, st === MixedState.S_SECOND_X_OR_BRACE) + ']' + closeSyncAfterRight(ob);
  } else if (st === MixedState.S_PAREN || st === MixedState.S_SECOND_X) {
    suffix += closeSyncAfterRight(ob);
  }

  // Guard against an async suffix starting with throw 'x' (33) right after an async non-zero toss.
  let canAttachX = st === MixedState.A_AFTER_TOSS;

  // Step 2: Emit remaining suffix beats [nextBeat .. totalPeriod - 1].
  for (let t = nextBeat; t < totalPeriod; ) {
    const L = added[LEFT][t] || [];
    const R = added[RIGHT][t] || [];

    if (L.length > 0 && R.length > 0) {
      const pairStr = `(${formatMhnBeat(L)},${formatMhnBeat(R)})`;
      const nextOccupied = (t + 1 >= totalPeriod) || beatHasAnyThrow(t + 1);
      suffix += pairStr + (nextOccupied ? '!' : '');
      canAttachX = false;
      t += nextOccupied ? 1 : 2;
    } else if (L.length === 0 && R.length === 0) {
      suffix += '0';
      canAttachX = true;
      t += 1;
    } else {
      const h = L.length > 0 ? LEFT : RIGHT;
      const throws = h === LEFT ? L : R;
      const expectedHand = ((t % 2 === 0) === leftOnEven) ? LEFT : RIGHT;
      if (h !== expectedHand) {
        suffix += (h === LEFT ? 'L' : 'R');
        leftOnEven = (t % 2 === 0) ? (h === LEFT) : (h !== LEFT);
        canAttachX = false;
      }
      const text = formatMhnBeat(throws);
      if (canAttachX && text.startsWith('x')) {
        suffix += ' ';
      }
      suffix += text;
      canAttachX = throws.length === 1 && !throws[0].crosses;
      t += 1;
    }
  }

  return suffix;
}

// Solves a mixed MHN suffix for an already-parsed prefix (without emitting '*').
function solveMixedFromParsed(parsed, input, allowMultiplex, extraSteps = 0) {
  if (parsed.state === MixedState.AFTER_STAR) {
    if (isValidMhn(parsed)) {
      return { suffix: '', mhn: parsed, addedBeats: 0 };
    }
    return { error: `Pattern '${input}' is not valid under '*' mirror repeat.` };
  }

  const constraints = getPrefixConstraints(parsed);
  const { ups, locked, openMultiplex } = constraints;
  const baseLimit = maxMixedLengthToCheck(parsed);
  const stepsWanted = Math.max(0, Math.floor(extraSteps));
  const searchLimit = baseLimit + (stepsWanted > 0 ? stepsWanted + 10 : 0);

  let foundS = -1;
  let foundDowns = null;
  let foundCount = 0;

  for (let s = 0; s <= searchLimit; s++) {
    if (s > baseLimit && foundCount === 0) {
      break;
    }
    const totalPeriod = parsed.period + s;
    if (totalPeriod === 0) {
      continue;
    }
    const downs = computeMixedDowns(parsed, totalPeriod);
    if (mixedNoConflict(parsed, constraints, downs, totalPeriod, allowMultiplex)) {
      if (foundCount === stepsWanted) {
        foundS = s;
        foundDowns = downs;
        break;
      }
      foundCount++;
    }
  }

  if (foundS === -1) {
    if (!allowMultiplex && solveMixedFromParsed(parsed, input, true, 0).error === undefined) {
      return { error: `No valid vanilla suffix exists for '${input}' (try Multiplex mode).` };
    }
    return { error: `No valid suffixes exist for '${input}' (throws collide on a prefix beat).` };
  }

  const totalPeriod = parsed.period + foundS;
  const goal = [new Array(totalPeriod).fill(0), new Array(totalPeriod).fill(0)];

  for (let h = 0; h < 2; h++) {
    for (let t = 0; t < totalPeriod; t++) {
      if (t < parsed.period) {
        if (locked[h][t]) {
          goal[h][t] = ups[h][t];
        } else if (openMultiplex[h][t]) {
          goal[h][t] = Math.max(2, ups[h][t], foundDowns[h][t]);
        } else {
          goal[h][t] = Math.max(ups[h][t], foundDowns[h][t]);
        }
      } else {
        goal[h][t] = foundDowns[h][t];
      }
    }
  }

  // If a new suffix beat has no catches on either hand yet, leave it empty (0 or absorbed)
  // unless we have zero throws anywhere and need to fill an open construct.
  const have = [];
  const need = [];
  for (let h = 0; h < 2; h++) {
    for (let t = 0; t < totalPeriod; t++) {
      const curUp = t < parsed.period ? ups[h][t] : 0;
      for (let k = 0; k < goal[h][t] - curUp; k++) {
        have.push({ hand: h, beat: t });
      }
      for (let k = 0; k < goal[h][t] - foundDowns[h][t]; k++) {
        need.push({ hand: h, beat: t });
      }
    }
  }

  const buildAdded = (pairedNeed) => {
    const added = [
      Array.from({ length: totalPeriod }, () => []),
      Array.from({ length: totalPeriod }, () => []),
    ];
    for (let i = 0; i < have.length; i++) {
      const src = have[i];
      const dst = pairedNeed[i];
      let v = mod(dst.beat - src.beat, totalPeriod);
      if (v === 0) {
        v = totalPeriod;
      }
      if (v <= 0 || v > MAX_TOSS) {
        return null;
      }
      const naturalDest = (v % 2 === 0) ? src.hand : (1 - src.hand);
      const crosses = naturalDest !== dst.hand;
      added[src.hand][src.beat].push({ value: v, crosses });
    }
    for (let h = 0; h < 2; h++) {
      for (let t = 0; t < totalPeriod; t++) {
        added[h][t].sort((a, b) => a.value - b.value || (a.crosses ? 1 : 0) - (b.crosses ? 1 : 0));
      }
    }
    return added;
  };

  let added = buildAdded(shuffled(need));
  if (!added) {
    for (let attempt = 0; attempt < 10; attempt++) {
      added = buildAdded(attempt === 0 ? need : shuffled(need));
      if (added) {
        break;
      }
    }
    if (!added) {
      return { error: `Suffix requires a throw higher than 'z' (35) for '${input}'.` };
    }
  }

  const suffix = buildMixedSuffix(parsed, added, totalPeriod);
  const fullMhn = parseMixed(input + suffix);
  if (fullMhn.error !== undefined || !isValidMhn(fullMhn)) {
    return { error: `Could not construct valid mixed suffix for '${input}'.` };
  }
  return { suffix, mhn: fullMhn, addedBeats: foundS };
}

// Ensures any throw-33 'x' emitted by legacy async mode won't be misread as a crossing modifier.
function protectAsyncXInSuffix(parsed, suffix) {
  let prevToss =
    parsed.state === MixedState.A_AFTER_TOSS ||
    parsed.state === MixedState.A_BRACE_AFTER_TOSS;
  let out = '';
  for (let i = 0; i < suffix.length; i++) {
    const ch = suffix[i];
    if (ch === 'x' && prevToss) {
      out += ' x';
      prevToss = true;
    } else {
      out += ch;
      prevToss = isValidAsyncToss(ch);
    }
  }
  return out;
}

const CAN_APPEND_X_STATES = new Set([
  MixedState.A_AFTER_TOSS,
  MixedState.A_BRACE_AFTER_TOSS,
  MixedState.S_FIRST_X,
  MixedState.S_FIRST_X_OR_BRACE,
  MixedState.S_SECOND_X,
  MixedState.S_SECOND_X_OR_BRACE,
]);

// Unified match-input suggestion entry point:
// - Pure async prefixes -> pure async completions (legacy suggestBest)
// - Pure sync prefixes (without '*') -> pure sync completions (legacy suggestBest)
// - Any prefix with '*', '!', 'L'/'R', async 'x', odd-in-sync, or mixed sync+async -> MHN mixed solver
export function suggestUnified(input, allowMultiplex, extraSteps = 0) {
  const parsed = parseMixed(input);
  if (parsed.error !== undefined) {
    return { error: parsed.error };
  }

  const mode = classifyPrefixMode(parsed);

  // Explicit '*' is always handled by the MHN solver (never emits more beats after '*').
  if (parsed.switchRepeat) {
    const res = solveMixedFromParsed(parsed, input, allowMultiplex, extraSteps);
    return res.error !== undefined ? res : { ...res, mode: mode === 'mixed' ? 'mixed' : mode };
  }

  // Match-input: keep pure async and pure sync 100% faithful to classic behavior
  // (including when the user inserts spaces like "z x y" or "(4, 2x)").
  if (mode !== 'mixed') {
    const stripped = input.replace(/ /g, '');
    if (stripped.length === 0) {
      return { error: 'Pattern is empty.' };
    }
    const isSync = mode === 'sync';
    const allowAppendX = CAN_APPEND_X_STATES.has(parsed.state);
    const legacy = legacySuggestBest(stripped, allowMultiplex, isSync, extraSteps, allowAppendX);
    if (legacy.error !== undefined) {
      return legacy;
    }
    const suffix = isSync ? legacy.suffix : protectAsyncXInSuffix(parsed, legacy.suffix);
    const fullMhn = parseMixed(input + suffix);
    return {
      suffix,
      mhn: fullMhn.error === undefined && isValidMhn(fullMhn)
        ? fullMhn
        : fromLegacySiteswap(legacy.siteswap, isSync),
      addedBeats: legacy.addedBeats,
      mode,
    };
  }

  // Mixed mode: solve directly, and also check if appending '!' or 'x' yields a shorter suffix.
  let best = solveMixedFromParsed(parsed, input, allowMultiplex, extraSteps);

  const tryAppendChar = (ch) => {
    const altParsed = parseMixed(input + ch);
    if (altParsed.error !== undefined) {
      return;
    }
    const alt = solveMixedFromParsed(altParsed, input + ch, allowMultiplex, extraSteps);
    if (alt.error === undefined &&
        (best.error !== undefined || alt.suffix.length + 1 < best.suffix.length)) {
      best = {
        suffix: ch + alt.suffix,
        mhn: alt.mhn,
        addedBeats: alt.addedBeats,
      };
    }
  };

  if (parsed.state === MixedState.S_AFTER_PAREN) {
    tryAppendChar('!');
  } else if (CAN_APPEND_X_STATES.has(parsed.state)) {
    const openList = parsed.openBeat >= 0 ? parsed.cells[parsed.openHand][parsed.openBeat] : null;
    const lastThrow = openList && openList.length > 0 ? openList[openList.length - 1] : null;
    if (lastThrow && lastThrow.value > 0) {
      tryAppendChar('x');
    }
  }

  return best.error !== undefined ? best : { ...best, mode: 'mixed' };
}
