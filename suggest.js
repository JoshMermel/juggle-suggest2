import { mod, shuffled } from './utils.js';

const MAX_TOSS = 35;

// Checks for characters that are valid toss heights.
function isValidAsyncToss(c) {
  return /^[0-9a-z]$/.test(c);
}

function isEvenToss(c) {
  return /^[02468acegikmoqsuwy]$/.test(c);
}

// Takes a char in [0-9a-z] and returns its integer throw height.
function toInt(c) {
  if (/^[0-9]$/.test(c)) {
    return parseInt(c, 10);
  }
  if (/^[a-z]$/.test(c)) {
    return c.charCodeAt(0) - 97 + 10;
  }
  throw new RangeError("Invalid toss character: " + c);
}

// Takes an integer in [0, 35] and returns its async siteswap character.
function asyncToToss(i) {
  if (i >= 0 && i <= 9) {
    return String.fromCharCode(i + 48);
  }
  if (i >= 10 && i <= MAX_TOSS) {
    return String.fromCharCode(i + 97 - 10);
  }
  throw new RangeError("Throw height out of range: " + i);
}

// Takes an integer in the siteswap range and returns its sync string.
// Odd raw throws are crossing throws whose even visual height is i + odd_modifier.
function syncToToss(i, odd_modifier) {
  if (i % 2 === 1) {
    const adjusted = i + odd_modifier;
    if (adjusted <= 0 || adjusted > MAX_TOSS) {
      throw new RangeError("Sync throw height out of range: " + adjusted);
    }
    return syncToToss(adjusted, 0) + "x";
  }

  if (i >= 0 && i <= 9) {
    return String.fromCharCode(i + 48);
  }
  if (i >= 10 && i <= MAX_TOSS) {
    return String.fromCharCode(i + 97 - 10);
  }
  throw new RangeError("Throw height out of range: " + i);
}

function toAsyncMultiToss(tosses) {
  return tosses.map(x => asyncToToss(x)).join("");
}

function toSyncMultiToss(tosses, odd_modifier) {
  return tosses.map(x => syncToToss(x, odd_modifier)).join("");
}

function appendX(s) {
  const toss = s.siteswap[s.siteswap.length - 1];
  if (s.siteswap.length % 2 === 0) {
    toss[toss.length - 1] -= 1;
  } else {
    toss[toss.length - 1] += 1;
  }
}

// Enum for async parse state.
const AsyncStateEnum = Object.freeze({
  A_NORMAL: 0,
  A_EMPTY_BRACE: 1,
  A_BRACE: 2,
});

// Enum for sync parse state (starts at 3 so async/sync values never overlap).
const SyncStateEnum = Object.freeze({
  S_NORMAL: 3,
  S_FIRST: 4,
  S_FIRST_X: 5,
  S_FIRST_EMPTY_BRACE: 6,
  S_FIRST_BRACE: 7,
  S_FIRST_X_OR_BRACE: 8,
  S_COMMA: 9,
  S_SECOND: 10,
  S_SECOND_X: 11,
  S_SECOND_EMPTY_BRACE: 12,
  S_SECOND_BRACE: 13,
  S_SECOND_X_OR_BRACE: 14,
  S_PAREN: 15,
});

const OPEN_MULTIPLEX_STATES = new Set([
  AsyncStateEnum.A_EMPTY_BRACE,
  AsyncStateEnum.A_BRACE,
  SyncStateEnum.S_FIRST_EMPTY_BRACE,
  SyncStateEnum.S_FIRST_BRACE,
  SyncStateEnum.S_FIRST_X_OR_BRACE,
  SyncStateEnum.S_SECOND_EMPTY_BRACE,
  SyncStateEnum.S_SECOND_BRACE,
  SyncStateEnum.S_SECOND_X_OR_BRACE,
]);

