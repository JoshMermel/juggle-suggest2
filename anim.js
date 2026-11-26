import { maxThrow, decomposeOrbits, Pos } from './orbits.js';
import {
  THROW_X,
  CATCH_X,
  DWELL,
  DWELL_DISTANCE,
  buildHandSchedule,
  getHandPosition,
  computeJugglerPose,
} from './juggler.js';
import { shuffled } from './utils.js';

const RADIUS = 10;

let pace = 0.03125;
let show_juggler = true;

export function setPace(new_pace) {
  pace = new_pace;
}

export function setShowJuggler(enabled) {
  show_juggler = Boolean(enabled);
}

// Maps world coordinates (x in [-100, 100], y >= -DWELL_DISTANCE) to canvas pixels.
export function worldToScreen(wx, wy, canvas_width, canvas_height, max_height) {
  const x = (wx * canvas_width / 200) + (canvas_width / 2);
  // If max height is small, avoid over-scaling so low patterns don't look stretched.
  const pattern_height = max_height + RADIUS + RADIUS + DWELL_DISTANCE;
  let y;
  if (pattern_height < (canvas_height / 10)) {
    y = canvas_height - max_height - RADIUS - 10 * (wy + DWELL_DISTANCE);
  } else {
    y = (max_height + RADIUS - wy) * canvas_height / pattern_height;
  }
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

  drawSelf(ctx, canvas_width, canvas_height, max_height) {
    const { x: render_x, y: render_y } = worldToScreen(
      this.x,
      this.y,
      canvas_width,
      canvas_height,
      max_height
    );

    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(render_x, render_y, RADIUS, 0, 2 * Math.PI);
    ctx.fill();
  }
}

const JUGGLER_STROKE = '#444444';
const JUGGLER_FILL = '#ffffff';

function drawArm(ctx, arm, scale) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = JUGGLER_STROKE;

  // Upper arm + forearm in one uniform color
  ctx.lineWidth = 3.5 * scale;
  ctx.beginPath();
  ctx.moveTo(arm.shoulder.x, arm.shoulder.y);
  ctx.lineTo(arm.elbow.x, arm.elbow.y);
  ctx.lineTo(arm.hand.x, arm.hand.y);
  ctx.stroke();

  // Subtle elbow joint
  ctx.fillStyle = JUGGLER_STROKE;
  ctx.beginPath();
  ctx.arc(arm.elbow.x, arm.elbow.y, 2.5 * scale, 0, 2 * Math.PI);
  ctx.fill();

  // Hand palm indicator
  ctx.fillStyle = JUGGLER_FILL;
  ctx.lineWidth = 2.0 * scale;
  ctx.beginPath();
  ctx.arc(arm.hand.x, arm.hand.y, 4.5 * scale, 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();
}

