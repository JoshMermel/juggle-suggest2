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
      var height = toss;
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
function printSiteswapAsOrbits(siteswap, is_sync) {
  var orbits = splitOrbits(siteswap, is_sync);
  console.log(orbits);
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
function Orbit(toss_seq, offset, is_sync) {
  while (offset > toss_seq[toss_seq.length - 1]) {
    offset -= toss_seq[toss_seq.length - 1];
    toss_seq.unshift(toss_seq.pop());
  }

  this.toss_seq = toss_seq;
  this.offset = offset;
  this.start_lhs = true;

  if (this.offset % 2 === 1) {
    this.start_lhs = false;
    if(is_sync) {
      this.offset -= 1;
    }
  }
}

// Splits a sitswap into a list of Orbits.
// Each orbit represents a 1 ball siteswap.
// If all orbits are played on top of each other at the correct offsets, the
// result will look like the original siteswap.
// destroys the input.
function splitOrbits(siteswap, is_sync) {
  var ret = [];
  var toss_seq, first, steal, newindex;

  while (firstNonempty(siteswap) != -1) {
    toss_seq = [];
    first = firstNonempty(siteswap);
    newindex = first;

    do {
      steal = siteswap[newindex].pop();
      toss_seq.push(steal);
      newindex = (newindex + steal) % siteswap.length;
    } while (newindex != first);

    var num_balls = arraysum(toss_seq) / siteswap.length;
    for (let i = 0; i < num_balls; i++) {
      ret.push(new Orbit(Array.from(toss_seq), first, is_sync));
      first += siteswap.length;
    }
  }

  return ret;
}

// applies a toss to pos
// updates the height of the toss
// updates whether the next throw is lhs
function applyToss(orbit, index, pos, is_sync) {
  var toss = orbit.toss_seq[index];
  pos.catch_lhs = (pos.toss_lhs && toss % 2 === 0) ||
                  (!pos.toss_lhs && toss % 2 === 1);

  // sync odd numbers represent crossing evens.
  if (toss % 2 === 1) {
    if (is_sync) {
      if (pos.toss_lhs) {
        toss -= 1;
      } else {
        toss += 1;
      }
    }
    pos.toss_lhs = !pos.toss_lhs;
  }
  pos.toss = toss;
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

  // Makes sure time doesn't go negative
  ret.time -= orbit.offset;
  ret.time = mod(ret.time, 2 * arraysum(orbit.toss_seq));

  // figure out which toss of the toss seq we are on
  var toss_index = 0;
  while (ret.time >= 0) {
    applyToss(orbit, toss_index, ret, is_sync);
    ret.time -= ret.toss;
    toss_index = (toss_index + 1) % orbit.toss_seq.length;
  }
  // When we exit the loop, we've found the point that would be too far so we
  // need to undo changes from the loop a tiny bit.
  ret.time += ret.toss;
  if (orbit.toss_seq[mod(toss_index - 1, orbit.toss_seq.length)] % 2 === 1) {
    ret.toss_lhs = !ret.toss_lhs;
  }
  
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
var pace = 0.0625;

function Ball(orbit, is_sync) {
  this.orbit = orbit;
  this.is_sync = is_sync;
  this.x = 0;
  this.y = 0;
  this.color = randomColor({luminosity: 'dark'});
  this.updatePosition = function(keyframe_count) {
    // get position
    var pos = Pos(this.orbit, keyframe_count, this.is_sync);

    var source_x, dest_x, peak_x, peak_y;
    // how far into this parabola we are
    var progress;
    // how long we plan to spend in this prabola
    var duration;

    // figure out if we're in the throw or the dwell
    if (pos.time + dwell < pos.toss) {
      // doing a throw
      duration = pos.toss - dwell;
      progress = pos.time;
      source_x = throw_x[pos.toss_lhs];
      dest_x = catch_x[pos.catch_lhs];
      peak_y = duration * duration;

      peak_x = (source_x + dest_x) / 2;
      this.x = source_x + ((dest_x - source_x) * progress / duration);
      this.y = peak_y * ((this.x-source_x)*(this.x-dest_x)) /
        ((peak_x-source_x)*(peak_x-dest_x));
    } else {
      // do a dwell from catch to throw
      duration = dwell;
      progress = dwell + pos.time - pos.toss;
      source_x = catch_x[pos.catch_lhs]
      dest_x = throw_x[pos.catch_lhs]
      // make dwell smaller for low throws.
      //peak_y = -1 * Math.min(dwell_distance, dwell_distance * pos.toss / 10);
      peak_y = -1 * dwell_distance;

      peak_x = (source_x + dest_x) / 2;
      this.x = source_x + ((dest_x - source_x) * progress / duration);
      this.y = peak_y * ((this.x-source_x)*(this.x-dest_x)) /
        ((peak_x-source_x)*(peak_x-dest_x));
    }
  }
  this.drawSelf = function(ctx, max_height) {
    var canvas_width = ctx.canvas.clientWidth;
    var canvas_height = ctx.canvas.clientHeight;
    var render_x = this.x + (canvas_width / 2);
    var render_y = 0;
    // if max height is small, don't bother scaling because it
    // makes things look stretched out
    var pattern_height = max_height + radius + radius + dwell_distance;
    if (pattern_height < (canvas_height / 8)) {
      render_y = canvas_height - max_height - radius - 8 * (this.y + dwell_distance);
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
function setSiteswap(siteswap, is_sync) {
  // TODO(jmerm): validate input here?
  max_throw = maxThrow(siteswap, is_sync);
  var new_balls = [];
  var orbits = splitOrbits(siteswap, is_sync);
  for (let orbit of orbits) {
    new_balls.push(new Ball(orbit, is_sync));
  }
  balls = new_balls;
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

