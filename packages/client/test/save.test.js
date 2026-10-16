// The local save (docs/spec/page.md 页面-2): the box, the 常规队, reading and writing, copying out and in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptySave, saveProblem, readSave, writeSave, importSave, exportSave, putEntry, removeEntry, place, squadOf, SAVE_KEY, BAD_SAVE_KEY } from '../src/save.js';

/** @param {number} n */
const entry = (n) => ({ id: `char_${String(100 + n).padStart(3, '0')}_op${n}`, elite: 2, level: 60, potential: 1, trust: 100, skills: [7], modules: [] });
/** A storage in memory. @param {Record<string, string>} [init] */
function memory(init = {}) {
  const m = new Map(Object.entries(init));
  return /** @type {Storage & { m: Map<string, string> }} */ (/** @type {unknown} */ ({ m, getItem: (/** @type {string} */ k) => m.get(k) ?? null, setItem: (/** @type {string} */ k, /** @type {string} */ v) => { m.set(k, v); } }));
}

test('[页面-2] a box entry goes in once, is replaced in place, and leaves the squad when it leaves the box', () => {
  let s = putEntry(putEntry(emptySave(), entry(1)), entry(2));
  s = putEntry(s, { ...entry(1), level: 80 });
  assert.deepEqual(s.box.map((e) => [e.id, e.level]), [[entry(1).id, 80], [entry(2).id, 60]]);
  s = /** @type {any} */ (place(s, entry(1).id, 'high'));
  s = /** @type {any} */ (place(s, entry(2).id, 'low'));
  assert.deepEqual(squadOf(s), { high: [{ ...entry(1), level: 80 }], low: [entry(2)] });
  s = /** @type {any} */ (place(s, entry(1).id, 'low'));
  assert.deepEqual(s.squad, { high: [], low: [entry(2).id, entry(1).id] }, 'moved, not copied');
  s = removeEntry(s, entry(2).id);
  assert.deepEqual([s.box.length, s.squad.low], [1, [entry(1).id]]);
  assert.deepEqual(/** @type {any} */ (place(s, entry(1).id, null)).squad, { high: [], low: [] });
});

test('[页面-2] a full list takes no more: 10 high, 20 low', () => {
  let s = emptySave();
  for (let i = 0; i < 11; i++) s = putEntry(s, entry(i));
  for (let i = 0; i < 10; i++) s = /** @type {any} */ (place(s, entry(i).id, 'high'));
  assert.equal(place(s, entry(10).id, 'high'), null);
  assert.ok(place(s, entry(10).id, 'low'));
});

test('[页面-2] the save reads back what was written; one that is not a save is kept aside and an empty one used', () => {
  const store = memory(), s = /** @type {any} */ (place(putEntry({ ...emptySave(), name: '博士' }, entry(1)), entry(1).id, 'high'));
  assert.equal(writeSave(store, s), true);
  assert.deepEqual(readSave(store), s);
  assert.deepEqual(readSave(memory()), emptySave());
  const bad = memory({ [SAVE_KEY]: '{"v":1,"name":"x","box":[{"id":"nope"}],"squad":{"high":[],"low":[]}}' });
  assert.deepEqual(readSave(bad), emptySave());
  assert.equal(bad.m.get(BAD_SAVE_KEY), bad.m.get(SAVE_KEY), 'kept aside');
  assert.deepEqual(readSave(null), emptySave());
  assert.equal(writeSave(null, s), false);
  const throwing = /** @type {Storage} */ (/** @type {unknown} */ ({ getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } }));
  assert.deepEqual(readSave(throwing), emptySave());
  assert.equal(writeSave(throwing, s), false);
});

test('[页面-2] a save copies out as text and back in; text that is not a save says why', () => {
  const s = putEntry({ ...emptySave(), name: 'A' }, entry(1));
  assert.deepEqual(importSave(exportSave(s)), { save: s });
  assert.deepEqual(importSave('nope'), { error: '不是存档的文本' });
  assert.deepEqual(importSave('{"v":2}'), { error: '不是促融共竞的存档' });
  assert.match(String(saveProblem({ ...s, name: 'x'.repeat(17) })), /16/);
  assert.match(String(saveProblem({ ...s, box: [entry(1), entry(1)] })), /两次/);
  assert.match(String(saveProblem({ ...s, squad: { high: ['char_999_none'], low: [] } })), /box 之外/);
  assert.match(String(saveProblem({ ...s, squad: { high: [] } })), /格式/);
  assert.match(String(saveProblem({ ...s, box: 'x' })), /box/);
});