function drawJuggler(ctx, keyframe_count, canvas_width, canvas_height, max_height) {
  const leftWorld = getHandPosition(hand_schedule.left, hand_schedule.cycleLength, true, keyframe_count);
  const rightWorld = getHandPosition(hand_schedule.right, hand_schedule.cycleLength, false, keyframe_count);

  const leftHand = worldToScreen(leftWorld.x, leftWorld.y, canvas_width, canvas_height, max_height);
  const rightHand = worldToScreen(rightWorld.x, rightWorld.y, canvas_width, canvas_height, max_height);
  const handLineY = worldToScreen(0, 0, canvas_width, canvas_height, max_height).y;

  const pose = computeJugglerPose(leftHand, rightHand, handLineY, canvas_width, canvas_height);
  const s = pose.scale;
  const cx = pose.collar.x;
  const hipW = pose.rightHip.x - cx;
  const bottomY = canvas_height + 4;
  const innerLegHalfGap = 5 * s;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = JUGGLER_STROKE;

  // Neck
  ctx.lineWidth = 3.5 * s;
  ctx.beginPath();
  ctx.moveTo(pose.neckTop.x, pose.neckTop.y);
  ctx.lineTo(pose.collar.x, pose.collar.y + 4 * s);
  ctx.stroke();

  // Torso with natural waist curve, hips, and upper legs splitting at crotch
  ctx.fillStyle = JUGGLER_FILL;
  ctx.lineWidth = 3.0 * s;
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
  ctx.lineWidth = 3.0 * s;
  ctx.beginPath();
  ctx.arc(pose.headCenter.x, pose.headCenter.y, pose.headRadius, 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();

  // 3D-IK arms (shoulder -> elbow -> hand)
  drawArm(ctx, pose.leftArm, s);
  drawArm(ctx, pose.rightArm, s);

  ctx.restore();
}

export const palette = [
  "#000000", "#1CE6FF", "#FF34FF", "#FF4A46", "#008941", "#006FA6",
  "#A30059", "#7A4900", "#0000A6", "#B79762", "#004D43", "#997D87", "#5A0007",
  "#809693", "#1B4400", "#4FC601", "#3B5DFF", "#4A3B53", "#FF2F80", "#61615A",
  "#BA0900", "#6B7900", "#00C2A0", "#B903AA", "#D16100", "#000035", "#7B4F4B",
  "#A1C299", "#300018", "#0AA6D8", "#013349", "#00846F", "#372101", "#FFB500",
  "#A079BF", "#CC0744", "#C0B9B2", "#001E09", "#00489C", "#6F0062", "#0CBD66",
  "#456D75", "#B77B68", "#7A87A1", "#788D66", "#885578", "#FF8A9A", "#D157A0",
  "#BEC459", "#456648", "#0086ED", "#886F4C", "#34362D", "#B4A8BD", "#00A6AA",
  "#452C2C", "#636375", "#A3C8C9", "#FF913F", "#938A81", "#575329", "#B05B6F",
  "#3B9700", "#04F757", "#C8A1A1", "#1E6E00", "#7900D7", "#A77500", "#6367A9",
  "#A05837", "#6B002C", "#772600", "#D790FF", "#9B9700", "#549E79", "#201625",
  "#72418F", "#BC23FF", "#99ADC0", "#3A2465", "#922329", "#5B4534", "#404E55",
  "#0089A3", "#CB7E98", "#A4E804", "#324E72", "#6A3A4C"
];

let keyframe_count = 0;
let balls = [];
let max_throw = 0;
let hand_schedule = { cycleLength: 0, left: [], right: [] };
let orbit_colors = new Map();
let canvas_el = null;
let ctx = null;
let logical_width = 350;
let logical_height = 600;
let last_draw_time = null;
let raf_id = null;
let resize_bound = false;

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
  hand_schedule = buildHandSchedule(siteswap, is_sync);
  const { orbits } = decomposed || decomposeOrbits(siteswap, is_sync);
  balls = orbits.map(orbit => new Ball(orbit, is_sync));
  if (color_by_orbit) {
    recolorByOrbit();
  } else {
    recolorRandomly();
  }
}

export function recolorRandomly() {
  const local_palette = shuffled(palette);
  orbit_colors = new Map();
  for (let i = 0; i < balls.length; i++) {
    balls[i].color = local_palette[i % local_palette.length];
    const oid = balls[i].orbit.id;
    if (!orbit_colors.has(oid)) {
      orbit_colors.set(oid, local_palette[oid % local_palette.length]);
    }
  }
}

export function recolorByOrbit() {
  const local_palette = shuffled(palette);
  orbit_colors = new Map();
  for (const ball of balls) {
    const color = local_palette[ball.orbit.id % local_palette.length];
    ball.color = color;
    orbit_colors.set(ball.orbit.id, color);
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
  const peak_duration = Math.max(0, max_throw - DWELL);
  const max_height = peak_duration * peak_duration;

  if (show_juggler) {
    drawJuggler(ctx, keyframe_count, logical_width, logical_height, max_height);
  }

  for (const ball of balls) {
    ball.updatePosition(keyframe_count);
    ball.drawSelf(ctx, logical_width, logical_height, max_height);
  }

  raf_id = window.requestAnimationFrame(draw);
}
