import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createPatternStore } from '../storage.js';

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(k, String(v)); },
  };
}

describe('pattern storage (starred & recent)', () => {
  it('stars, unstars, and persists across store instances', () => {
    const backing = createMemoryStorage();
    const store1 = createPatternStore(backing);

    assert.deepEqual(store1.getStarred(), []);
    assert.equal(store1.isStarred('531'), false);

    const added = store1.toggleStar('531');
    assert.equal(added.starred, true);
    assert.deepEqual(added.list, ['531']);
    assert.equal(store1.isStarred('531'), true);

    store1.toggleStar('(4,2x)(2x,4)');
    // New store reading same storage preserves order
    const store2 = createPatternStore(backing);
    assert.deepEqual(store2.getStarred(), ['(4,2x)(2x,4)', '531']);

    const removed = store2.toggleStar('531');
    assert.equal(removed.starred, false);
    assert.deepEqual(removed.list, ['(4,2x)(2x,4)']);
  });

  it('deduplicates and caps recent patterns at 8', () => {
    const backing = createMemoryStorage();
    const store = createPatternStore(backing);

    for (let i = 1; i <= 10; i++) {
      store.recordRecent(`p${i}`);
    }
    assert.equal(store.getRecent().length, 8);
    assert.equal(store.getRecent()[0], 'p10');
    assert.equal(store.getRecent()[7], 'p3');

    // Re-recording an existing entry moves it to front without duplicating
    store.recordRecent('p5');
    assert.equal(store.getRecent().length, 8);
    assert.equal(store.getRecent()[0], 'p5');
  });

  it('degrades gracefully if storage throws or is null', () => {
    const brokenStorage = {
      getItem() { throw new Error('blocked'); },
      setItem() { throw new Error('blocked'); },
    };
    const store = createPatternStore(brokenStorage);
    assert.deepEqual(store.getStarred(), []);
    assert.equal(store.toggleStar('531').starred, true);
    assert.deepEqual(store.recordRecent('531'), ['531']);
  });
});
