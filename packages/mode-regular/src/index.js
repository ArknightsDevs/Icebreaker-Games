// @icebreaker/mode-regular: 常规项目: the projects of team play, the allocation's times and lineup size, the temporary
// recruits and the playing styles (docs/spec/room.md), from the game's activity table (data/act1multi.json, made by
// tools/extract-activity.js). The battle rules of the mode — objectives, the two stages, the stamps — are the engine's (合作-6…8).
import data from '../data/act1multi.json' with { type: 'json' };

export { SQUAD, squadProblem, entryProblem, buildOf } from './squads.js';
/** @typedef {import('./squads.js').BoxEntry} BoxEntry @typedef {import('./squads.js').Squad} Squad */

/** The activity's data as extracted, with its source. */
export const ACTIVITY = data;

/** A project of team play (房间-2): a level, the difficulty its content is assembled at, its class (初级赛, 特级赛…). @typedef {{ level: string, difficulty: 'NORMAL' | 'FOUR_STAR', class: string, className: string }} Project */

/** The MVP's projects (房间-2: the levels chosen for the MVP), each in the class the activity puts it. @type {readonly Project[]} */
export const PROJECTS = Object.freeze(['act1multi_01', 'act1multi_06', 'act1multi_hard-02'].map((level) => {
  const cls = /** @type {Record<string, string>} */ (data.stages)[level];
  return Object.freeze({ level, difficulty: /** @type {const} */ ('NORMAL'), class: cls, className: /** @type {Record<string, string>} */ (data.classes)[cls] });
}));

/** Each step's time in milliseconds (房间-2, 房间-4, 房间-5). */
export const STEP_MS = Object.freeze({
  confirm: data.steps.ENTRANCE.seconds * 1000, pick: data.steps.CHAR_PICK.seconds * 1000, lineup: data.steps.SQUAD_CHECK.seconds * 1000,
});

/** The fewest and most operators of a lineup (房间-5). */
export const LINEUP = Object.freeze({ ...data.lineup });

/**
 * The temporary recruits as box entries (房间-5): their training, every skill they have at the recruit's skill level.
 * @param {(id: string) => number} skillCount how many skills an operator has
 * @returns {import('./squads.js').BoxEntry[]}
 */
export const recruitEntries = (skillCount) => data.recruits.map((r) => ({
  id: r.id, elite: r.elite, level: r.level, potential: r.potential, trust: r.trust, skills: Array.from({ length: skillCount(r.id) }, () => r.skillLevel), modules: [],
}));

/** @typedef {{ key: string, professions: number, board: [string, number | string][] }} SeatRune */
/**
 * A play style (房间-3): its id, name, colour, what it gives and costs, its carried unit (name, what it does, its unit id)
 * and its runes as a match carries them (engine 符文-1…6).
 * @typedef {{ id: string, name: string, color: string, buff: string, debuff: string, device: { name: string, desc: string, key: string }, runes: SeatRune[] }} Style
 */

/** The play styles of team play, in the activity's order (房间-3). @type {readonly Style[]} */
export const STYLES = Object.freeze(data.styles.map((s) => {
  const card = s.runes.find((r) => r.key === 'insert_token_card'), key = card?.board.find(([k]) => k === 'token_key')?.[1];
  return Object.freeze({ ...s, device: { ...s.device, key: String(key ?? '') }, runes: /** @type {SeatRune[]} */ (s.runes) });
}));

/** The style a player brings when it has chosen none (房间-3): the first, 基础. */
export const DEFAULT_STYLE = STYLES[0].id;

/** A style's runes for the match (房间-6), or null for an id that is not a style. @param {string} id @returns {SeatRune[] | null} */
export const styleRunes = (id) => STYLES.find((s) => s.id === id)?.runes ?? null;