// Sync states from which appending 'x' is syntactically valid.
const PRE_X_STATES = new Set([
  SyncStateEnum.S_FIRST_X,
  SyncStateEnum.S_FIRST_X_OR_BRACE,
  SyncStateEnum.S_SECOND_X,
  SyncStateEnum.S_SECOND_X_OR_BRACE,
]);

// Sync states immediately reached after parsing 'x'.
const POST_X_STATES = new Set([
  SyncStateEnum.S_COMMA,
  SyncStateEnum.S_FIRST_BRACE,
  SyncStateEnum.S_PAREN,
  SyncStateEnum.S_SECOND_BRACE,
]);

function unexpectedChar(next_char, expected) {
  return `Unexpected '${next_char}' (expected ${expected})`;
}

function parseANormal(s, next_char) {
  if (next_char === "[") {
    s.parse_state = AsyncStateEnum.A_EMPTY_BRACE;
    s.siteswap.push([]);
  } else if (isValidAsyncToss(next_char)) {
    s.siteswap.push([toInt(next_char)]);
  } else {
    s.error = unexpectedChar(next_char, "a toss 0-9/a-z or '['");
  }
}

function parseAEmptyBrace(s, next_char) {
  if (isValidAsyncToss(next_char)) {
    s.siteswap[s.siteswap.length - 1].push(toInt(next_char));
    s.parse_state = AsyncStateEnum.A_BRACE;
  } else {
    s.error = unexpectedChar(next_char, "a toss 0-9/a-z inside '['");
  }
}

function parseABrace(s, next_char) {
  if (isValidAsyncToss(next_char)) {
    s.siteswap[s.siteswap.length - 1].push(toInt(next_char));
  } else if (next_char === "]") {
    s.parse_state = AsyncStateEnum.A_NORMAL;
  } else {
    s.error = unexpectedChar(next_char, "a toss 0-9/a-z or ']'");
  }
}

const ASYNC_PARSE_FUNS = Object.freeze({
  [AsyncStateEnum.A_NORMAL]: parseANormal,
  [AsyncStateEnum.A_EMPTY_BRACE]: parseAEmptyBrace,
  [AsyncStateEnum.A_BRACE]: parseABrace,
});

function parseSyncNormal(s, next_char) {
  if (next_char === "(") {
    s.parse_state = SyncStateEnum.S_FIRST;
  } else {
    s.error = unexpectedChar(next_char, "'(' to start a sync pair");
  }
}

function parseSyncFirst(s, next_char) {
  if (next_char === "[") {
    s.parse_state = SyncStateEnum.S_FIRST_EMPTY_BRACE;
    s.siteswap.push([]);
  } else if (next_char === "0") {
    s.parse_state = SyncStateEnum.S_COMMA;
    s.siteswap.push([0]);
  } else if (isEvenToss(next_char)) {
    s.parse_state = SyncStateEnum.S_FIRST_X;
    s.siteswap.push([toInt(next_char)]);
  } else {
    s.error = unexpectedChar(next_char, "an even toss (0, 2, 4, ...) or '['");
  }
}

function parseSyncFirstX(s, next_char) {
  if (next_char === ",") {
    s.parse_state = SyncStateEnum.S_SECOND;
  } else if (next_char === "x") {
    s.parse_state = SyncStateEnum.S_COMMA;
    appendX(s);
  } else {
    s.error = unexpectedChar(next_char, "',' or 'x'");
  }
}

function parseSyncFirstEmptyBrace(s, next_char) {
  if (next_char === "0") {
    s.parse_state = SyncStateEnum.S_FIRST_BRACE;
    s.siteswap[s.siteswap.length - 1].push(0);
  } else if (isEvenToss(next_char)) {
    s.parse_state = SyncStateEnum.S_FIRST_X_OR_BRACE;
    s.siteswap[s.siteswap.length - 1].push(toInt(next_char));
  } else {
    s.error = unexpectedChar(next_char, "an even toss (0, 2, 4, ...) inside '['");
  }
}

