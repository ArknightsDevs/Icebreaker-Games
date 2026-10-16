// Extracts what 常规项目 takes from the game's activity table (docs/spec/room.md, mode.md): the steps' times and the
// lineup's size, the temporary recruits and the playing styles of the co-op activity act1multi.
// Usage: node tools/extract-activity.js --gamedata <ArknightsGameData checkout>
// Writes packages/mode-regular/data/act1multi.json (the same input gives byte-identical output).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ACTIVITY = 'act1multi';
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'mode-regular', 'data', `${ACTIVITY}.json`);
const ELITE = Object.freeze({ PHASE_0: 0, PHASE_1: 1, PHASE_2: 2 });

/** @param {string} file @returns {any} */
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

/** @param {string} dir */
function commitOf(dir) {
  try { return execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return 'unknown'; }
}

/** The trust percent of favour points (the favour table's frames: the last frame at or under them). @param {any} favor @param {number} points */
function trustOf(favor, points) {
  let pct = 0;
  for (const f of favor.favorFrames) if (f.data.favorPoint <= points) pct = Math.max(pct, f.data.percent);
  return pct;
}

/** A blackboard as [key, value or text] pairs in order. @param {any[]} bb */
const board = (bb) => bb.map((b) => [b.key, b.valueStr ?? b.value]);

/** @param {string} root */
export function extract(root) {
  const excel = join(root, 'zh_CN', 'gamedata', 'excel');
  const a = readJson(join(excel, 'activity_table.json')).activity.MULTIPLAY_V3[ACTIVITY], favor = readJson(join(excel, 'favor_table.json'));
  const steps = Object.fromEntries(a.selectStepDataList.map((/** @type {any} */ s) => [s.stepType, { title: s.title, seconds: s.time }]));
  return {
    source: { repo: 'Kengxxiao/ArknightsGameData', commit: commitOf(root), file: 'zh_CN/gamedata/excel/activity_table.json', activity: `MULTIPLAY_V3/${ACTIVITY}` },
    lineup: { min: a.constData.squadMinNum, max: a.constData.squadMaxNum },
    steps,
    classes: Object.fromEntries(Object.values(a.mapDiffDataDict).map((/** @type {any} */ d) => [d.diffType, d.name])),
    stages: Object.fromEntries(Object.values(a.mapTypeDataDict).filter((/** @type {any} */ t) => t.mode === 'NORMAL')
      .flatMap((/** @type {any} */ t) => t.stageIdInModeList.map((/** @type {string} */ id) => [id, t.difficulty])).sort((x, y) => (x[0] < y[0] ? -1 : 1))),
    recruits: a.tempCharDataList.map((/** @type {any} */ c) => ({
      id: c.charId, elite: ELITE[/** @type {keyof typeof ELITE} */ (c.evolvePhase)], level: c.level, potential: c.potentialRank + 1, trust: trustOf(favor, c.favorPoint),
      skillLevel: c.mainSkillLevel + c.specializeLevel,
    })),
    styles: a.squadEffectList.map((/** @type {any} */ s) => ({
      id: s.id, name: s.name, color: s.themeColor, buff: s.buffDesc, debuff: s.debuffDesc,
      device: { name: s.token.name, desc: s.token.desc },
      runes: s.runeData.runes.map((/** @type {any} */ r) => ({ key: r.key, professions: r.selector.professionMask, board: board(r.blackboard) })),
    })),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--gamedata'), root = i >= 0 ? process.argv[i + 1] : process.env['AUE_GAMEDATA'];
  if (!root) throw new Error('--gamedata <dir> (or AUE_GAMEDATA) is required');
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(extract(root), null, 1)}\n`);
  console.log(`wrote ${OUT}`);
}
