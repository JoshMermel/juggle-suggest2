// Before launch:
//   review and update comments.
//
// Eventually
//   minify?
//   improve error messages on bad input. (what was expected?).
//   figure out what to do if all suffixes have a throw larger than z.
//     can this be detected?
//   stop computing ups and downs an extra time (tiny optimization)
//   additional visualizers
//     embedded jugglinglab or something custom
//     jbuckland's juggle-graph
//     transitions from/to ground state (what is 5b sync ground state?)
//  add a random button based on cards model.

// Regexs for letters that are valid toss heights.
function isValidAsyncToss(c) {
  return c.match(/[0-9a-z]$/);
}
function isEvenToss(c) {
  return c.match(/^[02468acegikmoqsuwy]$/);
}

// Takes a char in the siteswap range [0-9a-z]
// Returns an int representing a throw of that height
function toInt(c) {
  if (c.match(/^[0-9]$/)) {
    return parseInt(c, 10);
  } else if (c.match(/^[a-z]$/i)) {
    return c.charCodeAt(0) - "a".charCodeAt(0) + 10;
  } else {
    // TODO: something better here.
    throw c;
  }
}

// Takes an integer value in the siteswap range
// returns a char representing a throw of that height
function asyncToToss(i) {
  if (i >= 0 && i <= 9) {
    return String.fromCharCode(i + 48);
  } else if (i >= 10 && i <= 35) {
    return String.fromCharCode(i + 97 - 10);
  }
  // TODO: handle characters larger than this?
}

// Takes an integer in the siteswap range.
// returns a string representing a throw of that height.
// if the throw is odd, it need to be made even and given an "x". Parity is used
// to tell whether it should be incremented to decremented.
function syncToToss(i, odd_modifier) {
  if (i % 2 === 1) {
    return syncToToss(i + odd_modifier) + "x";
  }

  if (i >= 0 && i <= 9) {
    return String.fromCharCode(i + 48);
  } else if (i >= 10 && i <= 35) {
    return String.fromCharCode(i + 97 - 10);
  } else {
    throw i;
  }
}

// Takes a list of integers in the siteswap range.
// returns a string representing a multiples of throws to those heights.
// does not add square braces.
function toAsyncMultiToss(tosses) {
  return tosses.map(x => asyncToToss(x)).join("");
}
function toSyncMultiToss(tosses, odd_modifier) {
  return tosses.map(x => syncToToss(x, odd_modifier)).join("");
}

function appendX(s) {
  var toss = s.siteswap[s.siteswap.length-1];
  if (s.siteswap.length % 2 === 0) {
    toss[toss.length-1] -= 1;
  } else {
    toss[toss.length-1] += 1;
  }
}

// Enum for async parse state.
var AsyncStateEnum = {
  A_NORMAL : 0,
  A_EMPTY_BRACE : 1,
  A_BRACE : 2,
};

// Enum for sync parse state.
// We start at 3 just in case someone tries to compare sync and async enums by
// accident.
var SyncStateEnum = {
  S_NORMAL : 3,
  S_FIRST : 4,
  S_FIRST_X : 5,
  S_FIRST_EMPTY_BRACE : 6,
  S_FIRST_BRACE : 7,
  S_FIRST_X_OR_BRACE : 8,
  S_COMMA : 9,
  S_SECOND : 10,
  S_SECOND_X : 11,
  S_SECOND_EMPTY_BRACE : 12,
  S_SECOND_BRACE : 13,
  S_SECOND_X_OR_BRACE : 14,
  S_PAREN : 15,
};

function parseANormal(s, next_char) {
  if (next_char === "[") {
    s.parse_state = AsyncStateEnum.A_EMPTY_BRACE;
    s.siteswap.push([]);
  } else if (isValidAsyncToss(next_char)) {
    s.siteswap.push([toInt(next_char)]);
  } else {
    s.error = "Unexpected character " + next_char;
  }
}
function parseAEmptyBrace(s, next_char) {
  if (isValidAsyncToss(next_char)) {
    s.siteswap[s.siteswap.length-1].push(toInt(next_char));
    s.parse_state = AsyncStateEnum.A_BRACE;
  } else {
    s.error = "Unexpected character " + next_char;
  }
}
function parseABrace(s, next_char) {
  if (isValidAsyncToss(next_char)) {
    s.siteswap[s.siteswap.length-1].push(toInt(next_char));
  } else if (next_char === "]") {
    s.parse_state = AsyncStateEnum.A_NORMAL;
  } else {
    s.error = "Unexpected character " + next_char;
  }
}

