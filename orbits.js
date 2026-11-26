import { arraysum, mod } from './utils.js';
import { LEFT, destHandForThrow, destCellForThrow, effectiveSwitchRepeat } from './mhn.js';

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

// Decomposes a siteswap into Orbits without mutating the input, also returning
// per-orbit summaries and a parallel throwOrbitIds[beat][throwIdx] map.
export function decomposeOrbits(siteswap, is_sync) {
  const remaining = siteswap.map(tosses =>
    tosses
      .map((toss, origIdx) => ({ toss, origIdx }))
      .filter(entry => entry.toss !== 0)
  );
  const original = remaining.map(entries => entries.map(e => e.toss));
  const throwOrbitIds = siteswap.map(tosses => tosses.map(() => -1));

  const orbits = [];
  const orbitSummaries = [];
  const max_landings = maxLandings(siteswap, is_sync);
  let id = 0;

  const findNextBeat = () => remaining.findIndex(beat => beat.length > 0);
  let first = findNextBeat();
  while (first !== -1) {
    const toss_seq = [];
    const beat_seq = [];
    const landing_seq = [];
    const hold_seq = [];
    let newindex = first;

    do {
      if (remaining[newindex].length === 0) {
        break;
      }
      const { toss: steal, origIdx } = remaining[newindex].pop();
      throwOrbitIds[newindex][origIdx] = id;
      const stacked_size = original[newindex].filter(c => c === steal).length;
      const stacked_remaining = remaining[newindex].filter(e => e.toss === steal).length;
      hold_seq.push(MAX_HOLD * stacked_remaining / stacked_size);
      toss_seq.push(steal);
      beat_seq.push(newindex);
      landing_seq.push(max_landings[newindex]);
      newindex = (newindex + steal) % remaining.length;
    } while (newindex !== first);

    const num_balls = arraysum(toss_seq) / remaining.length;
    orbitSummaries.push({
      id,
      balls: num_balls,
      tossSeq: Array.from(toss_seq),
      beatSeq: Array.from(beat_seq),
    });

    for (let i = 0; i < num_balls; i++) {
      orbits.push(new Orbit(Array.from(toss_seq), Array.from(landing_seq), Array.from(hold_seq), first, id, is_sync));
      first += remaining.length;
    }
    id += 1;
    first = findNextBeat();
  }

  return { orbits, orbitSummaries, throwOrbitIds };
}

// Splits a siteswap into a list of Orbits without mutating the input.
// Each orbit represents a 1-ball siteswap.
export function splitOrbits(siteswap, is_sync) {
  return decomposeOrbits(siteswap, is_sync).orbits;
}

// Returns the highest throw of an MHN pattern.
export function maxThrowMhn(mhn) {
  let max = 0;
  for (let h = 0; h < 2; h++) {
    for (let t = 0; t < mhn.period; t++) {
      for (const thr of mhn.cells[h][t]) {
        if (thr.value > max) {
          max = thr.value;
        }
      }
    }
  }
  return max;
}

// Returns a 2D array [2][period] with the highest throw landing on each (hand, beat).
export function maxLandingsMhn(mhn) {
  const P = mhn.period;
  const sr = effectiveSwitchRepeat(mhn);
  const ret = [new Array(P).fill(0), new Array(P).fill(0)];
  for (let h = 0; h < 2; h++) {
    for (let t = 0; t < P; t++) {
      for (const thr of mhn.cells[h][t]) {
        if (thr.value === 0) {
          continue;
        }
        const { hand: dh, beat: dt } = destCellForThrow(h, t, thr.value, thr.crosses, P, sr);
        ret[dh][dt] = Math.max(ret[dh][dt], thr.value);
      }
    }
  }
  return ret;
}

// Represents a single 1-ball MHN orbit with explicit per-step hand assignments.
export class MhnOrbit {
  constructor(steps, offset, id) {
    this.isMhn = true;
    this.id = id;
    this.steps = steps;
    this.period = steps.reduce((acc, s) => acc + s.toss, 0);
    this.offset = mod(offset, this.period);
  }
}

