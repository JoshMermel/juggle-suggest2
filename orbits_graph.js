import { decomposeOrbits, decomposeMhnOrbits } from './orbits.js';
import { asyncToToss, syncToToss } from './suggest.js';
import {
  LEFT,
  RIGHT,
  destCellForThrow,
  effectiveSwitchRepeat,
  formatMhnThrow,
} from './mhn.js';

// High-contrast default orbit colors (used if no external orbitColorMap is provided).
const DEFAULT_ORBIT_COLORS = [
  '#1f77b4', '#d62728', '#2ca02c', '#9467bd', '#ff7f0e',
  '#17becf', '#e377c2', '#8c564b', '#bcbd22', '#393b79',
];

function formatTossLabel(rawToss, beatIndex, is_sync) {
  if (!is_sync) {
    return asyncToToss(rawToss);
  }
  const oddMod = beatIndex % 2 === 0 ? -1 : 1;
  return syncToToss(rawToss, oddMod);
}

// Pure layout builder for a juggling-graph SVG diagram in the style of
// ambuc/juggling-graph (jbuckland.com/juggling-graph):
// - Horizontal siteswap expression with shaded multiplex [ ... ] boxes
// - Forward throws arc ABOVE, wrap-around throws arc BELOW, self-throws loop ABOVE
// - Multiplex beats throw from their individual digits and catch at their opening '['
// - Per-orbit coloring synced with the animator
export function buildOrbitGraphModel(siteswap, is_sync, orbitColorMap = null, decomposed = null) {
  if (!siteswap || siteswap.length === 0) {
    return {
      width: 120,
      height: 80,
      rowY: 40,
      rowHeight: 28,
      tokens: [],
      multiplexBoxes: [],
      arcs: [],
      orbits: [],
    };
  }

  const { orbitSummaries, throwOrbitIds } = decomposed || decomposeOrbits(siteswap, is_sync);

  const colorForOrbit = (orbitId) => {
    if (orbitColorMap && orbitColorMap.has(orbitId)) {
      return orbitColorMap.get(orbitId);
    }
    return DEFAULT_ORBIT_COLORS[orbitId % DEFAULT_ORBIT_COLORS.length];
  };

  const tokens = [];
  const multiplexBoxes = [];
  const landingX = new Array(siteswap.length);

  const PAD_X = 18;
  const ROW_H = 26;
  let cursorX = PAD_X;

  const pushToken = (kind, text, width, extra = {}) => {
    const tok = {
      kind,
      text,
      x: cursorX,
      width,
      cx: cursorX + width / 2,
      beatIndex: extra.beatIndex ?? -1,
      throwIndex: extra.throwIndex ?? -1,
      rawToss: extra.rawToss ?? 0,
      orbitId: extra.orbitId ?? -1,
    };
    tokens.push(tok);
    cursorX += width;
    return tok;
  };

  const emitBeat = (b) => {
    const throws = siteswap[b];
    if (throws.length > 1) {
      const boxStart = cursorX;
      const openTok = pushToken('punct', '[', 14, { beatIndex: b });
      landingX[b] = openTok.cx;
      for (let j = 0; j < throws.length; j++) {
        const label = formatTossLabel(throws[j], b, is_sync);
        const w = label.length > 1 ? 28 : 22;
        pushToken('throw', label, w, {
          beatIndex: b,
          throwIndex: j,
          rawToss: throws[j],
          orbitId: throwOrbitIds[b][j],
        });
      }
      pushToken('punct', ']', 14, { beatIndex: b });
      multiplexBoxes.push({ x: boxStart, width: cursorX - boxStart, beatIndex: b });
    } else if (throws.length === 1) {
      const label = formatTossLabel(throws[0], b, is_sync);
      const w = label.length > 1 ? 30 : 24;
      const tok = pushToken('throw', label, w, {
        beatIndex: b,
        throwIndex: 0,
        rawToss: throws[0],
        orbitId: throwOrbitIds[b][0],
      });
      landingX[b] = tok.cx;
    }
  };

  if (is_sync) {
    for (let b = 0; b < siteswap.length; b += 2) {
      pushToken('punct', '(', 12);
      emitBeat(b);
      pushToken('punct', ',', 10);
      if (b + 1 < siteswap.length) {
        emitBeat(b + 1);
      }
      pushToken('punct', ')', 12);
    }
  } else {
    for (let b = 0; b < siteswap.length; b++) {
      emitBeat(b);
    }
  }

  const totalWidth = Math.max(120, cursorX + PAD_X);

  // First pass: compute arc dimensions to determine exact top/bottom vertical margins.
  const pendingArcs = [];
  let maxTopArc = 16;
  let maxBottomArc = 16;
  const MAX_ARC_RY = 76;

  for (const tok of tokens) {
    if (tok.kind !== 'throw' || tok.rawToss === 0) {
      continue;
    }
    const destBeat = (tok.beatIndex + tok.rawToss) % siteswap.length;
    const x1 = tok.cx;
    const x2 = landingX[destBeat];
    const color = colorForOrbit(tok.orbitId);

    if (destBeat === tok.beatIndex && Math.abs(x2 - x1) < 1) {
      const loopH = 28;
      maxTopArc = Math.max(maxTopArc, loopH);
      pendingArcs.push({
        type: 'self',
        x1,
        x2,
        loopH,
        orbitId: tok.orbitId,
        color,
        fromBeat: tok.beatIndex,
        toBeat: destBeat,
        label: tok.text,
      });
    } else if (x2 > x1) {
      const rx = (x2 - x1) / 2;
      const ry = Math.min(MAX_ARC_RY, Math.max(20, rx * 0.68));
      maxTopArc = Math.max(maxTopArc, ry);
      pendingArcs.push({
        type: 'forward',
        x1,
        x2,
        rx,
        ry,
        orbitId: tok.orbitId,
        color,
        fromBeat: tok.beatIndex,
        toBeat: destBeat,
        label: tok.text,
      });
    } else {
      const rx = (x1 - x2) / 2;
      const ry = Math.min(MAX_ARC_RY, Math.max(20, rx * 0.68));
      maxBottomArc = Math.max(maxBottomArc, ry);
      pendingArcs.push({
        type: 'backward',
        x1,
        x2,
        rx,
        ry,
        orbitId: tok.orbitId,
        color,
        fromBeat: tok.beatIndex,
        toBeat: destBeat,
        label: tok.text,
      });
    }
  }

  const PAD_Y = 14;
  const rowTop = Math.ceil(PAD_Y + maxTopArc);
  const rowY = rowTop + ROW_H / 2;
  const rowBottom = rowTop + ROW_H;
  const totalHeight = Math.ceil(rowBottom + maxBottomArc + PAD_Y);

  // Second pass: build SVG path strings using computed rowTop/rowBottom.
  const arcs = pendingArcs.map(arc => {
    let d;
    if (arc.type === 'self') {
      const y = rowTop - 2;
      d = `M ${arc.x1 - 2.5} ${y} C ${arc.x1 - 16} ${y - arc.loopH}, ${arc.x1 + 14} ${y - arc.loopH}, ${arc.x1 + 2.5} ${y - 2}`;
    } else if (arc.type === 'forward') {
      const y = rowTop - 2;
      d = `M ${arc.x1} ${y} A ${arc.rx} ${arc.ry} 0 0 1 ${arc.x2} ${y - 3}`;
    } else {
      const y = rowBottom + 2;
      d = `M ${arc.x1} ${y} A ${arc.rx} ${arc.ry} 0 0 1 ${arc.x2} ${y + 3}`;
    }
    return { ...arc, d };
  });

  const orbits = orbitSummaries.map(summary => ({
    id: summary.id,
    balls: summary.balls,
    color: colorForOrbit(summary.id),
    labels: summary.tossSeq.map((t, idx) => formatTossLabel(t, summary.beatSeq[idx], is_sync)),
  }));

  return {
    width: totalWidth,
    height: totalHeight,
    rowTop,
    rowY,
    rowBottom,
    rowHeight: ROW_H,
    tokens,
    multiplexBoxes,
    arcs,
    orbits,
  };
}