// Maps from async parse state to a function that parses one character when in
// that parse state.
function asyncParseFuns() {
  var parse_funs = {};
  parse_funs[AsyncStateEnum.A_NORMAL] = parseANormal;
  parse_funs[AsyncStateEnum.A_EMPTY_BRACE] = parseAEmptyBrace;
  parse_funs[AsyncStateEnum.A_BRACE] = parseABrace;
  return parse_funs;
}

function parseSyncNormal(s, next_char) {
  if (next_char === "(") {
    s.parse_state = SyncStateEnum.S_FIRST;
  } else {
    s.error = "Unexpected character " + next_char;
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
    s.error = "Unexpected character " + next_char;
  }
}

function parseSyncFirstX(s, next_char) {
  if (next_char === ",") {
    s.parse_state = SyncStateEnum.S_SECOND;
  } else if (next_char === "x") {
    s.parse_state = SyncStateEnum.S_COMMA;
    appendX(s);
  } else {
    s.error = "Unexpected character " + next_char;
  }
}

function parseSyncFirstEmptyBrace(s, next_char) {
  if (next_char === "0") {
    s.parse_state = SyncStateEnum.S_FIRST_BRACE;
    s.siteswap[s.siteswap.length - 1].push(toInt(next_char));
  } else if (isEvenToss(next_char)) {
    s.parse_state = SyncStateEnum.S_FIRST_X_OR_BRACE;
    s.siteswap[s.siteswap.length - 1].push(toInt(next_char));
  } else {
    s.error = "Unexpected character " + next_char;
  }
}

function parseSyncFirstBrace(s, next_char) {
  if (next_char === "0") {
    s.parse_state = SyncStateEnum.S_FIRST_BRACE;
    s.siteswap[s.siteswap.length - 1].push(toInt(next_char));
  } else if (isEvenToss(next_char)) {
    s.parse_state = SyncStateEnum.S_FIRST_X_OR_BRACE;
    s.siteswap[s.siteswap.length - 1].push(toInt(next_char));
  } else if (next_char === "]") {
    s.parse_state = SyncStateEnum.S_COMMA;
  } else {
    s.error = "Unexpected character " + next_char;
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
    s.error = "Unexpected character " + next_char;
  }
}

function parseSyncComma(s, next_char) {
  if (next_char === ",") {
    s.parse_state = SyncStateEnum.S_SECOND;
  } else {
    s.error = "Unexpected character " + next_char;
  }
}

function parseSyncSecond(s, next_char) {
  if (next_char === "[") {
    s.parse_state = SyncStateEnum.S_SECOND_EMPTY_BRACE;
    s.siteswap.push([]);
  } else if (next_char === "0") {
    s.parse_state = SyncStateEnum.S_PAREN;
    s.siteswap.push([toInt(next_char)]);
  } else if (isEvenToss(next_char)) {
    s.parse_state = SyncStateEnum.S_SECOND_X;
    s.siteswap.push([toInt(next_char)]);
  } else {
    s.error = "Unexpected character " + next_char;
  }
}

function parseSyncSecondX(s, next_char) {
  if (next_char === ")") {
    s.parse_state = SyncStateEnum.S_NORMAL;
  } else if (next_char === "x") {
    s.parse_state = SyncStateEnum.S_PAREN;
    appendX(s);
  } else {
    s.error = "Unexpected character " + next_char;
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
    s.error = "Unexpected character " + next_char;
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
    s.error = "Unexpected character " + next_char;
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
    s.error = "Unexpected character " + next_char;
  }
}

function parseSyncParen(s, next_char) {
  if (next_char === ")") {
    s.parse_state = SyncStateEnum.S_NORMAL;
  } else {
    s.error = "Unexpected character " + next_char;
  }
}