function parseSyncFirstBrace(s, next_char) {
  if (next_char === "0") {
    s.parse_state = SyncStateEnum.S_FIRST_BRACE;
    s.siteswap[s.siteswap.length - 1].push(0);
  } else if (isEvenToss(next_char)) {
    s.parse_state = SyncStateEnum.S_FIRST_X_OR_BRACE;
    s.siteswap[s.siteswap.length - 1].push(toInt(next_char));
  } else if (next_char === "]") {
    s.parse_state = SyncStateEnum.S_COMMA;
  } else {
    s.error = unexpectedChar(next_char, "an even toss (0, 2, 4, ...) or ']'");
  }
}

function parseSyncFirstXOrBrace(s, next_char) {
  if (next_char === "0") {
    s.parse_state = SyncStateEnum.S_FIRST_BRACE;
    s.siteswap[s.siteswap.length - 1].push(0);
  } else if (next_char === "x") {
    s.parse_state = SyncStateEnum.S_FIRST_BRACE;
    appendX(s);
  } else if (isEvenToss(next_char)) {
    s.parse_state = SyncStateEnum.S_FIRST_X_OR_BRACE;
    s.siteswap[s.siteswap.length - 1].push(toInt(next_char));
  } else if (next_char === "]") {
    s.parse_state = SyncStateEnum.S_COMMA;
  } else {
    s.error = unexpectedChar(next_char, "an even toss, 'x', or ']'");
  }
}

function parseSyncComma(s, next_char) {
  if (next_char === ",") {
    s.parse_state = SyncStateEnum.S_SECOND;
  } else {
    s.error = unexpectedChar(next_char, "','");
  }
}

function parseSyncSecond(s, next_char) {
  if (next_char === "[") {
    s.parse_state = SyncStateEnum.S_SECOND_EMPTY_BRACE;
    s.siteswap.push([]);
  } else if (next_char === "0") {
    s.parse_state = SyncStateEnum.S_PAREN;
    s.siteswap.push([0]);
  } else if (isEvenToss(next_char)) {
    s.parse_state = SyncStateEnum.S_SECOND_X;
    s.siteswap.push([toInt(next_char)]);
  } else {
    s.error = unexpectedChar(next_char, "an even toss (0, 2, 4, ...) or '['");
  }
}

function parseSyncSecondX(s, next_char) {
  if (next_char === ")") {
    s.parse_state = SyncStateEnum.S_NORMAL;
  } else if (next_char === "x") {
    s.parse_state = SyncStateEnum.S_PAREN;
    appendX(s);
  } else {
    s.error = unexpectedChar(next_char, "')' or 'x'");
  }
}

function parseSyncSecondEmptyBrace(s, next_char) {
  if (next_char === "0") {
    s.parse_state = SyncStateEnum.S_SECOND_BRACE;
    s.siteswap[s.siteswap.length - 1].push(0);
  } else if (isEvenToss(next_char)) {
    s.parse_state = SyncStateEnum.S_SECOND_X_OR_BRACE;
    s.siteswap[s.siteswap.length - 1].push(toInt(next_char));
  } else {
    s.error = unexpectedChar(next_char, "an even toss (0, 2, 4, ...) inside '['");
  }
}

function parseSyncSecondBrace(s, next_char) {
  if (next_char === "0") {
    s.parse_state = SyncStateEnum.S_SECOND_BRACE;
    s.siteswap[s.siteswap.length - 1].push(0);
  } else if (isEvenToss(next_char)) {
    s.parse_state = SyncStateEnum.S_SECOND_X_OR_BRACE;
    s.siteswap[s.siteswap.length - 1].push(toInt(next_char));
  } else if (next_char === "]") {
    s.parse_state = SyncStateEnum.S_PAREN;
  } else {
    s.error = unexpectedChar(next_char, "an even toss (0, 2, 4, ...) or ']'");
  }
}