// Pure layout builder for a juggling-graph SVG diagram directly from an MHN pattern.
// Supports pure async, pure sync, '*', '!', 'L'/'R', async 'x', odd-in-sync, and mixed transitions.
export function buildOrbitGraphModelFromMhn(mhn, orbitColorMap = null, decomposed = null) {
  if (!mhn || mhn.period === 0 || !mhn.items || mhn.items.length === 0) {
    return {
      width: 120,
      height: 80,
      rowY: 40,
      rowHeight: 28,
      tokens: [],
      multiplexBoxes: [],
      arcs: [],
      orbits: [],
    };
  }

  const { orbitSummaries, throwOrbitIds } = decomposed || decomposeMhnOrbits(mhn);
  const sr = effectiveSwitchRepeat(mhn);

  const colorForOrbit = (orbitId) => {
    if (orbitColorMap && orbitColorMap.has(orbitId)) {
      return orbitColorMap.get(orbitId);
    }
    return DEFAULT_ORBIT_COLORS[orbitId % DEFAULT_ORBIT_COLORS.length];
  };

  const tokens = [];
  const multiplexBoxes = [];
  const landingX = [new Array(mhn.period), new Array(mhn.period)];

  const PAD_X = 18;
  const ROW_H = 26;
  let cursorX = PAD_X;

  const pushToken = (kind, text, width, extra = {}) => {
    const tok = {
      kind,
      text,
      x: cursorX,
      width,
      cx: cursorX + width / 2,
      hand: extra.hand ?? -1,
      beatIndex: extra.beatIndex ?? -1,
      throwIndex: extra.throwIndex ?? -1,
      value: extra.value ?? 0,
      crosses: extra.crosses ?? false,
      orbitId: extra.orbitId ?? -1,
    };
    tokens.push(tok);
    cursorX += width;
    return tok;
  };

  const emitCell = (hand, beat, forceMultiplex = false) => {
    const throws = mhn.cells[hand][beat] || [];
    if (throws.length === 0) {
      const tok = pushToken('throw', '0', 22, {
        hand,
        beatIndex: beat,
        throwIndex: 0,
        value: 0,
        crosses: false,
        orbitId: -1,
      });
      landingX[hand][beat] = tok.cx;
      return;
    }

    if (forceMultiplex || throws.length > 1) {
      const boxStart = cursorX;
      const openTok = pushToken('punct', '[', 14, { hand, beatIndex: beat });
      landingX[hand][beat] = openTok.cx;
      for (let j = 0; j < throws.length; j++) {
        const thr = throws[j];
        const label = formatMhnThrow(thr);
        const w = label.length > 1 ? 28 : 22;
        pushToken('throw', label, w, {
          hand,
          beatIndex: beat,
          throwIndex: j,
          value: thr.value,
          crosses: thr.crosses,
          orbitId: throwOrbitIds[hand][beat][j],
        });
      }
      pushToken('punct', ']', 14, { hand, beatIndex: beat });
      multiplexBoxes.push({ x: boxStart, width: cursorX - boxStart, beatIndex: beat, hand });
    } else {
      const thr = throws[0];
      const label = formatMhnThrow(thr);
      const w = label.length > 1 ? 30 : 24;
      const tok = pushToken('throw', label, w, {
        hand,
        beatIndex: beat,
        throwIndex: 0,
        value: thr.value,
        crosses: thr.crosses,
        orbitId: throwOrbitIds[hand][beat][0],
      });
      landingX[hand][beat] = tok.cx;
    }
  };

  for (const item of mhn.items) {
    if (item.kind === 'hand') {
      pushToken('punct', item.text, 16);
    } else if (item.kind === 'star') {
      pushToken('punct', '*', 14);
    } else if (item.kind === 'async') {
      emitCell(item.hand, item.beat, item.isMultiplex && (mhn.cells[item.hand][item.beat]?.length || 0) > 1);
    } else if (item.kind === 'sync') {
      pushToken('punct', '(', 12);
      emitCell(LEFT, item.beat);
      pushToken('punct', ',', 10);
      emitCell(RIGHT, item.beat);
      pushToken('punct', ')', 12);
      if (item.hasBang) {
        pushToken('punct', '!', 10);
      }
    }
  }

  const totalWidth = Math.max(120, cursorX + PAD_X);

  const pendingArcs = [];
  let maxTopArc = 16;
  let maxBottomArc = 16;
  const MAX_ARC_RY = 76;

  for (const tok of tokens) {
    if (tok.kind !== 'throw' || tok.value === 0) {
      continue;
    }
    const { hand: dh, beat: dt } = destCellForThrow(
      tok.hand,
      tok.beatIndex,
      tok.value,
      tok.crosses,
      mhn.period,
      sr
    );
    const x1 = tok.cx;
    const x2 = landingX[dh][dt];
    if (x2 === undefined) {
      continue;
    }
    const color = colorForOrbit(tok.orbitId);

    if (dh === tok.hand && dt === tok.beatIndex && Math.abs(x2 - x1) < 1) {
      const loopH = 28;
      maxTopArc = Math.max(maxTopArc, loopH);
      pendingArcs.push({
        type: 'self',
        x1,
        x2,
        loopH,
        orbitId: tok.orbitId,
        color,
        fromBeat: tok.beatIndex,
        toBeat: dt,
        label: tok.text,
      });
    } else if (x2 > x1) {
      const rx = (x2 - x1) / 2;
      const ry = Math.min(MAX_ARC_RY, Math.max(20, rx * 0.68));
      maxTopArc = Math.max(maxTopArc, ry);
      pendingArcs.push({
        type: 'forward',
        x1,
        x2,
        rx,
        ry,
        orbitId: tok.orbitId,
        color,
        fromBeat: tok.beatIndex,
        toBeat: dt,
        label: tok.text,
      });
    } else {
      const rx = (x1 - x2) / 2;
      const ry = Math.min(MAX_ARC_RY, Math.max(20, rx * 0.68));
      maxBottomArc = Math.max(maxBottomArc, ry);
      pendingArcs.push({
        type: 'backward',
        x1,
        x2,
        rx,
        ry,
        orbitId: tok.orbitId,
        color,
        fromBeat: tok.beatIndex,
        toBeat: dt,
        label: tok.text,
      });
    }
  }

  const PAD_Y = 14;
  const rowTop = Math.ceil(PAD_Y + maxTopArc);
  const rowY = rowTop + ROW_H / 2;
  const rowBottom = rowTop + ROW_H;
  const totalHeight = Math.ceil(rowBottom + maxBottomArc + PAD_Y);

  const arcs = pendingArcs.map(arc => {
    let d;
    if (arc.type === 'self') {
      const y = rowTop - 2;
      d = `M ${arc.x1 - 2.5} ${y} C ${arc.x1 - 16} ${y - arc.loopH}, ${arc.x1 + 14} ${y - arc.loopH}, ${arc.x1 + 2.5} ${y - 2}`;
    } else if (arc.type === 'forward') {
      const y = rowTop - 2;
      d = `M ${arc.x1} ${y} A ${arc.rx} ${arc.ry} 0 0 1 ${arc.x2} ${y - 3}`;
    } else {
      const y = rowBottom + 2;
      d = `M ${arc.x1} ${y} A ${arc.rx} ${arc.ry} 0 0 1 ${arc.x2} ${y + 3}`;
    }
    return { ...arc, d };
  });

  const orbits = orbitSummaries.map(summary => ({
    id: summary.id,
    balls: summary.balls,
    color: colorForOrbit(summary.id),
    labels: summary.throws.map(formatMhnThrow),
  }));

  return {
    width: totalWidth,
    height: totalHeight,
    rowTop,
    rowY,
    rowBottom,
    rowHeight: ROW_H,
    tokens,
    multiplexBoxes,
    arcs,
    orbits,
  };
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, String(v));
  }
  return el;
}

