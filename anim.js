"use strict";

/////////////////////
// Generic helpers //
/////////////////////

// Returns the sum of an array of numbers
function arraysum(arr) {
  return arr.reduce(function(a,b){
    return a + b;
  }, 0);
}

// Returns the highest throw of the pattern
function maxThrow(siteswap, is_sync) {
  var max = 0;
  var height;

  for (var i = 0; i < siteswap.length; ++i) {
    for (let toss of siteswap[i]) {
      height = toss;
      if (is_sync && height % 2 === 1) {
        if (i % 2 === 0) {
          height -= 1;
        } else {
          height += 1;
        }
      }
      max = Math.max(max, height);
    }
  }
  return max;
}

// Mod but it turns negatives to positives efficiently.
function mod(n, m) {
  return ((n % m) + m) % m;
}

// Prints the orbits of a siteswap for debugging.
// Each row represents an orbit
// Each column represents a time.
// For debugging only.
function printSiteswapAsOrbits(siteswap, is_sync) {
  var orbits = splitOrbits(siteswap, is_sync);
  var tmp;
  for (let orbit of orbits) {
    tmp = '';
    for (let i = 0; i < 12; i++) {
      var j = Pos(orbit, i, is_sync);
      tmp += j.toss + '.' + j.time + '.';
      if (j.toss_lhs) {
        tmp += 'L.';
      } else {
        tmp += 'R.';
      }
      if (j.catch_lhs) {
        tmp += 'L ';
      } else {
        tmp += 'R ';
      }
    }
    console.log(tmp);
  }
}

//////////////////////////////////////////////////
// Finding orbits and positions in those orbits //
//////////////////////////////////////////////////

// Returns the index of the first throw in a siteswap.
// 0's aren't throws in this context.
function firstNonempty(siteswap) {
  for (let i = 0; i < siteswap.length; i++) {
    for (let toss of siteswap[i]) {
      if (toss != 0) {
        return i;
      }
    }
  }
  return -1;
}

// Constructs an Orbit object.
// Simplifies so offset is less than last throw.
function Orbit(toss_seq, landing_seq, hold_seq, offset, id, is_sync) {
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
  this.offset = offset;
  this.start_lhs = true;

  if (this.offset % 2 === 1) {
    this.start_lhs = false;
    if(is_sync) {
      this.offset -= 1;
    }
  }
}

// returns an array as long as the siteswap
// at each index will be the height of the highest throw that lands on that
// beat.
function maxLandings(siteswap, is_sync) {
  let ret = [];
  for (let multi of siteswap) {
    ret.push([]);
  }
  for (let i = 0; i < siteswap.length; i++) {
    for (let j = 0; j < siteswap[i].length; j++) {
      var dest = (i + siteswap[i][j]) % siteswap.length;
      ret[dest] = Math.max(ret[dest], nextToss(siteswap[i][j], i % 2 === 0, is_sync));
    }
  }
  return ret;
}

var max_hold = 0.4;

// Splits a sitswap into a list of Orbits.
// Each orbit represents a 1 ball siteswap.
// If all orbits are played on top of each other at the correct offsets, the
// result will look like the original siteswap.
// destroys the input.
function splitOrbits(siteswap, is_sync) {
  var copy = [];
  for (let tosses of siteswap) {
    copy.push(Array.from(tosses));
  }

  var ret = [];
  // landing seq is a parallel array holding the hightest throw that will be
  // caught on the beat that toss_seq[i] is caught.
  // hold_seq is a num saying how long to hold a ball between catch and dwell 
  var toss_seq, landing_seq, hold_seq, first, steal, newindex;
  var max_landings = maxLandings(siteswap, is_sync);
  var id = 0;

  while (firstNonempty(siteswap) != -1) {
    toss_seq = [];
    landing_seq = [];
    hold_seq = [];
    first = firstNonempty(siteswap);
    newindex = first;

    do {
      steal = siteswap[newindex].pop();
      var stacked_size = copy[newindex].filter(c => c === steal).length;
      var stacked_remaining = siteswap[newindex].filter(c => c === steal).length;
      hold_seq.push(max_hold * stacked_remaining / stacked_size)
      // push a number to hold_seq.
      toss_seq.push(steal);
      landing_seq.push(max_landings[newindex]);
      newindex = (newindex + steal) % siteswap.length;
    } while (newindex != first);

    var num_balls = arraysum(toss_seq) / siteswap.length;
    for (let i = 0; i < num_balls; i++) {
      ret.push(new Orbit(Array.from(toss_seq), Array.from(landing_seq), Array.from(hold_seq), first, id, is_sync));
      first += siteswap.length;
    }
    id += 1;
  }

  return ret;
}

// Helper to get around the confusing way we represent sync siteswaps.
// in sync, odd numbers are crossing with even height.
function nextToss(raw_value, toss_lhs, is_sync) {
  if (raw_value % 2 === 1 && is_sync) {
    if (toss_lhs) {
      return raw_value - 1;
    } else {
      return raw_value + 1;
    }
  }
  return raw_value;
}