function parseSyncSecondXOrBrace(s, next_char) {
  if (next_char === "0") {
    s.parse_state = SyncStateEnum.S_SECOND_BRACE;
    s.siteswap[s.siteswap.length - 1].push(0);
  } else if (next_char === "x") {
    s.parse_state = SyncStateEnum.S_SECOND_BRACE;
    appendX(s);
  } else if (isEvenToss(next_char)) {
    s.parse_state = SyncStateEnum.S_SECOND_X_OR_BRACE;
    s.siteswap[s.siteswap.length - 1].push(toInt(next_char));
  } else if (next_char === "]") {
    s.parse_state = SyncStateEnum.S_PAREN;
  } else {
    s.error = unexpectedChar(next_char, "an even toss, 'x', or ']'");
  }
}

function parseSyncParen(s, next_char) {
  if (next_char === ")") {
    s.parse_state = SyncStateEnum.S_NORMAL;
  } else {
    s.error = unexpectedChar(next_char, "')'");
  }
}

const SYNC_PARSE_FUNS = Object.freeze({
  [SyncStateEnum.S_NORMAL]: parseSyncNormal,
  [SyncStateEnum.S_FIRST]: parseSyncFirst,
  [SyncStateEnum.S_FIRST_X]: parseSyncFirstX,
  [SyncStateEnum.S_FIRST_EMPTY_BRACE]: parseSyncFirstEmptyBrace,
  [SyncStateEnum.S_FIRST_BRACE]: parseSyncFirstBrace,
  [SyncStateEnum.S_FIRST_X_OR_BRACE]: parseSyncFirstXOrBrace,
  [SyncStateEnum.S_COMMA]: parseSyncComma,
  [SyncStateEnum.S_SECOND]: parseSyncSecond,
  [SyncStateEnum.S_SECOND_X]: parseSyncSecondX,
  [SyncStateEnum.S_SECOND_EMPTY_BRACE]: parseSyncSecondEmptyBrace,
  [SyncStateEnum.S_SECOND_BRACE]: parseSyncSecondBrace,
  [SyncStateEnum.S_SECOND_X_OR_BRACE]: parseSyncSecondXOrBrace,
  [SyncStateEnum.S_PAREN]: parseSyncParen,
});

function parseFuns(is_sync) {
  return is_sync ? SYNC_PARSE_FUNS : ASYNC_PARSE_FUNS;
}

function initialState(is_sync) {
  return is_sync ? SyncStateEnum.S_NORMAL : AsyncStateEnum.A_NORMAL;
}

// Parses a string representation of a siteswap into { siteswap, parse_state, error? }.
function parseSiteswap(str, is_sync) {
  const parse_funs = parseFuns(is_sync);
  const prefix = {
    parse_state: initialState(is_sync),
    siteswap: [],
  };

  for (let i = 0; i < str.length; i++) {
    parse_funs[prefix.parse_state](prefix, str[i]);
    if (prefix.error !== undefined) {
      prefix.error += " at position " + i + ".";
      break;
    }
  }
  return prefix;
}

// Returns how many throws occur on each beat of the prefix.
function getUps(s) {
  return s.siteswap.map(x => x.length);
}

// Returns how many catches land on each beat if the suffix has length `len`.
function getDowns(s, len) {
  const prefix = s.siteswap;
  const total_len = prefix.length + len;
  const downs = [];
  for (let i = 0; i < prefix.length; i++) {
    for (let j = 0; j < prefix[i].length; j++) {
      const down_pos = (prefix[i][j] + i) % total_len;
      downs[down_pos] = (downs[down_pos] || 0) + 1;
    }
  }
  return downs;
}

function isOpenMultiplexState(parse_state) {
  return OPEN_MULTIPLEX_STATES.has(parse_state);
}

// Returns true if throw counts and catch counts are compatible on prefix beats.
function noConflict(ups, downs, parse_state) {
  let num_to_check = ups.length;
  if (isOpenMultiplexState(parse_state)) {
    num_to_check -= 1;
  }
  for (let i = 0; i < num_to_check; i++) {
    if (downs[i] > ups[i]) {
      return false;
    }
  }
  return true;
}

