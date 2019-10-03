// generate random card
// card list to siteswap in int list list from
// print

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// https://stackoverflow.com/a/11809348
function makeRandomRange(x) {
  var range = new Array(x),
    pointer = x;
  return function getRandom() {
    pointer = (pointer-1+x) % x;
    var random = Math.floor(Math.random() * pointer);
    var num = (random in range) ? range[random] : random;
    range[random] = (pointer in range) ? range[pointer] : pointer;
    return range[pointer] = num;
  };
}

function randomCard(min_toss, max_toss, max_multiplicity) {
  var ret = [];
  // TODO(sometimes do zeros);
  var multiplicity = randInt(1, max_multiplicity);
  var generate = makeRandomRange(max_toss - min_toss);
  for (var i = 0; i < multiplicity; i++) {
    ret.push(generate() + min_toss);
  }
  ret.sort(function(a, b){return b-a});
  if (!ret || (Math.random() < 0.05)) {
    ret = [0];
  }
  return ret;
}

// handles a multiplex card at height "accum" and returns the new accum
function handleCard(card, accum) {
  for (let card_entry of card) {
    if (card_entry >= accum) {
      accum -= 1;
    }
  }
  return accum;
}

function convertCards(cards) {
  var ret = [];
  // handle each card one by one
  for (var i = 0; i < cards.length; i++) {
    var translated_card = [];
    for (let toss of cards[i]) {
      var accum = toss;
      var steps = 0;
      var card_index = (i+1) % cards.length;
      while (accum > 0) {
        accum = handleCard(cards[card_index], accum);
        steps += 1;
        card_index = (card_index + 1) % cards.length;
      }
      translated_card.push(steps);
    }
    ret.push(translated_card);
  }
  return ret;
}

// TODO(jmerm): tune max, len, etc depending on mode.

function randomAsync(vanilla) {
  var cards = []
  var len = randInt(4,9);
  var max = randInt(5,9);
  var max_multiplicity = randInt(2,4);
  if (vanilla) {
    max_multiplicity = 1;
  }
  for (var i = 0; i < len; i++) {
    cards.push(randomCard(1, 10, max_multiplicity));
  }
  return convertCards(cards);
}

function randomSync(vanilla) {
  var cards = []
  var len = randInt(2,4);
  var max = randInt(4,8);
  var max_multiplicity = randInt(2,4);
  if (vanilla) {
    max_multiplicity = 1;
  }
  for (var i = 0; i < len; i++) {
    var right_card = randomCard(1, 10, max_multiplicity);
    var left_card = randomCard(1 + right_card.length, 10, max_multiplicity);
    cards.push(left_card);
    cards.push(right_card);
  }
  return convertCards(cards);
}

function randomSiteswap(vanilla, is_sync) {
  var ret = [];
  if (is_sync) {
    ret = randomSync(vanilla);
  } else {
    ret = randomAsync(vanilla);
  }
  for (var i = 0; i < ret.length; i++) {
    for (var j = 0; j < ret[i].length; j++) {
      while (ret[i][j] > 15) {
        ret[i][j] %= ret.length;
      }
    }
  }
  return ret;
}
