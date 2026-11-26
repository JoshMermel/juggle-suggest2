import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  THROW_X,
  CATCH_X,
  DWELL,
  buildHandSchedule,
  buildHandScheduleFromMhn,
  getHandPosition,
  solveTwoBoneIK3D,
  computeJugglerPose,
} from '../juggler.js';
import { parseSiteswap } from '../suggest.js';
import { splitOrbits, decomposeMhnOrbits, Pos } from '../orbits.js';
import { parseMixed } from '../mhn.js';
import { Ball, computeSceneMetrics, worldToScreen } from '../anim.js';

describe('solveTwoBoneIK3D', () => {
  it('preserves exact 3D bone lengths in rigid mode and stretches smoothly in elastic mode', () => {
    const shoulder = { x: 133, y: 438, z: 0 };
    const target = { x: 87.5, y: 520, z: 66 };
    const L1 = 76;
    const L2 = 82;
    const pole = { x: -0.20, y: 1.0, z: -0.40 };
    const { elbow, hand } = solveTwoBoneIK3D(shoulder, target, L1, L2, pole);

    const upperDist = Math.hypot(elbow.x - shoulder.x, elbow.y - shoulder.y, elbow.z - shoulder.z);
    const foreDist = Math.hypot(hand.x - elbow.x, hand.y - elbow.y, hand.z - elbow.z);
    assert.ok(Math.abs(upperDist - L1) < 1e-6);
    assert.ok(Math.abs(foreDist - L2) < 1e-6);
    assert.deepEqual(hand, target);

    // Upper arm should hang strongly downward (elbow well below shoulder, near waist height)
    assert.ok(elbow.y > shoulder.y + 55, `Expected elbow well below shoulder, got y=${elbow.y}`);
    assert.ok(elbow.x < shoulder.x && elbow.x > 70, `Expected natural elbow x, got x=${elbow.x}`);
    assert.ok(elbow.z < target.z, 'Expected elbow behind hand in z');

    // Elastic mode should still reach exact wide/low catch target with soft stretch
    const deepCatch = { x: 43.75, y: 555, z: 72 };
    const elasticArm = solveTwoBoneIK3D(shoulder, deepCatch, L1, L2, pole, { elastic: true });
    assert.deepEqual(elasticArm.hand, deepCatch);
    assert.ok(elasticArm.elbow.y > elbow.y, 'Expected elbow to dip lower on deep catch');
  });

  it('produces mirror-symmetric elbows for left and right arms', () => {
    const cx = 175;
    const left = solveTwoBoneIK3D(
      { x: cx - 46, y: 400, z: 0 },
      { x: cx - 87.5, y: 520, z: 94 },
      112,
      108,
      { x: -0.14, y: 1.0, z: -0.35 }
    );
    const right = solveTwoBoneIK3D(
      { x: cx + 46, y: 400, z: 0 },
      { x: cx + 87.5, y: 520, z: 94 },
      112,
      108,
      { x: 0.14, y: 1.0, z: -0.35 }
    );

    assert.ok(Math.abs((cx - left.elbow.x) - (right.elbow.x - cx)) < 1e-6);
    assert.ok(Math.abs(left.elbow.y - right.elbow.y) < 1e-6);
    assert.ok(Math.abs(left.elbow.z - right.elbow.z) < 1e-6);
  });

  it('clamps cleanly without NaN when target is out of reach or coincident', () => {
    const shoulder = { x: 100, y: 400, z: 0 };
    const pole = { x: -0.14, y: 1.0, z: -0.35 };
    const far = solveTwoBoneIK3D(shoulder, { x: 100, y: 900, z: 94 }, 112, 108, pole);
    assert.ok(Number.isFinite(far.elbow.x) && Number.isFinite(far.elbow.y) && Number.isFinite(far.elbow.z));
    assert.ok(Math.hypot(far.hand.x - shoulder.x, far.hand.y - shoulder.y, far.hand.z - shoulder.z) <= 220);

    const same = solveTwoBoneIK3D(shoulder, { x: 100, y: 400, z: 0 }, 112, 108, pole);
    assert.ok(Number.isFinite(same.elbow.x) && Number.isFinite(same.elbow.y) && Number.isFinite(same.elbow.z));
  });
});

