import { arraysum, mod } from './utils.js';

// Returns the highest throw of the pattern.
export function maxThrow(siteswap, is_sync) {
  let max = 0;

  for (let i = 0; i < siteswap.length; ++i) {
    for (const toss of siteswap[i]) {
      let height = toss;
      if (is_sync && height % 2 === 1) {
        height += (i % 2 === 0) ? -1 : 1;
      }
      max = Math.max(max, height);
    }
  }
  return max;
}

// Returns the index of the first beat with a non-zero throw, or -1 if none.
export function firstNonempty(siteswap) {
  for (let i = 0; i < siteswap.length; i++) {
    for (const toss of siteswap[i]) {
      if (toss !== 0) {
        return i;
      }
    }
  }
  return -1;
}

// Represents a single 1-ball orbit within a siteswap.
// Simplifies offset so it is less than the last throw, and precomputes period.
export class Orbit {
  constructor(toss_seq, landing_seq, hold_seq, offset, id, is_sync) {
    this.id = id;
    while (offset > toss_seq[toss_seq.length - 1]) {
      offset -= toss_seq[toss_seq.length - 1];
      toss_seq.unshift(toss_seq.pop());
      landing_seq.unshift(landing_seq.pop());
      hold_seq.unshift(hold_seq.pop());
    }

    this.toss_seq = toss_seq;
    this.landing_seq = landing_seq;
    this.hold_seq = hold_seq;
    this.period = arraysum(toss_seq);
    this.offset = offset;
    this.start_lhs = true;

    if (this.offset % 2 === 1) {
      this.start_lhs = false;
      if (is_sync) {
        this.offset -= 1;
      }
    }
  }
}

// Converts raw internal sync throw representation (where odd numbers are
// crossing throws with even visual height) into actual throw duration.
export function nextToss(raw_value, toss_lhs, is_sync) {
  if (raw_value % 2 === 1 && is_sync) {
    return toss_lhs ? raw_value - 1 : raw_value + 1;
  }
  return raw_value;
}

// Returns an array as long as the siteswap; each index holds the height of the
// highest throw that lands on that beat.
export function maxLandings(siteswap, is_sync) {
  const ret = new Array(siteswap.length).fill(0);
  for (let i = 0; i < siteswap.length; i++) {
    for (let j = 0; j < siteswap[i].length; j++) {
      const dest = (i + siteswap[i][j]) % siteswap.length;
      ret[dest] = Math.max(ret[dest], nextToss(siteswap[i][j], i % 2 === 0, is_sync));
    }
  }
  return ret;
}

const MAX_HOLD = 0.4;

// Splits a siteswap into a list of Orbits without mutating the input.
// Each orbit represents a 1-ball siteswap.
export function splitOrbits(siteswap, is_sync) {
  // Filter out 0s so empty beats and 0s inside multiplexes (e.g. 3[30]) never
  // enter a ball's orbit.
  const remaining = siteswap.map(tosses => tosses.filter(t => t !== 0));
  const original = remaining.map(tosses => Array.from(tosses));

  const ret = [];
  // landing_seq holds the highest throw caught on each beat.
  // hold_seq staggers stacked multiplex throws between catch and dwell.
  const max_landings = maxLandings(siteswap, is_sync);
  let id = 0;

  let first = firstNonempty(remaining);
  while (first !== -1) {
    const toss_seq = [];
    const landing_seq = [];
    const hold_seq = [];
    let newindex = first;

    do {
      const steal = remaining[newindex].pop();
      const stacked_size = original[newindex].filter(c => c === steal).length;
      const stacked_remaining = remaining[newindex].filter(c => c === steal).length;
      hold_seq.push(MAX_HOLD * stacked_remaining / stacked_size);
      toss_seq.push(steal);
      landing_seq.push(max_landings[newindex]);
      newindex = (newindex + steal) % remaining.length;
    } while (newindex !== first);

    const num_balls = arraysum(toss_seq) / remaining.length;
    for (let i = 0; i < num_balls; i++) {
      ret.push(new Orbit(Array.from(toss_seq), Array.from(landing_seq), Array.from(hold_seq), first, id, is_sync));
      first += remaining.length;
    }
    id += 1;
    first = firstNonempty(remaining);
  }

  return ret;
}

// Returns what is happening in `orbit` at `time`:
//  - toss: height/duration of the current throw
//  - time: time elapsed on that throw (always in [0, toss))
//  - toss_lhs: whether this throw started on the left hand
//  - catch_lhs: whether this throw is caught on the left hand
export function Pos(orbit, time, is_sync) {
  let toss_lhs = orbit.start_lhs;
  let toss = nextToss(orbit.toss_seq[0], toss_lhs, is_sync);

  // Wrap into [0, 2 * period) so handedness cycles cleanly even for odd periods.
  let t = mod(time - orbit.offset, 2 * orbit.period);

  let toss_index = 0;
  const seq_len = orbit.toss_seq.length;
  while (t >= toss) {
    t -= toss;
    if (orbit.toss_seq[toss_index] % 2 === 1) {
      toss_lhs = !toss_lhs;
    }
    toss_index = (toss_index + 1) % seq_len;
    toss = nextToss(orbit.toss_seq[toss_index], toss_lhs, is_sync);
  }

  const next_toss_crosses = orbit.toss_seq[toss_index] % 2 === 1;
  return {
    time: t,
    toss,
    toss_lhs,
    catch_lhs: next_toss_crosses ? !toss_lhs : toss_lhs,
    max_landing_with: orbit.landing_seq[(toss_index + 1) % seq_len],
    hold: orbit.hold_seq[toss_index],
  };
}
