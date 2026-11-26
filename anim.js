import { maxThrow, maxThrowMhn, decomposeOrbits, decomposeMhnOrbits, Pos } from './orbits.js';
import {
  THROW_X,
  CATCH_X,
  DWELL,
  DWELL_DISTANCE,
  buildHandSchedule,
  buildHandScheduleFromMhn,
  getHandPosition,
  computeJugglerPose,
} from './juggler.js';
import { PALETTE, pickDistinctColors } from './colors.js';

const BASE_RADIUS = 10;
const BASE_PX_PER_Y = 10;
const MIN_ZOOM = 0.45;
const MIN_RADIUS = 5;

let pace = 0.03125;

export function setPace(new_pace) {
  pace = new_pace;
}

// Computes hybrid camera-zoom + vertical scaling metrics so normal patterns
// (maxThrow <= 6) stay at 1:1 scale, while very tall patterns (like 'zxy')
// smoothly zoom out the juggler, horizontal spread, and ball radius down to a
// readable floor while keeping hand dwell motion proportional to juggler size.
export function computeSceneMetrics(max_throw_val, canvas_width, canvas_height) {
  const zoom = max_throw_val <= 6
    ? 1.0
    : Math.max(MIN_ZOOM, Math.min(1.0, Math.sqrt(6 / max_throw_val)));

  const radius = Math.max(MIN_RADIUS, BASE_RADIUS * zoom);
  const jugglerScale = (canvas_width / 350) * zoom;
  const dwellPxPerY = BASE_PX_PER_Y * zoom;

  const bottomMargin = Math.max(
    DWELL_DISTANCE * dwellPxPerY + radius + 6,
    52 * jugglerScale
  );
  const handLineY = canvas_height - bottomMargin;

  const peakDuration = Math.max(0, max_throw_val - DWELL);
  const maxHeight = peakDuration * peakDuration;
  const topMargin = radius + 10;
  const availSky = Math.max(40, handLineY - topMargin);
  const flightPxPerY = (maxHeight > 0 && maxHeight * dwellPxPerY > availSky)
    ? availSky / maxHeight
    : dwellPxPerY;

  return {
    zoom,
    radius,
    jugglerScale,
    handLineY,
    dwellPxPerY,
    flightPxPerY,
    canvasWidth: canvas_width,
    canvasHeight: canvas_height,
  };
}

// Maps world coordinates to canvas pixels using hybrid scene metrics.
// Balls in flight (wy > 0) use flightPxPerY; hands and balls in dwell/hold
// use dwellPxPerY so hand scoops never collapse on extreme throws.
export function worldToScreen(wx, wy, metrics, { useHandScale = false } = {}) {
  const x = (wx * metrics.canvasWidth * metrics.zoom / 200) + (metrics.canvasWidth / 2);
  const pxPerY = (useHandScale || wy <= 0) ? metrics.dwellPxPerY : metrics.flightPxPerY;
  const y = metrics.handLineY - wy * pxPerY;
  return { x, y };
}

export class Ball {
  constructor(orbit, is_sync) {
    this.orbit = orbit;
    this.is_sync = is_sync;
    this.x = 0;
    this.y = 0;
    this.color = '#000000';
  }

  updatePosition(keyframe_count) {
    const pos = Pos(this.orbit, keyframe_count, this.is_sync);

    let source_x, dest_x, peak_y, progress, duration;

    if (pos.time + pos.hold + DWELL < pos.toss) {
      // Ball is in flight along a parabolic arc.
      duration = pos.toss - DWELL - pos.hold;
      progress = pos.time;
      source_x = THROW_X[pos.toss_lhs];
      dest_x = CATCH_X[pos.catch_lhs];
      peak_y = duration * duration;
    } else if (pos.time + DWELL < pos.toss) {
      // Staggered hold at the catch point for stacked multiplex throws.
      this.x = CATCH_X[pos.catch_lhs];
      this.y = 0;
      return;
    } else {
      // Dwell from catch position to throw position.
      duration = DWELL;
      progress = DWELL + pos.time - pos.toss;
      source_x = CATCH_X[pos.catch_lhs];
      dest_x = THROW_X[pos.catch_lhs];
      // Make dwell dip smaller for low throws.
      peak_y = -1 * Math.min(DWELL_DISTANCE, DWELL_DISTANCE * pos.max_landing_with / 10);
    }

    const u = progress / duration;
    this.x = source_x + (dest_x - source_x) * u;
    this.y = peak_y * 4 * u * (1 - u);
  }