// Returns what's happening in that orbit at that time.
// return object will include:
//  - toss (height of the toss being done)
//  - time (time elapsed on that toss, always less than |toss|)
//  - toss_lhs whether this throw started on the left
//  - catch_lhs whether this throw was caught on the left
function Pos(orbit, time, is_sync) {
  var ret = {};
  ret.time = time;
  ret.toss_lhs = orbit.start_lhs;
  ret.toss = nextToss(orbit.toss_seq[0], ret.toss_lhs, is_sync);

  // Makes sure time doesn't go negative
  ret.time -= orbit.offset;
  ret.time = mod(ret.time, 2 * arraysum(orbit.toss_seq));

  // Figure out which toss of the toss seq we are on by finding the first
  // throw we wouldn't have had time to finish.
  var toss_index = 0;
  while (ret.time >= ret.toss) {
    ret.time -= ret.toss;
    if (orbit.toss_seq[toss_index] % 2 === 1) {
      ret.toss_lhs = !ret.toss_lhs;
    }
    toss_index = (toss_index + 1) % orbit.toss_seq.length;
    ret.toss = nextToss(orbit.toss_seq[toss_index], ret.toss_lhs, is_sync);
  }

  ret.max_landing_with = orbit.landing_seq[mod(toss_index+1, orbit.toss_seq.length)];
  ret.hold = orbit.hold_seq[toss_index];
  var next_toss_crosses = orbit.toss_seq[toss_index] % 2 === 1;
  ret.catch_lhs = (ret.toss_lhs && !next_toss_crosses) ||
                  (!ret.toss_lhs && next_toss_crosses);

  return ret;
}

/////////////////////////
// Managing animations //
/////////////////////////

// constants to revist at some point
var throw_x = {true: -50, false : 50};
// TODO(jmerm): pick catch_x based on throw_x and dwell?
var catch_x = {true: -75, false : 75};
// hand y is just 0.
var radius = 10;
var dwell = 0.5;
var dwell_distance = 4;
var pace = 0.03125;

function Ball(orbit, is_sync) {
  this.orbit = orbit;
  this.is_sync = is_sync;
  this.x = 0;
  this.y = 0;
  // default to be set later.
  this.color = 0;
  this.updatePosition = function(keyframe_count) {
    // get position
    var pos = Pos(this.orbit, keyframe_count, this.is_sync);

    var source_x, dest_x, peak_x, peak_y;
    // how far into this parabola we are
    var progress;
    // how long we plan to spend in this prabola
    var duration;

    // figure out if we're in the throw or the dwell
    if (pos.time + pos.hold + dwell < pos.toss) {
      // doing a throw
      duration = pos.toss - dwell - pos.hold;
      progress = pos.time;
      source_x = throw_x[pos.toss_lhs];
      dest_x = catch_x[pos.catch_lhs];
      peak_y = duration * duration;

      peak_x = (source_x + dest_x) / 2;
      this.x = source_x + ((dest_x - source_x) * progress / duration);
      this.y = peak_y * ((this.x-source_x)*(this.x-dest_x)) /
        ((peak_x-source_x)*(peak_x-dest_x));
    } else if (pos.time + dwell < pos.toss) {
      this.x = catch_x[pos.catch_lhs];
      this.y = 0;
    } else {
      // do a dwell from catch to throw
      duration = dwell;
      progress = dwell + pos.time - pos.toss;
      source_x = catch_x[pos.catch_lhs];
      dest_x = throw_x[pos.catch_lhs];
      // make dwell smaller for low throws.
      peak_y = -1 * Math.min(dwell_distance, dwell_distance * pos.max_landing_with / 10);

      peak_x = (source_x + dest_x) / 2;
      this.x = source_x + ((dest_x - source_x) * progress / duration);
      this.y = peak_y * ((this.x-source_x)*(this.x-dest_x)) /
        ((peak_x-source_x)*(peak_x-dest_x));
    }
  };
  this.drawSelf = function(ctx, max_height) {
    var canvas_width = ctx.canvas.clientWidth;
    var canvas_height = ctx.canvas.clientHeight;
    var render_x = (this.x * canvas_width / 200) + (canvas_width / 2);
    var render_y = 0;
    // if max height is small, don't bother scaling because it
    // makes things look stretched out
    var pattern_height = max_height + radius + radius + dwell_distance;
    if (pattern_height < (canvas_height / 10)) {
      render_y = canvas_height - max_height - radius - 10 * (this.y + dwell_distance);
    } else {
      render_y = (max_height + radius - this.y) * canvas_height / pattern_height;
    }
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(render_x, render_y, radius, 0, 2 * Math.PI);
    ctx.fill();
  };
}

// begin animationmanager
var keyframe_count = 0;
var balls = [];
var max_throw = 0;
function StartAnimation() {
  window.requestAnimationFrame(draw);
}

// Updates the animation to start animating new siteswap.
// TODO(jmerm): is updating maxthrow before balls a race?
function setSiteswap(siteswap, color_by_orbit, is_sync) {
  // TODO(jmerm): validate input here?
  max_throw = maxThrow(siteswap, is_sync);
  var new_balls = [];
  var orbits = splitOrbits(siteswap, is_sync);
  for (let orbit of orbits) {
    new_balls.push(new Ball(orbit, is_sync));
  }
  balls = new_balls;
  if (color_by_orbit) {
    recolorByOrbit();
  } else {
    recolorRandomly();
  }
}

function recolorRandomly() {
  for (let ball of balls) {
    ball.color = randomColor({luminosity: 'dark'});
  }
}

function recolorByOrbit() {
  var hues = shuffle(["red", "orange", "yellow", "green", "blue", "purple", "pink", "monochrome"]);

  for (let ball of balls) {
    ball.color = randomColor({luminosity: 'dark', hue: hues[ball.orbit.id % hues.length]});
  }
}

// Draws balls to the canvas when time = timestamp.
var last_draw_time = 0;
function draw(timestamp) {
  var delta = timestamp - last_draw_time;
  last_draw_time = timestamp;
  // on a 60fps screen, each frame should happen about every 16ms.
  keyframe_count += delta * pace / 16;
  var ctx = document.getElementById('canvas').getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height); 
  for (let ball of balls) {
    ball.updatePosition(keyframe_count);
    ball.drawSelf(ctx, (max_throw-dwell) * (max_throw - dwell));
  }

  window.requestAnimationFrame(draw);
}

// end animationmanager

