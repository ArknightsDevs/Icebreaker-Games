// 阵地足球锦标's progress on this browser (docs/spec/room.md 房间-15): read leniently, written back, a stage cleared once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CUP_KEY, readCup, writeCup, emptyCup, clearedWith, wonWith } from '../src/cupsave.js';
import { cupStage } from '@icebreaker/mode-regular';

/** A storage of one map. */
function memory() {
  const m = new Map();
  return /** @type {Storage} */ (/** @type {unknown} */ ({ getItem: (/** @type {string} */ k) => m.get(k) ?? null, setItem: (/** @type {string} */ k, /** @type {string} */ v) => { m.set(k, v); } }));
}

test('[房间-15] the progress: empty at first, kept and read back; what is not well formed is dropped, not the rest', () => {
  const s = memory();
  assert.deepEqual(readCup(s), emptyCup());
  assert.deepEqual(readCup(null), emptyCup());
  const c = clearedWith(clearedWith({ ...emptyCup(), picks: [{ id: 'char_002_amiya', skill: 1, module: -1 }], assist: { id: 'char_017_huang', skill: 2, module: 0 }, relic: 'act1football_relic_01' }, 'act1football_tr01'), 'act1football_tr01');
  assert.deepEqual(c.cleared, ['act1football_tr01'], 'cleared once');
  assert.equal(writeCup(s, c), true);
  assert.deepEqual(readCup(s), c);
  s.setItem(CUP_KEY, JSON.stringify({ cleared: ['act1football_01', 'nope', 3], picks: [{ id: 'char_002_amiya', skill: 9, module: 0 }, { id: 'char_003_kalts', skill: 0, module: -1 }, { id: 'char_003_kalts', skill: 1, module: -1 }], relic: 5 }));
  assert.deepEqual(readCup(s), { v: 1, cleared: ['act1football_01'], picks: [{ id: 'char_003_kalts', skill: 0, module: -1 }], assist: null, relic: '', points: 0, best: {} });
  s.setItem(CUP_KEY, JSON.stringify({ picks: [{ id: 'char_003_kalts', skill: 0, module: -1 }], assist: { id: 'char_003_kalts', skill: 0, module: -1 } }));
  assert.equal(readCup(s).assist, null, 'a support unit also in the lineup: dropped');
  s.setItem(CUP_KEY, JSON.stringify({ assist: { id: 'char_017_huang', skill: 7, module: -1 } }));
  assert.equal(readCup(s).assist, null, 'a malformed one: dropped');
  s.setItem(CUP_KEY, '{');
  assert.deepEqual(readCup(s), emptyCup());
});

test('[房间-15] a stage won: cleared, its 锦标积分券 (and its first-win ones on the first), its best score kept; kept and read back', () => {
  const pf1 = /** @type {import('@icebreaker/mode-regular').CupStage} */ (cupStage('act1football_01'));
  const first = wonWith(emptyCup(), pf1, [3, 1]);
  assert.deepEqual([first.gained, first.save.points, first.save.cleared, first.save.best], [100, 100, ['act1football_01'], { act1football_01: [3, 1] }], '25 + 75');
  const again = wonWith(first.save, pf1, [5, 4]);
  assert.deepEqual([again.gained, again.save.points, again.save.best.act1football_01], [25, 125, [3, 1]], 'a smaller lead keeps the best');
  const better = wonWith(again.save, pf1, [5, 3]);
  assert.deepEqual(better.save.best.act1football_01, [5, 3], 'the same lead, more goals');
  const tr = wonWith(emptyCup(), /** @type {any} */ (cupStage('act1football_tr01')), [1, 0]);
  assert.equal(tr.gained, 0, 'the training stage gives none');
  const s = memory();
  writeCup(s, better.save);
  assert.deepEqual(readCup(s), better.save);
  s.setItem(CUP_KEY, JSON.stringify({ points: -3, best: { act1football_01: [1, 'x'], nope: [1, 0], act1football_02: [2, 1] } }));
  assert.deepEqual([readCup(s).points, readCup(s).best], [0, { act1football_02: [2, 1] }], 'what is not well formed is dropped');
});