// Maps from sync parse state to a function that parses one character when in
// that parse state.
function syncParseFuns() {
  var parse_funs = {};
  parse_funs[SyncStateEnum.S_NORMAL] = parseSyncNormal;
  parse_funs[SyncStateEnum.S_FIRST] = parseSyncFirst;
  parse_funs[SyncStateEnum.S_FIRST_X] = parseSyncFirstX;
  parse_funs[SyncStateEnum.S_FIRST_EMPTY_BRACE] = parseSyncFirstEmptyBrace;
  parse_funs[SyncStateEnum.S_FIRST_BRACE] = parseSyncFirstBrace;
  parse_funs[SyncStateEnum.S_FIRST_X_OR_BRACE] = parseSyncFirstXOrBrace;
  parse_funs[SyncStateEnum.S_COMMA] = parseSyncComma;
  parse_funs[SyncStateEnum.S_SECOND] = parseSyncSecond;
  parse_funs[SyncStateEnum.S_SECOND_X] = parseSyncSecondX;
  parse_funs[SyncStateEnum.S_SECOND_EMPTY_BRACE] = parseSyncSecondEmptyBrace;
  parse_funs[SyncStateEnum.S_SECOND_BRACE] = parseSyncSecondBrace;
  parse_funs[SyncStateEnum.S_SECOND_X_OR_BRACE] = parseSyncSecondXOrBrace;
  parse_funs[SyncStateEnum.S_PAREN] = parseSyncParen;
  return parse_funs;
}

function parseFuns(is_sync) {
  if (is_sync) {
    return syncParseFuns();
  }
  return asyncParseFuns();
}

// Takes a string representation of a siteswap
// Parses it into a list list int and a parse state.
function parseSiteswap(str, is_sync) {
  var parse_funs = parseFuns(is_sync);
  var prefix = {};
  prefix.parse_state = initialState(is_sync);
  prefix.siteswap = [];

  for (var i = 0; i < str.length; i++) {
    parse_funs[prefix.parse_state](prefix, str[i]);
    if (prefix.error !== undefined) {
      prefix.error += (" at position " + i + ".");
      break;
    }
  }
  return prefix;
}

// Takes a siteswap prefix
// Returns a list of how many throws happen on each beat.
// undefined means any number of things can go up on that beat.
function getUps(s) {
  return s.siteswap.map(x => x.length);
}

// Takes a siteswap prefix
// Takes an int len
// Returns a list of how many catches happen if the suffix was length |len|.
// 0 means exactly 0 things must land that beat
// undefined means nothing lands on that beat yet but tosses are allowed to.
function getDowns(s, len) {
  var prefix = s.siteswap;
  var downs = [];
  var down_pos = 0;
  for (var i = 0; i < prefix.length; i++) {
    for (var j = 0; j < prefix[i].length; j++) {
      down_pos = (prefix[i][j] + i) % (prefix.length + len);
      if (downs[down_pos] === undefined) {
        downs[down_pos] = 1;
      } else {
        downs[down_pos] += 1;
      }
    }
  }
  return downs;
}

function isOpenMultiplexState(parse_state) {
  return [AsyncStateEnum.A_EMPTY_BRACE, 
    AsyncStateEnum.A_BRACE,
    SyncStateEnum.S_FIRST_EMPTY_BRACE,
    SyncStateEnum.S_FIRST_BRACE,
    SyncStateEnum.S_FIRST_X_OR_BRACE,
    SyncStateEnum.S_SECOND_EMPTY_BRACE,
    SyncStateEnum.S_SECOND_BRACE,
    SyncStateEnum.S_SECOND_X_OR_BRACE 
  ].indexOf(parse_state) >= 0;
}

// Returns true if this list of throw locations and catch locations are
// compatible.
// open_multiplex is an bool that is true if the input ends with an open
// multiplex
function noConflict(ups, downs, parse_state) {
  var num_to_check = ups.length;
  if (isOpenMultiplexState(parse_state)) {
    num_to_check -= 1;
  }
  for (var i = 0; i < num_to_check; i++) {
    if (downs[i] > ups[i]) {
      return false;
    }
  }
  return true;
}

// It is worth checking up to the point that no throws wrap around modulo
// pattern length. After that, downs will always be the same.
function maxLengthToCheck(s) {
  var max = 0;
  for (var i = 0; i < s.siteswap.length; i++) {
    for (var j = 0; j < s.siteswap[i].length; j++) {
      max = Math.max(max, s.siteswap[i][j] + i);
    }
  }
  // this max is to handle an issue I don't fully understand when the prefix is
  // something like "0" or "(0"
  // the +2 used to be a +1 but that made it check too little for the prefix
  // "32"
  return Math.max(max - s.siteswap.length + 2, 2);
}

function noMultiplexAdded(downs, prefix_len) {
  for (var i = prefix_len; i < downs.length; i++) {
    if (downs[i] > 1) {
      return false;
    }
  }
  return true;
}