// It is worth checking up to the point where no throws wrap around modulo
// pattern length (total_len = max + 1, so suffix_len = max + 1 - prefix_len).
// Beyond that, downs on prefix beats never change.
function maxLengthToCheck(s) {
  let max = 0;
  for (let i = 0; i < s.siteswap.length; i++) {
    for (let j = 0; j < s.siteswap[i].length; j++) {
      max = Math.max(max, s.siteswap[i][j] + i);
    }
  }
  return Math.max(max - s.siteswap.length + 1, 1);
}

function noMultiplexAdded(downs, prefix_len) {
  for (let i = prefix_len; i < downs.length; i++) {
    if (downs[i] > 1) {
      return false;
    }
  }
  return true;
}

// Finds the (extra_steps + 1)-th shortest valid suffix length and returns { length, downs } or null.
function findShortestSuffix(s, ups, allow_multiplex, is_sync, extra_steps = 0) {
  const start = is_sync
    ? (s.siteswap.length % 2) + (s.parse_state === SyncStateEnum.S_FIRST ? 2 : 0)
    : 0;
  const step = is_sync ? 2 : 1;
  const baseLimit = maxLengthToCheck(s) + (is_sync ? 1 : 0);
  const stepsWanted = Math.max(0, Math.floor(extra_steps));
  const searchLimit = baseLimit + (stepsWanted > 0 ? (stepsWanted + 10) * step : 0);

  let foundCount = 0;
  for (let i = start; i <= searchLimit; i += step) {
    // Once past baseLimit without finding a single valid length, no larger length can work.
    if (i > baseLimit && foundCount === 0) {
      return null;
    }
    const downs = getDowns(s, i);
    if (noConflict(ups, downs, s.parse_state)) {
      if (allow_multiplex || noMultiplexAdded(downs, s.siteswap.length)) {
        if (foundCount === stepsWanted) {
          return { length: i, downs };
        }
        foundCount++;
      }
    }
  }
  return null;
}

function suffixLength(prefix, allow_multiplex, is_sync, extra_steps = 0) {
  const found = findShortestSuffix(prefix, getUps(prefix), allow_multiplex, is_sync, extra_steps);
  return found ? found.length : -1;
}

function goalCounts(ups, downs, suffix_length, parse_state) {
  const goal_counts = new Array(suffix_length + ups.length);
  for (let i = 0; i < goal_counts.length; i++) {
    if (downs[i] === undefined && ups[i] === undefined) {
      goal_counts[i] = 1;
    } else if (downs[i] === undefined) {
      goal_counts[i] = ups[i];
    } else if (ups[i] === undefined) {
      goal_counts[i] = downs[i];
    } else {
      goal_counts[i] = Math.max(ups[i], downs[i]);
    }
  }
  // Honor user square braces even in vanilla mode by ensuring >= 2 throws.
  if (isOpenMultiplexState(parse_state)) {
    const open_index = ups.length - 1;
    goal_counts[open_index] = Math.max(2, goal_counts[open_index]);
  }
  return goal_counts;
}

// Returns a multiset of beat indices representing how many throws/catches must
// be added at each index to reach goal_counts.
function listDiff(lst, goal_counts) {
  const diff = [];
  for (let i = 0; i < goal_counts.length; i++) {
    const elem = lst[i] || 0;
    for (let j = 0; j < goal_counts[i] - elem; j++) {
      diff.push(i);
    }
  }
  return diff;
}

