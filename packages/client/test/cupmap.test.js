// 阵地足球锦标's own pages (docs/spec/page.md 页面-11): each stage's and zone's state, the stage a map scrolls to, where
// a stage's button sits, the score board's digits, the trophy, the lineup's slots, the cup pack merged into the lobby
// pack, the result's texts, a newcomer's module, a cup result kept for the room page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CUP_STAGES } from '@icebreaker/mode-regular';
import { CUP_SCREENS, stageState, zoneStages, zoneOpen, zonesOf, firstStage, slotOf, digits, trophyOf, slotsOf } from '../src/cupmap.js';
import { mergeCup, cupSprites } from '../src/cuppack.js';
import { timeText, netText } from '../src/lobbycupfinish.js';
import { defaultModule } from '../src/lobbycupsquad.js';
import { resultOf, pageOf, newLocal } from '../src/lobbymap.js';

const at = (/** @type {string} */ code) => /** @type {import('@icebreaker/mode-regular').CupStage} */ (CUP_STAGES.find((s) => s.code === code));

test('[页面-11] stages locked, open or cleared; zones open with one of their stages; a map scrolls to its newest open stage', () => {
  const cleared = ['act1football_tr01', 'act1football_01'];
  assert.deepEqual(['PF-TR-1', 'PF-1', 'PF-2', 'PF-3', 'PF-S-1'].map((c) => stageState(at(c), cleared)), ['cleared', 'cleared', 'open', 'locked', 'open']);
  assert.deepEqual(zonesOf([]).map((z) => [z.name, z.open]), [['晋级赛', true], ['淘汰赛', false], ['特训赛', false]]);
  assert.deepEqual(zonesOf(cleared).map((z) => z.open), [true, false, true]);
  assert.equal(zoneOpen('act1football_zone2', ['act1football_07']), true, '淘汰赛 after PF-7');
  assert.deepEqual(zoneStages('act1football_zone3').map((s) => s.code), ['PF-S-1', 'PF-S-2']);
  assert.equal(firstStage('act1football_zone1', cleared)?.code, 'PF-2', 'the first open one not cleared');
  assert.equal(firstStage('act1football_zone1', [])?.code, 'PF-TR-1');
  const all = CUP_STAGES.map((s) => s.stage);
  assert.equal(firstStage('act1football_zone1', all)?.code, 'PF-7', 'all cleared: the last open one');
  assert.equal(firstStage('act1football_zone2', [])?.code, 'PF-EX-1', 'none open: the first');
});

test('[页面-11] where a stage\'s button sits: the qualifier\'s and the tournament\'s by the stage id, the training\'s by its scene', () => {
  assert.deepEqual(['PF-1', 'PF-EX-2', 'PF-S-1', 'PF-S-2'].map((c) => slotOf(at(c))), ['act1football_01', 'act1football_ex02', 'act1football_sub_1-1', 'act1football_sub_1-2']);
  assert.equal(CUP_SCREENS.zones.length, 3);
});

test('[页面-11] the score board\'s two digits a side; the trophy\'s level and how far the next is; twelve slots', () => {
  assert.deepEqual([digits(5), digits(12), digits(0), digits(120), digits(-1)], [['0', '5'], ['1', '2'], ['0', '0'], ['9', '9'], ['0', '0']]);
  assert.deepEqual(trophyOf(0), { level: 0, max: false, next: 50, fill: 0 });
  assert.deepEqual(trophyOf(125), { level: 2, max: false, next: 150, fill: 0.5 });
  assert.deepEqual(trophyOf(99999), { level: 55, max: true, next: 2750, fill: 1 });
  const s = slotsOf([{ id: 'a' }, { id: 'b' }]);
  assert.deepEqual([s.length, s[0]?.id, s[1]?.id, s[2]], [12, 'a', 'b', null]);
});

test('[页面-11] the cup pack joins the lobby pack (the lobby\'s keys stay); its sprites load when the event first opens', async () => {
  const lobby = { screens: { a: 1 }, clips: { c: 1 }, views: {}, sprites: { s: { uri: 'lobby/s.webp' } } };
  const cup = { screens: { 'cup/x': 2, a: 9 }, clips: { d: 2 }, views: { 'cup/x': [] }, sprites: { 'sprite/cup/k': { uri: 'cup/k.webp' } }, art: { kv: {} }, strings: { S: 't' } };
  assert.equal(mergeCup(lobby, null), false);
  assert.equal(mergeCup(lobby, cup), true);
  assert.deepEqual([lobby.screens, lobby.clips, Object.keys(lobby.sprites)], [{ a: 1, 'cup/x': 2 }, { c: 1, d: 2 }, ['s']]);
  /** @type {string[]} */
  const loaded = [];
  class FakeImage { onload = () => {}; onerror = () => {}; set src(/** @type {string} */ v) { loaded.push(v); this.onload(); } }
  const imgs = new Map(), ui = { ctx: { pack: lobby, imgs } };
  await Promise.all([cupSprites(ui, { base: 'u/', Image: /** @type {any} */ (FakeImage) }), cupSprites(ui, { base: 'u/', Image: /** @type {any} */ (FakeImage) })]);
  assert.deepEqual([loaded, [...imgs.keys()], Object.keys(lobby.sprites)], [['u/cup/k.webp'], ['sprite/cup/k'], ['s', 'sprite/cup/k']], 'once');
});

test('[页面-11] the result\'s net goals and time; a newcomer\'s module; a cup result kept for the room page', () => {
  assert.deepEqual([netText([5, 2]), netText([1, 3]), netText([2, 2])], ['+3', '-2', '0']);
  assert.equal(timeText(new Date(2026, 9, 30, 9, 5).getTime()), '2026/10/30 09:05');
  const e = (/** @type {number[]} */ modules) => ({ id: 'x', elite: 2, level: 90, potential: 1, trust: 100, skills: [7], modules });
  assert.deepEqual([defaultModule(e([0, 2, 3])), defaultModule(e([3, 3])), defaultModule(e([0])), defaultModule(e([])), defaultModule(null)], [2, 0, -1, -1, -1]);
  const raw = { match: 'm', result: 1, level: 'act1football_02', stamps: [3], cup: { score: [5, 2], gained: 100, points: 860, best: true } };
  assert.deepEqual(resultOf(JSON.stringify(raw))?.cupEnd, { score: [5, 2], gained: 100, points: 860, best: true });
  assert.equal(resultOf(JSON.stringify({ ...raw, cup: { score: [5], gained: 1, points: 1 } }))?.cupEnd, undefined, 'a broken one: none');
  assert.equal(pageOf({ view: null }, { ...newLocal(), cup: true }), 'cup');
  assert.equal(pageOf({ view: { phase: 'setup' } }, { ...newLocal(), cup: true }), 'prepare', 'a room first');
});