// Returns the length of the shortest suffix.
function asyncSuffixLength(s, allow_multiplex) {
  var ups = getUps(s);
  var max_length_to_check = maxLengthToCheck(s);
  var downs;
  for (var i = 0; i < max_length_to_check; i++) {
    downs = getDowns(s, i);
    if (noConflict(ups, downs, s.parse_state)) {
      if (allow_multiplex || noMultiplexAdded(downs, s.siteswap.length)) {
        return i;
      }
    }
  }
  return -1;
}

function syncSuffixLength(s, allow_multiplex) {
  var first_suffix_len = s.siteswap.length % 2;
  // HACK, fixes (0,0)( -> ) and ( -> )
  // TODO: make this into a minSuffixLengthToCheck?
  if (s.parse_state === SyncStateEnum.S_FIRST) {
    first_suffix_len += 2;
  }
  var ups = getUps(s);
  // Since lengths must be even, this +1 makes sure we actually check the max
  // length we intend to check.
  var max_length_to_check = maxLengthToCheck(s) + 1;
  var downs;
  for (var i = first_suffix_len; i < max_length_to_check; i+=2) {
    downs = getDowns(s, i);
    if (noConflict(ups, downs, s.parse_state)) {
      if (allow_multiplex || noMultiplexAdded(downs, s.siteswap.length)) {
        return i;
      }
    }
  }
  return -1;
}

function suffixLength(prefix, allow_multiplex, is_sync) {
  if (is_sync) {
    return syncSuffixLength(prefix, allow_multiplex);
  }
  return asyncSuffixLength(prefix, allow_multiplex);
}

