// generate random card
// card list to siteswap in int list list from
// print

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function intToCard(i) {
  var bin = [];
  while (i > 0) {
    bin.push(i % 2);
    i = ~~(i/2);
  }

  ret = [];
  for (var i = bin.length - 1; i >= 0; i--) {
    if (bin[i] === 1) {
      ret.push(i+1);
    }
  }
  if (!ret.length) {
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
  console.log("converting: ", cards);
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


function randomAsync() {
  var cards = []
  var len = randInt(4,9);
  var max = randInt(5,9);
  for (var i = 0; i < len; i++) {
    cards.push(intToCard(randInt(0,127)));
  }
  return convertCards(cards);
}