// Produces a map from throw beat index to sorted list of added throw heights.
function suffixMap(have, need, goal_length, is_sync) {
  const suffix_map = [];
  for (let i = 0; i < have.length; i++) {
    let toss = mod(need[i] - have[i], goal_length);
    // Avoid filling suffixes with 0s when a period-length throw fits.
    if (toss === 0 && goal_length <= MAX_TOSS) {
      toss = goal_length;
    }
    // Avoid 0x throws on even beats in sync mode.
    if (toss === 1 && goal_length < MAX_TOSS && have[i] % 2 === 0 && is_sync) {
      toss = goal_length + 1;
    }
    if (suffix_map[have[i]] === undefined) {
      suffix_map[have[i]] = [];
    }
    suffix_map[have[i]].push(toss);
  }
  for (let i = 0; i < suffix_map.length; i++) {
    if (suffix_map[i] !== undefined) {
      suffix_map[i].sort((a, b) => a - b);
    }
  }
  return suffix_map;
}

function isRepresentableSuffixMap(suffix_map, is_sync) {
  for (let i = 0; i < suffix_map.length; i++) {
    if (suffix_map[i] === undefined) {
      continue;
    }
    for (let j = 0; j < suffix_map[i].length; j++) {
      const toss = suffix_map[i][j];
      if (!is_sync) {
        if (toss < 0 || toss > MAX_TOSS) {
          return false;
        }
      } else if (toss % 2 === 1) {
        const odd_modifier = (i % 2 === 0) ? -1 : 1;
        const adjusted = toss + odd_modifier;
        if (adjusted <= 0 || adjusted > MAX_TOSS) {
          return false;
        }
      } else if (toss < 0 || toss > MAX_TOSS) {
        return false;
      }
    }
  }
  return true;
}

function punctuation(parse_state, is_sync) {
  if (!is_sync) {
    return isOpenMultiplexState(parse_state) ? "]" : "";
  }
  let ret = isOpenMultiplexState(parse_state) ? "]" : "";
  if (parse_state !== SyncStateEnum.S_NORMAL) {
    ret += ")";
  }
  return ret;
}

function buildSuffixANormal(s, toss) {
  if (toss.length > 1) {
    return "[" + buildSuffixABrace(s, toss);
  }
  return asyncToToss(toss[0]);
}

function buildSuffixABrace(s, toss) {
  s.parse_state = AsyncStateEnum.A_NORMAL;
  return toAsyncMultiToss(toss) + "]";
}

const ASYNC_BUILD_FUNS = Object.freeze({
  [AsyncStateEnum.A_NORMAL]: buildSuffixANormal,
  [AsyncStateEnum.A_EMPTY_BRACE]: buildSuffixABrace,
  [AsyncStateEnum.A_BRACE]: buildSuffixABrace,
});

function buildSuffixSNormal(s, toss) {
  return "(" + buildSuffixSFirst(s, toss);
}

function buildSuffixSFirst(s, toss) {
  if (toss.length > 1) {
    return "[" + buildSuffixSFirstBrace(s, toss);
  }
  s.parse_state = SyncStateEnum.S_SECOND;
  return syncToToss(toss[0], -1) + ",";
}

// Also handles S_COMMA.
function buildSuffixSFirstX(s, toss) {
  return "," + buildSuffixSSecond(s, toss);
}

// Also handles S_FIRST_EMPTY_BRACE and S_FIRST_X_OR_BRACE.
function buildSuffixSFirstBrace(s, toss) {
  s.parse_state = SyncStateEnum.S_SECOND;
  return toSyncMultiToss(toss, -1) + "],";
}

function buildSuffixSSecond(s, toss) {
  if (toss.length > 1) {
    return "[" + buildSuffixSSecondBrace(s, toss);
  }
  s.parse_state = SyncStateEnum.S_NORMAL;
  return syncToToss(toss[0], 1) + ")";
}

// Also handles S_PAREN.
function buildSuffixSSecondX(s, toss) {
  return ")(" + buildSuffixSFirst(s, toss);
}

// Also handles S_SECOND_EMPTY_BRACE and S_SECOND_X_OR_BRACE.
function buildSuffixSSecondBrace(s, toss) {
  s.parse_state = SyncStateEnum.S_NORMAL;
  return toSyncMultiToss(toss, 1) + "])";
}

