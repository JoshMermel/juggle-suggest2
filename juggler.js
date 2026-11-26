import { maxLandings } from './orbits.js';
import { LEFT, RIGHT, destHandForThrow, expandMhn } from './mhn.js';
import { mod } from './utils.js';

export const THROW_X = Object.freeze({ true: -22, false: 22 });
export const CATCH_X = Object.freeze({ true: -64, false: 64 });
export const DWELL = 0.5;
export const DWELL_DISTANCE = 4;
const MAX_HOLD = 0.4;

// Computes the longest staggered hold time for stacked duplicate throws on a beat.
function maxHoldForBeat(throws) {
  const counts = new Map();
  let maxCount = 0;
  for (const t of throws) {
    if (t === 0) {
      continue;
    }
    const c = (counts.get(t) || 0) + 1;
    counts.set(t, c);
    if (c > maxCount) {
      maxCount = c;
    }
  }
  return maxCount > 1 ? MAX_HOLD * (maxCount - 1) / maxCount : 0;
}

// Builds a repeating schedule of throw events for left and right hands.
export function buildHandSchedule(siteswap, is_sync) {
  if (!siteswap || siteswap.length === 0) {
    return { cycleLength: 0, left: [], right: [] };
  }

  const max_landings = maxLandings(siteswap, is_sync);
  const left = [];
  const right = [];

  if (is_sync) {
    // Sync siteswaps have even length; pair (2k, 2k+1) is thrown at time t = 2k.
    const cycleLength = siteswap.length;
    for (let t = 0; t < cycleLength; t += 2) {
      if (siteswap[t].some(v => v !== 0)) {
        left.push({
          time: t,
          maxLanding: max_landings[t],
          maxHold: maxHoldForBeat(siteswap[t]),
        });
      }
      if (t + 1 < siteswap.length && siteswap[t + 1].some(v => v !== 0)) {
        right.push({
          time: t,
          maxLanding: max_landings[t + 1],
          maxHold: maxHoldForBeat(siteswap[t + 1]),
        });
      }
    }
    return { cycleLength, left, right };
  }

  // Async siteswaps alternate L/R on even/odd beats; odd periods double before hands repeat.
  const cycleLength = (siteswap.length % 2 === 0) ? siteswap.length : siteswap.length * 2;
  for (let t = 0; t < cycleLength; t++) {
    const beatIdx = t % siteswap.length;
    if (siteswap[beatIdx].some(v => v !== 0)) {
      const event = {
        time: t,
        maxLanding: max_landings[beatIdx],
        maxHold: maxHoldForBeat(siteswap[beatIdx]),
      };
      if (t % 2 === 0) {
        left.push(event);
      } else {
        right.push(event);
      }
    }
  }

  return { cycleLength, left, right };
}

function maxHoldForMhnBeat(throws) {
  const counts = new Map();
  let maxCount = 0;
  for (const thr of throws) {
    if (thr.value === 0) {
      continue;
    }
    const key = `${thr.value}:${thr.crosses ? 1 : 0}`;
    const c = (counts.get(key) || 0) + 1;
    counts.set(key, c);
    if (c > maxCount) {
      maxCount = c;
    }
  }
  return maxCount > 1 ? MAX_HOLD * (maxCount - 1) / maxCount : 0;
}

// Builds a repeating hand schedule directly from an MHN pattern (handles async,
// sync, '*', '!', 'L'/'R', async 'x', and mixed sync/async transitions).
export function buildHandScheduleFromMhn(mhn) {
  if (!mhn || mhn.period === 0) {
    return { cycleLength: 0, left: [], right: [] };
  }

  const expanded = expandMhn(mhn);
  const P = expanded.period;
  const maxLand = [new Array(P).fill(0), new Array(P).fill(0)];

  for (let h = 0; h < 2; h++) {
    for (let t = 0; t < P; t++) {
      for (const thr of expanded.cells[h][t]) {
        if (thr.value === 0) {
          continue;
        }
        const dh = destHandForThrow(h, thr.value, thr.crosses);
        const dt = mod(t + thr.value, P);
        maxLand[dh][dt] = Math.max(maxLand[dh][dt], thr.value);
      }
    }
  }

  const left = [];
  const right = [];
  for (let t = 0; t < P; t++) {
    if (expanded.cells[LEFT][t].some(thr => thr.value > 0)) {
      left.push({
        time: t,
        maxLanding: maxLand[LEFT][t],
        maxHold: maxHoldForMhnBeat(expanded.cells[LEFT][t]),
      });
    }
    if (expanded.cells[RIGHT][t].some(thr => thr.value > 0)) {
      right.push({
        time: t,
        maxLanding: maxLand[RIGHT][t],
        maxHold: maxHoldForMhnBeat(expanded.cells[RIGHT][t]),
      });
    }
  }

  return { cycleLength: P, left, right };
}

