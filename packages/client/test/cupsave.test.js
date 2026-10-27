// 阵地足球锦标's progress on this browser (docs/spec/room.md 房间-15): read leniently, written back, a stage cleared once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CUP_KEY, readCup, writeCup, emptyCup, clearedWith } from '../src/cupsave.js';

/** A storage of one map. */
function memory() {
  const m = new Map();
  return /** @type {Storage} */ (/** @type {unknown} */ ({ getItem: (/** @type {string} */ k) => m.get(k) ?? null, setItem: (/** @type {string} */ k, /** @type {string} */ v) => { m.set(k, v); } }));
}

test('[房间-15] the progress: empty at first, kept and read back; what is not well formed is dropped, not the rest', () => {
  const s = memory();
  assert.deepEqual(readCup(s), emptyCup());
  assert.deepEqual(readCup(null), emptyCup());
  const c = clearedWith(clearedWith({ ...emptyCup(), picks: [{ id: 'char_002_amiya', skill: 1, module: -1 }], relic: 'act1football_relic_01' }, 'act1football_tr01'), 'act1football_tr01');
  assert.deepEqual(c.cleared, ['act1football_tr01'], 'cleared once');
  assert.equal(writeCup(s, c), true);
  assert.deepEqual(readCup(s), c);
  s.setItem(CUP_KEY, JSON.stringify({ cleared: ['act1football_01', 'nope', 3], picks: [{ id: 'char_002_amiya', skill: 9, module: 0 }, { id: 'char_003_kalts', skill: 0, module: -1 }, { id: 'char_003_kalts', skill: 1, module: -1 }], relic: 5 }));
  assert.deepEqual(readCup(s), { v: 1, cleared: ['act1football_01'], picks: [{ id: 'char_003_kalts', skill: 0, module: -1 }], relic: '' });
  s.setItem(CUP_KEY, '{');
  assert.deepEqual(readCup(s), emptyCup());
});
