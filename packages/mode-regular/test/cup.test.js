// 阵地足球锦标 (docs/spec/room.md 房间-15): the stages by zone from the activity data, which opens after which, the
// special operators, the lineup's rules and the deck it makes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CUP_NAME, CUP_ZONES, CUP_STAGES, CUP_LEVELS, CUP_LINEUP, CUP_NPCS, CUP_TUTORIAL, cupStage, cupOpen, cupNpcEntries, lineupProblem, cupDeck } from '../src/index.js';

/** A well-formed box entry. @param {string} id */
const entry = (id) => ({ id, elite: 2, level: 90, potential: 1, trust: 100, skills: [10, 10, 10], modules: [0, 2] });

test('[房间-15] the 14 stages by zone (晋级赛, 淘汰赛, 特训赛) with their levels, codes, teams and training effects', () => {
  assert.equal(CUP_NAME, '阵地足球锦标');
  assert.deepEqual(CUP_ZONES.map((z) => z.name), ['晋级赛', '淘汰赛', '特训赛']);
  assert.deepEqual(CUP_STAGES.map((s) => s.code), ['PF-TR-1', 'PF-1', 'PF-2', 'PF-3', 'PF-4', 'PF-5', 'PF-6', 'PF-7', 'PF-EX-1', 'PF-EX-2', 'PF-EX-3', 'PF-EX-4', 'PF-S-1', 'PF-S-2']);
  assert.deepEqual(CUP_ZONES.map((z) => CUP_STAGES.filter((s) => s.zone === z.id).length), [8, 4, 2]);
  assert.deepEqual([cupStage('act1football_s01')?.level, cupStage('act1football_sub-1-2')?.stage, cupStage('act1multi_01')], ['act1football_sub-1-1', 'act1football_s02', null]);
  assert.equal(CUP_LEVELS.length, 14);
  assert.deepEqual([cupStage('act1football_01')?.ours.name, cupStage('act1football_01')?.theirs.name, cupStage('act1football_ex04')?.theirs.name], ['罗德岛队', '业余组', '魔球帮']);
  assert.deepEqual(CUP_STAGES.filter((s) => s.buff).map((s) => [s.code, s.buff?.name]), [['PF-S-1', '体能充沛'], ['PF-S-2', '技艺精湛']]);
  assert.deepEqual(CUP_STAGES.filter((s) => s.predefined).map((s) => s.code), ['PF-TR-1'], 'the training stage brings no lineup');
  assert.ok(Object.keys(CUP_TUTORIAL.stories).length > 0, 'PF-TR-1 tells its stories');
});

test('[房间-15] a stage opens once the stages of the event before it are cleared', () => {
  const at = (/** @type {string} */ code) => /** @type {any} */ (CUP_STAGES.find((s) => s.code === code));
  assert.equal(cupOpen(at('PF-TR-1'), []), true, 'open from the start');
  assert.deepEqual(['PF-1', 'PF-S-1', 'PF-S-2'].map((c) => cupOpen(at(c), [])), [false, false, false]);
  assert.deepEqual(['PF-1', 'PF-2', 'PF-S-1', 'PF-S-2'].map((c) => cupOpen(at(c), ['act1football_tr01'])), [true, false, true, true]);
  assert.equal(cupOpen(at('PF-EX-1'), ['act1football_06']), false);
  assert.equal(cupOpen(at('PF-EX-1'), ['act1football_07']), true, '淘汰赛 after PF-7');
});

test('[房间-15] the six special operators: elite 2, level 90, every skill at 专精3', () => {
  assert.deepEqual(CUP_NPCS, ['char_613_acmedc', 'char_611_acnipe', 'char_612_accast', 'char_615_acspec', 'char_608_acpion', 'char_610_acfend']);
  const e = cupNpcEntries(() => 3);
  assert.deepEqual(e[0], { id: 'char_613_acmedc', elite: 2, level: 90, potential: 1, trust: 200, skills: [10, 10, 10], modules: [] });
  assert.equal(lineupProblem(e.map((x) => ({ e: x, skill: 2, module: -1 })), /** @type {any} */ (cupStage('act1football_01'))), null);
});

test('[房间-15] a lineup: none on PF-TR-1; else 1–12 well-formed operators, each once, with a skill and module slot', () => {
  const tr = /** @type {any} */ (cupStage('act1football_tr01')), pf1 = /** @type {any} */ (cupStage('act1football_01'));
  const pick = (/** @type {string} */ id, skill = 0, module = -1) => ({ e: entry(id), skill, module });
  assert.equal(lineupProblem([], tr), null);
  assert.match(String(lineupProblem([pick('char_002_amiya')], tr)), /takes no lineup/);
  assert.match(String(lineupProblem([], pf1)), /1–12/);
  assert.equal(lineupProblem([pick('char_002_amiya', 2, 1)], pf1), null);
  const thirteen = Array.from({ length: CUP_LINEUP + 1 }, (_, i) => pick(`char_${100 + i}_op`));
  assert.match(String(lineupProblem(thirteen, pf1)), /1–12/);
  assert.equal(lineupProblem(thirteen.slice(0, CUP_LINEUP), pf1), null);
  assert.match(String(lineupProblem([pick('char_002_amiya'), pick('char_002_amiya')], pf1)), /twice/);
  assert.match(String(lineupProblem([pick('char_002_amiya', 3)], pf1)), /slot/);
  assert.match(String(lineupProblem([{ e: entry('char_002_amiya'), skill: 0 }], pf1)), /\{ e, skill, module \}/);
  assert.match(String(lineupProblem([{ e: { ...entry('char_002_amiya'), level: 'x' }, skill: 0, module: -1 }], pf1)), /./);
  // the deck: each operator's training with the chosen skill and module (a module not unlocked is none)
  assert.deepEqual(cupDeck([pick('char_002_amiya', 1, 1), pick('char_003_kalts', -1, 0)]), [
    { id: 'char_002_amiya', build: { elite: 2, level: 90, potential: 1, trust: 100, skill: 1, skillLevel: 10, module: 1, moduleLevel: 2 } },
    { id: 'char_003_kalts', build: { elite: 2, level: 90, potential: 1, trust: 100, skill: -1, skillLevel: 1 } },
  ]);
});
