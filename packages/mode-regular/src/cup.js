// 阵地足球锦标 (docs/spec/room.md 房间-15): the single-player 阵地足球 event, from its activity data
// (data/act1football.json, made by tools/extract-cup.js) — its zones and stages in order, which stage opens after which,
// the special operators lent in every match, the stories of its training stage — and the lineup a player brings: up to
// 12 operators, each with the skill and module it takes into the match, and at most one support unit besides, any
// operator fully trained. From the network a lineup and its support unit are untrusted: lineupProblem and
// assistProblem check them. The match's rules — stadiums, teams, penalties, the training effects — are the engine's (锦标-1…7).
import data from '../data/act1football.json' with { type: 'json' };
import { entryProblem, buildOf } from './squads.js';

/** @typedef {import('./squads.js').BoxEntry} BoxEntry @typedef {import('@aue/schema').Build} Build */
/**
 * A stage of the event: its id, the level it plays (the engine's), its code, name, zone, description as rich text,
 * whether its operators are all the level's own (the training stage: no lineup is brought), the stages of the event it
 * opens after, the two teams' names and icons, the training effect clearing it unlocks.
 * @typedef {{ stage: string, level: string, code: string, name: string, zone: string, detail: string, predefined: boolean, after: string[],
 *   ours: { name: string, icon: string }, theirs: { name: string, icon: string }, buff: { id: string, name: string, icon: string, desc: string } | null }} CupStage
 */
/** An operator of a lineup: its box entry, the skill slot (−1: none) and module (−1: none) it takes into the match. @typedef {{ e: BoxEntry, skill: number, module: number }} CupPick */

/** The event's name (阵地足球锦标). */
export const CUP_NAME = data.name;

/** The zones in their order (晋级赛, 淘汰赛, 特训赛): each its id, name and the text while it is locked. @type {readonly { id: string, name: string, unlock: string }[]} */
export const CUP_ZONES = Object.freeze(data.zones.map((z) => Object.freeze({ ...z })));

/** The stages in the activity's order. @type {readonly CupStage[]} */
export const CUP_STAGES = Object.freeze(data.stages.map((s) => Object.freeze(/** @type {CupStage} */ ({ ...s }))));

/** The levels the event plays, in its stages' order. */
export const CUP_LEVELS = Object.freeze(CUP_STAGES.map((s) => s.level));

/** The stage of a stage id or of its level, or null. @param {string} id @returns {CupStage | null} */
export const cupStage = (id) => CUP_STAGES.find((s) => s.stage === id || s.level === id) ?? null;

/** Whether a stage is open (房间-15): every stage of the event it opens after cleared. @param {CupStage} s @param {Iterable<string>} cleared the stage ids cleared */
export function cupOpen(s, cleared) {
  const done = new Set(cleared);
  return s.after.every((x) => done.has(x));
}

/** The stadiums' names (锦标-2), by the engine's stadium names: as PF-S-1's description lists them. */
export const STADIUM_NAMES = Object.freeze({ plain: '常规球场', winter: '冻人冬日球场', thunder: '超强对流球场', smart: '智能时代球场', whirlwind: '旋旋风暴球场' });

/** The most operators a lineup holds (房间-15: 「您可以选择12名参赛选手」). */
export const CUP_LINEUP = 12;

/** The special operators lent in every match (房间-15), as box entries: their training, every skill at their skill level. @param {(id: string) => number} skillCount how many skills an operator has @returns {BoxEntry[]} */
export const cupNpcEntries = (skillCount) => data.npcs.map((n) => ({
  id: n.id, elite: n.elite, level: n.level, potential: n.potential, trust: n.trust, skills: Array.from({ length: skillCount(n.id) }, () => n.skillLevel), modules: [],
}));

/** The special operators' ids. */
export const CUP_NPCS = Object.freeze(data.npcs.map((n) => n.id));

/** The stories the training stage tells, by name, and the story variables they use (as the training's, 房间-11). */
export const CUP_TUTORIAL = Object.freeze({ stories: /** @type {Readonly<Record<string, readonly { cmd: string, args: Record<string, string | number | boolean>, text?: string }[]>>} */ (/** @type {any} */ (data.stories)),
  vars: /** @type {Readonly<Record<string, string | number>>} */ (data.vars) });

/** @param {unknown} x @returns {x is Record<string, unknown>} */
const isRecord = (x) => typeof x === 'object' && x !== null && !Array.isArray(x);

/** @param {unknown} x */
const slot = (x) => Number.isInteger(x) && /** @type {number} */ (x) >= -1 && /** @type {number} */ (x) <= 2;

/**
 * Why a lineup cannot be brought to a stage, or null (房间-15): none to the training stage, whose operators are the
 * level's own; else 1 to 12 operators, each once, each a well-formed box entry with a skill and a module slot of −1–2.
 * @param {unknown} list @param {CupStage} s @returns {string | null}
 */
export function lineupProblem(list, s) {
  if (s.predefined) return Array.isArray(list) && list.length === 0 ? null : `${s.code} takes no lineup`;
  if (!Array.isArray(list) || list.length < 1 || list.length > CUP_LINEUP) return `a lineup is not a list of 1–${CUP_LINEUP}`;
  const seen = new Set();
  for (const p of list) {
    if (!isRecord(p) || Object.keys(p).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).join() !== 'e,module,skill') return 'an operator of a lineup is not { e, skill, module }';
    const why = entryProblem(p.e);
    if (why) return why;
    if (!slot(p.skill) || !slot(p.module)) return `${/** @type {BoxEntry} */ (p.e).id}: the skill or module slot is not −1–2`;
    const id = /** @type {BoxEntry} */ (p.e).id;
    if (seen.has(id)) return `${id} twice in one lineup`;
    seen.add(id);
  }
  return null;
}

/**
 * Why a support unit cannot come along, or null (房间-15: 「12名参赛选手+至多1名助战单位」): none (null) always may; none
 * to the training stage; else one operator as a lineup's are — a well-formed box entry with a skill and a module slot —
 * not already in the lineup. The page brings it fully trained; its training is checked as a box entry's is.
 * @param {unknown} a @param {readonly CupPick[]} list the lineup, already checked @param {CupStage} s @returns {string | null}
 */
export function assistProblem(a, list, s) {
  if (a === null) return null;
  if (s.predefined) return `${s.code} takes no support unit`;
  if (!isRecord(a) || Object.keys(a).sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)).join() !== 'e,module,skill') return 'the support unit is not { e, skill, module }';
  const why = entryProblem(a.e);
  if (why) return why;
  if (!slot(a.skill) || !slot(a.module)) return `${/** @type {BoxEntry} */ (a.e).id}: the skill or module slot is not −1–2`;
  const id = /** @type {BoxEntry} */ (a.e).id;
  return list.some((p) => p.e.id === id) ? `${id} is in the lineup and the support unit` : null;
}

/**
 * A lineup as a match's deck (engine 同步-9): each operator with the training it takes in, the support unit last marked
 * as such. @param {CupPick[]} list @param {CupPick | null} [assist] @returns {{ id: string, build: Build, assist?: true }[]}
 */
export const cupDeck = (list, assist = null) => [...list, ...(assist ? [assist] : [])]
  .map((p) => ({ id: p.e.id, build: buildOf(p.e, p.skill, p.module), ...(p === assist ? { assist: /** @type {const} */ (true) } : {}) }));
