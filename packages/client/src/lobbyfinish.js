// The result after a match (docs/spec/page.md 页面-6, room.md 房间-6): the battle finish view over the room page when
// the players come back — the stage's name and class, the stamps won as the rating's stars, each stage's mark of a
// stamp won; 下一步 goes on to the room (at 项目调整 again). The original's rewards, milestones and illustrations are
// of systems the platform does not have and stay hidden.
import { openPart, closePart, place } from './lobbykit.js';
import { PAGES } from './lobbymap.js';
import { fillDiff } from './lobbystage.js';

/** @typedef {import('./lobbykit.js').Part} Part @typedef {import('./lobbymap.js').MatchResult} MatchResult */

/**
 * The finish view for a match's result. @param {any} ui @param {MatchResult} r
 * @param {{ project: (level: string) => import('./roomview.js').ProjectView | null, done: () => void }} A
 */
export function createFinish(ui, r, A) {
  const page = openPart(ui, PAGES.finish), f = page.view();
  page.show(f.playerDisplayContainer, false);
  page.show(f.reportPanelContainer, false);
  const info = f.completeInfoContainer && f.completeInfoPrefab ? place(page, f.completeInfoContainer, f.completeInfoPrefab) : null;
  if (info) completeInfo(info, r, A.project(r.level), A.done);
  return { part: page, close: () => closePart(page) };
}

/**
 * The complete info panel: the stage's name and class, the bar below, the mode's rating, 下一步.
 * @param {Part} info @param {MatchResult} r @param {import('./roomview.js').ProjectView | null} pr @param {() => void} done
 */
function completeInfo(info, r, pr, done) {
  const cf = info.view();
  for (const g of [cf.earlyQuitGO, cf.earlyQuitTitleGO, cf.rewardView, cf.illustView, cf.btnNextQuitPartGO]) info.show(g, false);
  info.show(cf.normalTitleGO, true);
  info.text(cf.textStageName, pr ? `${pr.code} ${pr.name}` : '');
  const icon = pr && cf.diffIconContainer && cf.diffIconPrefab ? place(info, cf.diffIconContainer, cf.diffIconPrefab) : null;
  if (icon && pr) fillDiff(icon, pr.class);
  if (cf.bottomBarContainer && cf.bottomBarPrefab) place(info, cf.bottomBarContainer, cf.bottomBarPrefab);
  const mode = cf.modeViewContainer && cf.modePrefabList?.[0] ? place(info, cf.modeViewContainer, cf.modePrefabList[0]) : null;
  if (mode) stars(mode, r, pr);
  info.tap('@panel_front/btn_next/hotspot', done);
  void info.anim(cf.enterAnim).then(() => info.anim(cf.nextAnim));
}

/**
 * The rating: a star for each stamp won (at most 3), each stage's panel marked when it won its stamps; the stage's
 * task as the title and description.
 * @param {Part} m @param {MatchResult} r @param {import('./roomview.js').ProjectView | null} pr
 */
function stars(m, r, pr) {
  const f = m.view(), won = Math.min(3, r.stamps.reduce((t, x) => t + Math.max(0, x), 0));
  (f.activeStarGOList ?? []).forEach((/** @type {string} */ s, /** @type {number} */ i) => m.show(s, i < won));
  (f.inactiveStarGOList ?? []).forEach((/** @type {string} */ s, /** @type {number} */ i) => m.show(s, i >= won));
  m.show(f.penaltyHintGO, false);
  m.show(f.newStarGO, false);
  const task = pr?.stages[pr.stages.length - 1];
  m.text(f.textTitle, task?.title ?? '');
  m.text(f.textDesc, r.result === 1 ? '比赛胜利' : '比赛结束');
  m.show('@group_info/main/panel_stage1/panel_progress/panel_num', false);
  m.show('@group_info/main/panel_stage2/panel_progress/panel_num_1', false);
  m.show('@group_info/main/panel_stage2/panel_progress/panel_num_2', false);
  m.show('@group_info/main/panel_stage2/panel_progress/div', false);
  m.show('@group_info/main/panel_stage1/panel_progress/panel_got', (r.stamps[0] ?? 0) > 0);
  m.show('@group_info/main/panel_stage2/panel_progress/panel_got_1', (r.stamps[1] ?? 0) > 0);
  m.show('@group_info/main/panel_stage2/panel_progress/panel_got_2', (r.stamps[1] ?? 0) > 1);
  for (const [s, v] of /** @type {[string, number][]} */ ([[f.sliderStage1, r.stamps[0] ?? 0], [f.sliderStage2, Math.min(2, r.stamps[1] ?? 0) / 2]])) {
    const n = m.node(s);
    if (n) m.scr.slider('', Math.min(1, v), n);
  }
  void m.anim(f.animEnter);
}
