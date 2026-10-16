// What 常规项目 takes from the activity table (docs/spec/room.md): the MVP's projects and their classes, the steps'
// times, the lineup's size, the temporary recruits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIVITY, PROJECTS, STEP_MS, LINEUP, recruitEntries, STYLES, DEFAULT_STYLE, styleRunes, MISSIONS, DETAILS, PLAYER_TITLE, PINGS } from '../src/index.js';

test('[房间-2] the MVP projects: IG-1 and IG-10 in 初级赛, IG-S-2 in 特级赛, at the normal difficulty', () => {
  assert.deepEqual(PROJECTS.map((p) => [p.level, p.difficulty, p.className]), [
    ['act1multi_01', 'NORMAL', '初级赛'], ['act1multi_06', 'NORMAL', '初级赛'], ['act1multi_hard-02', 'NORMAL', '特级赛'],
  ]);
  assert.equal(ACTIVITY.source.activity, 'MULTIPLAY_V3/act1multi');
});

test('[房间-2] [房间-4] [房间-5] the steps\' times and the lineup\'s size from the activity table', () => {
  assert.deepEqual(STEP_MS, { confirm: 30_000, pick: 20_000, lineup: 60_000 });
  assert.deepEqual(LINEUP, { min: 6, max: 10 });
});

test('[页面-6] each project\'s missions in their order and its description, the game\'s markup as rich text', () => {
  assert.deepEqual(MISSIONS['act1multi_01'], ['保护4位乌萨斯平民进入目标点', '保护3位乌萨斯平民进入目标点', '保护5位乌萨斯平民进入目标点']);
  for (const p of PROJECTS) assert.equal(MISSIONS[p.level]?.length, 3, p.level);
  assert.match(DETAILS['act1multi_06'], /他们人多。\n<color=#D4133C><玉门天灾工事><\/color>置于其中/);
});

test("[页面-6] the name cards' title of a player who chose none, and the latency texts by threshold in the game's colours", () => {
  assert.equal(PLAYER_TITLE, '平凡的博士');
  assert.deepEqual(PINGS.map((p) => p.from), [1, 60, 200]);
  assert.equal(PINGS[0]?.text, '当前延迟<color=#7fa826>{0}</color>ms');
});

test('[房间-5] the 5 temporary recruits: E2 level 80, potential 1, trust 200%, each skill at level 7 with mastery 3', () => {
  const e = recruitEntries((id) => (id === 'char_508_aguard' ? 2 : 1));
  assert.deepEqual(e.map((x) => x.id), ['char_508_aguard', 'char_511_asnipe', 'char_509_acast', 'char_510_amedic', 'char_513_apionr']);
  assert.deepEqual(e[0], { id: 'char_508_aguard', elite: 2, level: 80, potential: 1, trust: 200, skills: [10, 10], modules: [] });
  assert.deepEqual(e[1].skills, [10]);
});

test('[房间-3] [房间-6] the five play styles with their carried units and their runes as a match carries them; 基础 when none is chosen', () => {
  assert.deepEqual(STYLES.map((s) => [s.id, s.name, s.device.key]), [
    ['buff_1', '基础', 'trap_201_muulco'], ['buff_2', '驻场', 'trap_197_muulwr'], ['buff_3', '游走', 'trap_198_muulas'],
    ['buff_4', '攻坚', 'trap_199_muulrg'], ['buff_5', '支援', 'trap_200_muulcl'],
  ]);
  assert.equal(DEFAULT_STYLE, 'buff_1');
  assert.deepEqual(styleRunes('buff_1'), [
    { key: 'char_attribute_mul', professions: 639, board: [['atk', 1.1]] },
    { key: 'insert_token_card', professions: 384, board: [['token_key', 'trap_201_muulco'], ['level', 1], ['skill', 0], ['count', 1], ['skill_level', 1]] },
  ]);
  assert.equal(styleRunes('buff_9'), null);
});
