// What the lobby tells a page about team play (docs/spec/room.md): each project with its level's code and name (engine
// 关卡-4), class, the tasks of its two stages (关卡-5), its description and the activity's missions for it (shown at 项目确认); the
// temporary recruits as box entries.
import { LEVELS, TESTING, levelAt, loadTraining } from '@aue/content';
import { ACTIVITY, DETAILS, MISSIONS, PROJECTS, TRAINING_LEVELS, DEFAULT_STYLE, recruitEntries, styleRunes, stageName, trainingModeOf, cupStage, lineupProblem, cupDeck } from '@icebreaker/mode-regular';

/**
 * A project as the lobby shows it: its code and name, its stages' tasks (常规项目) or its waves (堡垒守御), the
 * activity's missions, its description; whether its level is being tested (the engine's 关卡-8).
 * @typedef {import('@icebreaker/mode-regular').Project & { code: string, name: string, stages: { title: string, basic: string, advanced?: string, seconds: number }[],
 *   waves: number, missions: readonly string[], detail: string, testing: boolean }} ProjectView
 */

/** The note a project being tested carries at the head of its description (房间-2, the engine's 关卡-8). */
export const TESTING_NOTE = '<color=#FF6E6E>测试中：部分敌人能力未实现</color>';

/**
 * Whether a project is being tested (房间-13, 房间-14): its level is one of the engine's being tested and, at the
 * project's difficulty, some ability of its enemies has no behaviour yet (engine 关卡-8).
 * @param {{ level: string, difficulty: 'NORMAL' | 'FOUR_STAR' }} p
 */
const testingAt = (p) => TESTING.includes(p.level) && (levelAt(p.level, p.difficulty).level.uncovered ?? []).length > 0;

/** The projects as the lobby shows them. @returns {ProjectView[]} */
export function projectViews() {
  return PROJECTS.map((p) => {
    const lv = LEVELS[p.level].level, own = stageName(p.stage), testing = testingAt(p), detail = DETAILS[p.stage] ?? '';
    return { ...p, code: own?.code ?? lv.code, name: own?.name ?? lv.name, stages: (lv.stages ?? []).map((/** @type {any} */ s) => ({ ...s.task, seconds: s.time })),
      waves: lv.waves.length, missions: MISSIONS[p.stage] ?? [], detail: testing ? `${TESTING_NOTE}\n${detail}` : detail, testing };
  });
}

/**
 * The match of a training level (房间-11): its own cards (engine 关卡-7) for seat 0 — in 常规项目's with 基础专项's runes,
 * in 阵地足球's with none —, nobody for seat 1 — the partner's operators are the level's (engine 波次-7); null for a
 * level that is not a training level here. @param {string} level @param {number} seed @returns {import('@aue/schema').Match | null}
 */
export function trainingMatch(level, seed) {
  const cards = TRAINING_LEVELS.includes(level) ? LEVELS[level]?.level.cards : null;
  if (!cards) return null;
  const runes = trainingModeOf(level) === 'NORMAL' ? /** @type {any} */ (styleRunes(DEFAULT_STYLE)) : [];
  return { level, difficulty: 'NORMAL', seed, decks: [cards.operators.map((/** @type {any} */ o) => ({ id: o.key, build: o.build })), []], runes: [runes, []] };
}

/**
 * The match of a 阵地足球锦标 stage (房间-15): the player's lineup for seat 0 — none on the training stage, whose operators
 * are the level's own — with the runes of the training effect chosen (engine 锦标-7; '' for none), nobody for seat 1;
 * or why there is none: not a stage of the event, a lineup that breaks its rules, a training effect the level has not.
 * @param {string} level @param {number} seed @param {unknown} lineup @param {string} relic
 * @returns {{ match: import('@aue/schema').Match } | { error: string }}
 */
export function cupMatch(level, seed, lineup, relic) {
  const s = cupStage(level), lv = s && s.level === level ? LEVELS[level]?.level : null;
  if (!s || !lv) return { error: '没有这一关' };
  const why = lineupProblem(lineup, s);
  if (why) return { error: `上场干员不对：${why}` };
  const r = relic ? (lv.football?.cup?.relics ?? []).find((/** @type {any} */ x) => x.id === relic) : null;
  if (relic && !r) return { error: '没有这个训练效果' };
  const deck = cupDeck(/** @type {import('@icebreaker/mode-regular').CupPick[]} */ (lineup));
  return { match: { level, difficulty: 'NORMAL', seed, decks: [deck, []], runes: [r ? r.runes : [], []] } };
}

/** The temporary recruits as box entries, each skill they have at the recruit's level. */
export async function recruits() {
  const counts = new Map();
  for (const r of ACTIVITY.recruits) counts.set(r.id, (await loadTraining(r.id)).skills.length);
  return recruitEntries((id) => counts.get(id) ?? 0);
}
