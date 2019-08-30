// Tests for suggest.js
// Right now I just test that suffixes are valid on a kinda representative set
// of inputs.

var test = require("unit.js");
var SuggestModule = require("./suggest.js")

console.log("If all you see is this input then all tests passed :)");

function CheckPrefix(prefix, allow_multiplex, is_sync) {
  var suggestion = prefix + SuggestModule.suggest(prefix,
    allow_multiplex, is_sync);
  var s = SuggestModule.parseSiteswap(suggestion,
    SuggestModule.initialState(is_sync),
    SuggestModule.parseFuns(is_sync));
  // Check that parsing succeeded and ended at a normal state
  test.undefined(s.error);
  test.value(s.parse_state).is(SuggestModule.initialState(is_sync));

  // Check that the result is valid.
  test.array(SuggestModule.getUps(s)).is(SuggestModule.getDowns(s, 0));
}

// tests for suggest (sync & multiplex)
! function() {
  // Cover simple cases
  CheckPrefix("(4", true, true);
  CheckPrefix("(4,4)", true, true);
  CheckPrefix("(4,2x", true, true);
  CheckPrefix("(4,2x)", true, true);
  CheckPrefix("(4,2x)(", true, true);
  CheckPrefix("(4,4)([", true, true);
  CheckPrefix("(4,2x)(2x", true, true);
  CheckPrefix("(4,2x)(2x,", true, true);
  CheckPrefix("(2x,4)(4,2", true, true);
  CheckPrefix("(2x,4x)(4,[", true, true);
  CheckPrefix("(2,4)(8,4)([", true, true);

  // first brace edge cases.
  CheckPrefix("(4,4)([2", true, true);
  CheckPrefix("(4,4)([2x", true, true);
  CheckPrefix("(4,4)([44", true, true);
  CheckPrefix("(4,4)([4x4x", true, true);

  // second brace edge cases.
  CheckPrefix("([2x2x],4)(4,[2x", true, true);
  CheckPrefix("([6x2x],4)(4,[2x8x", true, true);
  CheckPrefix("([44],2x)(2x,[4", true, true);
  CheckPrefix("([64],2x)(2x,[44", true, true);

  // Punctuation only cases.
  CheckPrefix("(4,2x)(2x,4", true, true);
  CheckPrefix("([44],2x)(2x,[44", true, true);
  CheckPrefix("([2x2x],4)(4,[2x2x", true, true);
  CheckPrefix("([2x2x],4)(4,[2x2x]", true, true);

  // Cases that have made me find bugs
  CheckPrefix("(4,4)(0,0)(", true, true);
  CheckPrefix("(", true, true);
  CheckPrefix("(0,0", true, true);

  // TODO stuff with no suffixes
  // TODO stuff that doesn't parse
}()

// tests for suggest
! function() {
  // vanilla
  CheckPrefix("1468", false, false);
  CheckPrefix("0", false, false);
  CheckPrefix("0[", false, false);

  // multiplex
  CheckPrefix("745[25", true, false);
  CheckPrefix("1468", true, false);
  CheckPrefix("0[", true, false);

  // TODO stuff with no suffixes
  // TODO stuff that doesn't parse
}()

// TODO dedicated tests for parseSiteswap
// TODO dedicated tests for helpers used in tests here.