describe('hand schedules and trajectories', () => {
  it('matches ball positions during dwell for async pattern 531', () => {
    const siteswap = parseSiteswap('531', false).siteswap;
    const schedule = buildHandSchedule(siteswap, false);
    const orbits = splitOrbits(siteswap, false);
    const balls = orbits.map(o => new Ball(o, false));

    let checkedDwells = 0;
    for (let t = 0; t < 12; t += 0.05) {
      const leftPos = getHandPosition(schedule.left, schedule.cycleLength, true, t);
      const rightPos = getHandPosition(schedule.right, schedule.cycleLength, false, t);

      for (const ball of balls) {
        ball.updatePosition(t);
        const pos = Pos(ball.orbit, t, false);
        if (pos.time + DWELL >= pos.toss) {
          const hand = pos.catch_lhs ? leftPos : rightPos;
          assert.ok(Math.abs(hand.x - ball.x) < 1e-6, `x mismatch at t=${t}: hand=${hand.x}, ball=${ball.x}`);
          assert.ok(Math.abs(hand.y - ball.y) < 1e-6, `y mismatch at t=${t}: hand=${hand.y}, ball=${ball.y}`);
          checkedDwells++;
        }
      }
    }
    assert.ok(checkedDwells > 50, 'Expected to check many dwell frames');
  });

  it('matches ball positions during dwell for sync pattern (4,2x)(2x,4)', () => {
    const siteswap = parseSiteswap('(4,2x)(2x,4)', true).siteswap;
    const schedule = buildHandSchedule(siteswap, true);
    const orbits = splitOrbits(siteswap, true);
    const balls = orbits.map(o => new Ball(o, true));

    let checkedDwells = 0;
    for (let t = 0; t < 8; t += 0.05) {
      const leftPos = getHandPosition(schedule.left, schedule.cycleLength, true, t);
      const rightPos = getHandPosition(schedule.right, schedule.cycleLength, false, t);

      for (const ball of balls) {
        ball.updatePosition(t);
        const pos = Pos(ball.orbit, t, true);
        if (pos.time + DWELL >= pos.toss) {
          const hand = pos.catch_lhs ? leftPos : rightPos;
          assert.ok(Math.abs(hand.x - ball.x) < 1e-6, `sync x mismatch at t=${t}`);
          assert.ok(Math.abs(hand.y - ball.y) < 1e-6, `sync y mismatch at t=${t}`);
          checkedDwells++;
        }
      }
    }
    assert.ok(checkedDwells > 50);
  });

  it('keeps hand trajectory continuous across throw and catch boundaries', () => {
    const siteswap = parseSiteswap('531', false).siteswap;
    const schedule = buildHandSchedule(siteswap, false);

    let prev = getHandPosition(schedule.left, schedule.cycleLength, true, 0);
    for (let t = 0.01; t <= 12; t += 0.01) {
      const cur = getHandPosition(schedule.left, schedule.cycleLength, true, t);
      const jump = Math.hypot(cur.x - prev.x, cur.y - prev.y);
      assert.ok(jump < 2.0, `Discontinuity detected at t=${t}: jump=${jump}`);
      prev = cur;
    }
  });

  it('rests idle hands cleanly on empty beats like 0 and (4,0)', () => {
    const zeroSched = buildHandSchedule(parseSiteswap('0', false).siteswap, false);
    const leftIdle = getHandPosition(zeroSched.left, zeroSched.cycleLength, true, 3.2);
    assert.equal(leftIdle.phase, 'idle');
    assert.equal(leftIdle.x, (THROW_X[true] + CATCH_X[true]) / 2);
    assert.equal(leftIdle.y, 0);

    const oneHandSched = buildHandSchedule(parseSiteswap('(4,0)', true).siteswap, true);
    assert.equal(oneHandSched.left.length, 1);
    assert.equal(oneHandSched.right.length, 0);
    assert.equal(getHandPosition(oneHandSched.right, oneHandSched.cycleLength, false, 1.0).phase, 'idle');
  });

  it('holds steady at CATCH_X during stacked multiplexes and matches dwell', () => {
    const siteswap = parseSiteswap('([44],2x)(2x,[44])', true).siteswap;
    const schedule = buildHandSchedule(siteswap, true);
    const orbits = splitOrbits(siteswap, true);
    const balls = orbits.map(o => new Ball(o, true));

    let checkedHolds = 0;
    let checkedDwells = 0;
    for (let t = 0; t < 8; t += 0.05) {
      const leftPos = getHandPosition(schedule.left, schedule.cycleLength, true, t);
      const rightPos = getHandPosition(schedule.right, schedule.cycleLength, false, t);

      for (const ball of balls) {
        ball.updatePosition(t);
        const pos = Pos(ball.orbit, t, true);
        const hand = pos.catch_lhs ? leftPos : rightPos;
        if (pos.time + DWELL >= pos.toss) {
          assert.ok(Math.abs(hand.x - ball.x) < 1e-6);
          assert.ok(Math.abs(hand.y - ball.y) < 1e-6);
          checkedDwells++;
        } else if (pos.time + pos.hold + DWELL >= pos.toss) {
          assert.equal(hand.x, CATCH_X[pos.catch_lhs]);
          assert.equal(hand.y, 0);
          checkedHolds++;
        }
      }
    }
    assert.ok(checkedDwells > 50);
    assert.ok(checkedHolds > 0, 'Expected to verify stacked multiplex hold frames');
  });

  it('keeps torso steady, tucks elbows near waist, sweeps forearms in/out, and bounces elbows vertically', () => {
    // On a 350px canvas: left throw = 175 - 22*1.75 = 136.5, left catch = 175 - 64*1.75 = 63
    const throwPose = computeJugglerPose({ x: 136.5, y: 520 }, { x: 213.5, y: 520 }, 520, 350, 600);
    const catchPose = computeJugglerPose({ x: 63, y: 520 }, { x: 287, y: 520 }, 520, 350, 600);

    const neckLen = throwPose.collar.y - throwPose.neckTop.y;
    const torsoLen = throwPose.pelvis.y - throwPose.collar.y;
    const shoulderWidth = throwPose.rightShoulder.x - throwPose.leftShoulder.x;
    const waistWidth = throwPose.rightWaist.x - throwPose.leftWaist.x;
    const hipWidth = throwPose.rightHip.x - throwPose.leftHip.x;
    assert.ok(neckLen >= 12 && neckLen <= 20, `Expected visible neck, got ${neckLen}`);
    assert.ok(torsoLen / neckLen < 8, `Torso-to-neck ratio too high: ${torsoLen / neckLen}`);
    assert.ok(throwPose.headRadius * 2 >= shoulderWidth * 0.45, 'Head should be well-proportioned to shoulders');
    assert.ok(waistWidth < hipWidth && hipWidth < shoulderWidth, 'Expected defined waist narrower than hips and shoulders');
    assert.ok(throwPose.crotch.y > throwPose.pelvis.y && throwPose.crotch.y < 600 - 20, 'Expected visible upper legs below crotch');

    // Elbows stay reasonably tucked near the torso/waist (not flared way out)
    assert.ok(throwPose.leftShoulder.x - throwPose.leftArm.elbow.x < 30, 'Expected left elbow tucked near shoulder/waist');
    assert.ok(throwPose.rightArm.elbow.x - throwPose.rightShoulder.x < 30, 'Expected right elbow tucked near shoulder/waist');

    // Forearms angle INWARD on throws (left hand right of left elbow; right hand left of right elbow)
    assert.ok(throwPose.leftArm.hand.x > throwPose.leftArm.elbow.x + 10, 'Expected left forearm angled in on throw');
    assert.ok(throwPose.rightArm.hand.x < throwPose.rightArm.elbow.x - 10, 'Expected right forearm angled in on throw');

    // Forearms angle OUTWARD on catches (left hand left of left elbow; right hand right of right elbow)
    assert.ok(catchPose.leftArm.hand.x < catchPose.leftArm.elbow.x - 20, 'Expected left forearm angled out on catch');
    assert.ok(catchPose.rightArm.hand.x > catchPose.rightArm.elbow.x + 20, 'Expected right forearm angled out on catch');

    // Torso, head, and shoulders stay steady even under asymmetric hand motion,
    // while elbows bounce noticeably vertically (down on dwell dip, up on follow-through).
    const active = computeJugglerPose({ x: 100, y: 555 }, { x: 250, y: 498 }, 520, 350, 600);
    assert.deepEqual(active.headCenter, throwPose.headCenter);
    assert.deepEqual(active.leftShoulder, throwPose.leftShoulder);
    assert.deepEqual(active.rightShoulder, throwPose.rightShoulder);
    assert.ok(active.leftArm.elbow.y > throwPose.leftArm.elbow.y + 15, 'Expected left elbow to bounce down on dwell');
    assert.ok(active.rightArm.elbow.y < throwPose.rightArm.elbow.y - 10, 'Expected right elbow to spring up on follow-through');
  });

  it('scales juggler, balls, and horizontal spread smoothly on tall patterns while preserving dwell motion', () => {
    const m5 = computeSceneMetrics(5, 350, 600);
    const m9 = computeSceneMetrics(9, 350, 600);
    const mz = computeSceneMetrics(35, 350, 600);

    // Normal patterns stay 1:1
    assert.equal(m5.zoom, 1.0);
    assert.equal(m5.radius, 10);
    assert.equal(m5.flightPxPerY, m5.dwellPxPerY);

    // Tall patterns smoothly zoom out without collapsing below readable floor
    assert.ok(m9.zoom < 1.0 && m9.zoom > 0.7);
    assert.equal(mz.zoom, 0.45);
    assert.equal(mz.radius, 5);

    // On zxy (35), flight gravity compresses to fit sky, while hand dwell keeps expressive pixels
    assert.ok(mz.flightPxPerY < 1.0);
    assert.ok(mz.dwellPxPerY >= 4.0, `Expected healthy dwell scale on zxy, got ${mz.dwellPxPerY}`);

    // Ball and hand match identically at y = 0 and during dwell (y < 0)
    const handRelease = worldToScreen(-22, 0, mz, { useHandScale: true });
    const ballRelease = worldToScreen(-22, 0, mz);
    assert.deepEqual(handRelease, ballRelease);

    const handDwell = worldToScreen(-43, -4, mz, { useHandScale: true });
    const ballDwell = worldToScreen(-43, -4, mz);
    assert.deepEqual(handDwell, ballDwell);
    assert.ok(handDwell.y - handRelease.y >= 16, 'Expected visible vertical dwell scoop on zxy');
  });

  it('locks hands to balls during dwell for MHN mixed patterns (*, !, L/R, 1x, 441)', () => {
    const patterns = ['531', '441', '(4,2x)*', '(3x,4)!3x', '4x1(4x,3x)*', '(4,5x)(4,1x)!R5x41x', '(3x,2x)!L3', '1x', 'R531*'];
    for (const pat of patterns) {
      const mhn = parseMixed(pat);
      const { orbits } = decomposeMhnOrbits(mhn);
      const schedule = buildHandScheduleFromMhn(mhn);
      const balls = orbits.map(o => new Ball(o, false));

      let checkedDwells = 0;
      for (let step = 0; step < 300; step++) {
        const t = step * 0.05;
        for (const ball of balls) {
          const pos = Pos(ball.orbit, t, false);
          if (pos.time + DWELL >= pos.toss) {
            ball.updatePosition(t);
            const events = pos.catch_lhs ? schedule.left : schedule.right;
            const hand = getHandPosition(events, schedule.cycleLength, pos.catch_lhs, t);
            assert.ok(
              Math.abs(hand.x - ball.x) < 1e-6,
              `${pat} x mismatch at t=${t.toFixed(2)}: hand=${hand.x}, ball=${ball.x}`
            );
            assert.ok(
              Math.abs(hand.y - ball.y) < 1e-6,
              `${pat} y mismatch at t=${t.toFixed(2)}: hand=${hand.y}, ball=${ball.y}`
            );
            checkedDwells++;
          }
        }
      }
      assert.ok(checkedDwells > 40, `Expected dwell frames for ${pat}, got ${checkedDwells}`);
    }
  });
});