const SYNC_BUILD_FUNS = Object.freeze({
  [SyncStateEnum.S_NORMAL]: buildSuffixSNormal,
  [SyncStateEnum.S_FIRST]: buildSuffixSFirst,
  [SyncStateEnum.S_FIRST_X]: buildSuffixSFirstX,
  [SyncStateEnum.S_COMMA]: buildSuffixSFirstX,
  [SyncStateEnum.S_FIRST_EMPTY_BRACE]: buildSuffixSFirstBrace,
  [SyncStateEnum.S_FIRST_BRACE]: buildSuffixSFirstBrace,
  [SyncStateEnum.S_FIRST_X_OR_BRACE]: buildSuffixSFirstBrace,
  [SyncStateEnum.S_SECOND]: buildSuffixSSecond,
  [SyncStateEnum.S_SECOND_X]: buildSuffixSSecondX,
  [SyncStateEnum.S_PAREN]: buildSuffixSSecondX,
  [SyncStateEnum.S_SECOND_EMPTY_BRACE]: buildSuffixSSecondBrace,
  [SyncStateEnum.S_SECOND_BRACE]: buildSuffixSSecondBrace,
  [SyncStateEnum.S_SECOND_X_OR_BRACE]: buildSuffixSSecondBrace,
});

function preSuffix(s, suffix_map, is_sync) {
  if (suffix_map[s.siteswap.length - 1] !== undefined) {
    return "";
  }
  if (!is_sync) {
    if (s.parse_state === AsyncStateEnum.A_BRACE) {
      s.parse_state = AsyncStateEnum.A_NORMAL;
      return "]";
    }
    return "";
  }
  if (s.parse_state === SyncStateEnum.S_FIRST_BRACE ||
      s.parse_state === SyncStateEnum.S_FIRST_X_OR_BRACE) {
    s.parse_state = SyncStateEnum.S_SECOND;
    return "],";
  }
  if (s.parse_state === SyncStateEnum.S_SECOND_BRACE ||
      s.parse_state === SyncStateEnum.S_SECOND_X_OR_BRACE) {
    s.parse_state = SyncStateEnum.S_NORMAL;
    return "])";
  }
  return "";
}

// Builds a suffix string using the state transition graph.
function buildSuffix(s, suffix_map, is_sync) {
  const build_funs = is_sync ? SYNC_BUILD_FUNS : ASYNC_BUILD_FUNS;
  let suffix = preSuffix(s, suffix_map, is_sync);
  for (let i = 0; i < suffix_map.length; i++) {
    if (suffix_map[i] !== undefined) {
      suffix += build_funs[s.parse_state](s, suffix_map[i]);
    }
  }
  return suffix + punctuation(s.parse_state, is_sync);
}

// Combines prefix siteswap throws with suffix_map throws without re-parsing.
function combineSiteswap(prefix_siteswap, suffix_map) {
  const combined = prefix_siteswap.map(beat => beat.slice());
  for (let i = 0; i < suffix_map.length; i++) {
    if (suffix_map[i] !== undefined) {
      if (i < combined.length) {
        combined[i].push(...suffix_map[i]);
      } else {
        combined[i] = suffix_map[i].slice();
      }
    }
  }
  return combined;
}

