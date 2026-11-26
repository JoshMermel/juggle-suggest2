import { maxThrow, splitOrbits, Pos } from './orbits.js';
import { shuffled } from './utils.js';

const THROW_X = { true: -50, false: 50 };
const CATCH_X = { true: -75, false: 75 };
const RADIUS = 10;
const DWELL = 0.5;
const DWELL_DISTANCE = 4;

let pace = 0.03125;

export function setPace(new_pace) {
  pace = new_pace;
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

    const peak_x = (source_x + dest_x) / 2;
    this.x = source_x + ((dest_x - source_x) * progress / duration);
    this.y = peak_y * ((this.x - source_x) * (this.x - dest_x)) /
      ((peak_x - source_x) * (peak_x - dest_x));
  }

  drawSelf(ctx, canvas_width, canvas_height, max_height) {
    const render_x = (this.x * canvas_width / 200) + (canvas_width / 2);
    // If max height is small, avoid over-scaling so low patterns don't look stretched.
    const pattern_height = max_height + RADIUS + RADIUS + DWELL_DISTANCE;
    let render_y;
    if (pattern_height < (canvas_height / 10)) {
      render_y = canvas_height - max_height - RADIUS - 10 * (this.y + DWELL_DISTANCE);
    } else {
      render_y = (max_height + RADIUS - this.y) * canvas_height / pattern_height;
    }

    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(render_x, render_y, RADIUS, 0, 2 * Math.PI);
    ctx.fill();
  }
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
let canvas_el = null;
let ctx = null;
let logical_width = 350;
let logical_height = 600;
let last_draw_time = null;
let raf_id = null;

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
  window.addEventListener('resize', resizeCanvas);
  if (raf_id !== null) {
    window.cancelAnimationFrame(raf_id);
  }
  last_draw_time = null;
  raf_id = window.requestAnimationFrame(draw);
}

export function setSiteswap(siteswap, color_by_orbit, is_sync) {
  max_throw = maxThrow(siteswap, is_sync);
  const orbits = splitOrbits(siteswap, is_sync);
  balls = orbits.map(orbit => new Ball(orbit, is_sync));
  if (color_by_orbit) {
    recolorByOrbit();
  } else {
    recolorRandomly();
  }
}

export function recolorRandomly() {
  const local_palette = shuffled(palette);
  for (let i = 0; i < balls.length; i++) {
    balls[i].color = local_palette[i % local_palette.length];
  }
}

export function recolorByOrbit() {
  const local_palette = shuffled(palette);
  for (const ball of balls) {
    ball.color = local_palette[ball.orbit.id % local_palette.length];
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
  const max_height = (max_throw - DWELL) * (max_throw - DWELL);
  for (const ball of balls) {
    ball.updatePosition(keyframe_count);
    ball.drawSelf(ctx, logical_width, logical_height, max_height);
  }

  raf_id = window.requestAnimationFrame(draw);
}
