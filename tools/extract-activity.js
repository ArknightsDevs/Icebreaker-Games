// Extracts what 常规项目 takes from the game's activity table (docs/spec/room.md, page.md): the steps' times and the
// lineup's size, the temporary recruits, the playing styles (with their icons, 页面-5) and the mode of the co-op
// activity act1multi.
// Usage: node tools/extract-activity.js --gamedata <ArknightsGameData checkout>
// Writes packages/mode-regular/data/act1multi.json (the same input gives byte-identical output).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ACTIVITY = 'act1multi';
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'mode-regular', 'data', `${ACTIVITY}.json`);
const ELITE = Object.freeze({ PHASE_0: 0, PHASE_1: 1, PHASE_2: 2 });
/** The toasts of the activity's room flow the lobby screens show (页面-6), and the server's refusals (站点-2). */
const TOASTS = Object.freeze(['noRoom', 'fullRoom', 'roomIdFormatError', 'roomIdCopySuccess', 'roomCollaboratorJoinRoom', 'roomCollaboratorExitRoom',
  'roomOwnerReviseMap', 'roomCollaboratorReviseMap', 'matchPrepareRoomClose', 'continuousClicks', 'serverOverload']);

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

/**
 * The game's markup `<@style>text</>` as Unity rich text by the game's styles (`richTextStyles`, e.g. `<color=#D4133C>{0}</color>`);
 * a style it does not know keeps only its text; the text's written line breaks (`\n`) as line breaks.
 * @param {string} s @param {Record<string, string>} styles
 */
export const richText = (s, styles) => s.replace(/<@([\w.]+)>([\s\S]*?)<\/>/g, (_, k, t) => (styles[k] ? styles[k].replace('{0}', t) : t)).replace(/\\n/g, '\n');

/**
 * The title of a player who chose none (页面-6): the activity's first front part and first back part by their order
 * (平凡的 + 博士). @param {Record<string, { order: number, titleDesc: string, isBack: boolean }>} titles
 */
function defaultTitle(titles) {
  const first = (/** @type {boolean} */ back) => Object.values(titles).filter((t) => t.isBack === back).sort((x, y) => x.order - y.order)[0]?.titleDesc ?? '';
  return first(false) + first(true);
}

/** @param {string} root */
export function extract(root) {
  const excel = join(root, 'zh_CN', 'gamedata', 'excel');
  const a = readJson(join(excel, 'activity_table.json')).activity.MULTIPLAY_V3[ACTIVITY], favor = readJson(join(excel, 'favor_table.json'));
  const stageTable = readJson(join(excel, 'stage_table.json')).stages, styles = readJson(join(excel, 'gamedata_const.json')).richTextStyles;
  const steps = Object.fromEntries(a.selectStepDataList.map((/** @type {any} */ s) => [s.stepType, { title: s.title, seconds: s.time, hint: s.hintTime }]));
  const normal = new Set(Object.values(a.mapTypeDataDict).filter((/** @type {any} */ t) => t.mode === 'NORMAL').flatMap((/** @type {any} */ t) => t.stageIdInModeList));
  return {
    source: { repo: 'Kengxxiao/ArknightsGameData', commit: commitOf(root), file: 'zh_CN/gamedata/excel/activity_table.json', activity: `MULTIPLAY_V3/${ACTIVITY}` },
    lineup: { min: a.constData.squadMinNum, max: a.constData.squadMaxNum },
    steps,
    mode: { type: a.mapModeDataDict.NORMAL.modeType, name: a.mapModeDataDict.NORMAL.name, icon: a.mapModeDataDict.NORMAL.iconId, color: `#${a.mapModeDataDict.NORMAL.color}` },
    classes: Object.fromEntries(Object.values(a.mapDiffDataDict).map((/** @type {any} */ d) => [d.diffType, d.name])),
    stages: Object.fromEntries(Object.values(a.mapTypeDataDict).filter((/** @type {any} */ t) => t.mode === 'NORMAL')
      .flatMap((/** @type {any} */ t) => t.stageIdInModeList.map((/** @type {string} */ id) => [id, t.difficulty])).sort((x, y) => (x[0] < y[0] ? -1 : 1))),
    // the lobby screens (页面-6): each stage's preview picture, its description (stage_table, the game's markup as
    // rich text) and its missions (the detail and goal panels of 项目确认), the toasts of the room flow
    pictures: Object.fromEntries(Object.values(a.mapDataDict).filter((/** @type {any} */ m) => normal.has(m.stageId))
      .map((/** @type {any} */ m) => [m.stageId, m.previewIconId]).sort((x, y) => (x[0] < y[0] ? -1 : 1))),
    details: Object.fromEntries([...normal].sort().map((id) => [id, richText(stageTable[id]?.description ?? '', styles)])),
    missions: Object.fromEntries(Object.values(a.mapDataDict).filter((/** @type {any} */ m) => normal.has(m.stageId))
      .map((/** @type {any} */ m) => [m.stageId, m.missionIdList.map((/** @type {string} */ id) => a.targetMissionDataDict[id]?.description ?? '')])
      .sort((x, y) => (x[0] < y[0] ? -1 : 1))),
    toasts: Object.fromEntries(TOASTS.map((k) => [k, a.constToastData[k]])),
    // the name cards' title of a player who chose none, and the latency texts from each threshold in ms (页面-6)
    title: defaultTitle(a.titleDataDict),
    // the invitation a host copies (房间-1): the room code, the host's name and 代号
    invite: a.constData.noMapRoomNumCopyDesc,
    pings: a.constData.pingConds.map((/** @type {any} */ p) => ({ from: p.cond, text: richText(p.txt, styles) })),
    recruits: a.tempCharDataList.map((/** @type {any} */ c) => ({
      id: c.charId, elite: ELITE[/** @type {keyof typeof ELITE} */ (c.evolvePhase)], level: c.level, potential: c.potentialRank + 1, trust: trustOf(favor, c.favorPoint),
      skillLevel: c.mainSkillLevel + c.specializeLevel,
    })),
    styles: a.squadEffectList.map((/** @type {any} */ s) => ({
      id: s.id, name: s.name, icon: s.iconId, color: s.themeColor, buff: s.buffDesc, debuff: s.debuffDesc,
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
