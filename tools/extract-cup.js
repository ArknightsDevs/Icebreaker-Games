// Extracts what 阵地足球锦标 takes from the game's activity table (docs/spec/room.md 房间-15): its zones (晋级赛, 淘汰赛,
// 特训赛), its stages in order — each its level, code, name, zone, description, whether its operators are all the
// level's own (isPredefined), the stages it opens after, the two teams, the training effect it unlocks, the points a win
// and a first win give —, the special operators lent in every match, the stories its levels tell, the points each 锦标奖杯
// level takes and the entry page's key visuals.
// Usage: node tools/extract-cup.js --gamedata <ArknightsGameData checkout>
// Writes packages/mode-regular/data/act1football.json (the same input gives byte-identical output).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { richText, storyOf } from '../packages/mode-regular/src/story.js';

const ACTIVITY = 'act1football';
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

/** A stage's level as the engine names it: its level file's name without `level_`. @param {any} stage */
const levelOf = (stage) => String(stage.levelId).toLowerCase().split('/level_').pop() ?? '';

/**
 * The stories a stage's level tells (its waves' STORY actions), by their path's last part.
 * @param {string} gamedata @param {any} stage @param {Record<string, string>} styles
 */
function storiesOf(gamedata, stage, styles) {
  const level = readJson(join(gamedata, 'levels', `${String(stage.levelId).toLowerCase()}.json`));
  const keys = level.waves.flatMap((/** @type {any} */ w) => w.fragments.flatMap((/** @type {any} */ f) => f.actions.filter((/** @type {any} */ x) => x.actionType === 'STORY').map((/** @type {any} */ x) => x.key)));
  return keys.map((/** @type {string} */ k) => [String(k).split('/').pop() ?? k, storyOf(readFileSync(join(gamedata, 'story', `${String(k).toLowerCase()}.txt`), 'utf8'), styles)]);
}

/** @param {string} root */
export function extract(root) {
  const gamedata = join(root, 'zh_CN', 'gamedata'), excel = join(gamedata, 'excel');
  const table = readJson(join(excel, 'activity_table.json')), a = table.activity.ACT_FOOTBALL[ACTIVITY];
  const stageTable = readJson(join(excel, 'stage_table.json')).stages, styles = readJson(join(excel, 'gamedata_const.json')).richTextStyles;
  const zoneTable = readJson(join(excel, 'zone_table.json')).zones, favor = readJson(join(excel, 'favor_table.json'));
  // the stages in the activity's order (its stage additions), each opening after the stages of this activity its unlock names
  const ids = Object.keys(a.stageAdditionDataMap), own = new Set(ids);
  const stages = ids.map((id) => {
    const s = stageTable[id], add = a.stageAdditionDataMap[id];
    return {
      stage: id, level: levelOf(s), code: s.code, name: s.name, zone: s.zoneId, detail: richText(s.description ?? '', styles), predefined: s.isPredefined === true,
      after: s.unlockCondition.map((/** @type {any} */ c) => c.stageId).filter((/** @type {string} */ x) => own.has(x)),
      ours: { name: add.selfTeamName, icon: add.selfTeamIcon }, theirs: { name: add.enemyTeamName, icon: add.enemyTeamIcon },
      buff: add.unlockBuffId ? { id: add.unlockBuffId, name: add.unlockBuffName, icon: add.unlockBuffIcon, desc: add.unlockBuffDesc } : null,
      points: { complete: add.completePoint, first: add.firstCompletePoint },
    };
  });
  const zones = [...new Set(stages.map((s) => s.zone))].sort((x, y) => zoneTable[x].zoneIndex - zoneTable[y].zoneIndex)
    .map((z) => ({ id: z, name: zoneTable[z].zoneNameSecond ?? '', unlock: a.zoneAdditionDataMap[z]?.unlockText ?? '' }));
  /** @type {Record<string, ReturnType<typeof storyOf>>} */
  const stories = Object.fromEntries(ids.flatMap((id) => storiesOf(gamedata, stageTable[id], styles)).sort((x, y) => (x[0] < y[0] ? -1 : 1)));
  const known = readJson(join(gamedata, 'story', 'story_variables.json'));
  const used = [...new Set(Object.values(stories).flat().flatMap((c) => Object.values(c.args)).filter((v) => typeof v === 'string' && v.startsWith('$')).map((v) => String(v).slice(1)))].sort();
  const missing = used.filter((k) => !Object.hasOwn(known, k));
  if (missing.length) throw new Error(`story variables not found: ${missing.join(', ')}`);
  return {
    source: { repo: 'Kengxxiao/ArknightsGameData', commit: commitOf(root), file: 'zh_CN/gamedata/excel/activity_table.json', activity: `ACT_FOOTBALL/${ACTIVITY}` },
    name: table.basicInfo[ACTIVITY].name,
    zones,
    stages,
    // the special operators lent in every match (npcCharDataDict), each with its training
    npcs: Object.values(a.npcCharDataDict).sort((/** @type {any} */ x, /** @type {any} */ y) => x.instId - y.instId).map((/** @type {any} */ c) => ({
      id: c.charId, elite: ELITE[/** @type {keyof typeof ELITE} */ (c.evolvePhase)], level: c.level, potential: c.potentialRank + 1, trust: trustOf(favor, c.favorPoint),
      skillLevel: c.mainSkillLevel + c.specializeLevel,
    })),
    stories,
    vars: Object.fromEntries(used.map((k) => [k, known[k]])),
    // 锦标奖杯: the points each of its levels takes in all (milestoneList's tokenNum, by orderId)
    trophy: [...a.milestoneList].sort((/** @type {any} */ x, /** @type {any} */ y) => x.orderId - y.orderId).map((/** @type {any} */ m) => m.tokenNum),
    // the entry page's key visual: the default one, and the one after a stage is completed (kvSwitchData)
    kv: Object.entries(table.kvSwitchData[ACTIVITY]?.kvSwitchInfo ?? {}).sort((x, y) => (x[0] < y[0] ? -1 : 1))
      .map(([name, k]) => ({ name, stage: /** @type {any} */ (k).isDefault ? null : /** @type {any} */ (k).stageId })),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--gamedata'), root = i >= 0 ? process.argv[i + 1] : process.env['AUE_GAMEDATA'];
  if (!root) throw new Error('--gamedata <dir> (or AUE_GAMEDATA) is required');
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(extract(root), null, 1)}\n`);
  console.log(`wrote ${OUT}`);
}
