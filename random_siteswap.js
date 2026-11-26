// Random siteswap generator using the juggling-cards model.

export function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Uniformly samples `count` distinct integers from [min, max).
export function sampleRange(min, max, count) {
  const pool = [];
  for (let v = min; v < max; v++) {
    pool.push(v);
  }
  const k = Math.min(count, pool.length);
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(Math.random() * (pool.length - i));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }
  return pool.slice(0, k);
}

export function randomCard(min_toss, max_toss, max_multiplicity) {
  const available = Math.max(0, max_toss - min_toss);
  if (available === 0 || Math.random() < 0.05) {
    return [0];
  }

  const effective_max = Math.min(max_multiplicity, available);
  let multiplicity = 1;
  if (effective_max > 1) {
    // Geometric distribution: P(1) = 1/2 + 2^-effective_max, P(k) = 2^-k for 2 <= k <= effective_max.
    const k = Math.floor(-Math.log2(Math.random() || Number.MIN_VALUE)) + 1;
    multiplicity = k <= effective_max ? k : 1;
  }

  // Pick distinct toss heights and sort descending.
  const ret = sampleRange(min_toss, max_toss, multiplicity);
  ret.sort((a, b) => b - a);
  return ret;
}

// Handles a multiplex card at height "accum" and returns the new accum.
export function handleCard(card, accum) {
  for (const card_entry of card) {
    if (card_entry >= accum) {
      accum -= 1;
    }
  }
  return accum;
}

export function convertCards(cards) {
  const ret = [];
  for (let i = 0; i < cards.length; i++) {
    const translated_card = [];
    for (const toss of cards[i]) {
      let accum = toss;
      let steps = 0;
      let card_index = (i + 1) % cards.length;
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

export function randomAsync(vanilla) {
  const cards = [];
  let len, max, max_multiplicity;
  if (vanilla) {
    len = randInt(4, 15);
    max = randInt(4, 15);
    max_multiplicity = 1;
  } else {
    len = randInt(4, 9);
    max = randInt(4, 9);
    max_multiplicity = randInt(2, 6);
  }
  for (let i = 0; i < len; i++) {
    cards.push(randomCard(1, max + 1, max_multiplicity));
  }
  return convertCards(cards);
}

export function randomSync(vanilla) {
  const cards = [];
  let len, max, max_multiplicity;
  if (vanilla) {
    len = randInt(2, 8);
    max = randInt(4, 15);
    max_multiplicity = 1;
  } else {
    len = randInt(2, 4);
    max = randInt(4, 9);
    max_multiplicity = randInt(2, 6);
  }
  for (let i = 0; i < len; i++) {
    const right_card = randomCard(1, max + 1, max_multiplicity);
    const right_count = (right_card.length === 1 && right_card[0] === 0) ? 0 : right_card.length;
    const left_min = 1 + right_count;
    // Ensure enough distinct slots so left_card never wraps or underflows.
    const left_max = Math.max(max + 1, left_min + max_multiplicity);
    const left_card = randomCard(left_min, left_max, max_multiplicity);
    cards.push(left_card);
    cards.push(right_card);
  }
  return convertCards(cards);
}

export function randomSiteswap(vanilla, is_sync) {
  const ret = is_sync ? randomSync(vanilla) : randomAsync(vanilla);
  for (let i = 0; i < ret.length; i++) {
    for (let j = 0; j < ret[i].length; j++) {
      while (ret[i][j] > 15 && ret[i][j] > ret.length + 1) {
        ret[i][j] -= ret.length;
      }
    }
  }
  return ret;
}