// Computes a single hand's world-space (x, y) position at `time`.
export function getHandPosition(events, cycleLength, isLeft, time) {
  const throwX = THROW_X[isLeft];
  const catchX = CATCH_X[isLeft];
  const restX = (throwX + catchX) / 2;

  if (!events || events.length === 0 || cycleLength <= 0) {
    return { x: restX, y: 0, phase: 'idle' };
  }

  const t = mod(time, cycleLength);

  // Binary search for the first event strictly after t.
  let lo = 0;
  let hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (events[mid].time <= t) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  const nextIdx = lo < events.length ? lo : -1;

  let nextEvent, nextTime, prevEvent, prevTime;
  if (nextIdx !== -1) {
    nextEvent = events[nextIdx];
    nextTime = nextEvent.time;
    const prevIdx = (nextIdx - 1 + events.length) % events.length;
    prevEvent = events[prevIdx];
    prevTime = nextIdx === 0 ? prevEvent.time - cycleLength : prevEvent.time;
  } else {
    nextEvent = events[0];
    nextTime = nextEvent.time + cycleLength;
    prevEvent = events[events.length - 1];
    prevTime = prevEvent.time;
  }

  const timeUntilNext = nextTime - t;

  // Phase 1: Dwell — matches the ball's exact downward scoop parabola from catch to throw.
  if (timeUntilNext <= DWELL) {
    const u = (DWELL - timeUntilNext) / DWELL;
    const x = catchX + (throwX - catchX) * u;
    const peakY = -1 * Math.min(DWELL_DISTANCE, DWELL_DISTANCE * nextEvent.maxLanding / 10);
    const y = peakY * 4 * u * (1 - u);
    return { x, y, phase: 'dwell' };
  }

  // Phase 2: Staggered multiplex hold — wait steadily at catch point as balls stack in.
  if (timeUntilNext <= DWELL + nextEvent.maxHold) {
    return { x: catchX, y: 0, phase: 'hold' };
  }

  // Phase 3: Empty-hand recovery — smooth upward follow-through oval from throw back to catch.
  const nextCatchTime = nextTime - DWELL - nextEvent.maxHold;
  const gap = nextCatchTime - prevTime;
  if (gap <= 0) {
    return { x: catchX, y: 0, phase: 'hold' };
  }

  const elapsed = t - prevTime;
  const returnDuration = gap > 2.0 ? 1.5 : gap;
  if (elapsed >= returnDuration) {
    return { x: catchX, y: 0, phase: 'wait' };
  }

  const u = elapsed / returnDuration;
  const s = 0.5 - 0.5 * Math.cos(Math.PI * u);
  const x = throwX + (catchX - throwX) * s;
  const prevDip = Math.min(DWELL_DISTANCE, DWELL_DISTANCE * prevEvent.maxLanding / 10);
  const arcHeight = Math.max(1.2, prevDip * 0.9);
  const y = arcHeight * Math.sin(Math.PI * u);
  return { x, y, phase: 'return' };
}

// Soft-stretch helper so arms have gentle JugglingLab-style elasticity instead
// of locking rigidly straight on wide catches or deep dwells.
function elasticBoneScale(rawDist, baseReach) {
  const softStart = baseReach * 0.72;
  if (rawDist <= softStart) {
    return 1.0;
  }
  const excess = (rawDist - softStart) / baseReach;
  // Smoothly grows arm length so joints retain a lively bend even at full reach.
  return 1.0 + excess * 0.55;
}

// Analytical 3D two-bone inverse kinematics (+x right, +y down, +z forward toward viewer).
// When `elastic` is true, bones smoothly stretch slightly on deep reaches to feel
// organic and bouncy rather than mechanically rigid.
export function solveTwoBoneIK3D(shoulder, target, baseUpperLen, baseForeLen, pole, { elastic = false } = {}) {
  const dx = target.x - shoulder.x;
  const dy = target.y - shoulder.y;
  const dz = target.z - shoulder.z;
  const rawDist = Math.hypot(dx, dy, dz);

  const stretch = elastic ? elasticBoneScale(rawDist, baseUpperLen + baseForeLen) : 1.0;
  const upperLen = baseUpperLen * stretch;
  const foreLen = baseForeLen * stretch;

  const minDist = Math.abs(upperLen - foreLen) + 1e-3;
  const maxDist = upperLen + foreLen - 1e-3;
  const dist = Math.max(minDist, Math.min(maxDist, rawDist));

  // Unit vector from shoulder toward hand.
  let ux, uy, uz;
  if (rawDist > 1e-6) {
    ux = dx / rawDist;
    uy = dy / rawDist;
    uz = dz / rawDist;
  } else {
    ux = 0;
    uy = 1;
    uz = 0;
  }

  // Distance along u and perpendicular offset h to the elbow circle (law of cosines).
  const a = (upperLen * upperLen + dist * dist - foreLen * foreLen) / (2 * dist);
  const h = Math.sqrt(Math.max(0, upperLen * upperLen - a * a));

  // Project pole vector perpendicular to u (Gram-Schmidt) to choose natural elbow direction.
  const dot = pole.x * ux + pole.y * uy + pole.z * uz;
  let vx = pole.x - dot * ux;
  let vy = pole.y - dot * uy;
  let vz = pole.z - dot * uz;
  let vLen = Math.hypot(vx, vy, vz);

  if (vLen < 1e-6) {
    vx = 0;
    vy = 0;
    vz = -1;
    const fDot = vz * uz;
    vx -= fDot * ux;
    vy -= fDot * uy;
    vz -= fDot * uz;
    vLen = Math.hypot(vx, vy, vz) || 1;
  }

  vx /= vLen;
  vy /= vLen;
  vz /= vLen;

  const elbow = {
    x: shoulder.x + a * ux + h * vx,
    y: shoulder.y + a * uy + h * vy,
    z: shoulder.z + a * uz + h * vz,
  };

  const hand = (rawDist >= minDist && rawDist <= maxDist)
    ? { x: target.x, y: target.y, z: target.z }
    : {
        x: shoulder.x + dist * ux,
        y: shoulder.y + dist * uy,
        z: shoulder.z + dist * uz,
      };

  return { shoulder, elbow, hand };
}