function goalCounts(ups, downs, suffix_length, parse_state) {
  var goal_counts = [];
  for (var i = 0; i < suffix_length + ups.length; i++) {
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
  // Opinionated choice, honor user square braces even in vanilla input mode.
  if (isOpenMultiplexState(parse_state)) {
    var open_index = ups.length - 1;
    goal_counts[open_index] = Math.max(2, goal_counts[open_index]);
  }
  return goal_counts;
}

// Returns a list of indices in lst that would need to be incremented to get
// goal_counts. If an index would need to be incremented n times, then that
// index will appear n times in the output.
function listDiff(lst, goal_counts) {
  var have = [];
  for (var i = 0; i < goal_counts.length; i++) {
    var elem = lst[i] || 0;
    for (var j = 0; j < (goal_counts[i] - elem); j++) {
      have.push(i);
    }
  }
  return have;
}

// Mod but it turns negatives to positives efficiently.
function mod(n, m) {
  return ((n % m) + m) % m;
}

// Produces a map from throw location to list of catch locations.
function suffixMap(have, need, goal_length, is_sync) {
  var suffix_map = [];
  var toss;
  for (var i = 0; i < have.length; i++) {
    toss = mod(need[i] - have[i], goal_length);
    // Personal preference, I don't like lots of 0's in a suffix.
    if (toss == 0 && goal_length < 36) {
      toss = goal_length;
    }
    // Avoids 0xs
    if (toss === 1 && goal_length < 36 && have[i] % 2 === 0 && is_sync) {
      toss = goal_length + 1;
    }
    if (suffix_map[have[i]] === undefined) {
      suffix_map[have[i]] = [];
    }
    suffix_map[have[i]].push(toss);
  }
  suffix_map.forEach(function(tosses) { tosses.sort(); });
  return suffix_map;
}

function asyncPunctuation(parse_state) {
  if (isOpenMultiplexState(parse_state)) {
    return "]";
  }
  return "";
}

function syncPunctuation(parse_state) {
  var ret = "";
  if (isOpenMultiplexState(parse_state)) {
    ret += "]";
  }
  if (parse_state !== SyncStateEnum.S_NORMAL) {
    ret += ")";
  }
  return ret;
}

// TODO: could infer sync from state?
function punctuation(parse_state, is_sync) {
  if (is_sync) {
    return syncPunctuation(parse_state);
  }
  return asyncPunctuation(parse_state);
}

function buildSuffixANormal(s, toss) {
  if (toss.length > 1) {
    return "[" + buildSuffixABrace(s, toss);
  } else {
    return asyncToToss(toss[0]);
  }
}

function buildSuffixABrace(s, toss) {
  s.parse_state = AsyncStateEnum.A_NORMAL;
  return toAsyncMultiToss(toss) + "]";
}

function asyncBuildFuns() {
  var build_funs = {};
  build_funs[AsyncStateEnum.A_NORMAL] = buildSuffixANormal;
  build_funs[AsyncStateEnum.A_EMPTY_BRACE] = buildSuffixABrace;
  build_funs[AsyncStateEnum.A_BRACE] = buildSuffixABrace;
  return build_funs;
}

function buildSuffixSNormal (s, toss) {
  return "(" + buildSuffixSFirst(s, toss);
}

function buildSuffixSFirst(s, toss) {
  if (toss.length > 1) {
    return "[" + buildSuffixSFirstBrace(s, toss);
  } else {
    s.parse_state = SyncStateEnum.S_SECOND;
    return syncToToss(toss[0], -1) + ",";
  }
}

// Also handles S_COMMA
function buildSuffixSFirstX(s, index , toss) {
  return "," + buildSuffixSSecond(s, index , toss);
}

// Also handle S_FIRST_EMPTY_BRACE and S_FIRST_X_OR_BRACE
function buildSuffixSFirstBrace(s, toss) {
  s.parse_state = SyncStateEnum.S_SECOND;
  return toSyncMultiToss(toss, -1) + "],";
}

// also handles S_FIRST_X_OR_BRACE
function buildSuffixSSecond(s, toss) {
  if (toss.length > 1) {
    return "[" + buildSuffixSSecondBrace(s, toss);
  } else {
    s.parse_state = SyncStateEnum.S_NORMAL;
    return syncToToss(toss[0], 1) + ")";
  }
}

// Also handles S_PAREN
function buildSuffixSSecondX(s, toss) {
  return ")(" + buildSuffixSFirst(s, toss);
}

// Also handle S_SECOND_EMPTY_BRACE and S_SECOND_X_OR_BRACE
function buildSuffixSSecondBrace(s, toss) {
  s.parse_state = SyncStateEnum.S_NORMAL;
  return toSyncMultiToss(toss, 1) + "])";
}

function syncBuildFuns() {
  var build_funs = {};
  build_funs[SyncStateEnum.S_NORMAL] = buildSuffixSNormal;
  build_funs[SyncStateEnum.S_FIRST] = buildSuffixSFirst;
  build_funs[SyncStateEnum.S_FIRST_X] = buildSuffixSFirstX;
  build_funs[SyncStateEnum.S_COMMA] = buildSuffixSFirstX;
  build_funs[SyncStateEnum.S_FIRST_EMPTY_BRACE] = buildSuffixSFirstBrace;
  build_funs[SyncStateEnum.S_FIRST_BRACE] = buildSuffixSFirstBrace;
  build_funs[SyncStateEnum.S_FIRST_X_OR_BRACE] = buildSuffixSFirstBrace;
  build_funs[SyncStateEnum.S_SECOND] = buildSuffixSSecond;
  build_funs[SyncStateEnum.S_SECOND_X] = buildSuffixSSecondX;
  build_funs[SyncStateEnum.S_PAREN] = buildSuffixSSecondX;
  build_funs[SyncStateEnum.S_SECOND_EMPTY_BRACE] = buildSuffixSSecondBrace;
  build_funs[SyncStateEnum.S_SECOND_BRACE] = buildSuffixSSecondBrace;
  build_funs[SyncStateEnum.S_SECOND_X_OR_BRACE] = buildSuffixSSecondBrace;
  return build_funs;
}

// TODO: could merge maps
function buildFuns(is_sync) {
  if (is_sync) {
    return syncBuildFuns();
  }
  return asyncBuildFuns();
}

// Handles cases where the state of the user's input is an open multiplex that
// we don't want to add to. By doing this as prework, the suffix builder can be
// simplifed. For example:
// 745[25 -> ]5[56]5[57]
function asyncPreSuffix(s, suffix_map) {
  var suffix = "";
  if (suffix_map[s.siteswap.length - 1] === undefined &&
    s.parse_state === AsyncStateEnum.A_BRACE) {
    suffix += "]";
    s.parse_state = AsyncStateEnum.A_NORMAL;
  }
  return suffix;
}

// Handles cases where the state of the user's input is an open multiplex that
// we don't want to add to. By doing this as prework, the suffix builder can be
// simplifed. For example:
// (4,4)([44          -> ],4)
// (4,4)([4x4x        -> ], [2x2x])
// ([6x2x],4)(4,[2x8x -> ])([24],4)
// ([64],2x)(2x,[44   -> ])(4,2x)(4x,[44])
function syncPreSuffix(s, suffix_map) {
  var suffix = "";
  if (suffix_map[s.siteswap.length - 1] === undefined &&
    (s.parse_state === SyncStateEnum.S_FIRST_BRACE ||
    s.parse_state === SyncStateEnum.S_FIRST_X_OR_BRACE)) {
    suffix += "],";
    s.parse_state = SyncStateEnum.S_SECOND;
  }
  if (suffix_map[s.siteswap.length - 1] === undefined &&
    (s.parse_state === SyncStateEnum.S_SECOND_BRACE ||
    s.parse_state === SyncStateEnum.S_SECOND_X_OR_BRACE)) {
    suffix += "])";
    s.parse_state = SyncStateEnum.S_NORMAL;
  }
  return suffix;
}

function preSuffix(s, suffix_map, is_sync) {
  if (is_sync) {
    return syncPreSuffix(s, suffix_map);
  }
  return asyncPreSuffix(s, suffix_map);
}

// Builds a suffix using the state transition graph.
function buildSuffix(s, suffix_map, is_sync) {
  var build_funs = buildFuns(is_sync);
  var suffix = preSuffix(s, suffix_map, is_sync);
  for (var i = 0; i < suffix_map.length; i++) {
    if (suffix_map[i] !== undefined) {
      suffix += build_funs[s.parse_state](s, suffix_map[i]);
    }
  }
  return suffix + punctuation(s.parse_state, is_sync);
}

function initialState(is_sync) {
  if (is_sync) {
    return SyncStateEnum.S_NORMAL;
  }
  return AsyncStateEnum.A_NORMAL;
}

// Fisher-Yates shuffles an array
function shuffle(array) {
  var m = array.length, t, i;
  while (m) {
    i = Math.floor(Math.random() * m--);
    t = array[m];
    array[m] = array[i];
    array[i] = t;
  }
  return array;
}

// Inputs is a string prefix of a siteswap
// Returns a suffix or that there is none.
function suggest(input, allow_multiplex, is_sync) {
  // Parse
  var prefix = parseSiteswap(input, is_sync);
  if (prefix.error != undefined) {
    return prefix;
  }

  // Find suffix length
  var suffix_length = suffixLength(prefix, allow_multiplex, is_sync);
  if (suffix_length === -1) {
    return {error: "No valid suffixes exist for " + input};
  }
  
  // Figure out what you have and need
  var ups = getUps(prefix);
  var downs = getDowns(prefix, suffix_length);
  var goal_counts = goalCounts(ups, downs, suffix_length, prefix.parse_state);
  var have = listDiff(ups, goal_counts);
  var need = listDiff(downs, goal_counts);

  // Map between what you have and need
  var suffix_map = suffixMap(have, shuffle(need), goal_counts.length, is_sync);

  // Print the suffix in a way that matches the parse state
  var suffix = buildSuffix(prefix, suffix_map, is_sync);
  return suffix;
}

// TODO: move this to another module that relies on suggest.js
// Function for interacting with html.
function updateSuggestion(prefix) {
  var suffix;

  // Compute suffix based on mode and first char
  if (!prefix) {
    suffix = "531";
  } else {
    var sync = (prefix[0] === "(");
    var vanilla = document.getElementById("vanilla").checked;
    suffix = suggest(prefix, !vanilla, sync);
  }

  if (suffix.error != undefined) {
    suggestbox.options = [];
    suggestbox.repaint();
    $('#error span').text(suffix.error);
    $('#error').slideDown();
    return;
  }

  suggestbox.options = [prefix + suffix];
  suggestbox.repaint();
  $('#error').slideUp();
  return;
}

// TODO: move this to another module that relies on suggest.js
function initSuggestbox() {
  // suggestbox init
  suggestbox = completely(document.getElementById('input'), {
    fontSize : '24px',
    fontFamily : 'Arial',
    color:'#933',
  });
  suggestbox.options = ['531'];
  suggestbox.repaint(); 
  function Update(txt) {
    updateSuggestion(txt);
  }
  suggestbox.onChange = Update;

  // TODO(understand this)
  setTimeout(function() {
    suggestbox.input.focus();
  },0);

  // multiplex/vanilla selector
  $(".btn-group > .btn").click(function(){
    $(this).addClass("active").siblings().removeClass("active");
  });
  $('input[type=radio]').click(function(){
    var txt = suggestbox.getText();
    Update(txt);
  });
}

// Export for tests
module.exports = {
  suggest : suggest,
  parseSiteswap : parseSiteswap,
  getUps : getUps,
  getDowns : getDowns,
  initialState : initialState,
  parseFuns : parseFuns,
};