// Core suggestion engine operating on an already-parsed prefix object.
function suggestFromParsed(prefix, input, allow_multiplex, is_sync, extra_steps = 0) {
  const ups = getUps(prefix);
  const found = findShortestSuffix(prefix, ups, allow_multiplex, is_sync, extra_steps);
  if (found === null) {
    if (!allow_multiplex && findShortestSuffix(prefix, ups, true, is_sync, 0) !== null) {
      return { error: `No valid vanilla suffix exists for '${input}' (throws land on the same beat; try Multiplex mode).` };
    }
    return { error: `No valid suffixes exist for '${input}' (throws collide on a prefix beat).` };
  }

  const goal_counts = goalCounts(ups, found.downs, found.length, prefix.parse_state);
  const have = listDiff(ups, goal_counts);
  const need = listDiff(found.downs, goal_counts);

  let suffix_map = suffixMap(have, shuffled(need), goal_counts.length, is_sync);
  if (!isRepresentableSuffixMap(suffix_map, is_sync)) {
    let ok = false;
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = suffixMap(have, attempt === 0 ? need : shuffled(need), goal_counts.length, is_sync);
      if (isRepresentableSuffixMap(candidate, is_sync)) {
        suffix_map = candidate;
        ok = true;
        break;
      }
    }
    if (!ok) {
      return { error: `Suffix requires a throw higher than 'z' (35) for '${input}'.` };
    }
  }

  const siteswap = combineSiteswap(prefix.siteswap, suffix_map);
  const builderState = { parse_state: prefix.parse_state, siteswap: prefix.siteswap };
  const suffix = buildSuffix(builderState, suffix_map, is_sync);
  return { suffix, siteswap, addedBeats: found.length };
}

// Returns a suffix string for `input`, or `{ error }`.
function suggest(input, allow_multiplex, is_sync, extra_steps = 0) {
  const prefix = parseSiteswap(input, is_sync);
  if (prefix.error !== undefined) {
    return prefix;
  }
  const result = suggestFromParsed(prefix, input, allow_multiplex, is_sync, extra_steps);
  return result.error !== undefined ? result : result.suffix;
}

// Like suggest, but appends 'x' first in sync mode; returns undefined on failure.
function suggestWithX(input, allow_multiplex, is_sync, extra_steps = 0) {
  if (!is_sync) {
    return undefined;
  }
  const parsed = parseSiteswap(input + 'x', true);
  if (parsed.error !== undefined || !POST_X_STATES.has(parsed.parse_state)) {
    return undefined;
  }
  const result = suggestFromParsed(parsed, input + 'x', allow_multiplex, true, extra_steps);
  return result.error !== undefined ? undefined : result.suffix;
}

// Single-parse entry point for the UI: tries `input` and (when syntactically
// valid in sync mode) `input + 'x'`, returning `{ suffix, siteswap, addedBeats }`
// or `{ error }`.
function suggestBest(input, allow_multiplex, is_sync, extra_steps = 0, allow_append_x = true) {
  const prefix = parseSiteswap(input, is_sync);
  if (prefix.error !== undefined) {
    return { error: prefix.error };
  }

  const primary = suggestFromParsed(prefix, input, allow_multiplex, is_sync, extra_steps);

  if (is_sync && allow_append_x && PRE_X_STATES.has(prefix.parse_state)) {
    const xPrefix = {
      parse_state: prefix.parse_state,
      siteswap: prefix.siteswap.map(beat => beat.slice()),
    };
    SYNC_PARSE_FUNS[xPrefix.parse_state](xPrefix, 'x');
    if (xPrefix.error === undefined && POST_X_STATES.has(xPrefix.parse_state)) {
      const withX = suggestFromParsed(xPrefix, input + 'x', allow_multiplex, true, extra_steps);
      if (withX.error === undefined &&
          (primary.error !== undefined || primary.suffix.length > withX.suffix.length + 1)) {
        return { suffix: 'x' + withX.suffix, siteswap: withX.siteswap, addedBeats: withX.addedBeats };
      }
    }
  }

  return primary;
}

function printSiteswap(list, is_sync) {
  const s = { parse_state: initialState(is_sync), siteswap: [] };
  return buildSuffix(s, list, is_sync);
}

export {
  AsyncStateEnum,
  SyncStateEnum,
  isValidAsyncToss,
  isEvenToss,
  toInt,
  asyncToToss,
  syncToToss,
  initialState,
  parseFuns,
  parseSiteswap,
  getUps,
  getDowns,
  suffixLength,
  suffixMap,
  suggest,
  suggestWithX,
  suggestBest,
  printSiteswap,
};