// Computes full stick-figure joint geometry in screen coordinates with a calm,
// steady torso/head and vertically bouncy, elastic 3D arm IK.
export function computeJugglerPose(leftHand, rightHand, handLineY, canvasWidth, canvasHeight, zoom = 1) {
  const scale = (canvasWidth / 350) * zoom;
  const centerX = canvasWidth / 2;

  // Proportioned upper body with defined waist, hips, and upper legs descending
  // cleanly to the bottom edge of the frame.
  const crotchY = Math.min(canvasHeight - 16 * scale, handLineY + 20 * scale);
  const hipY = crotchY - 14 * scale;
  const waistY = hipY - 22 * scale;
  const shoulderY = waistY - 76 * scale;
  const shoulderHalfWidth = 39 * scale;
  const waistHalfWidth = 26 * scale;
  const hipHalfWidth = 30 * scale;

  const collar = { x: centerX, y: shoulderY - 5 * scale };
  // Place shoulder joints cleanly on the outer rounded shoulder tangent.
  const leftShoulder = { x: centerX - shoulderHalfWidth, y: shoulderY + 4 * scale, z: 0 };
  const rightShoulder = { x: centerX + shoulderHalfWidth, y: shoulderY + 4 * scale, z: 0 };

  const neckLength = 14 * scale;
  const headRadius = 20 * scale;
  const neckTop = { x: centerX, y: collar.y - neckLength };
  const headCenter = { x: centerX, y: neckTop.y - headRadius };

  const leftWaist = { x: centerX - waistHalfWidth, y: waistY };
  const rightWaist = { x: centerX + waistHalfWidth, y: waistY };
  const pelvis = { x: centerX, y: hipY };
  const leftHip = { x: centerX - hipHalfWidth, y: hipY };
  const rightHip = { x: centerX + hipHalfWidth, y: hipY };
  const crotch = { x: centerX, y: crotchY };

  // Elastic vertical arm bounce with narrower, tucked ball-juggling elbows.
  const clamp = (v, lim) => Math.max(-lim, Math.min(lim, v));
  const leftDy = clamp(leftHand.y - handLineY, 45 * scale);
  const rightDy = clamp(rightHand.y - handLineY, 45 * scale);

  const handZ = 64 * scale;
  const baseUpperLen = 74 * scale;
  const baseForeLen = 78 * scale;

  const leftUpperLen = baseUpperLen + leftDy * 0.42;
  const rightUpperLen = baseUpperLen + rightDy * 0.42;
  const leftForeLen = baseForeLen + Math.max(0, leftDy) * 0.18;
  const rightForeLen = baseForeLen + Math.max(0, rightDy) * 0.18;

  const leftTarget = { x: leftHand.x, y: leftHand.y, z: handZ + leftDy * 0.12 };
  const rightTarget = { x: rightHand.x, y: rightHand.y, z: handZ + rightDy * 0.12 };

  const leftPole = { x: -0.22, y: 1.0, z: -0.40 };
  const rightPole = { x: 0.22, y: 1.0, z: -0.40 };

  const leftArm = solveTwoBoneIK3D(leftShoulder, leftTarget, leftUpperLen, leftForeLen, leftPole, { elastic: true });
  const rightArm = solveTwoBoneIK3D(rightShoulder, rightTarget, rightUpperLen, rightForeLen, rightPole, { elastic: true });

  return {
    scale,
    headCenter,
    headRadius,
    neckTop,
    collar,
    leftShoulder,
    rightShoulder,
    leftWaist,
    rightWaist,
    pelvis,
    leftHip,
    rightHip,
    crotch,
    leftArm,
    rightArm,
  };
}
