// What 阵地足球锦标's own pages show (docs/spec/page.md 页面-11, room.md 房间-15): the screens of the cup UI pack the
// page opens, each zone's state and stages, each stage's state, the stage a zone's map chooses first, where a stage's
// button sits on its zone's map, a best score as the score board's digits, the 锦标奖杯's level and how far the next
// one is, the lineup's slots. Pure; lobbycup.js draws it.
import { CUP_ZONES, CUP_STAGES, CUP_TROPHY, CUP_LINEUP, cupOpen, trophyLevel } from '@icebreaker/mode-regular';

/** The cup pack's screens (页面-11): its keys in the lobby pack once merged (cuppack.js). */
export const CUP_SCREENS = Object.freeze({
  entry: 'cup/act1football_activity_stage', map: 'cup/zonemap/act1football_zone_map_state',
  zones: Object.freeze(['cup/zonemap/panel_football_zone1_map', 'cup/zonemap/panel_football_zone2_map', 'cup/zonemap/panel_football_zone3_map']),
  stageButton: 'cup/zonemap/act1football_zone1_stage_btn', trap: 'cup/templatetrap/act1football_trap_state_view',
  squad: 'cup/squad/act1football_layout_view', squadTraps: 'cup/squad/act1football_trap_squad_view', squadTop: 'cup/squad/act1football_top_view',
  card: 'cup/squad/act1football_common_squad_card_with_predefine', finish: 'cup/battlefinish/act1football_battle_finish_view',
});

/** @typedef {import('@icebreaker/mode-regular').CupStage} CupStage @typedef {'locked' | 'open' | 'cleared'} StageState */

/** A stage's state: cleared, open (its stages before it cleared) or locked. @param {CupStage} s @param {readonly string[]} cleared @returns {StageState} */
export const stageState = (s, cleared) => (cleared.includes(s.stage) ? 'cleared' : cupOpen(s, cleared) ? 'open' : 'locked');

/** A zone's stages in the activity's order. @param {string} zone */
export const zoneStages = (zone) => CUP_STAGES.filter((s) => s.zone === zone);

/** Whether a zone is open: one of its stages is. @param {string} zone @param {readonly string[]} cleared */
export const zoneOpen = (zone, cleared) => zoneStages(zone).some((s) => cupOpen(s, cleared));

/** The zones with their index (0–2), name, text while locked and whether each is open. @param {readonly string[]} cleared */
export const zonesOf = (cleared) => CUP_ZONES.map((z, i) => ({ ...z, i, open: zoneOpen(z.id, cleared) }));

/**
 * The stage a zone's map chooses when it opens: the first open one not cleared yet, else the last open one, else the
 * first. @param {string} zone @param {readonly string[]} cleared @returns {CupStage | null}
 */
export function firstStage(zone, cleared) {
  const list = zoneStages(zone), open = list.filter((s) => stageState(s, cleared) !== 'locked');
  return open.find((s) => stageState(s, cleared) === 'open') ?? open.at(-1) ?? list[0] ?? null;
}

/**
 * The node of its zone's map a stage's button sits in (页面-11): the qualifier's and the tournament's by the stage's id,
 * the training's by its scene's name (PF-S-1 act1football_sub_1-1, PF-S-2 act1football_sub_1-2). @param {CupStage} s
 */
export const slotOf = (s) => (CUP_ZONES[2] && s.zone === CUP_ZONES[2].id ? `act1football_sub_1-${Number(s.stage.slice(-2))}` : s.stage);

/** A score's two digits on the score board (each side 00–99). @param {number} n @returns {[string, string]} */
export const digits = (n) => { const v = Math.max(0, Math.min(99, Math.floor(n))); return [String(Math.floor(v / 10)), String(v % 10)]; };

/**
 * The 锦标奖杯 for points (页面-11): its level (0 until the first), whether it is the last, the points the next level
 * takes in all and how far there from the last level's (0–1; 1 at the last level).
 * @param {number} points
 */
export function trophyOf(points) {
  const level = trophyLevel(points), max = level >= CUP_TROPHY.length, next = max ? CUP_TROPHY.at(-1) ?? 0 : CUP_TROPHY[level] ?? 0;
  const from = level > 0 ? CUP_TROPHY[level - 1] ?? 0 : 0;
  return { level, max, next, fill: max ? 1 : Math.max(0, Math.min(1, (points - from) / Math.max(1, next - from))) };
}

/**
 * The lineup's slots on the squad page (页面-11): the operators chosen in order, then empty ones up to the 12 a
 * lineup holds. @template T @param {readonly T[]} picks @returns {(T | null)[]}
 */
export const slotsOf = (picks) => Array.from({ length: CUP_LINEUP }, (_, i) => picks[i] ?? null);
