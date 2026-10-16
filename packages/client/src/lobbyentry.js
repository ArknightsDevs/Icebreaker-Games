// The activity's entry page (docs/spec/page.md 页面-6, engine ADR 0063): 组队参加 opens its room panel, where 发起！
// makes a room and 加入！ joins one by its code (the invitation text pasted whole works too, 房间-1); 编队 opens the
// squad page. The entries of systems the platform does not have — quick match, the manual, milestones, rewards,
// training, medals, invitations, the guide book — are hidden, not left as dead ends.
import { openPart, closePart, inputOn } from './lobbykit.js';
import { PAGES } from './lobbymap.js';

/** The entry page's state root, under which its panels are. */
export const ENTRY = '@view_ui/canvas_ui/canvas_group/state_root/panel_entry_state';

/** The entry page's nodes for the systems the platform does not have (ADR 0063). */
export const ENTRY_HIDDEN = Object.freeze([
  'panel_main/panel_match/btn_match', 'panel_main/panel_match/new_match', 'panel_main/panel_left/btn_seasonal_handbook', 'panel_main/panel_left/btn_milestone',
  'panel_main/panel_left/btn_reward', 'panel_main/panel_left/btn_mission', 'panel_main/group_upper_right/group_time', 'panel_main/group_upper_right/btn_medal',
  'panel_main/btn_invite', 'panel_room/btn_train', 'panel_room/panel_right/btn_invite', 'btn_guidebook',
].map((p) => `${ENTRY}/${p}`));

/**
 * @typedef {object} EntryActions
 * @property {() => void} create makes a room
 * @property {(code: string) => void} join joins a room by a code or an invitation text
 * @property {() => void} squad opens the squad page
 * @property {() => string | null} squadProblem why the save's 常规队 cannot be used (the 编队 button says 人数不足)
 * @property {(room: boolean) => void} roomPanel the room panel is shown or not (the page's back button follows it)
 */

/**
 * The entry page on the lobby UI.
 * @param {any} ui @param {EntryActions} A
 */
export function createEntry(ui, A) {
  const p = openPart(ui, PAGES.entry), f = p.view(ENTRY);
  for (const r of ENTRY_HIDDEN) p.show(r, false);
  // the 3D scene behind (its meshes, cameras and the world-space ground) is not drawn yet (页面-6)
  p.show('@view_back', false);
  // the season's logo comes from the activity's art, which the pack does not have
  p.show(`${ENTRY}/panel_main/season_logo`, false);
  // the activity's "ended" marks, and the left panel's back that framed the buttons hidden above
  p.show(`${ENTRY}/panel_main/panel_left/btn_formation/act_end`, false);
  p.show(`${ENTRY}/panel_main/panel_match/group_act_end`, false);
  p.show(`${ENTRY}/panel_main/panel_left/left_panel_back`, false);
  p.show('@view_ui/canvas_ui/canvas_group/panel_entry_anim/entry_p2_season_cover/season_logo', false);
  let room = false, busy = false;
  const join = (/** @type {string} */ v) => { if (!v.trim()) return; joining(true); A.join(v); };
  const code = inputOn(p, `${ENTRY}/panel_room/panel_right/btn_join_room/hotspot`, { label: '房间编号', onEnter: join });
  /** @param {boolean} on */
  function joining(on) { p.show(f.joinRoomMask ?? `${ENTRY}/panel_room/group_lower_bar_joining`, on && room); }
  /** @param {boolean} on */
  async function toRoom(on) {
    if (busy || on === room) return;
    busy = true;
    if (on) p.show(`${ENTRY}/panel_room`, true);
    await p.anim(on ? f.animMainToRoom : f.animRoomToMain);
    p.show(`${ENTRY}/panel_room`, on);
    p.show(`${ENTRY}/panel_main`, !on);
    room = on;
    busy = false;
    joining(false);
    A.roomPanel(on);
  }
  p.tap(`${ENTRY}/panel_main/panel_match/btn_team_up/hotspot`, () => { void toRoom(true); });
  p.tap(`${ENTRY}/panel_main/panel_left/btn_formation/hotspot`, A.squad);
  p.tap(`${ENTRY}/panel_room/panel_right/btn_strat_room/hotspot`, A.create);
  p.tap(`${ENTRY}/panel_room/panel_right/btn_join_room/btn_search_room/panel_enable/hotspot`, () => join(code?.value() ?? ''));
  joining(false);
  void p.anim(f.animEntry);
  return {
    part: p,
    /** The 编队 button's hint when the 常规队 cannot be used. */
    update: () => p.show(`${ENTRY}/panel_main/panel_left/btn_formation/info_not_ready`, !!A.squadProblem()),
    /** Back from the room panel to the main panel. */
    back: () => toRoom(false),
    /** A join came to nothing (an error from the server). */
    failed: () => joining(false),
    /** Whether the room panel shows. */
    get room() { return room; },
    /** The join box (for tests and the page). */
    code,
    close: () => closePart(p),
  };
}
