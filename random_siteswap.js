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
  if ((Math.random() < 0.05)) {
    return [0];
  }
  var ret = [];
  var multiplicity = 0;

  if (max_multiplicity === 1) {
    multiplicity = 1;
  } else {
    // Pick actual multiplicty by giving [0,0.5] to 1, [0.5,0.75] to 2 ...
    // up to max multiplicity. Unused range goes to 1.
    var increaser = Math.random();
    for (let i = 0; i < max_multiplicity; i++) {
      if (increaser < 1) {
        increaser *= 2;
        multiplicity += 1;
      }
    }
    if (increaser < 1) {
      multiplicity = 1;
    }
  }

  // pick that many tosses and sort descending
  var generate = makeRandomRange(max_toss - min_toss);
  for (var i = 0; i < multiplicity; i++) {
    ret.push(generate() + min_toss);
  }
  ret.sort(function(a, b){return b-a});
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
  var len, max, max_multiplicity;
  if (vanilla) {
    len = randInt(4,15);
    max = randInt(5,15);
    max_multiplicity = 1;
  } else {
    len = randInt(4,9);
    max = randInt(5,9);
    max_multiplicity = randInt(2,6);
  }
  for (var i = 0; i < len; i++) {
    cards.push(randomCard(1, 10, max_multiplicity));
  }
  return convertCards(cards);
}

function randomSync(vanilla) {
  var cards = []
  var len, max, max_multiplicity;
  if (vanilla) {
    len = randInt(2,8);
    max = randInt(5,15);
    max_multiplicity = 1;
  } else {
    len = randInt(2,4);
    max = randInt(5,9);
    max_multiplicity = randInt(2,6);
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
        ret[i][j] -= ret.length;
      }
    }
  }
  return ret;
}
