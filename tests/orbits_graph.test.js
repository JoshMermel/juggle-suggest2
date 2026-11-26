import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildOrbitGraphModel, buildOrbitGraphModelFromMhn } from '../orbits_graph.js';
import { parseSiteswap } from '../suggest.js';
import { parseMixed } from '../mhn.js';

describe('orbits_graph', () => {
  it('builds forward, backward, and self-loop arcs for 531', () => {
    const siteswap = parseSiteswap('531', false).siteswap;
    const model = buildOrbitGraphModel(siteswap, false);

    assert.equal(model.tokens.length, 3);
    assert.equal(model.arcs.length, 3);
    assert.equal(model.orbits.length, 2);

    // Beat 0 ('5') -> lands beat 2 (forward above)
    // Beat 1 ('3') -> lands beat 1 (self loop above)
    // Beat 2 ('1') -> lands beat 0 (backward below)
    const types = model.arcs.map(a => a.type);
    assert.deepEqual(types, ['forward', 'self', 'backward']);

    // Beats 0 and 2 belong to the same orbit; beat 1 belongs to the other
    assert.equal(model.arcs[0].orbitId, model.arcs[2].orbitId);
    assert.notEqual(model.arcs[0].orbitId, model.arcs[1].orbitId);
  });

  it('routes multiplex catches to the opening bracket like ambuc/juggling-graph', () => {
    // Valid multiplex pattern 3[11][22] (ups = [1,2,2], downs = [1,2,2])
    const siteswap = parseSiteswap('3[11][22]', false).siteswap;
    const model = buildOrbitGraphModel(siteswap, false);

    assert.equal(model.multiplexBoxes.length, 2);
    assert.equal(model.arcs.length, 5);

    const openBrackets = model.tokens.filter(t => t.text === '[');
    assert.equal(openBrackets.length, 2);

    // Both '1's in [11] (beat 1) land on beat 2 -> x2 must equal opening '[' of [22]
    const throwsFromBeat1 = model.arcs.filter(a => a.fromBeat === 1);
    assert.equal(throwsFromBeat1.length, 2);
    for (const arc of throwsFromBeat1) {
      assert.equal(arc.type, 'forward');
      assert.equal(arc.x2, openBrackets[1].cx);
    }

    // Both '2's in [22] (beat 2) land on beat 1 -> x2 must equal opening '[' of [11]
    const throwsFromBeat2 = model.arcs.filter(a => a.fromBeat === 2);
    assert.equal(throwsFromBeat2.length, 2);
    for (const arc of throwsFromBeat2) {
      assert.equal(arc.type, 'backward');
      assert.equal(arc.x2, openBrackets[0].cx);
    }
    // Distinct starting x1 ensures nested non-overlapping arcs
    assert.notEqual(throwsFromBeat2[0].x1, throwsFromBeat2[1].x1);
  });

  it('builds sync graphs with crossing labels and respects custom orbitColorMap', () => {
    const siteswap = parseSiteswap('(4,2x)(2x,4)', true).siteswap;
    const colorMap = new Map([[0, '#112233'], [1, '#445566'], [2, '#778899']]);
    const model = buildOrbitGraphModel(siteswap, true, colorMap);

    assert.equal(model.arcs.length, 4);
    assert.equal(model.orbits.length, 3);
    assert.ok(model.tokens.some(t => t.text === '2x'));
    assert.ok(model.arcs.every(a => colorMap.get(a.orbitId) === a.color));
  });

  it('handles zero-ball patterns cleanly', () => {
    const model = buildOrbitGraphModel(parseSiteswap('0', false).siteswap, false);
    assert.equal(model.arcs.length, 0);
    assert.equal(model.orbits.length, 0);
  });

  it('builds MHN orbit graphs for *, !, L/R, and mixed sync/async patterns', () => {
    // (4,2x)* has tokens (, 4, ,, 2x, ), * and 2 self-looping orbits (4 has 2 balls, 2x has 1 ball)
    const starModel = buildOrbitGraphModelFromMhn(parseMixed('(4,2x)*'));
    assert.deepEqual(starModel.tokens.map(t => t.text), ['(', '4', ',', '2x', ')', '*']);
    assert.equal(starModel.arcs.length, 2);
    assert.equal(starModel.orbits.length, 2);
    assert.deepEqual(starModel.arcs.map(a => a.type), ['self', 'self']);

    // (3x,4)!3x has tokens (, 3x, ,, 4, ), !, 3x and 2 orbits ([3x, 3x] and [4])
    const bangModel = buildOrbitGraphModelFromMhn(parseMixed('(3x,4)!3x'));
    assert.deepEqual(bangModel.tokens.map(t => t.text), ['(', '3x', ',', '4', ')', '!', '3x']);
    assert.equal(bangModel.arcs.length, 3);
    assert.equal(bangModel.orbits.length, 2);
    assert.deepEqual(bangModel.arcs.map(a => a.type), ['forward', 'self', 'backward']);

    // (3x,2x)!L3 includes the 'L' hand specifier token and valid arcs
    const handModel = buildOrbitGraphModelFromMhn(parseMixed('(3x,2x)!L3'));
    assert.ok(handModel.tokens.some(t => t.text === 'L'));
    assert.ok(handModel.tokens.some(t => t.text === '!'));
    assert.equal(handModel.arcs.length, 3);
  });
});
