// The player's local save (docs/spec/room.md 房间-3): a name, the box — operators with their training, entered by
// hand — and the 常规队: box operators in a high-priority and a low-priority list. It lives in this browser's
// localStorage and copies out and back in as text. Every change makes a new save; nothing here touches the page.
import { entryProblem, SQUAD } from '@icebreaker/mode-regular';

/** The save's name in localStorage, and where an unreadable one is kept rather than lost. */
export const SAVE_KEY = 'ice.save', BAD_SAVE_KEY = 'ice.save.unreadable';
/** The most operators a box holds. */
const MAX_BOX = 600;

/** @typedef {import('@icebreaker/mode-regular').BoxEntry} BoxEntry */
/** @typedef {{ v: 1, name: string, box: BoxEntry[], squad: { high: string[], low: string[] } }} Save */

/** @returns {Save} */
export const emptySave = () => ({ v: 1, name: '', box: [], squad: { high: [], low: [] } });

/** @param {unknown} x @returns {x is Record<string, any>} */
const isRecord = (x) => typeof x === 'object' && x !== null && !Array.isArray(x);

/** @param {unknown} q @param {Set<string>} ids */
function squadIdsProblem(q, ids) {
  if (!isRecord(q) || !Array.isArray(q.high) || !Array.isArray(q.low) || q.high.length > SQUAD.high || q.low.length > SQUAD.low) return '常规队的格式不对';
  const all = [...q.high, ...q.low];
  if (new Set(all).size !== all.length || !all.every((id) => ids.has(id))) return '常规队里有 box 之外或重复的干员';
  return null;
}

/** Why something is not a save, or null. @param {unknown} x @returns {string | null} */
export function saveProblem(x) {
  if (!isRecord(x) || x.v !== 1) return '不是促融共竞的存档';
  if (typeof x.name !== 'string' || x.name.length > 16) return '名字不能超过 16 个字';
  if (!Array.isArray(x.box) || x.box.length > MAX_BOX) return `box 最多 ${MAX_BOX} 名干员`;
  const ids = new Set();
  for (const e of x.box) {
    const why = entryProblem(e);
    if (why) return why;
    if (ids.has(e.id)) return `${e.id} 在 box 里出现了两次`;
    ids.add(e.id);
  }
  return squadIdsProblem(x.squad, ids);
}

/** A storage's save text, or null when it has none or refuses. @param {Storage | null} store */
function stored(store) {
  try { return store?.getItem(SAVE_KEY) ?? null; } catch { return null; }
}

/** The save in a storage; an empty one when there is none, and when it is unreadable (kept aside). @param {Storage | null} store @returns {Save} */
export function readSave(store) {
  const raw = stored(store);
  if (raw === null) return emptySave();
  const got = importSave(raw);
  if ('save' in got) return got.save;
  try { store?.setItem(BAD_SAVE_KEY, raw); } catch { /* nowhere to keep it */ }
  return emptySave();
}

/** Writes a save; false when the storage refused it. @param {Storage | null} store @param {Save} s */
export function writeSave(store, s) {
  try { store?.setItem(SAVE_KEY, JSON.stringify(s)); return store !== null; } catch { return false; }
}

/** A save from its text (exportSave's, or a backup). @param {string} text @returns {{ save: Save } | { error: string }} */
export function importSave(text) {
  let x;
  try { x = JSON.parse(text); } catch { return { error: '不是存档的文本' }; }
  const why = saveProblem(x);
  return why ? { error: why } : { save: /** @type {Save} */ (x) };
}

/** A save as text. @param {Save} s */
export const exportSave = (s) => JSON.stringify(s);

/** The save with an operator added, or its entry replaced. @param {Save} s @param {BoxEntry} e @returns {Save} */
export function putEntry(s, e) {
  const box = s.box.some((x) => x.id === e.id) ? s.box.map((x) => (x.id === e.id ? e : x)) : [...s.box, e];
  return { ...s, box };
}

/** The save without an operator, in the box and in the squad. @param {Save} s @param {string} id @returns {Save} */
export function removeEntry(s, id) {
  return { ...s, box: s.box.filter((x) => x.id !== id), squad: { high: s.squad.high.filter((x) => x !== id), low: s.squad.low.filter((x) => x !== id) } };
}

/**
 * The save with a box operator moved to a list of the squad (or out of it), or null when that list is full.
 * @param {Save} s @param {string} id @param {'high' | 'low' | null} list @returns {Save | null}
 */
export function place(s, id, list) {
  const next = { high: s.squad.high.filter((x) => x !== id), low: s.squad.low.filter((x) => x !== id) };
  if (list) {
    if (next[list].length >= SQUAD[list]) return null;
    next[list] = [...next[list], id];
  }
  return { ...s, squad: next };
}

/** The 常规队 a room takes (房间-3): the squad's operators with their box training. @param {Save} s */
export function squadOf(s) {
  const by = new Map(s.box.map((e) => [e.id, e]));
  const of = (/** @type {string[]} */ ids) => ids.map((id) => /** @type {BoxEntry} */ (by.get(id)));
  return { high: of(s.squad.high), low: of(s.squad.low) };
}
