// What 常规项目 takes from the activity table (docs/spec/room.md): the MVP's projects and their classes, the steps'
// times, the lineup's size, the temporary recruits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIVITY, PROJECTS, STEP_MS, LINEUP, recruitEntries } from '../src/index.js';

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

test('[房间-5] the 5 temporary recruits: E2 level 80, potential 1, trust 200%, each skill at level 7 with mastery 3', () => {
  const e = recruitEntries((id) => (id === 'char_508_aguard' ? 2 : 1));
  assert.deepEqual(e.map((x) => x.id), ['char_508_aguard', 'char_511_asnipe', 'char_509_acast', 'char_510_amedic', 'char_513_apionr']);
  assert.deepEqual(e[0], { id: 'char_508_aguard', elite: 2, level: 80, potential: 1, trust: 200, skills: [10, 10], modules: [] });
  assert.deepEqual(e[1].skills, [10]);
});