// Renders the juggling-graph SVG + interactive orbit legend into `container`.
export function renderOrbitGraph(container, model) {
  if (!container) {
    return;
  }

  if (!model || model.tokens.length === 0) {
    container.replaceChildren();
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'orbits-graph-wrap';

  const svgWrap = document.createElement('div');
  svgWrap.className = 'orbits-svg-scroll';

  const svg = svgEl('svg', {
    viewBox: `0 0 ${model.width} ${model.height}`,
    width: model.width,
    height: model.height,
    class: 'orbits-svg',
    role: 'img',
    'aria-label': 'Siteswap orbits graph',
  });
  // Keep short patterns at natural 1:1 size and let very wide patterns stay readable
  // (scaling gently down to ~78% before enabling horizontal scroll).
  svg.style.minWidth = `${Math.round(model.width * 0.78)}px`;

  // Define crisp directional arrowheads per unique color
  const defs = svgEl('defs');
  const colorToMarkerId = new Map();
  let markerCounter = 0;
  for (const arc of model.arcs) {
    if (!colorToMarkerId.has(arc.color)) {
      const markerId = `arrow-${markerCounter++}`;
      colorToMarkerId.set(arc.color, markerId);
      const marker = svgEl('marker', {
        id: markerId,
        viewBox: '0 0 10 8',
        refX: '9',
        refY: '4',
        markerWidth: '9',
        markerHeight: '7.5',
        orient: 'auto',
        markerUnits: 'userSpaceOnUse',
      });
      marker.appendChild(svgEl('path', {
        d: 'M 0 1 L 10 4 L 0 7 L 2.5 4 Z',
        fill: arc.color,
      }));
      defs.appendChild(marker);
    }
  }
  svg.appendChild(defs);

  // Subtle token row strip (matching ambuc/juggling-graph's soft pill backdrop)
  const firstTok = model.tokens[0];
  const lastTok = model.tokens[model.tokens.length - 1];
  svg.appendChild(svgEl('rect', {
    x: firstTok.x - 2,
    y: model.rowTop,
    width: (lastTok.x + lastTok.width) - firstTok.x + 4,
    height: model.rowHeight,
    rx: 6,
    fill: '#f4f4f4',
  }));

  // Light-blue multiplex grouping pills (matching ambuc/juggling-graph)
  for (const box of model.multiplexBoxes) {
    svg.appendChild(svgEl('rect', {
      x: box.x,
      y: model.rowTop - 1,
      width: box.width,
      height: model.rowHeight + 2,
      rx: 5,
      fill: '#d4ebf2',
    }));
  }

  // Expression tokens
  const tokGroup = svgEl('g', { class: 'orbits-tokens' });
  for (const tok of model.tokens) {
    const textEl = svgEl('text', {
      x: tok.cx,
      y: model.rowY + 5,
      'text-anchor': 'middle',
      class: tok.kind === 'throw' ? 'orbit-token-throw' : 'orbit-token-punct',
    });
    if (tok.orbitId >= 0) {
      textEl.dataset.orbitId = String(tok.orbitId);
    }
    textEl.textContent = tok.text;
    tokGroup.appendChild(textEl);
  }
  svg.appendChild(tokGroup);

  // Directed orbit arcs
  const arcGroup = svgEl('g', { class: 'orbits-arcs' });
  const arcElements = [];
  for (const arc of model.arcs) {
    const markerId = colorToMarkerId.get(arc.color);
    const path = svgEl('path', {
      d: arc.d,
      fill: 'none',
      stroke: arc.color,
      'stroke-width': '1.6',
      'marker-end': `url(#${markerId})`,
      class: 'orbit-arc',
    });
    path.dataset.orbitId = String(arc.orbitId);
    arcGroup.appendChild(path);
    arcElements.push(path);
  }
  svg.appendChild(arcGroup);

  svgWrap.appendChild(svg);
  wrapper.appendChild(svgWrap);

  // Hover an arc to highlight its entire orbit cycle
  const highlightOrbit = (activeId) => {
    for (const el of arcElements) {
      const match = activeId === null || el.dataset.orbitId === activeId;
      el.classList.toggle('is-dimmed', !match);
      el.classList.toggle('is-highlighted', activeId !== null && match);
    }
  };

  for (const el of arcElements) {
    el.addEventListener('mouseenter', () => highlightOrbit(el.dataset.orbitId));
    el.addEventListener('mouseleave', () => highlightOrbit(null));
  }

  container.replaceChildren(wrapper);
}