// Decomposes an MHN pattern into 1-ball MhnOrbits, orbitSummaries, and
// throwOrbitIds[hand][beat][throwIdx] without mutating the input.
export function decomposeMhnOrbits(mhn) {
  const P = mhn.period;
  const sr = effectiveSwitchRepeat(mhn);
  const remaining = [
    mhn.cells[0].map(beat =>
      beat.map((thr, origIdx) => ({ thr, origIdx })).filter(e => e.thr.value !== 0)
    ),
    mhn.cells[1].map(beat =>
      beat.map((thr, origIdx) => ({ thr, origIdx })).filter(e => e.thr.value !== 0)
    ),
  ];
  const original = [
    remaining[0].map(entries => entries.map(e => e.thr)),
    remaining[1].map(entries => entries.map(e => e.thr)),
  ];
  const throwOrbitIds = [
    mhn.cells[0].map(beat => beat.map(() => -1)),
    mhn.cells[1].map(beat => beat.map(() => -1)),
  ];

  const max_landings = maxLandingsMhn(mhn);
  const orbits = [];
  const orbitSummaries = [];
  let id = 0;

  const sameThrow = (a, b) => a.value === b.value && a.crosses === b.crosses;

  const findNextCell = () => {
    for (let t = 0; t < P; t++) {
      for (let h = 0; h < 2; h++) {
        if (remaining[h][t].length > 0) {
          return { hand: h, beat: t };
        }
      }
    }
    return null;
  };

  let start = findNextCell();
  while (start !== null) {
    const cycle = [];
    let curH = start.hand;
    let curT = start.beat;

    do {
      if (remaining[curH][curT].length === 0) {
        break;
      }
      const { thr, origIdx } = remaining[curH][curT].pop();
      throwOrbitIds[curH][curT][origIdx] = id;
      const stacked_size = original[curH][curT].filter(x => sameThrow(x, thr)).length;
      const stacked_remaining = remaining[curH][curT].filter(e => sameThrow(e.thr, thr)).length;
      const hold = MAX_HOLD * stacked_remaining / stacked_size;
      const next = destCellForThrow(curH, curT, thr.value, thr.crosses, P, sr);
      cycle.push({
        hand: curH,
        beat: curT,
        thr,
        hold,
        landingAtDest: max_landings[next.hand][next.beat],
      });
      curH = next.hand;
      curT = next.beat;
    } while (curH !== start.hand || curT !== start.beat);

    const cycleSum = cycle.reduce((acc, c) => acc + c.thr.value, 0);
    const num_balls = Math.round(cycleSum / P);

    orbitSummaries.push({
      id,
      balls: num_balls,
      throws: cycle.map(c => c.thr),
      cells: cycle.map(c => ({ hand: c.hand, beat: c.beat })),
    });

    for (let i = 0; i < num_balls; i++) {
      const startHand = (sr && i % 2 === 1) ? (1 - start.hand) : start.hand;
      const steps = [];
      let realHand = startHand;
      // Walk base cycle once; if real handedness flipped (e.g. odd switch-repeat wraps),
      // walk a second pass so the orbit closes cleanly on the exact same hand.
      for (let pass = 0; pass < 2; pass++) {
        for (const c of cycle) {
          const nextRealHand = destHandForThrow(realHand, c.thr.value, c.thr.crosses);
          steps.push({
            toss: c.thr.value,
            toss_lhs: realHand === LEFT,
            catch_lhs: nextRealHand === LEFT,
            max_landing_with: c.landingAtDest,
            hold: c.hold,
          });
          realHand = nextRealHand;
        }
        if (realHand === startHand) {
          break;
        }
      }
      orbits.push(new MhnOrbit(steps, start.beat + i * P, id));
    }

    id += 1;
    start = findNextCell();
  }

  return { orbits, orbitSummaries, throwOrbitIds };
}

// Returns what is happening in `orbit` at `time`:
//  - toss: height/duration of the current throw
//  - time: time elapsed on that throw (always in [0, toss))
//  - toss_lhs: whether this throw started on the left hand
//  - catch_lhs: whether this throw is caught on the left hand
export function Pos(orbit, time, is_sync) {
  if (orbit.isMhn) {
    let t = mod(time - orbit.offset, orbit.period);
    let idx = 0;
    const len = orbit.steps.length;
    while (t >= orbit.steps[idx].toss) {
      t -= orbit.steps[idx].toss;
      idx = (idx + 1) % len;
    }
    const step = orbit.steps[idx];
    return {
      time: t,
      toss: step.toss,
      toss_lhs: step.toss_lhs,
      catch_lhs: step.catch_lhs,
      max_landing_with: step.max_landing_with,
      hold: step.hold,
    };
  }

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