  drawSelf(ctx, metrics) {
    const { x: render_x, y: render_y } = worldToScreen(this.x, this.y, metrics);

    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(render_x, render_y, metrics.radius, 0, 2 * Math.PI);
    ctx.fill();
  }
}

const JUGGLER_STROKE = '#444444';
const JUGGLER_FILL = '#ffffff';

function drawArm(ctx, arm, scale) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = JUGGLER_STROKE;

  // Continuous shoulder -> elbow -> hand path with smooth round join
  ctx.lineWidth = Math.max(2.0, 3.5 * scale);
  ctx.beginPath();
  ctx.moveTo(arm.shoulder.x, arm.shoulder.y);
  ctx.lineTo(arm.elbow.x, arm.elbow.y);
  ctx.lineTo(arm.hand.x, arm.hand.y);
  ctx.stroke();

  // Hand palm indicator
  ctx.fillStyle = JUGGLER_FILL;
  ctx.lineWidth = Math.max(1.4, 2.0 * scale);
  ctx.beginPath();
  ctx.arc(arm.hand.x, arm.hand.y, Math.max(2.6, 4.5 * scale), 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();
}

function drawJuggler(ctx, keyframe_count, metrics) {
  const leftWorld = getHandPosition(hand_schedule.left, hand_schedule.cycleLength, true, keyframe_count);
  const rightWorld = getHandPosition(hand_schedule.right, hand_schedule.cycleLength, false, keyframe_count);

  const leftHand = worldToScreen(leftWorld.x, leftWorld.y, metrics, { useHandScale: true });
  const rightHand = worldToScreen(rightWorld.x, rightWorld.y, metrics, { useHandScale: true });

  const pose = computeJugglerPose(
    leftHand,
    rightHand,
    metrics.handLineY,
    metrics.canvasWidth,
    metrics.canvasHeight,
    metrics.zoom
  );
  const s = pose.scale;
  const cx = pose.collar.x;
  const hipW = pose.rightHip.x - cx;
  const bottomY = metrics.canvasHeight + 4;
  const innerLegHalfGap = 5 * s;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = JUGGLER_STROKE;

  // Neck
  ctx.lineWidth = Math.max(2.0, 3.5 * s);
  ctx.beginPath();
  ctx.moveTo(pose.neckTop.x, pose.neckTop.y);
  ctx.lineTo(pose.collar.x, pose.collar.y + 4 * s);
  ctx.stroke();

  // Torso with natural waist curve, hips, and upper legs splitting at crotch
  ctx.fillStyle = JUGGLER_FILL;
  ctx.lineWidth = Math.max(1.8, 3.0 * s);
  ctx.beginPath();
  ctx.moveTo(cx - hipW * 1.02, bottomY);
  ctx.lineTo(pose.leftHip.x, pose.leftHip.y);
  ctx.quadraticCurveTo(
    pose.leftWaist.x,
    pose.leftWaist.y + 4 * s,
    pose.leftWaist.x,
    pose.leftWaist.y
  );
  ctx.quadraticCurveTo(
    pose.leftShoulder.x + 2 * s,
    (pose.leftShoulder.y + pose.leftWaist.y) / 2,
    pose.leftShoulder.x,
    pose.leftShoulder.y
  );
  ctx.quadraticCurveTo(
    pose.leftShoulder.x,
    pose.collar.y,
    cx - 10 * s,
    pose.collar.y
  );
  ctx.lineTo(cx + 10 * s, pose.collar.y);
  ctx.quadraticCurveTo(
    pose.rightShoulder.x,
    pose.collar.y,
    pose.rightShoulder.x,
    pose.rightShoulder.y
  );
  ctx.quadraticCurveTo(
    pose.rightShoulder.x - 2 * s,
    (pose.rightShoulder.y + pose.rightWaist.y) / 2,
    pose.rightWaist.x,
    pose.rightWaist.y
  );
  ctx.quadraticCurveTo(
    pose.rightWaist.x,
    pose.rightWaist.y + 4 * s,
    pose.rightHip.x,
    pose.rightHip.y
  );
  ctx.lineTo(cx + hipW * 1.02, bottomY);
  ctx.lineTo(cx + innerLegHalfGap, bottomY);
  ctx.lineTo(pose.crotch.x, pose.crotch.y);
  ctx.lineTo(cx - innerLegHalfGap, bottomY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Head
  ctx.fillStyle = JUGGLER_FILL;
  ctx.lineWidth = Math.max(1.8, 3.0 * s);
  ctx.beginPath();
  ctx.arc(pose.headCenter.x, pose.headCenter.y, pose.headRadius, 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();

  // 3D-IK arms (shoulder -> elbow -> hand)
  drawArm(ctx, pose.leftArm, s);
  drawArm(ctx, pose.rightArm, s);

  ctx.restore();
}

export const palette = PALETTE;

let keyframe_count = 0;
let balls = [];
let max_throw = 0;
let hand_schedule = { cycleLength: 0, left: [], right: [] };
let orbit_colors = new Map();
let canvas_el = null;
let ctx = null;
let logical_width = 350;
let logical_height = 600;
let cached_metrics = computeSceneMetrics(0, 350, 600);
let last_draw_time = null;
let raf_id = null;
let resize_bound = false;

function refreshSceneMetrics() {
  cached_metrics = computeSceneMetrics(max_throw, logical_width, logical_height);
}

export function getOrbitColors() {
  return new Map(orbit_colors);
}

export function resizeCanvas() {
  if (!canvas_el || !ctx) {
    return;
  }
  const dpr = window.devicePixelRatio || 1;
  logical_width = canvas_el.clientWidth || 350;
  logical_height = canvas_el.clientHeight || 600;
  canvas_el.width = Math.round(logical_width * dpr);
  canvas_el.height = Math.round(logical_height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  refreshSceneMetrics();
}

export function startAnimation(canvas) {
  canvas_el = canvas || document.getElementById('canvas');
  if (!canvas_el) {
    return;
  }
  ctx = canvas_el.getContext('2d');
  resizeCanvas();
  if (!resize_bound) {
    window.addEventListener('resize', resizeCanvas);
    resize_bound = true;
  }
  if (raf_id !== null) {
    window.cancelAnimationFrame(raf_id);
  }
  last_draw_time = null;
  raf_id = window.requestAnimationFrame(draw);
}

export function setSiteswap(siteswap, color_by_orbit, is_sync, decomposed = null) {
  max_throw = maxThrow(siteswap, is_sync);
  refreshSceneMetrics();
  hand_schedule = buildHandSchedule(siteswap, is_sync);
  const { orbits } = decomposed || decomposeOrbits(siteswap, is_sync);
  balls = orbits.map(orbit => new Ball(orbit, is_sync));
  if (color_by_orbit) {
    recolorByOrbit();
  } else {
    recolorRandomly();
  }
}

export function setMhn(mhn, color_by_orbit, decomposed = null) {
  max_throw = maxThrowMhn(mhn);
  refreshSceneMetrics();
  hand_schedule = buildHandScheduleFromMhn(mhn);
  const { orbits } = decomposed || decomposeMhnOrbits(mhn);
  balls = orbits.map(orbit => new Ball(orbit, false));
  if (color_by_orbit) {
    recolorByOrbit();
  } else {
    recolorRandomly();
  }
}

function assignOrbitColors() {
  const uniqueOrbitIds = [...new Set(balls.map(b => b.orbit.id))];
  const orbitPalette = pickDistinctColors(uniqueOrbitIds.length, { randomize: true });
  orbit_colors = new Map();
  uniqueOrbitIds.forEach((oid, idx) => {
    orbit_colors.set(oid, orbitPalette[idx]);
  });
}

export function recolorRandomly() {
  assignOrbitColors();
  const ballColors = pickDistinctColors(balls.length, { randomize: true });
  for (let i = 0; i < balls.length; i++) {
    balls[i].color = ballColors[i];
  }
}

export function recolorByOrbit() {
  assignOrbitColors();
  for (const ball of balls) {
    ball.color = orbit_colors.get(ball.orbit.id);
  }
}

function draw(timestamp) {
  if (last_draw_time === null) {
    last_draw_time = timestamp;
  }
  const delta = Math.min(timestamp - last_draw_time, 100);
  last_draw_time = timestamp;

  // At 60fps, each frame is ~16ms.
  keyframe_count += delta * pace / 16;

  ctx.clearRect(0, 0, logical_width, logical_height);

  drawJuggler(ctx, keyframe_count, cached_metrics);

  for (const ball of balls) {
    ball.updatePosition(keyframe_count);
    ball.drawSelf(ctx, cached_metrics);
  }

  raf_id = window.requestAnimationFrame(draw);
}
