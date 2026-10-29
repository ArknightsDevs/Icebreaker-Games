// 阵地足球锦标's progress on this browser (docs/spec/room.md 房间-15): the stages cleared, the lineup last brought — each
// operator's id with the skill and module slot it takes —, the support unit (null for none) and the training effect
// chosen ('' for none), kept apart from
// the save (save.js) under a key of its own. Read leniently: what is not well formed is dropped, never the rest.
import { CUP_STAGES, CUP_LINEUP } from '@icebreaker/mode-regular';

export const CUP_KEY = 'ice.cup';

/** @typedef {{ id: string, skill: number, module: number }} CupChoice */
/** @typedef {{ v: 1, cleared: string[], picks: CupChoice[], assist: CupChoice | null, relic: string }} CupSave */

/** @returns {CupSave} */
export const emptyCup = () => ({ v: 1, cleared: [], picks: [], assist: null, relic: '' });

const STAGES = new Set(CUP_STAGES.map((s) => s.stage));

/** @param {unknown} x */
const slot = (x) => Number.isInteger(x) && /** @type {number} */ (x) >= -1 && /** @type {number} */ (x) <= 2;

/** @param {any} p @returns {p is CupChoice} */
const choiceOk = (p) => typeof p === 'object' && p !== null && typeof p.id === 'string' && /^char_\d{3,4}_[a-z0-9]{1,16}$/.test(p.id) && slot(p.skill) && slot(p.module);

/** The text kept under the key, parsed; null for none, unreadable or refused. @param {Storage | null} store @returns {any} */
function parsed(store) {
  try { return JSON.parse(store?.getItem(CUP_KEY) ?? 'null'); } catch { return null; }
}

/** The progress kept in a storage, an empty one when there is none or it is unreadable. @param {Storage | null} store @returns {CupSave} */
export function readCup(store) {
  const x = parsed(store);
  if (typeof x !== 'object' || x === null) return emptyCup();
  const cleared = Array.isArray(x.cleared) ? [...new Set(x.cleared.filter((/** @type {unknown} */ s) => typeof s === 'string' && STAGES.has(s)))] : [];
  const seen = new Set(), picks = (Array.isArray(x.picks) ? x.picks : []).filter((/** @type {any} */ p) => choiceOk(p) && !seen.has(p.id) && seen.add(p.id)).slice(0, CUP_LINEUP);
  const assist = choiceOk(x.assist) && !seen.has(x.assist.id) ? { id: x.assist.id, skill: x.assist.skill, module: x.assist.module } : null;
  return { v: 1, cleared, picks: picks.map((/** @type {CupChoice} */ p) => ({ id: p.id, skill: p.skill, module: p.module })), assist, relic: typeof x.relic === 'string' ? x.relic : '' };
}

/** Writes the progress; false when the storage refused it. @param {Storage | null} store @param {CupSave} c */
export function writeCup(store, c) {
  try { store?.setItem(CUP_KEY, JSON.stringify(c)); return store !== null; } catch { return false; }
}

/** The progress with a stage cleared. @param {CupSave} c @param {string} stage @returns {CupSave} */
export const clearedWith = (c, stage) => (c.cleared.includes(stage) ? c : { ...c, cleared: [...c.cleared, stage] });
