// The result after a match (docs/spec/page.md 页面-6, room.md 房间-6): the battle finish view over the room page when
// the players come back — the stage's name and class, the stamps won as the rating's stars, each stage's mark of a
// stamp won; 下一步 goes on to the room (at 项目调整 again). The original's rewards, milestones and illustrations are
// of systems the platform does not have and stay hidden.
import { openPart, closePart, place, placeBottomBar } from './lobbykit.js';
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
  if (cf.bottomBarContainer && cf.bottomBarPrefab) placeBottomBar(info, cf.bottomBarContainer, cf.bottomBarPrefab);
  const mode = cf.modeViewContainer && cf.modePrefabList?.[0] ? place(info, cf.modeViewContainer, cf.modePrefabList[0]) : null;
  if (mode) stars(mode, r, pr);
  info.tap('@panel_front/btn_next/hotspot', done);
  void info.anim(cf.enterAnim).then(() => info.anim(cf.nextAnim));
}

/**
 * The rating: a star for each stamp won (at most 3), each stage's panel marked when it won its stamps (its clip after
 * the panel's own); the last stage's task as the title and its goal as the description (the task's icon is filled at
 * run time from art the packs do not have).
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
  m.text(f.textDesc, task?.basic ?? '');
  m.show(f.imgType, false);
  const s1 = r.stamps[0] ?? 0, s2 = r.stamps[1] ?? 0, got = [s1 > 0, s2 > 0, s2 > 1];
  stagePanels(m, f, got, [s1, Math.min(2, s2) / 2]);
  void m.anim(f.animEnter).then(() => Promise.all([f.animComplete1, f.animComplete2, f.animComplete3].map((a, i) => (got[i] ? m.anim(a) : null))));
}

/**
 * The two stages' panels: their stamps' marks (stage 1 one, stage 2 two) and progress bars; no counts (the room keeps
 * stamps only). @param {Part} m @param {Record<string, any>} f @param {boolean[]} got @param {number[]} bars
 */
function stagePanels(m, f, got, bars) {
  const at = '@group_info/main/panel_stage', p1 = `${at}1/panel_progress`, p2 = `${at}2/panel_progress`;
  for (const r of [`${p1}/panel_num`, `${p2}/panel_num_1`, `${p2}/panel_num_2`, `${p2}/div`]) m.show(r, false);
  [`${p1}/panel_got`, `${p2}/panel_got_1`, `${p2}/panel_got_2`].forEach((r, i) => m.show(r, got[i]));
  [f.sliderStage1, f.sliderStage2].forEach((s, i) => { const n = m.node(s); if (n) m.scr.slider('', Math.min(1, bars[i]), n); });
}
